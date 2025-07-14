import * as three from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Dimensions = {
	width: number;
	height: number;
};

class Sizes {
	width = window.innerWidth;
	height = window.innerHeight;

	public resize() {
		this.width = window.innerWidth;
		this.height = window.innerHeight;
	}
}

class ThreeCamera {
	camera: three.PerspectiveCamera;
	sizes: Dimensions;

	constructor(sizes: Sizes) {
		this.sizes = sizes;
		this.camera = new three.PerspectiveCamera(
			75,
			this.sizes.width / this.sizes.height,
			0.1,
			100
		);
		this.camera.position.set(3, 3, 3);
	}

	public resize() {
		this.camera.aspect = this.sizes.width / this.sizes.height;
		this.camera.updateProjectionMatrix();
	}
}

class ThreeRenderer {
	renderer: three.WebGLRenderer;
	sizes: Dimensions;

	constructor(canvas: HTMLCanvasElement, sizes: Sizes) {
		this.renderer = new three.WebGLRenderer({
			canvas,
			// alpha: true,
		});
		this.sizes = sizes;
		this.renderer.setSize(this.sizes.width, this.sizes.height);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	}

	public resize() {
		this.renderer?.setSize(this.sizes.width, this.sizes.height);
		this.renderer?.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	}
}

class ThreeControls {
	controls: OrbitControls;

	constructor(camera: three.PerspectiveCamera, canvas: HTMLCanvasElement) {
		this.controls = new OrbitControls(camera, canvas);
		this.controls.enableDamping = true;
	}
}

class ThreeLighting {
	ambientLight = new three.AmbientLight(0xffffff, 2.1);
	directionalLight = new three.DirectionalLight("#ffffff", 2);
	scene: three.Scene;
	renderer: three.WebGLRenderer;
	directionalLighthelper: three.DirectionalLightHelper | null = null;
	shadowHelper: three.CameraHelper | null = null;

	constructor({
		scene,
		renderer,
		initShadow = false,
	}: {
		scene: three.Scene;
		renderer: three.WebGLRenderer;
		initShadow?: boolean;
	}) {
		this.scene = scene;
		this.renderer = renderer;
		this.directionalLight.position.set(-10, 10, -10);
		if (initShadow) {
			this.initShadow();
		}
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
}

export class ThreeCanvas {
	cursor = { x: 0, y: 0 };
	sizes: Sizes;
	threeCamera: ThreeCamera;
	controls: OrbitControls;
	threeRenderer: ThreeRenderer;
	lighting: ThreeLighting;

	scene = new three.Scene();
	textureLoader = new three.TextureLoader();
	clock = new three.Clock();

	constructor({
		canvas,
		initShadow,
	}: {
		canvas: HTMLCanvasElement;
		initShadow: boolean;
	}) {
		this.sizes = new Sizes();
		this.threeCamera = new ThreeCamera(this.sizes);
		this.controls = new ThreeControls(this.threeCamera.camera, canvas).controls;
		this.threeRenderer = new ThreeRenderer(canvas, this.sizes);
		this.lighting = new ThreeLighting({
			scene: this.scene,
			renderer: this.threeRenderer.renderer,
			initShadow,
		});

		this.scene.add(
			this.lighting.ambientLight,
			this.lighting.directionalLight,
			this.threeCamera.camera
		);

		// Add event listeners (important for functionality)
		window.addEventListener("resize", this.resizeCanvas);
		window.addEventListener("scroll", this.handleScroll);
		window.addEventListener("mousemove", this.handleMouseMove);

		this.animationTick();
	}

	/**
	 * Event Actions
	 */
	public resizeCanvas = (): void => {
		// Update sizes
		this.sizes.resize();
		// Update camera
		this.threeCamera.resize();
		// Update renderer
		this.threeRenderer.resize();
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
		this.threeRenderer.renderer.render(this.scene, this.threeCamera.camera);

		// Call tick again on the next frame
		window.requestAnimationFrame(this.animationTick);
	};

	public dispose = (): void => {
		window.removeEventListener("resize", this.resizeCanvas);
		window.removeEventListener("scroll", this.handleScroll);
		window.removeEventListener("mousemove", this.handleMouseMove);
		this.controls.dispose();
		this.threeRenderer.renderer.dispose();
	};

	/**
	 *
	 * Convert a 2d coordinate into usable threejs world coordinates
	 * Useful for cursor tracking
	 * @returns threejs vector3 coordinates
	 */
	public getNormalizedDeviceCoords = ({
		x,
		y,
		mirrored = false,
	}: {
		x: number;
		y: number;
		mirrored?: boolean;
	}): three.Vector3 => {
		// First step is converting the coords to range from -1 - 1 ( [-1, 1 ] )
		// Using a flag to see if we should flip x / y ( like for webcam )
		const flipMirrorFlag = mirrored ? -1 : 1;
		const coordX = flipMirrorFlag * (x * 2 - 1);
		const coordY = flipMirrorFlag * (y * 2 - 1);
		const normalizedCoordinates = new three.Vector3(coordX, coordY, 0);

		// this is the magic trick, it turns the above vector3 to a point according to where the camera sees it
		normalizedCoordinates.unproject(this.threeCamera.camera);

		// then this gives us an invisible ray ( from the camera to the normalized Vector3 )
		// to where we want to position the object to later
		const direction = normalizedCoordinates
			.sub(this.threeCamera.camera.position)
			.normalize();

		const fixedDistance = 5;
		const worldPos = this.threeCamera.camera.position
			.clone()
			.add(direction.multiplyScalar(fixedDistance));

		// then we move the object we want to what we are tracking ( finger )
		return worldPos;
	};
}
