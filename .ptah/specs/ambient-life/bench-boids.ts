// Throwaway CPU benchmark: node --experimental-strip-types bench-boids.ts
// Cost of one frame of boids (step + matrix write) per tier budget.
import { QUALITY_PROFILES } from '../../../libs/world/domain/src/lib/quality-profile.ts';
import { createSchoolState, stepSchool, writeSchoolMatrices } from '../../../libs/world/feature/src/lib/fish-school.ts';

for (const tier of ['low', 'medium', 'high'] as const) {
  const { schools, fishPerSchool, neighbourSamples } = QUALITY_PROFILES[tier].ambientLife;
  const spec = { center: [0, 6, 0] as const, radius: 6, speed: 2, size: 0.4, color: '#ffffff' };
  const states = Array.from({ length: schools }, (_, i) => createSchoolState(spec, fishPerSchool, i + 1));
  const out = new Float32Array(fishPerSchool * 16);
  const frame = (): void => {
    for (const state of states) {
      stepSchool(state, spec, 1 / 60, neighbourSamples);
      writeSchoolMatrices(state, spec.size, out);
    }
  };
  for (let i = 0; i < 600; i++) frame(); // warm up the JIT
  const frames = 6000;
  const start = performance.now();
  for (let i = 0; i < frames; i++) frame();
  const perFrame = (performance.now() - start) / frames;
  console.log(`${tier}: ${schools}x${fishPerSchool} fish, ${neighbourSamples} neighbours -> ${(perFrame * 1000).toFixed(1)} us/frame`);
}
