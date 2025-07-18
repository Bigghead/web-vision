import * as three from "three";
import { ThreeCanvas } from "../src/lib/canvas";
import { MediaPipeHands } from "./lib/media-pipe-hands";
import {
	ctxLineSize,
	digits,
	objectScaleTick,
	HandGestures,
	type MultiHandedness,
	type HandLandmark,
	type WebcamResponse,
} from "./lib/constants";
import { HandGestureManager } from "./lib/gesture-manager";
import type { GLTF } from "three/examples/jsm/Addons.js";

const canvas = document.querySelector("canvas.webgl") as HTMLCanvasElement;
const webcam = document.querySelector("video.webcam") as HTMLVideoElement;
const canvas2d = document.querySelector(".canvas-2d") as HTMLCanvasElement;
const ctx = canvas2d.getContext("2d") as CanvasRenderingContext2D;

if (!canvas) {
	console.error("Canvas element with class 'webgl' not found.");
}

const threeCanvas = new ThreeCanvas({ canvas, initShadow: false });
const {
	sizes: { width, height },
	scene,
	threeCamera: { camera },
	modelLoader,
	getNormalizedDeviceCoords,
} = threeCanvas;

let threeObject: GLTF[] = [];

(async function loadModels() {
	const model = await modelLoader.initModel(
		"/models/Duck/glTF-Binary/Duck.glb"
	);
	threeObject.push(model);
	scene.add(model.scene);
})();

const gestures = new HandGestureManager();

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

const detectHandGesture = (threeObject: GLTF, hand: HandLandmark[]): string => {
	const fingerDistances = gestures.calculateDistancesBetweenFingers(hand);

	const { fingerTip: indexTip, distanceToThumb: indexToThumbDistance } =
		fingerDistances[0];

	const isHandHoveringOverObject = gestures.isHandHoveringAboveObject({
		tips: [indexTip],
		threeObject,
		camera,
	});

	if (!isHandHoveringOverObject) return "";

	return gestures.detectGesture({
		fingerDistances,
		indexToThumbDistance,
		indexFinger: { indexTip: hand[8], indexPip: hand[6], indexBase: hand[5] },
	});
};

const transformObject = ({
	threeObj,
	transformDirection,
	transformation,
}: {
	threeObj: GLTF;
	transformDirection: "up" | "down" | "left" | "right";
	transformation: "scale" | "rotation";
}): void => {
	// scale down ( negative ) if down direction
	const scaleStep =
		transformDirection === "up" || transformDirection === "left"
			? objectScaleTick
			: -objectScaleTick;

	if (transformation === "scale") {
		if (threeObj.scene.scale.x >= 0.2 && threeObj.scene.scale.x <= 5) {
			threeObj.scene.scale.x += scaleStep;
			threeObj.scene.scale.y += scaleStep;
			threeObj.scene.scale.z += scaleStep;
		}
	}

	if (transformation === "rotation") {
		threeObj.scene.rotation.y += scaleStep;
	}
};

const makeObjectFollowHand = (
	threeObject: GLTF,
	hand: HandLandmark[]
): void => {
	const finger = hand[8];

	// Ok, this is kinda intense but the whole gist of it is we need convert a mediapipe coords to usable threejs coords
	// mediapipe goes from 0 ( left of screen ) to 1 ( right end of screen )
	const handPos = getNormalizedDeviceCoords({
		x: finger.x,
		y: finger.y,
		mirrored: true,
	});
	threeObject.scene.position.copy(handPos);
};

const handleHandGesture = (hand: HandLandmark[]) => {
	const models = threeObject;
	if (!models.length) return;

	models.forEach((model) => {
		switch (detectHandGesture(model, hand)) {
			case HandGestures.FIST:
				break;
			case HandGestures.PINCHED:
				transformObject({
					threeObj: model,
					transformDirection: "down",
					transformation: "scale",
				});
				break;
			case HandGestures.UNPINCH:
				transformObject({
					threeObj: model,
					transformDirection: "up",
					transformation: "scale",
				});
				break;
			case HandGestures.SQUEEZED:
				makeObjectFollowHand(model, hand);
				break;
			case HandGestures.FINGER_UP_LEFT:
				transformObject({
					threeObj: model,
					transformDirection: "left",
					transformation: "rotation",
				});
				break;
			case HandGestures.FINGER_UP_RIGHT:
				transformObject({
					threeObj: model,
					transformDirection: "right",
					transformation: "rotation",
				});
				break;
			default:
				break;
		}
	});
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

const drawHand = (hand: HandLandmark[]): void => {
	if (!hand) return;

	digits.forEach(([i, j]) => {
		const start = hand[i];
		const end = hand[j];
		drawHandLine(start, end);
	});

	drawDigitLandmarks(hand);
};

const drawHandLine = (start: HandLandmark, end: HandLandmark): void => {
	ctx.lineWidth = ctxLineSize;
	ctx.beginPath();
	ctx.moveTo(start.x * canvas2d.width, start.y * canvas2d.height);
	ctx.lineTo(end.x * canvas2d.width, end.y * canvas2d.height);
	ctx.strokeStyle = "red";
	ctx.stroke();
};

const drawDigitLandmarks = (hand: HandLandmark[]): void => {
	hand.forEach(drawPointOnFinger);
};

const drawPointOnFinger = (landmark: HandLandmark, index: number): void => {
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

const drawHandLandmarks = (
	multiHandLandmarks: HandLandmark[][],
	multiHandedness: MultiHandedness[]
): void => {
	// landmarks are 20 points on your hand, with 0 - 5 being where your palm begins and thumb ends split into 5

	if (multiHandLandmarks.length) {
		ctx.clearRect(0, 0, canvas2d.width, canvas2d.height);

		multiHandLandmarks.forEach((hand, index) => {
			drawHand(hand);
			handleHandGesture(hand);
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
				multiHandLandmarks: HandLandmark[][];
				multiHandedness: MultiHandedness[];
			}) => drawHandLandmarks(multiHandLandmarks, multiHandedness)
		);
		hands.start();
	} catch (e) {
		console.error(e);
	}
})();
