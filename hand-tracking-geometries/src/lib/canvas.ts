import * as three from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Base
 */

export class ThreeCanvas {
  sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
  };
  cursor = { x: 0, y: 0 };

  scene = new three.Scene();
  ambientLight = new three.AmbientLight(0xffffff, 2.1);
  directionalLight = new three.DirectionalLight("#ffffff", 2);
  camera = new three.PerspectiveCamera(
    75,
    this.sizes.width / this.sizes.height,
    0.1,
    100
  );
  textureLoader = new three.TextureLoader();
  clock = new three.Clock();

  directionalLighthelper: three.DirectionalLightHelper | null = null;
  shadowHelper: three.CameraHelper | null = null;
  controls: OrbitControls;
  renderer: three.WebGLRenderer;

  constructor({
    canvas,
    initShadow,
  }: {
    canvas: HTMLCanvasElement;
    initShadow: boolean;
  }) {
    this.directionalLight.position.set(-10, 10, -10);

    this.camera.position.set(3, 3, 3);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;

    this.renderer = new three.WebGLRenderer({
      canvas,
      alpha: true,
    });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (initShadow) {
      this.initShadow();
    }
    this.scene.add(this.ambientLight, this.directionalLight, this.camera);

    // Add event listeners (important for functionality)
    window.addEventListener("resize", this.resizeCanvas);
    window.addEventListener("scroll", this.handleScroll);
    window.addEventListener("mousemove", this.handleMouseMove);

    this.animationTick();
  }

  initShadow = (): void => {
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(1024, 1024);
    this.directionalLight.shadow.camera.far = 40;
    this.directionalLight.shadow.camera.left = -10;
    this.directionalLight.shadow.camera.top = 10;
    this.directionalLight.shadow.camera.right = 10;
    this.directionalLight.shadow.camera.bottom = -10;

    this.directionalLight.shadow.camera.updateProjectionMatrix();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = three.PCFSoftShadowMap;

    this.directionalLighthelper = new three.DirectionalLightHelper(
      this.directionalLight
    );
    this.shadowHelper = new three.CameraHelper(
      this.directionalLight.shadow.camera
    );
    this.directionalLighthelper.update();
    this.shadowHelper.update();
    this.scene.add(this.directionalLighthelper);
    this.scene.add(this.shadowHelper);
  };

  /**
   * Event Actions
   */
  public resizeCanvas = (): void => {
    // Update sizes
    this.sizes.width = window.innerWidth;
    this.sizes.height = window.innerHeight;

    // Update camera
    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    // Update renderer
    this.renderer?.setSize(this.sizes.width, this.sizes.height);
    this.renderer?.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };

  public handleScroll = (): void => {
    scrollY = window.scrollY;
  };

  public handleMouseMove = (e: MouseEvent): void => {
    const { clientX, clientY } = e;
    const { width, height } = this.sizes;
    this.cursor.x = clientX / width - 0.5;
    this.cursor.y = clientY / height - 0.5;
  };

  /**
   * Animate
   */
  public animationTick = (): void => {
    const elapsedTime = this.clock.getElapsedTime();

    // Update controls
    this.controls.update();

    // Render
    this.renderer.render(this.scene, this.camera);

    // Call tick again on the next frame
    window.requestAnimationFrame(this.animationTick);
  };

  public dispose = (): void => {
    window.removeEventListener("resize", this.resizeCanvas);
    window.removeEventListener("scroll", this.handleScroll);
    window.removeEventListener("mousemove", this.handleMouseMove);
    this.controls.dispose();
    this.renderer.dispose();
  };

  // get the viewable screen for a threejs canvas
  // used for converting canvas / html cursor or mediapipe coordinates into usable threejs positioning
  public get3dWorldScreenSize = (): {
    viewableHeight: number;
    viewableWidth: number;
  } => {
    const { aspect, fov, position } = this.camera;
    const fovRad = three.MathUtils.degToRad(fov); // Convert camera FOV from degrees to radians

    const cameraToTargetDist = Math.abs(position.z - 0);
    console.log(position, cameraToTargetDist);

    // Calculate the actual height and width visible in the 3D world
    const viewableHeight = 2 * Math.tan(fovRad / 2) * cameraToTargetDist;
    const viewableWidth = viewableHeight * aspect;

    return {
      viewableHeight,
      viewableWidth,
    };
  };
}
