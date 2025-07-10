import * as three from "three";
import { ThreeCanvas } from "../src/lib/canvas";
import { MediaPipeHands } from "./lib/media-pipe-hands";

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

type HandDigits = {
  thumb: MultiHandLandmark[];
  index: MultiHandLandmark[];
  middle: MultiHandLandmark[];
  ring: MultiHandLandmark[];
  little: MultiHandLandmark[];
};

// Each
const getDigits = (hand: MultiHandLandmark[] | null): HandDigits | null => {
  if (!hand) return null;
  return {
    thumb: hand.slice(0, 5),
    index: hand.slice(5, 9),
    middle: hand.slice(9, 13),
    ring: hand.slice(13, 17),
    little: hand.slice(17, hand.length),
  };
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
      }: {
        multiHandLandmarks: MultiHandLandmark[][];
      }) => {
        console.log("hands started", multiHandLandmarks);
        // landmarks are 20 points on your hand, with 0 - 5 being where your palm begins and thumb ends split into 5
        if (multiHandLandmarks.length) {
          const leftHand = multiHandLandmarks[0];
          const rightHand = multiHandLandmarks[1];

          const leftDigits = getDigits(leftHand);
          const rightDigits = getDigits(rightHand);

          if (leftDigits) {
            console.log("Canvas element:", canvas2d);
            console.log(
              "Canvas width:",
              canvas2d.width,
              "height:",
              canvas2d.height
            );
            console.log("2D Context:", ctx);
            const thumbTip = leftDigits.thumb[0];

            console.log(thumbTip.x, thumbTip.y);

            const pixelX = thumbTip.x * canvas.width;
            const pixelY = thumbTip.y * canvas.height;
            ctx.beginPath();
            ctx.arc(pixelX, pixelY, 5, 0, Math.PI * 2);
            ctx.fillStyle = "green";
            ctx.fill();
            ctx.closePath();
          }
        }
      }
    );
    hands.start();
  } catch (e) {
    console.error(e);
  }
})();
