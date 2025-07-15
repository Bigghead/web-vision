import * as three from "three";
import { ThreeCanvas } from "../src/lib/canvas";
import { MediaPipeHands } from "./lib/media-pipe-hands";
import {
	ctxLineSize,
	digits,
	HandGestures,
	objectScaleTick,
	pinchDistanceThreshold,
	type MultiHandedness,
	type MultiHandLandmark,
	type WebcamResponse,
} from "./lib/constants";

const canvas = document.querySelector("canvas.webgl") as HTMLCanvasElement;
const webcam = document.querySelector("video.webcam") as HTMLVideoElement;
const canvas2d = document.querySelector(".canvas-2d") as HTMLCanvasElement;
const ctx = canvas2d.getContext("2d") as CanvasRenderingContext2D;

if (!canvas) {
	console.error("Canvas element with class 'webgl' not found.");
}

const gestures: Record<string, boolean | string> = {
	[HandGestures.PINCHED]: false,
	lastGesture: "",
};

const getDimensionsFromElement = (
	element: HTMLElement,
	...properties: string[]
): number[] => {
	return properties.map((prop) => {
		const style = getComputedStyle(element).getPropertyValue(prop);
		// remove "px" from height/width
		return parseFloat(style.slice(0, -2));
	});
};

// Fix blurry canvas drawn lines
(function fix_dpr() {
	const dpr = window.devicePixelRatio || 1;
	const [height, width] = getDimensionsFromElement(canvas2d, "height", "width");
	canvas2d.setAttribute("height", (height * dpr).toString());
	canvas2d.setAttribute("width", (width * dpr).toString());
})();

const threeCanvas = new ThreeCanvas({ canvas, initShadow: false });
const {
	sizes: { width, height },
	scene,
	threeCamera: { camera },
	getNormalizedDeviceCoords,
} = threeCanvas;

const cube: three.Mesh<three.BoxGeometry, three.MeshBasicMaterial> =
	new three.Mesh(
		new three.BoxGeometry(1, 1, 1),
		new three.MeshBasicMaterial({ color: 0x00ff00, wireframe: true })
	);

scene.add(cube);

const calculateTipDistances = (
	tipA: MultiHandLandmark,
	tipB: MultiHandLandmark
): number => {
	const distanceX = tipA.x - tipB.x;
	const distanceY = tipA.y - tipB.y;
	return Math.hypot(distanceX, distanceY);
};

const validPinchDistance = (distance: number): boolean => {
	return distance <= pinchDistanceThreshold;
};

const isHandHoveringAboveObject = (tips: MultiHandLandmark[]): boolean => {
	let allTipsAboveObject = true;
	const vector = new three.Vector3();
	vector.copy(cube.position);
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

type FingerDistance = {
	fingerTip: MultiHandLandmark;
	distanceToThumb: number;
	distanceToBase: number;
};

const calculateDistancesBetweenFingers = (
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
				distanceToThumb: calculateTipDistances(thumbTip, fingerTip),
				distanceToBase: calculateTipDistances(fingerTip, fingerBase),
			};
		});

	return nonThumbFingerDistances;
};

// checking if all non-thumb fingers (Index, Middle, Ring, Pinky) are curled into a fist.
const allFingersMakingFist = (fingers: FingerDistance[]): boolean => {
	return fingers.every(
		(finger) => finger.distanceToBase < pinchDistanceThreshold - 0.02
	);
};

// Only checking last 3 fingers
// We are checking if other fingers other than index / thumb are pinched
const checkOtherFingersPinched = (fingers: FingerDistance[]): boolean => {
	return fingers.every((finger) => validPinchDistance(finger.distanceToThumb));
};

