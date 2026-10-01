// Throwaway close-up viewer: ?view=side|front|three-quarter|top|kelp
import {
  AmbientLight,
  DirectionalLight,
  FogExp2,
  Color,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { createHamourGeometry, createHamourMaterial } from '../../../libs/world/feature/src/lib/hamour-model';
import { createFishGeometry, createFishMaterial } from '../../../libs/world/feature/src/lib/fish-mesh';
import { createKelpGeometry, createKelpMaterial } from '../../../libs/world/feature/src/lib/kelp-bed';

const view = new URLSearchParams(location.search).get('view') ?? 'side';
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new Scene();
scene.background = new Color('#0a1e3f');
scene.fog = new FogExp2('#0a1e3f', 0.028);
scene.add(new AmbientLight('#1d4f7a', 0.9));
scene.add(new HemisphereLight('#5fb4d9', '#06101f', 1.1));
const sun = new DirectionalLight('#a9dcff', 1.6);
sun.position.set(18, 60, 12);
scene.add(sun);

const time = { value: 1.3 };
const swim = { value: 0.8 };
const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 200);

if (view === 'kelp') {
  const kelp = new InstancedMesh(createKelpGeometry('#264a20', '#a3b84c'), createKelpMaterial({ time, sway: 0.55 }), 12);
  const m = new Matrix4();
  for (let i = 0; i < 12; i++) {
    m.makeScale(1, 3 + (i % 4), 1).setPosition((i % 4) * 0.8 - 1.2, -2, Math.floor(i / 4) * 0.8 - 0.8);
    kelp.setMatrixAt(i, m);
  }
  scene.add(kelp);
  camera.position.set(0, 0.5, 7);
  camera.lookAt(0, 0.5, 0);
} else if (view === 'fish') {
  const fish = new InstancedMesh(createFishGeometry(), createFishMaterial({ color: '#e3bf4f', time }), 3);
  const m = new Matrix4();
  fish.setMatrixAt(0, m.makeRotationY(Math.PI / 2).setPosition(-0.8, 0, 0));
  fish.setMatrixAt(1, m.makeRotationY(0.6).setPosition(0.4, 0.3, 0));
  fish.setMatrixAt(2, m.makeRotationY(-2.3).setPosition(0.6, -0.4, 0.3));
  scene.add(fish);
  camera.position.set(0, 0.3, 2.6);
  camera.lookAt(0, 0, 0);
} else {
  const hamour = new Mesh(createHamourGeometry(), createHamourMaterial({ time, swim }));
  hamour.scale.setScalar(3.6);
  scene.add(hamour);
  const poses: Record<string, [number, number, number]> = {
    side: [6, 0.4, 0.3],
    front: [0.4, 0.2, 6],
    'three-quarter': [4.2, 1.2, 4.2],
    top: [0.5, 6, 0.2],
    back: [-4, 1, -4],
  };
  camera.position.set(...(poses[view] ?? poses.side));
  camera.lookAt(0, 0, 0);
}

const loop = (): void => {
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
};
loop();
