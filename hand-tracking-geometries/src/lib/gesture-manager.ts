import * as three from "three";
import {
	HandGestures,
	pinchDistanceThreshold,
	type FingerDistance,
	type HandLandmark,
} from "./constants";
import type { GLTF } from "three/examples/jsm/Addons.js";

export class HandGestureManager {
	// the indices of where mediapipe flags as tips or base / start of finger
	private readonly fingerTipsIndices = [4, 8, 12, 16, 20];
	private readonly fingerBasesIndices = [0, 5, 9, 13, 17];

	private calculateTipDistances(
		tipA: HandLandmark,
		tipB: HandLandmark
	): number {
		const distanceX = tipA.x - tipB.x;
		const distanceY = tipA.y - tipB.y;
		return Math.hypot(distanceX, distanceY);
	}

	private validPinchDistance(distance: number): boolean {
		return distance <= pinchDistanceThreshold;
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

			// need 0.1 to be a "zone" of where the object is
			// but it's ok for now
			if (distance > 0.1) {
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
	private checkOtherFingersPinched = (fingers: FingerDistance[]): boolean => {
		return fingers.every((finger) =>
			this.validPinchDistance(finger.distanceToThumb)
		);
	};

	detectGesture({
		fingerDistances,
		indexToThumbDistance,
	}: {
		fingerDistances: FingerDistance[];
		indexToThumbDistance: number;
	}): string {
		const makingFist = this.allFingersMakingFist(fingerDistances);
		const validPinch = this.validPinchDistance(indexToThumbDistance);
		const otherFingersPinched = this.checkOtherFingersPinched(
			fingerDistances.slice(1)
		);

		if (makingFist) {
			console.log("fist");
			return HandGestures.FIST;
		}

		if (otherFingersPinched) {
			console.log("squeeze");
			return HandGestures.SQUEEZED;
		}

		if (validPinch && !otherFingersPinched && !makingFist) {
			console.log("pinch");
			return HandGestures.PINCHED;
		}

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
}
