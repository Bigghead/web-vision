import * as three from "three";
import { ThreeCanvas } from "../src/lib/canvas";
import { MediaPipeHands } from "./lib/media-pipe-hands";

const canvas = document.querySelector("canvas.webgl") as HTMLCanvasElement;
const webcam = document.querySelector("video.webcam") as HTMLVideoElement;
const canvas2d = document.querySelector(".canvas-2d") as HTMLCanvasElement;
const ctx = canvas2d.getContext("2d") as CanvasRenderingContext2D;
const ctxLineSize = 1;

if (!canvas) {
	console.error("Canvas element with class 'webgl' not found.");
}

// Fix blurry canvas drawn lines
(function fix_dpr() {
	const dpr = window.devicePixelRatio || 1;
	let style_height = +getComputedStyle(canvas2d)
		.getPropertyValue("height")
		.slice(0, -2);
	let style_width = +getComputedStyle(canvas2d)
		.getPropertyValue("width")
		.slice(0, -2);
	canvas2d.setAttribute("height", (style_height * dpr).toString());
	canvas2d.setAttribute("width", (style_width * dpr).toString());
})();

const threeCanvas = new ThreeCanvas({ canvas, initShadow: false });
const {
	sizes: { width, height },
	scene,
	getNormalizedDeviceCoords,
} = threeCanvas;

const cube: three.Mesh<three.BoxGeometry, three.MeshBasicMaterial> =
	new three.Mesh(
		new three.BoxGeometry(1, 1, 1),
		new three.MeshBasicMaterial({ color: 0x00ff00, wireframe: true })
	);

scene.add(cube);

type WebcamResponse = {
	success: boolean;
	error?: string | Error;
};

type MultiHandLandmark = {
	visibility: unknown;
	x: number;
	y: number;
	z: number;
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

	const digits = [
		// Thumb
		[0, 1],
		[1, 2],
		[2, 3],
		[3, 4],
		// Index finger
		[0, 5],
		[5, 6],
		[6, 7],
		[7, 8],
		// Middle finger
		[0, 9],
		[9, 10],
		[10, 11],
		[11, 12],
		// Ring finger
		[0, 13],
		[13, 14],
		[14, 15],
		[15, 16],
		// Pinky
		[0, 17],
		[17, 18],
		[18, 19],
		[19, 20],
		// Palm
		[0, 5],
		[5, 9],
		[9, 13],
		[13, 17],
	];

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
		isTip ? ctxLineSize * 1.2 : ctxLineSize,
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
		const worldPos = getNormalizedDeviceCoords(finger.x, finger.y);
		cube.position.copy(worldPos);
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
