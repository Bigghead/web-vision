import * as three from "three";
import { ThreeCanvas } from "../src/lib/canvas";
import { MediaPipeHands } from "./lib/media-pipe-hands";

const canvas = document.querySelector("canvas.webgl") as HTMLCanvasElement;
const webcam = document.querySelector("video.webcam") as HTMLVideoElement;

if (!canvas) {
  console.error("Canvas element with class 'webgl' not found.");
}

const threeCanvas = new ThreeCanvas({ canvas, initShadow: false });
const {
  sizes: { width, height },
} = threeCanvas;

const cube: three.Mesh<three.BoxGeometry, three.MeshBasicMaterial> =
  new three.Mesh(
    new three.BoxGeometry(1, 1, 1),
    new three.MeshBasicMaterial({ color: 0x00ff00 })
  );

threeCanvas.scene.add(cube);

type WebcamResponse = {
  success: boolean;
  error?: string | Error;
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

(async () => {
  try {
    await initWebcam();
    const hands = new MediaPipeHands(webcam, width, height, () =>
      console.log("hands started")
    );
    hands.start();
  } catch (e) {
    console.error(e);
  }
})();
