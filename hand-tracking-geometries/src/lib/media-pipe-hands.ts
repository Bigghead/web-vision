declare const Hands: any;
declare const Camera: any;

export class MediaPipeHands {
  camera;
  constructor(
    videoElement: HTMLVideoElement,
    width: number,
    height: number,
    callbackFunc: unknown
  ) {
    const hands = new Hands({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    // this callback function is called everytime mediapipe successfully processes a video frame
    hands.onResults(callbackFunc);

    this.camera = new Camera(videoElement, {
      async onFrame() {
        await hands.send({ image: videoElement });
      },
      width,
      height,
    });
  }

  start() {
    if (this.camera) this.camera.start();
  }
}
