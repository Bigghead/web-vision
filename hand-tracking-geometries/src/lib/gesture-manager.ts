import * as three from "three";
import { HandGestures } from "./constants";
import {
	type FingerDistance,
	type GestureResponse,
	type HandGestureType,
	type HandLabel,
	type HandLandmark,
} from "./types";
import type { GLTF } from "three/examples/jsm/Addons.js";

/**
 * You know, this could probably be done muuuuuch easier if we used a built-in / external gesture detector
 * I think mediapipe even has one but:
 * 1) Yolo
 * 2) It's more fun getting broken things to work
 * 3) Now we know how it works, but it's pretty annoying to get right
 *
 *
 */

// ===== constants ===== //
const PINCH_DISTANCE_THRESHOLD = 0.08;
const FIST_FINGER_DISTANCE_THRESHOLD = PINCH_DISTANCE_THRESHOLD - 0.02;
// how
const PINCH_DELTA_SCALE = 20;
const PINCH_ROTATION_THRESHOLD = 0.02;

type NormalizedCoords = {
	objectX: number;
	objectY: number;
};

type Coords2D = {
	x: number;
	y: number;
};

type GestureData = {
	fingerDistances: FingerDistance[];
	normalizedThreeObjectCoords: NormalizedCoords;
	handLabel: HandLabel;
};

type GestureCallback = (data: GestureData) => GestureResponse;

// ==== utils ===== //
const getEuclidianDistance = (a: Coords2D, b: Coords2D): number => {
	return Math.hypot(a.x - b.x, a.y - b.y);
};
const defaultGestureResponse: GestureResponse = {
	gesture: "",
	data: null,
};

class GestureHandler {
	private pinchedHands: Map<
		string,
		{
			pinched: boolean;
			data?: {
				pinchPoint: { x: number; y: number };
				pinchDistanceToObject: number;
				initialDistance: number;
			};
		}
	> = new Map([
		["Left", { pinched: false }],
		["Right", { pinched: false }],
	]);

	private gestureResponseCallbacks: Record<string, GestureCallback> = {
		pinched: ({ fingerDistances, normalizedThreeObjectCoords, handLabel }) =>
			this.handleSinglehandPinch({
				fingerDistances,
				normalizedThreeObjectCoords,
				handLabel,
			}),
		two_hand_pinched: () => this.handleTwohandPinch(),
		squeezed: () => ({ gesture: HandGestures.SQUEEZED }),
		fist: () => ({ gesture: HandGestures.FIST }),
	};

	emitGestureResponse(
		gesture: Partial<HandGestureType> | string,
		data: GestureData
	): GestureResponse {
		const callback = this.gestureResponseCallbacks[gesture];
		if (callback) {
			return callback(data);
		}

		return defaultGestureResponse;
	}

	private isHandHoveringAboveObject = ({
		tips,
		position,
	}: {
		tips: HandLandmark[];
		position: NormalizedCoords;
	}): boolean => {
		const objectPosition = {
			x: position.objectX,
			y: position.objectY,
		};

		return tips.every((tip) => {
			const distance = getEuclidianDistance(tip, objectPosition);

			// this distance to be a "zone" of where the object is
			// but it's ok for now
			// todo - get actual model scale zone
			return distance < 0.2;
		});
	};

	private validPinchDistance(
		distance: number,
		distanceThreshold = PINCH_DISTANCE_THRESHOLD
	): boolean {
		return distance <= distanceThreshold;
	}

	// checking if all non-thumb fingers are curled into a fist.
	private allFingersMakingFist = (fingers: FingerDistance[]): boolean => {
		return fingers.every(
			(finger) => finger.distanceToBase < FIST_FINGER_DISTANCE_THRESHOLD
		);
	};

	// checking if the middle, ring, and pinky fingers are "pinched" towards the thumb.
	private areOtherFingersPinched = (fingers: FingerDistance[]): boolean => {
		return fingers.every((finger) =>
			this.validPinchDistance(finger.distanceToThumb, 0.04)
		);
	};

