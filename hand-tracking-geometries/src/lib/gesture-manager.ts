import * as three from "three";
import {
	HandGestures,
	pinchDistanceThreshold,
	type FingerDistance,
	type HandLandmark,
} from "./constants";
import type { GLTF } from "three/examples/jsm/Addons.js";

/**
 * You know, this could probably be done muuuuuch easier if we used a built-in / external gesture detector
 * I think mediapipe even has one but:
 * 1) Yolo
 * 2) It's more fun getting broken things to work
 * 3) Now we know how it works
 *
 */
export class HandGestureManager {
	// the indices of where mediapipe flags as tips or base / start of finger
	private readonly fingerTipsIndices = [4, 8, 12, 16, 20];
	private readonly fingerBasesIndices = [0, 5, 9, 13, 17];
	private readonly indexFingerRotationThreshold = 0.05;

	private calculateTipDistances(
		tipA: HandLandmark,
		tipB: HandLandmark
	): number {
		const distanceX = tipA.x - tipB.x;
		const distanceY = tipA.y - tipB.y;
		return Math.hypot(distanceX, distanceY);
	}

	private validPinchDistance(
		distance: number,
		distanceThreshold = pinchDistanceThreshold
	): boolean {
		return distance <= distanceThreshold;
	}

	isHandHoveringAboveObject = ({
		tips,
		threeObject,
		camera,
	}: {
		tips: HandLandmark[];
		threeObject: GLTF;
		camera: three.Camera;
	}): boolean => {
		let allTipsAboveObject = true;
		const vector = new three.Vector3();
		vector.copy(threeObject.scene.position);
		vector.project(camera);

		// now vector x/y/z are in a range from -1 - 1 ( normalized coordinates )
		// we need to convert to mediapipe coordinates ( from 0 to 1 )

		const objectX = (vector.x + 1) / 2;
		const objectY = (1 - vector.y) / 2;

		tips.forEach((tip) => {
			const dx = objectX - (1 - tip.x);
			const dy = objectY - tip.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			// this distance to be a "zone" of where the object is
			// but it's ok for now
			if (distance > 0.25) {
				allTipsAboveObject = false;
			}
		});
		return allTipsAboveObject;
	};

	calculateDistancesBetweenFingers = (
		hand: HandLandmark[]
	): FingerDistance[] => {
		const fingers = this.fingerTipsIndices.map((tip, index) => ({
			fingerTip: hand[tip],
			fingerBase: hand[this.fingerBasesIndices[index]],
		}));

		const thumbTip = fingers[0].fingerTip;

		// remove thumb from result cause we only care about calculated distance from thumb or other bases
		const nonThumbFingerDistances = fingers
			.slice(1)
			.map(({ fingerTip, fingerBase }) => {
				return {
					fingerTip,
					distanceToThumb: this.calculateTipDistances(thumbTip, fingerTip),
					distanceToBase: this.calculateTipDistances(fingerTip, fingerBase),
				};
			});

		return nonThumbFingerDistances;
	};

	// checking if all non-thumb fingers are curled into a fist.
	private allFingersMakingFist = (fingers: FingerDistance[]): boolean => {
		return fingers.every(
			(finger) => finger.distanceToBase < pinchDistanceThreshold - 0.02
		);
	};

	// checking if the middle, ring, and pinky fingers are "pinched" towards the thumb.
	private areOtherFingersPinched = (fingers: FingerDistance[]): boolean => {
		return fingers.every((finger) =>
			this.validPinchDistance(finger.distanceToThumb, 0.04)
		);
	};

	private validateIndexFinger(hand: HandLandmark[]) {
		const indexTip = hand[8];
		const indexPip = hand[6];
		const indexBase = hand[5];

		const indexPointingUp = indexTip.y < indexPip.y - 0.05;
		let gesture = "";

		if (indexTip.x < indexBase.x - this.indexFingerRotationThreshold) {
			gesture = HandGestures.FINGER_UP_LEFT;
		} else if (indexTip.x > indexBase.x + this.indexFingerRotationThreshold) {
			gesture = HandGestures.FINGER_UP_RIGHT;
		}

		return {
			indexPointingUp,
			gesture,
		};
	}

	private validateGestures({
		hand,
		fingerDistances,
		indexToThumbDistance,
	}: {
		hand: HandLandmark[];
		fingerDistances: FingerDistance[];
		indexToThumbDistance: number;
	}): string {
		const makingFist = this.allFingersMakingFist(fingerDistances);
		const validPinch = this.validPinchDistance(indexToThumbDistance, 0.025);
		const otherFingersPinched = this.areOtherFingersPinched(
			fingerDistances.slice(1)
		);

		const { indexPointingUp, gesture } = this.validateIndexFinger(hand);

		if (makingFist) {
			console.log("fist");
			return HandGestures.FIST;
		}

		if (indexPointingUp) {
			console.log("finger up");
			return gesture;
		}

		if (otherFingersPinched) {
			console.log("squeeze");
			return HandGestures.SQUEEZED;
		}

		// We might need two hands for this as the "squeeze" is fighting with a "pinch"
		// technically same-ish gesture
		// if (validPinch && !otherFingersPinched && !makingFist) {
		// 	console.log("pinch");
		// 	return HandGestures.PINCHED;
		// }

		// still need a differernt gesture for this
		// maybe need 2 hands for this one
		// if (gestures[HandGestures.PINCHED]) {
		// 	if (indexDistance > 0.1) {
		// 		console.log("unpinch");
		// 		return HandGestures.UNPINCH;
		// 	}
		// }

		return "";
	}

	detectGesture(
		hand: HandLandmark[],
		threeObject: GLTF,
		camera: three.PerspectiveCamera
	): string {
		const fingerDistances = this.calculateDistancesBetweenFingers(hand);

		const { fingerTip: indexTip, distanceToThumb: indexToThumbDistance } =
			fingerDistances[0];

		const isHandHoveringOverObject = this.isHandHoveringAboveObject({
			tips: [indexTip],
			threeObject,
			camera,
		});

		if (!isHandHoveringOverObject) return "";

		return this.validateGestures({
			hand,
			fingerDistances,
			indexToThumbDistance,
		});
	}
}
