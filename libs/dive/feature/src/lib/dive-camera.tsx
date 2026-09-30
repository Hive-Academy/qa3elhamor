import { useFrame, useThree } from '@react-three/fiber';
import { useDive } from './dive-context.js';

/**
 * Drives the default R3F camera along the dive. Render inside `<Canvas>`, below a
 * `<DiveProvider>`, and with no other camera controls mounted.
 *
 * Per frame it advances the controller and copies its pose onto the camera; the pose buffers
 * are reused and `Object3D.lookAt` uses three.js's module-level temporaries, so nothing is
 * allocated in the loop.
 */
export function DiveCamera() {
  const controller = useDive();
  const camera = useThree((state) => state.camera);

  useFrame((_, delta) => {
    controller.step(delta);
    const { position, lookAt } = controller.pose;
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  });

  return null;
}
