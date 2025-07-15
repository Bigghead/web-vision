import * as three from "three";
import {
	pinchDistanceThreshold,
	type FingerDistance,
	type MultiHandLandmark,
} from "./constants";

export class HandGestureManager {
	calculateTipDistances(
		tipA: MultiHandLandmark,
		tipB: MultiHandLandmark
	): number {
		const distanceX = tipA.x - tipB.x;
		const distanceY = tipA.y - tipB.y;
		return Math.hypot(distanceX, distanceY);
	}

	validPinchDistance(distance: number): boolean {
		return distance <= pinchDistanceThreshold;
	}

	isHandHoveringAboveObject = ({
		tips,
		threeObject,
		camera,
	}: {
		tips: MultiHandLandmark[];
		threeObject: three.Mesh;
		camera: three.Camera;
	}): boolean => {
		let allTipsAboveObject = true;
		const vector = new three.Vector3();
		vector.copy(threeObject.position);
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
		hand: MultiHandLandmark[]
	): FingerDistance[] => {
		// the indices of where mediapipe flags as tips or base / start of finger
		const fingerTipsIndices = [4, 8, 12, 16, 20];
		const fingerBasesIndices = [0, 5, 9, 13, 17];

		const fingers = fingerTipsIndices.map((tip, index) => ({
			fingerTip: hand[tip],
			fingerBase: hand[fingerBasesIndices[index]],
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
	allFingersMakingFist = (fingers: FingerDistance[]): boolean => {
		return fingers.every(
			(finger) => finger.distanceToBase < pinchDistanceThreshold - 0.02
		);
	};

	// checking if the middle, ring, and pinky fingers are "pinched" towards the thumb.
	checkOtherFingersPinched = (fingers: FingerDistance[]): boolean => {
		return fingers.every((finger) =>
			this.validPinchDistance(finger.distanceToThumb)
		);
	};
}
