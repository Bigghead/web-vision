import * as three from "three";
import { ThreeCanvas } from "../src/lib/canvas";

const canvas = document.querySelector("canvas.webgl") as HTMLCanvasElement;
if (!canvas) {
  console.error("Canvas element with class 'webgl' not found.");
}

const threeCanvas = new ThreeCanvas({ canvas, initShadow: false });

const cube: three.Mesh<three.BoxGeometry, three.MeshBasicMaterial> =
  new three.Mesh(
    new three.BoxGeometry(1, 1, 1),
    new three.MeshBasicMaterial({ color: 0x00ff00 })
  );

threeCanvas.scene.add(cube);
