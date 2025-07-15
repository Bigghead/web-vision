import * as three from "three";
import { ThreeCanvas } from "../src/lib/canvas";
import { MediaPipeHands } from "./lib/media-pipe-hands";
import {
	ctxLineSize,
	digits,
	HandGestures,
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
	const distanceThreshold = 0.08;
	return distance <= distanceThreshold;
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

		if (distance > 0.05) {
			allTipsAboveObject = false;
		}
	});
	return allTipsAboveObject;
};

const handleHandGesture = (hand: MultiHandLandmark[]): string => {
	const thumbTip = hand[4];
	const indexTip = hand[8];

	// works for pinch ( for scale ), but need to do other fingers for squeezed (drag / drop )
	const middleTip = hand[12];
	const ringTip = hand[16];
	const pinkyTip = hand[20];

	const indexDistance = calculateTipDistances(thumbTip, indexTip);
	const middleDistance = calculateTipDistances(thumbTip, middleTip);
	const ringDistance = calculateTipDistances(thumbTip, ringTip);
	const pinkyDistance = calculateTipDistances(thumbTip, pinkyTip);

	const indexBase = hand[5];
	const middleBase = hand[9];
	const ringBase = hand[13];
	const pinkyBase = hand[17];

	const indexTipToBaseDistance = calculateTipDistances(indexTip, indexBase);
	const middleTipToBaseDistance = calculateTipDistances(middleTip, middleBase);
	const ringTipToBaseDistance = calculateTipDistances(ringTip, ringBase);
	const pinkyTipToBaseDistance = calculateTipDistances(pinkyTip, pinkyBase);

	// console.log(indexDistance, middleDistance, ringDistance, pinkyDistance);
	// console.log(
	// 	indexTipToBaseDistance,
	// 	middleTipToBaseDistance,
	// 	ringTipToBaseDistance,
	// 	pinkyTipToBaseDistance
	// );

	if (!isHandHoveringAboveObject([indexTip])) return "";

	if (
		indexTipToBaseDistance < 0.06 &&
		middleTipToBaseDistance < 0.06 &&
		ringTipToBaseDistance < 0.06 &&
		pinkyTipToBaseDistance < 0.06
	) {
		console.log("fist");

		gestures[HandGestures.PINCHED] = false;
		return HandGestures.FIST;
	}

	const otherFingersPinched =
		validPinchDistance(middleDistance) &&
		validPinchDistance(ringDistance) &&
		validPinchDistance(pinkyDistance);

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

	// this works but need a way to stop it
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

const drawHand = (...hands: MultiHandLandmark[][]): void => {
	ctx.clearRect(0, 0, canvas2d.width, canvas2d.height);

	hands.forEach((hand) => {
		if (!hand) return;

		digits.forEach(([i, j]) => {
			const start = hand[i];
			const end = hand[j];
			drawHandLine(start, end);
		});

		drawDigitLandmarks(hand);
	});
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

const drawHandLandmarks = (multiHandLandmarks: MultiHandLandmark[][]): void => {
	// landmarks are 20 points on your hand, with 0 - 5 being where your palm begins and thumb ends split into 5
	if (multiHandLandmarks.length) {
		const leftHand = multiHandLandmarks[0];
		const rightHand = multiHandLandmarks[1];
		drawHand(leftHand, rightHand);
		const finger = leftHand[8];

		// Ok, this is kinda intense but the whole gist of it is we need convert a mediapipe coords to usable threejs coords
		// mediapipe goes from 0 ( left of screen ) to 1 ( right end of screen )
		const worldPos = getNormalizedDeviceCoords({
			x: finger.x,
			y: finger.y,
			mirrored: true,
		});

		switch (handleHandGesture(leftHand)) {
			case HandGestures.FIST:
				break;
			case HandGestures.PINCHED:
				if (cube.scale.x >= 0.2) {
					cube.scale.x -= 0.05;
					cube.scale.y -= 0.05;
					cube.scale.z -= 0.05;
				}
				break;
			case HandGestures.UNPINCH:
				if (cube.scale.x <= 5) {
					cube.scale.x += 0.05;
					cube.scale.y += 0.05;
					cube.scale.z += 0.05;
				}
				break;
			case HandGestures.SQUEEZED:
				cube.position.copy(worldPos);
				break;
			default:
				break;
		}
	}
};

(async () => {
	try {
		await initWebcam();
		const hands = new MediaPipeHands(
			webcam,
			width,
			height,
			({ multiHandLandmarks }: { multiHandLandmarks: MultiHandLandmark[][] }) =>
				drawHandLandmarks(multiHandLandmarks)
		);
		hands.start();
	} catch (e) {
		console.error(e);
	}
})();
