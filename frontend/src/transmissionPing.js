import * as THREE from 'three';

const emitters = new Set();

/** Animated dot stream along local nadir — downlink toward Earth */
export function createDownlinkStream(color, {
  count = 8,
  speed = 1.25,
  length = 8,
  dotSize = 0.05,
  guideRadius = 0.018,
  timeOffset = 0,
  phases = null,
  dotScales = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'downlink-stream';
  const dots = [];

  const guide = new THREE.Mesh(
    new THREE.CylinderGeometry(guideRadius, guideRadius * 0.7, length, 8),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28 + Math.min(0.18, guideRadius * 6),
      depthWrite: false,
    }),
  );
  guide.position.y = -length / 2;
  group.add(guide);

  for (let i = 0; i < count; i += 1) {
    const scale = dotScales?.[i] ?? 1;
    const size = dotSize * scale;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), mat);
    dot.userData.phase = phases?.[i] ?? i / count;
    dots.push(dot);
    group.add(dot);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(size * 1.65, 8, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    dot.userData.glow = glow;
    group.add(glow);
  }

  const emitter = {
    speed,
    length,
    baseGuideLength: length,
    guide,
    timeOffset,
    dots,
    tick(timeMs) {
      const t = (timeMs / 1000 + this.timeOffset) * this.speed;
      for (const dot of this.dots) {
        const phase = (t + dot.userData.phase) % 1;
        const y = -phase * this.length;
        dot.position.y = y;
        const opacity = Math.max(0, 0.98 * (1 - phase * 0.85));
        dot.material.opacity = opacity;
        const glow = dot.userData.glow;
        if (glow) {
          glow.position.y = y;
          glow.material.opacity = opacity * 0.35;
        }
      }
    },
  };

  emitters.add(emitter);
  group.userData.downlinkEmitter = emitter;
  return { group, emitter };
}

export function setDownlinkLength(emitter, length) {
  if (!emitter || length <= 0) return;
  emitter.length = length;
  if (emitter.guide && emitter.baseGuideLength) {
    emitter.guide.scale.y = length / emitter.baseGuideLength;
    emitter.guide.position.y = -length / 2;
  }
}

/** Tick downlink animation on a globe mesh instance */
export function tickDownlinkOnObject(obj, timeMs) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.userData?.downlinkEmitter) {
      child.userData.downlinkEmitter.tick(timeMs);
    }
  });
}

/** Match stream length to current altitude + mesh scale */
export function retuneDownlinkOnObject(obj, sat, scale = 1.55, reachLength) {
  if (!obj || !sat) return;
  obj.traverse((child) => {
    const emitter = child.userData?.downlinkEmitter;
    if (!emitter) return;
    const next = reachLength ?? emitter.length;
    if (Math.abs(emitter.length - next) > 0.05) {
      setDownlinkLength(emitter, next);
    }
  });
}

/** @deprecated alias */
export const createTransmissionEmitter = createDownlinkStream;

export function tickDownlinkStreams(timeMs) {
  for (const emitter of emitters) emitter.tick(timeMs);
}

export const tickTransmissionPings = tickDownlinkStreams;

export function clearDownlinkStreams() {
  emitters.clear();
}

export const clearTransmissionPings = clearDownlinkStreams;
