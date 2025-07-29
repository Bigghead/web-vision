import type { HandGestures } from "./constants";

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

export type GestureResponse = {
	gesture: string;
	data?: unknown;
};

export type HandGestureType = (typeof HandGestures)[keyof typeof HandGestures];

export type TransformDirection = "down" | "up" | "left" | "right";
export type TransformationType = "scale" | "rotation";
export type TransformParams = {
	transformDirection: TransformDirection;
	transformation: TransformationType;
};