	private getCurrentPinchFingersCoords(fingerDistances: FingerDistance[]): {
		currentPinchX: number;
		currentPinchY: number;
	} {
		const thumbTip = fingerDistances[0]?.fingerTip;
		const indexTip = fingerDistances[1]?.fingerTip;

		const currentPinchX = (thumbTip.x + indexTip.x) / 2;
		const currentPinchY = (thumbTip.y + indexTip.y) / 2;
		return {
			currentPinchX,
			currentPinchY,
		};
	}

	storePinchData({
		fingerDistances,
		normalizedThreeObjectCoords,
		handLabel,
	}: {
		fingerDistances: FingerDistance[];
		normalizedThreeObjectCoords: NormalizedCoords;
		handLabel: HandLabel;
	}): void {
		const { objectX, objectY } = normalizedThreeObjectCoords;
		const { currentPinchX, currentPinchY } =
			this.getCurrentPinchFingersCoords(fingerDistances);

		// need to check euclid distance from pinch to object center to check how far pinches are
		// √[(x₂ - x₁)² + (y₂ - y₁)²] in case you need to see the formula too
		const pinchDistanceToObject = Math.sqrt(
			Math.pow(currentPinchX - objectX, 2) +
				Math.pow(currentPinchY - objectY, 2)
		);

		this.pinchedHands.set(handLabel, {
			pinched: true,
			data: {
				pinchPoint: { x: currentPinchX, y: currentPinchY },
				pinchDistanceToObject,
				initialDistance:
					this.pinchedHands.get(handLabel)?.data?.initialDistance ||
					pinchDistanceToObject,
			},
		});
	}

	handleSinglehandPinch({
		fingerDistances,
		normalizedThreeObjectCoords,
	}: {
		fingerDistances: FingerDistance[];
		normalizedThreeObjectCoords: NormalizedCoords;
		handLabel: HandLabel;
	}): GestureResponse {
		const { currentPinchX } =
			this.getCurrentPinchFingersCoords(fingerDistances);
		const { objectX } = normalizedThreeObjectCoords;
		// the tip coordinates are fliiped 1 - 0 left -> right because we reversed the webcam
		const deltaX = -currentPinchX - objectX;

		return {
			gesture: HandGestures.PINCHED,
			data: deltaX / PINCH_DELTA_SCALE,
		};
	}

	handleTwohandPinch(): GestureResponse {
		const [{ data: leftHandData }, { data: rightHandData }] = Array.from(
			this.pinchedHands.values()
		);

		if (leftHandData && rightHandData) {
			const leftPinchChange =
				leftHandData?.pinchDistanceToObject - leftHandData?.initialDistance;
			const rightPinchChange =
				rightHandData?.pinchDistanceToObject - rightHandData?.initialDistance;

			const averagePinchChange = (leftPinchChange + rightPinchChange) / 2;

			// need this abs check cause sometimes even when your fingers aren't moving
			// it will still trigger a scale action
			// shaky camera / mediapipe tracking maybe
			if (Math.abs(averagePinchChange) > PINCH_ROTATION_THRESHOLD) {
				if (averagePinchChange > 0) {
					return { gesture: HandGestures.SCALE_UP };
				}
				if (averagePinchChange < 0) {
					return { gesture: HandGestures.SCALE_DOWN };
				}
			}
		}
		return { gesture: "" };
	}

	handleFist({
		fingerDistances,
		normalizedThreeObjectCoords,
	}: {
		fingerDistances: FingerDistance[];
		normalizedThreeObjectCoords: NormalizedCoords;
	}): GestureResponse {
		const isHandHoveringOverObject = this.isHandHoveringAboveObject({
			tips: fingerDistances.map((finger) => finger.fingerTip),
			position: normalizedThreeObjectCoords,
		});
		if (isHandHoveringOverObject) {
			return { gesture: HandGestures.FIST };
		}

		return defaultGestureResponse;
	}

	resetPinchedHands(): void {
		this.pinchedHands.forEach((_, key) => this.pinchedHands.delete(key));
	}

	bothHandsPinched(): boolean {
		return (
			this.pinchedHands.get("Left")?.pinched === true &&
			this.pinchedHands.get("Right")?.pinched === true
		);
	}

