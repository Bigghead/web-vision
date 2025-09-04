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
const PINCH_DELTA_SCALE = 20; // how fast to spin the model when pinched
const PINCH_ROTATION_THRESHOLD = 0.02;

// the indices of where mediapipe flags as tips or base / start of finger
const fingerTipsIndices = [4, 8, 12, 16, 20];
const fingerBasesIndices = [0, 5, 9, 13, 17];

const defaultGestureResponse: GestureResponse = {
	gesture: "",
	data: null,
};

type Coords2D = {
	x: number;
	y: number;
};

type GestureData = {
	fingerDistances: FingerDistance[];
	normalizedThreeObjectCoords: Coords2D;
	handLabel: HandLabel;
};

type PinchedHands = Map<
	string,
	{
		pinched: boolean;
		data?: {
			pinchPoint: { x: number; y: number };
			pinchDistanceToObject: number;
			initialDistance: number;
		};
	}
>;
// ===== end constants ===== //

// ==== utils ===== //
const getEuclidianDistance = (a: Coords2D, b: Coords2D): number => {
	return Math.hypot(a.x - b.x, a.y - b.y);
};
// ===== end utils ===== //

class GestureHandler {
	private pinchedHands: PinchedHands = new Map([
		["Left", { pinched: false }],
		["Right", { pinched: false }],
	]);

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

	private calculatePinchCenter(fingerDistances: FingerDistance[]): {
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
		normalizedThreeObjectCoords: Coords2D;
		handLabel: HandLabel;
	}): void {
		const { currentPinchX, currentPinchY } =
			this.calculatePinchCenter(fingerDistances);

		const pinchDistanceToObject = getEuclidianDistance(
			{ x: currentPinchX, y: currentPinchY },
			normalizedThreeObjectCoords
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
		normalizedThreeObjectCoords: Coords2D;
		handLabel: HandLabel;
	}): GestureResponse {
		const { currentPinchX } = this.calculatePinchCenter(fingerDistances);
		const { x: objectX } = normalizedThreeObjectCoords;
		// the tip coordinates are flipped 1 - 0 left -> right because we reversed / mirrored the webcam
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

	emitGestureResponse(
		gesture: Partial<HandGestureType>,
		data: GestureData
	): GestureResponse {
		if (gesture === HandGestures.PINCHED)
			return this.handleSinglehandPinch(data);
		if (gesture === HandGestures.TWO_HAND_PINCHED)
			return this.handleTwohandPinch();
		if (gesture === HandGestures.SQUEEZED)
			return { gesture: HandGestures.SQUEEZED };
		if (gesture === HandGestures.FIST) return { gesture: HandGestures.FIST };

		return defaultGestureResponse;
	}
}

export class HandGestureManager {
	private vector3d = new three.Vector3();
	gestureHandler = new GestureHandler();

	/**
	 * Converts threejs coordinates into normalized mediapipe coords
	 */
	private getNormalizedObjectPosition(
		threeObject: GLTF,
		camera: three.PerspectiveCamera
	): Coords2D {
		this.vector3d.copy(threeObject.scene.position);
		this.vector3d.project(camera);
		// now vector x/y/z are in a range from -1 - 1 ( normalized coordinates )
		// we need to convert to mediapipe coordinates ( from 0 to 1 )

		const objectX = (this.vector3d.x + 1) / 2;
		const objectY = (1 - this.vector3d.y) / 2;

		return {
			x: objectX,
			y: objectY,
		};
	}

	private calculateDistancesBetweenFingers = (
		hand: HandLandmark[]
	): FingerDistance[] => {
		const fingers = fingerTipsIndices.map((tip, index) => ({
			fingerTip: hand[tip],
			fingerBase: hand[fingerBasesIndices[index]],
		}));

		const thumbTip = fingers[0].fingerTip;

		const fingerDistances = fingers.map(({ fingerTip, fingerBase }) => {
			return {
				fingerTip,
				distanceToThumb: getEuclidianDistance(thumbTip, fingerTip),
				distanceToBase: getEuclidianDistance(fingerTip, fingerBase),
			};
		});

		return fingerDistances;
	};

	private validateGestures({
		fingerDistances,
		indexToThumbDistance,
		normalizedThreeObjectCoords,
		handLabel,
	}: {
		fingerDistances: FingerDistance[];
		indexToThumbDistance: number;
		normalizedThreeObjectCoords: Coords2D;
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
