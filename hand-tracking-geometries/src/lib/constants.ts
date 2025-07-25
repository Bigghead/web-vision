export const ctxLineSize = 2.5;
export const objectScaleTick = 0.025;
export const pinchDistanceThreshold = 0.08;

export type WebcamResponse = {
	success: boolean;
	error?: string | Error;
};

export type HandLandmark = {
	visibility: unknown;
	x: number;
	y: number;
	z: number;
};

export type FingerDistance = {
	fingerTip: HandLandmark;
	distanceToThumb: number;
	distanceToBase: number;
};

export type MultiHandedness = {
	displayName: string | undefined;
	index: number;
	label: "Left" | "Right";
	score: number;
};

export const HandGestures = Object.freeze({
	// pinched scale down or up
	PINCHED: "pinched",

	UNPINCH: "unpinched",
	// drag / drop
	SQUEEZED: "squeezed",

	FIST: "fist",

	// rotate
	FINGER_UP: "finger up",
	FINGER_UP_LEFT: "finger up left",
	FINGER_UP_RIGHT: "finger up right",
	// ....
});

export type HandGestureType = (typeof HandGestures)[keyof typeof HandGestures];

export type TransformDirection = "down" | "up" | "left" | "right";
export type TransformationType = "scale" | "rotation";
export type TransformParams = {
	transformDirection: TransformDirection;
	transformation: TransformationType;
};

export const digits = [
	// thumb
	[0, 1],
	[1, 2],
	[2, 3],
	[3, 4],

	// index
	[0, 5],
	[5, 6],
	[6, 7],
	[7, 8],

	// middle
	[0, 9],
	[9, 10],
	[10, 11],
	[11, 12],

	// ring
	[0, 13],
	[13, 14],
	[14, 15],
	[15, 16],

	// pinky
	[0, 17],
	[17, 18],
	[18, 19],
	[19, 20],

	// palm
	[0, 5],
	[5, 9],
	[9, 13],
	[13, 17],
];
