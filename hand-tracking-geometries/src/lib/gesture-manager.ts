import * as three from "three";
import { HandGestures } from "./constants";
import {
	type FingerDistance,
	type GestureResponse,
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

type NormalizedCoords = {
	objectX: number;
	objectY: number;
};

class GestureHandler {
	private readonly pinchDistanceThreshold = 0.08;
	private readonly pinchRotationThreshold = 0.02;

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

	private validPinchDistance(
		distance: number,
		distanceThreshold = this.pinchDistanceThreshold
	): boolean {
		return distance <= distanceThreshold;
	}

	// checking if all non-thumb fingers are curled into a fist.
	private allFingersMakingFist = (fingers: FingerDistance[]): boolean => {
		return fingers.every(
			(finger) => finger.distanceToBase < this.pinchDistanceThreshold - 0.02
		);
	};

	// checking if the middle, ring, and pinky fingers are "pinched" towards the thumb.
	private areOtherFingersPinched = (fingers: FingerDistance[]): boolean => {
		return fingers.every((finger) =>
			this.validPinchDistance(finger.distanceToThumb, 0.04)
		);
	};

	handleSinglehandPinch({
		fingerDistances,
		threeObjectPosition,
		handLabel,
	}: {
		fingerDistances: FingerDistance[];
		threeObjectPosition: NormalizedCoords;
		handLabel: HandLabel;
	}) {
		const thumbTip = fingerDistances[0]?.fingerTip;
		const indexTip = fingerDistances[1]?.fingerTip;

		const currentPinchX = (thumbTip.x + indexTip.x) / 2;
		const currentPinchY = (thumbTip.y + indexTip.y) / 2;

		const { objectX, objectY } = threeObjectPosition;

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

		return {
			currentPinchX,
			objectX,
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
			if (Math.abs(averagePinchChange) > this.pinchRotationThreshold) {
				if (averagePinchChange > 0) {
					console.log("scale up");
					return { gesture: HandGestures.SCALE_UP };
				}
				if (averagePinchChange < 0) {
					console.log("scale down");
					return { gesture: HandGestures.SCALE_DOWN };
				}
			}
		}
		return { gesture: "" };
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

	private calculateTipDistances(
		tipA: HandLandmark,
		tipB: HandLandmark
	): number {
		const distanceX = tipA.x - tipB.x;
		const distanceY = tipA.y - tipB.y;
		return Math.hypot(distanceX, distanceY);
	}

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

	private isHandHoveringAboveObject = ({
		tips,
		position,
	}: {
		tips: HandLandmark[];
		position: NormalizedCoords;
	}): boolean => {
		let allTipsAboveObject = true;
		const { objectX, objectY } = position;

		tips.forEach((tip) => {
			const dx = objectX - (1 - tip.x);
			const dy = objectY - tip.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			// this distance to be a "zone" of where the object is
			// but it's ok for now
			// todo - get actual model scale zone
			if (distance > 0.4) {
				allTipsAboveObject = false;
			}
		});
		return allTipsAboveObject;
	};

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
				distanceToThumb: this.calculateTipDistances(thumbTip, fingerTip),
				distanceToBase: this.calculateTipDistances(fingerTip, fingerBase),
			};
		});

		return fingerDistances;
	};

	private validateGestures({
		handLabel,
		fingerDistances,
		indexToThumbDistance,
		threeObjectPosition,
	}: {
		handLabel: HandLabel;
		fingerDistances: FingerDistance[];
		indexToThumbDistance: number;
		threeObjectPosition: NormalizedCoords;
	}): GestureResponse {
		const gestureResponse: GestureResponse = {
			gesture: "",
			data: null,
		};

		const {
			checkGestureType,
			handleSinglehandPinch,
			bothHandsPinched,
			handleTwohandPinch,
			resetPinchedHands,
		} = this.gestureHandler;

		const { validPinch, otherFingersPinched, makingFist } = checkGestureType(
			indexToThumbDistance,
			fingerDistances
		);

		if (validPinch && !makingFist) {
			if (bothHandsPinched()) {
				return handleTwohandPinch();
			}
			const { currentPinchX, objectX } = handleSinglehandPinch({
				fingerDistances,
				threeObjectPosition,
				handLabel,
			});

			console.log("pinch");

			// the tip coordinates are fliiped 1 - 0 left -> right because we reversed the webcam
			const deltaX = -currentPinchX - objectX;
			return { gesture: HandGestures.PINCHED, data: deltaX / 20 };
		}

		resetPinchedHands();

		if (otherFingersPinched) {
			return { gesture: HandGestures.SQUEEZED };
		}

		if (makingFist) {
			return { gesture: HandGestures.FIST };
		}

		return gestureResponse;
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

		const { fingerTip: indexTip, distanceToThumb: indexToThumbDistance } =
			fingerDistances[1];

		const normalizedThreeObjectCoords = this.getNormalizedObjectPosition(
			threeObject,
			camera
		);

		const isHandHoveringOverObject = this.isHandHoveringAboveObject({
			tips: [indexTip],
			position: normalizedThreeObjectCoords,
		});

		if (!isHandHoveringOverObject) return { gesture: "" };

		return this.validateGestures({
			handLabel,
			fingerDistances,
			indexToThumbDistance,
			threeObjectPosition: normalizedThreeObjectCoords,
		});
	}
}
