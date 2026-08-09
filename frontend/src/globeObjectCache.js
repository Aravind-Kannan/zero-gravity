import { createSatelliteMesh } from './satelliteMesh.js';
import { createDownlinkStream } from './transmissionPing.js';
import { getGroupColor } from './satelliteTypes.js';
import { GLOBE_UI } from './globeColors.js';
import { downlinkReachLength, stemAnchorLocalY } from './orbitPath.js';

const cache = new Map();

/** Deterministic 0–1 hash from satellite id — stable across telemetry ticks */
function hash01(id, salt = 0) {
  const n = Number(id) || 0;
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function meshIdleScale(group) {
  return group === 'station' ? 6.5 : 3.6;
}

function buildStreamVariation(meta) {
  const { id, group } = meta;
  const isStation = group === 'station';
  const h = (salt) => hash01(id, salt);
  const scale = meshIdleScale(group);
  const reach = downlinkReachLength(meta, scale);

  const count = Math.min(14, (isStation ? 8 : 6) + Math.floor(h(0) * 5) + Math.floor(reach / 5));
  const length = reach * (0.94 + h(1) * 0.1);
  const speed = (isStation ? 1.35 : 1.05) * (0.72 + h(2) * 0.56);
  const dotSize = (isStation ? 0.055 : 0.048) * (0.82 + h(3) * 0.38);
  const guideRadius = (isStation ? 0.022 : 0.018) * (0.75 + h(4) * 0.5);
  const timeOffset = h(5) * 6.5 + h(6) * 4.2;

  const phases = [];
  const dotScales = [];
  for (let i = 0; i < count; i += 1) {
    const bucket = i / count;
    const jitter = h(10 + i) * 0.42;
    phases.push((bucket + jitter) % 1);
    dotScales.push(0.75 + h(20 + i) * 0.55);
  }

  return {
    count,
    speed,
    length,
    dotSize,
    guideRadius,
    timeOffset,
    phases,
    dotScales,
  };
}

/** Stable Three.js instance per satellite + selection state — avoids rebuild on telemetry tick */
export function getGlobeSatObject(meta, isSelected) {
  const key = `${meta.id}-${isSelected ? 'sel' : 'idle'}`;
  if (cache.has(key)) return cache.get(key);

  const mesh = createSatelliteMesh({
    group: meta.group,
    selected: isSelected,
    name: meta.name,
  });
  const streamColor = isSelected ? GLOBE_UI.selected : getGroupColor(meta);
  const { group: streamGroup } = createDownlinkStream(
    streamColor,
    buildStreamVariation(meta),
  );
  streamGroup.position.y = -stemAnchorLocalY(meta.group);
  mesh.add(streamGroup);
  cache.set(key, mesh);
  return mesh;
}

export function clearGlobeObjectCache() {
  cache.clear();
}
