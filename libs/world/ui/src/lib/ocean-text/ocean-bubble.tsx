import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import {
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type ColorRepresentation,
} from 'three';
import { bubbleLayout, type BubbleLayout, type BubbleTailSide, type OceanTextBounds } from './ocean-bubble-layout.js';
import { OCEAN_CAUSTIC_GLSL } from './ocean-text-material.js';
import { OceanText, type OceanTextProps } from './ocean-text.js';

export interface OceanBubbleProps {
  /** The text block to wrap, from `OceanText`'s `onLayout`. */
  readonly bounds: OceanTextBounds;
  /** Space between the text and the bubble's edge, in local units. */
  readonly padding?: number;
  readonly tail?: BubbleTailSide;
  /** The glass body's colour (drawn translucent). */
  readonly color?: ColorRepresentation;
  /** The bright rim. */
  readonly rimColor?: ColorRepresentation;
  readonly reducedMotion?: boolean;
  readonly renderOrder?: number;
}

const BODY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BODY_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform vec4 uQuad;
uniform vec2 uHalf;
uniform float uRadius;
uniform float uUnit;
uniform vec3 uTail[3];
uniform vec3 uColor;
uniform vec3 uRim;
varying vec2 vUv;
${OCEAN_CAUSTIC_GLSL}
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float circle(vec2 p, vec3 c) {
  return c.z > 0.0 ? length(p - c.xy) - c.z : 1e5;
}
void main() {
  vec2 p = mix(uQuad.xy, uQuad.zw, vUv);
  float t = uTime;
  float ang = atan(p.y, p.x);
  // Jelly: the membrane breathes a little, never enough to touch the text.
  float wobble = (sin(ang * 3.0 + t * 1.3) + 0.5 * sin(ang * 5.0 - t * 0.9)) * 0.006 * uUnit * uMotion;
  float body = smin(sdRoundBox(p, uHalf, uRadius) + wobble, circle(p, uTail[0]), 0.09 * uUnit);
  float d = min(body, min(circle(p, uTail[1]), circle(p, uTail[2])));
  float aa = fwidth(d) * 1.2;
  float inside = 1.0 - smoothstep(-aa, aa, d);

  // Fake fresnel: the glass thickens toward the edge.
  float rimWidth = 0.09 * uUnit;
  float edge = pow(1.0 - clamp(-d / rimWidth, 0.0, 1.0), 2.4);
  float innerRim = inside * edge;
  float line = inside * (1.0 - smoothstep(0.0, 0.012 * uUnit + aa, abs(d + 0.006 * uUnit)));
  float halo = (1.0 - inside) * exp(-max(d, 0.0) / (0.05 * uUnit)) * 0.35;

  // Thin-film iridescence along the rim.
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + ang * 0.16 + t * 0.04 + d * 3.0));
  // Soft window highlight hugging the upper-left curve, and a faint round glint lower right.
  vec2 hl = (p - vec2(-uHalf.x + uRadius * 1.0, uHalf.y - uRadius * 0.42)) / vec2(uRadius * 1.1, uRadius * 0.2);
  float highlight = inside * exp(-dot(hl, hl) * 1.8) * 0.4;
  vec2 hl2 = (p - vec2(uHalf.x - uRadius * 0.55, -uHalf.y + uRadius * 0.5)) / vec2(uRadius * 0.12);
  highlight += inside * exp(-dot(hl2, hl2) * 2.5) * 0.18;

  float caustic = oceanCaustic(vec3(p * 0.9, 0.0), t * 0.8);
  float depth = clamp(0.5 - p.y / max(uHalf.y * 2.0, 1e-3), 0.0, 1.0);

  vec3 col = uColor * (0.75 + 0.35 * depth) + uRim * caustic * 0.12;
  col = mix(col, uRim, innerRim * 0.55) + film * innerRim * 0.22 + vec3(1.0) * (highlight + line * 0.5);
  float alpha = inside * (0.42 + 0.18 * depth) + innerRim * 0.35 + line * 0.4 + highlight;
  col = mix(col, uRim, halo > 0.0 ? 1.0 : 0.0);
  alpha = max(alpha, halo);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