	checkGestureType(
		indexToThumbDistance: number,
		fingerDistances: FingerDistance[]
	) {
		const validPinch = this.validPinchDistance(indexToThumbDistance, 0.025);
		const nonThumbFingers = fingerDistances.slice(1);
		const otherFingersPinched = this.areOtherFingersPinched(nonThumbFingers);
		const makingFist = this.allFingersMakingFist(nonThumbFingers);

		return {
			validPinch,
			otherFingersPinched,
			makingFist,
		};
	}
}

export class HandGestureManager {
	// the indices of where mediapipe flags as tips or base / start of finger
	private readonly fingerTipsIndices = [4, 8, 12, 16, 20];
	private readonly fingerBasesIndices = [0, 5, 9, 13, 17];
	private vector3d = new three.Vector3();

	gestureHandler = new GestureHandler();

	// Converts threejs coordinates into normalized mediapipe coords
	private getNormalizedObjectPosition(
		threeObject: GLTF,
		camera: three.PerspectiveCamera
	): NormalizedCoords {
		this.vector3d.copy(threeObject.scene.position);
		this.vector3d.project(camera);
		// now vector x/y/z are in a range from -1 - 1 ( normalized coordinates )
		// we need to convert to mediapipe coordinates ( from 0 to 1 )

		const objectX = (this.vector3d.x + 1) / 2;
		const objectY = (1 - this.vector3d.y) / 2;

		return {
			objectX,
			objectY,
		};
	}

	private calculateDistancesBetweenFingers = (
		hand: HandLandmark[]
	): FingerDistance[] => {
		const fingers = this.fingerTipsIndices.map((tip, index) => ({
			fingerTip: hand[tip],
			fingerBase: hand[this.fingerBasesIndices[index]],
		}));

		const thumbTip = fingers[0].fingerTip;

		// remove thumb from result cause we only care about calculated distance from thumb or other bases
		const fingerDistances = fingers.map(({ fingerTip, fingerBase }) => {
			return {
				fingerTip,
				distanceToThumb: getEuclidianDistance(thumbTip, fingerTip),
				distanceToBase: getEuclidianDistance(fingerTip, fingerBase),
			};
		});

		return fingerDistances;
	};

	// todo, break this up
	private validateGestures({
		fingerDistances,
		indexToThumbDistance,
		normalizedThreeObjectCoords,
		handLabel,
	}: {
		fingerDistances: FingerDistance[];
		indexToThumbDistance: number;
		normalizedThreeObjectCoords: NormalizedCoords;
		handLabel: HandLabel;
	}): Partial<HandGestureType> | null {
		const { validPinch, otherFingersPinched, makingFist } =
			this.gestureHandler.checkGestureType(
				indexToThumbDistance,
				fingerDistances
			);

		if (validPinch && !makingFist) {
			this.gestureHandler.storePinchData({
				fingerDistances,
				normalizedThreeObjectCoords,
				handLabel,
			});
			if (this.gestureHandler.bothHandsPinched()) {
				return HandGestures.TWO_HAND_PINCHED;
			}

			return HandGestures.PINCHED;
		}

		this.gestureHandler.resetPinchedHands();
		if (otherFingersPinched) return HandGestures.SQUEEZED;
		if (makingFist) return HandGestures.FIST;

		return null;
	}

	detectGesture({
		hand,
		threeObject,
		camera,
		handLabel,
	}: {
		hand: HandLandmark[];
		threeObject: GLTF;
		camera: three.PerspectiveCamera;
		handLabel: HandLabel;
	}): GestureResponse {
		const fingerDistances = this.calculateDistancesBetweenFingers(hand);

		const { distanceToThumb: indexToThumbDistance } = fingerDistances[1];

		const normalizedThreeObjectCoords = this.getNormalizedObjectPosition(
			threeObject,
			camera
		);

		const gesture = this.validateGestures({
			fingerDistances,
			indexToThumbDistance,
			normalizedThreeObjectCoords,
			handLabel,
		});

		if (!gesture) return defaultGestureResponse;

		const data = {
			fingerDistances,
			normalizedThreeObjectCoords,
			handLabel,
		};

		return this.gestureHandler.emitGestureResponse(gesture, data);
	}
}
