export const ctxLineSize = 2.5;

export type WebcamResponse = {
	success: boolean;
	error?: string | Error;
};

export type MultiHandLandmark = {
	visibility: unknown;
	x: number;
	y: number;
	z: number;
};

export const HandGestures = Object.freeze({
	// pinched scale down or up
	PINCHED: "pinched",
	// drag / drop
	SQUEEZED: "squeezed",
	// rotate
	// ....
});

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