const handleHandGesture = (hand: MultiHandLandmark[]): string => {
	const fingerDistances = calculateDistancesBetweenFingers(hand);

	const { fingerTip: indexTip, distanceToThumb: indexDistance } =
		fingerDistances[0];

	if (!isHandHoveringAboveObject([indexTip])) return "";

	if (allFingersMakingFist(fingerDistances)) {
		console.log("fist");
		gestures[HandGestures.PINCHED] = false;
		return HandGestures.FIST;
	}

	const otherFingersPinched = checkOtherFingersPinched(
		fingerDistances.slice(1)
	);

	if (validPinchDistance(indexDistance)) {
		if (!otherFingersPinched) {
			console.log("pinch");
			gestures[HandGestures.PINCHED] = true;
			return HandGestures.PINCHED;
		} else {
			console.log("squeeze");

			return HandGestures.SQUEEZED;
		}
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
};

const initWebcam = async (): Promise<WebcamResponse> => {
	return new Promise(async (resolve, reject) => {
		try {
			const videoCam = await navigator.mediaDevices.getUserMedia({
				video: {
					width: { min: width, max: width },
					height: { min: height, max: height },
					frameRate: 30,
					facingMode: { exact: "user" }, // centered front facing camera only ( for phone mostly )
				},
			});
			webcam.srcObject = videoCam;

			webcam.onloadedmetadata = () => {
				webcam.play();

				resolve({
					success: true,
				});
			};
		} catch (e) {
			reject({
				success: false,
				error: `${e}`,
			});
		}
	});
};

const drawHand = (hand: MultiHandLandmark[]): void => {
	if (!hand) return;

	digits.forEach(([i, j]) => {
		const start = hand[i];
		const end = hand[j];
		drawHandLine(start, end);
	});

	drawDigitLandmarks(hand);
};

const drawHandLine = (
	start: MultiHandLandmark,
	end: MultiHandLandmark
): void => {
	ctx.lineWidth = ctxLineSize;
	ctx.beginPath();
	ctx.moveTo(start.x * canvas2d.width, start.y * canvas2d.height);
	ctx.lineTo(end.x * canvas2d.width, end.y * canvas2d.height);
	ctx.strokeStyle = "red";
	ctx.stroke();
};

const drawDigitLandmarks = (hand: MultiHandLandmark[]): void => {
	hand.forEach(drawPointOnFinger);
};

const drawPointOnFinger = (
	landmark: MultiHandLandmark,
	index: number
): void => {
	let pointColor = "green";
	const isTip = index === 4 || index === 8;

	// different tip color for index finger / thumb ( for pinching visualization / actions later)
	if (isTip) {
		pointColor = "blue";
	}

	ctx.fillStyle = pointColor;
	ctx.beginPath();
	ctx.arc(
		landmark.x * canvas2d.width,
		landmark.y * canvas2d.height,
		isTip ? ctxLineSize * 2.5 : ctxLineSize,
		0,
		2 * Math.PI
	);
	ctx.fill();
};

const scaleObject = (
	threeObj: three.Mesh,
	scaleDirection: "up" | "down"
): void => {
	// scale down ( negative ) if down direction
	const scaleStep =
		scaleDirection === "up" ? objectScaleTick : -objectScaleTick;

	if (threeObj.scale.x >= 0.2 && threeObj.scale.x <= 5) {
		threeObj.scale.x += scaleStep;
		threeObj.scale.y += scaleStep;
		threeObj.scale.z += scaleStep;
	}
};

const drawHandLandmarks = (
	multiHandLandmarks: MultiHandLandmark[][],
	multiHandedness: MultiHandedness[]
): void => {
	// landmarks are 20 points on your hand, with 0 - 5 being where your palm begins and thumb ends split into 5

	if (multiHandLandmarks.length) {
		ctx.clearRect(0, 0, canvas2d.width, canvas2d.height);

		multiHandLandmarks.forEach((hand, index) => {
			drawHand(hand);
			const finger = hand[8];

			// Ok, this is kinda intense but the whole gist of it is we need convert a mediapipe coords to usable threejs coords
			// mediapipe goes from 0 ( left of screen ) to 1 ( right end of screen )
			const worldPos = getNormalizedDeviceCoords({
				x: finger.x,
				y: finger.y,
				mirrored: true,
			});

			switch (handleHandGesture(hand)) {
				case HandGestures.FIST:
					break;
				case HandGestures.PINCHED:
					scaleObject(cube, "down");
					break;
				case HandGestures.UNPINCH:
					scaleObject(cube, "up");
					break;
				case HandGestures.SQUEEZED:
					cube.position.copy(worldPos);
					break;
				default:
					break;
			}
		});
	}
};

(async () => {
	try {
		await initWebcam();
		const hands = new MediaPipeHands(
			webcam,
			width,
			height,
			({
				multiHandLandmarks,
				multiHandedness,
			}: {
				multiHandLandmarks: MultiHandLandmark[][];
				multiHandedness: MultiHandedness[];
			}) => drawHandLandmarks(multiHandLandmarks, multiHandedness)
		);
		hands.start();
	} catch (e) {
		console.error(e);
	}
})();
