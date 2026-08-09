import * as THREE from 'three';
import { getGroupColor, getSatelliteGroup } from './satelliteTypes.js';
import { createSpaceStationMesh } from './stationMesh.js';

const meshCache = new Map();

function hexToThree(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export function createSatelliteMesh({ group = 'visual', selected = false, name = '' } = {}) {
  const type = getSatelliteGroup({ group });

  if (type === 'station') {
    return createSpaceStationMesh({ selected, name });
  }

  const key = `${type}-${selected}`;
  if (meshCache.has(key)) return meshCache.get(key).clone();

  const meshGroup = new THREE.Group();
  const bodyColor = selected ? 0xf5f4fa : hexToThree(getGroupColor({ group: type }));
  const panelColor = 0x2a3544;
  const accent = bodyColor;

  // Suspension stem + anchor glow toward orbit level
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.02, 0.42, 8),
    new THREE.MeshStandardMaterial({
      color: 0x6a7585,
      metalness: 0.65,
      roughness: 0.3,
      emissive: 0x4a5565,
      emissiveIntensity: 0.08,
    }),
  );
  stem.position.y = -0.24;

  const anchor = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 10, 10),
    new THREE.MeshStandardMaterial({
      color: accent,
      metalness: 0.35,
      roughness: 0.4,
      emissive: accent,
      emissiveIntensity: selected ? 0.45 : 0.28,
    }),
  );
  anchor.position.y = -0.44;

  const anchorHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.035, 0.08, 20),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: selected ? 0.4 : 0.24,
      side: THREE.DoubleSide,
    }),
  );
  anchorHalo.rotation.x = Math.PI / 2;
  anchorHalo.position.y = -0.44;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.35, 0.55),
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      metalness: 0.35,
      roughness: 0.45,
      emissive: bodyColor,
      emissiveIntensity: selected ? 0.25 : 0.12,
    }),
  );

  const panelMat = new THREE.MeshStandardMaterial({
    color: panelColor,
    metalness: 0.5,
    roughness: 0.35,
  });

  const panelGeom = new THREE.BoxGeometry(1.1, 0.03, 0.38);
  const panelL = new THREE.Mesh(panelGeom, panelMat);
  panelL.position.set(-0.75, 0, 0);
  const panelR = panelL.clone();
  panelR.position.set(0.75, 0, 0);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6),
    new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.6, roughness: 0.3 }),
  );
  antenna.position.set(0, 0.28, 0);

  meshGroup.add(stem, anchor, anchorHalo, body, panelL, panelR, antenna);
  meshGroup.scale.setScalar(selected ? 7.4 : 3.6);

  meshCache.set(key, meshGroup);
  return meshGroup.clone();
}
