import type { OceanLightsConfig } from './ocean-config.js';

export interface OceanLightsProps {
  readonly config: OceanLightsConfig;
}

/**
 * The ambient rig: a blue ambient floor so nothing goes pure black, a hemisphere light for
 * the bright-surface / dark-seabed gradient, and one steep directional "sun through the
 * water" key that the caustics pattern implies. No shadows: they cost a depth pass and the
 * fog hides their absence.
 */
export function OceanLights({ config }: OceanLightsProps) {
  return (
    <>
      <ambientLight color={config.ambientColor} intensity={config.ambientIntensity} />
      <hemisphereLight args={[config.skyColor, config.groundColor, config.hemisphereIntensity]} />
      <directionalLight
        color={config.sunColor}
        intensity={config.sunIntensity}
        position={[18, 60, 12]}
      />
    </>
  );
}