const RISING_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uSpan;
varying vec2 vUv;
varying float vLife;
void main() {
  float life = fract(uTime * aSeed.w + aSeed.y);
  float r = aSeed.z * uSpan.z;
  vec2 center = vec2(
    aSeed.x * uSpan.x + sin(life * 9.0 + aSeed.y * 31.0) * 0.04 * uSpan.z,
    uSpan.y - r + life * uSpan.z * 1.6
  );
  vUv = uv;
  vLife = life;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(center + position.xy * r * 2.0, 0.0, 1.0);
}
`;

const RISING_FRAGMENT = /* glsl */ `
uniform vec3 uRim;
varying vec2 vUv;
varying float vLife;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float aa = fwidth(d);
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  float ring = disc * smoothstep(0.55, 0.95, d);
  float glint = exp(-dot(vUv - vec2(0.36, 0.66), vUv - vec2(0.36, 0.66)) * 90.0);
  float fade = sin(vLife * 3.14159);
  float alpha = (ring * 0.75 + disc * 0.12 + glint * 0.9) * fade;
  gl_FragColor = vec4(mix(uRim, vec3(1.0), glint), alpha);
  #include <colorspace_fragment>
}
`;

/** Rising air bubbles per speech bubble: x across the top (-1..1), phase, radius (x unit), speed. */
const RISING_SEEDS = [
  [-0.62, 0.0, 0.05, 0.22],
  [-0.2, 0.37, 0.035, 0.3],
  [0.15, 0.71, 0.06, 0.18],
  [0.48, 0.15, 0.03, 0.34],
  [0.8, 0.55, 0.045, 0.25],
  [-0.85, 0.83, 0.028, 0.29],
] as const;

function createBubbleMaterials() {
  const body = {
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uQuad: { value: new Vector4() },
    uHalf: { value: new Vector2() },
    uRadius: { value: 0 },
    uUnit: { value: 1 },
    uTail: { value: [new Vector3(), new Vector3(), new Vector3()] },
    uColor: { value: new Color() },
    uRim: { value: new Color() },
  };
  const rising = {
    uTime: { value: 0 },
    uSpan: { value: new Vector3() },
    uRim: { value: new Color() },
  };
  const shared = { transparent: true, depthWrite: false, toneMapped: false } as const;
  const bodyMaterial = new ShaderMaterial({
    ...shared,
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT,
    uniforms: body,
  });
  const risingMaterial = new ShaderMaterial({
    ...shared,
    vertexShader: RISING_VERTEX,
    fragmentShader: RISING_FRAGMENT,
    uniforms: rising,
  });
  const plane = new PlaneGeometry(1, 1);
  const risingGeometry = new InstancedBufferGeometry();
  risingGeometry.index = plane.index;
  risingGeometry.setAttribute('position', plane.getAttribute('position'));
  risingGeometry.setAttribute('uv', plane.getAttribute('uv'));
  risingGeometry.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(RISING_SEEDS.flat()), 4));
  risingGeometry.instanceCount = RISING_SEEDS.length;

  return {
    uniforms: { body, rising },
    bodyMaterial,
    risingMaterial,
    risingGeometry,
    applyLayout(layout: BubbleLayout) {
      const { quad } = layout;
      const unit = Math.min(layout.halfHeight * 2, 1.2);
      body.uQuad.value.set(quad.minX, quad.minY, quad.maxX, quad.maxY);
      body.uHalf.value.set(layout.halfWidth, layout.halfHeight);
      body.uRadius.value = layout.radius;
      body.uUnit.value = unit;
      layout.tail.forEach((c, i) => body.uTail.value[i].set(c.x, c.y, c.r));
      rising.uSpan.value.set(layout.halfWidth * 0.85, layout.halfHeight, unit);
    },
    dispose() {
      bodyMaterial.dispose();
      risingMaterial.dispose();
      risingGeometry.dispose();
      plane.dispose();
    },
  };
}

/**
 * A glassy underwater speech bubble sized to a text block: a translucent membrane with a
 * fresnel-like rim, thin-film shimmer and highlights, a tail of air bubbles trailing toward the
 * speaker, and a few tiny bubbles rising off its top. One quad and one six-instance draw; the
 * shape is a signed-distance field, so resizing only updates uniforms.
 */
export function OceanBubble({
  bounds,
  padding = 0.14,
  tail = 'left',
  color = '#0b4a63',
  rimColor = '#9ff4ff',
  reducedMotion = false,
  renderOrder = 0,
}: OceanBubbleProps) {
  const bubble = useMemo(createBubbleMaterials, []);
  useEffect(() => () => bubble.dispose(), [bubble]);

  const layout = useMemo(() => bubbleLayout(bounds, padding, tail), [bounds, padding, tail]);
  useEffect(() => bubble.applyLayout(layout), [bubble, layout]);
  useEffect(() => {
    bubble.uniforms.body.uColor.value.set(color);
    bubble.uniforms.body.uRim.value.set(rimColor);
    bubble.uniforms.rising.uRim.value.set(rimColor);
  }, [bubble, color, rimColor]);

  useFrame((state) => {
    const time = reducedMotion ? 0 : state.clock.elapsedTime;
    bubble.uniforms.body.uTime.value = time;
    bubble.uniforms.body.uMotion.value = reducedMotion ? 0 : 1;
    bubble.uniforms.rising.uTime.value = time;
  });

  const { quad } = layout;
  return (
    <group position={[layout.centerX, layout.centerY, 0]}>
      <mesh
        position={[(quad.minX + quad.maxX) / 2, (quad.minY + quad.maxY) / 2, 0]}
        scale={[quad.maxX - quad.minX, quad.maxY - quad.minY, 1]}
        material={bubble.bodyMaterial}
        renderOrder={renderOrder}
      >
        <planeGeometry args={[1, 1]} />
      </mesh>
      {reducedMotion ? null : (
        <mesh
          geometry={bubble.risingGeometry}
          material={bubble.risingMaterial}
          renderOrder={renderOrder}
          frustumCulled={false}
        />
      )}
    </group>
  );
}

export interface OceanSpeechBubbleProps extends OceanTextProps {
  readonly padding?: number;
  readonly tail?: BubbleTailSide;
  readonly bubbleColor?: ColorRepresentation;
  readonly rimColor?: ColorRepresentation;
}

/** `OceanText` inside an `OceanBubble` that follows the text's laid-out size. */
export function OceanSpeechBubble({
  padding,
  tail,
  bubbleColor,
  rimColor,
  position,
  onLayout,
  renderOrder = 1,
  ...text
}: OceanSpeechBubbleProps) {
  const [bounds, setBounds] = useState<OceanTextBounds | null>(null);
  const handleLayout = (next: OceanTextBounds) => {
    setBounds(next);
    onLayout?.(next);
  };
  return (
    <group position={position ? [...position] : undefined}>
      {bounds ? (
        <OceanBubble
          bounds={bounds}
          padding={padding}
          tail={tail}
          color={bubbleColor}
          rimColor={rimColor}
          reducedMotion={text.reducedMotion}
          renderOrder={renderOrder - 1}
        />
      ) : null}
      <OceanText {...text} position={[0, 0, 0.01]} renderOrder={renderOrder} onLayout={handleLayout} />
    </group>
  );
}
