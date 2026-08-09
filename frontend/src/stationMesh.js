import * as THREE from 'three';

const cache = new Map();

function isTiangong(name = '') {
  return /tiangong|css|tianhe|wentian|mengtian/i.test(name);
}

function mat(color, { emissive = 0, intensity = 0.15, metalness = 0.45, roughness = 0.4 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive: emissive || color,
    emissiveIntensity: intensity,
  });
}

/** ISS / Tiangong-style station with suspension stem + anchor glow */
export function createSpaceStationMesh({ selected = false, name = '' } = {}) {
  const variant = isTiangong(name) ? 'cn' : 'iss';
  const key = `${variant}-${selected}`;
  if (cache.has(key)) return cache.get(key).clone();

  const root = new THREE.Group();
  const accent = selected ? 0xf5f4fa : variant === 'cn' ? 0xf0aa55 : 0xe8a04a;
  const panel = 0x1a2838;
  const module = 0xb8bcc8;
  const truss = 0x8a9098;

  // Suspension — long stem + glowing anchor at orbit level
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.028, 0.72, 8),
    mat(0x6a7585, { intensity: 0.08, metalness: 0.7, roughness: 0.25 }),
  );
  stem.position.y = -0.42;

  const anchor = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    mat(accent, { intensity: selected ? 0.55 : 0.35, metalness: 0.3, roughness: 0.35 }),
  );
  anchor.position.y = -0.76;

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.11, 24),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: selected ? 0.45 : 0.28,
      side: THREE.DoubleSide,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.76;

  // Main truss
  const mainTruss = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.12, 0.12),
    mat(truss, { intensity: 0.1, metalness: 0.55, roughness: 0.35 }),
  );
  mainTruss.position.y = 0.08;

  const crossTruss = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.9),
    mat(truss, { intensity: 0.08, metalness: 0.5, roughness: 0.4 }),
  );
  crossTruss.position.y = 0.08;

  // Hab modules
  const coreModule = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.55, 16),
    mat(module, { intensity: 0.12, metalness: 0.4, roughness: 0.45 }),
  );
  coreModule.rotation.z = Math.PI / 2;
  coreModule.position.set(0, 0.1, 0);

  const nodeModule = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    mat(module, { intensity: 0.1, metalness: 0.35, roughness: 0.5 }),
  );
  nodeModule.position.set(variant === 'cn' ? 0.35 : -0.42, 0.1, 0);

  // Solar arrays — large cross wings
  const panelGeom = new THREE.BoxGeometry(0.55, 0.025, 0.32);
  const panelMat = mat(panel, { intensity: 0.06, metalness: 0.65, roughness: 0.2 });

  const wings = new THREE.Group();
  const wingOffsets = [
    [-0.95, 0.08, 0],
    [0.95, 0.08, 0],
    [0, 0.08, -0.55],
    [0, 0.08, 0.55],
  ];
  wingOffsets.forEach(([x, y, z]) => {
    const wing = new THREE.Mesh(panelGeom, panelMat);
    wing.position.set(x, y, z);
    if (z !== 0) wing.rotation.y = Math.PI / 2;
    wings.add(wing);
  });

  // Radiator stripes on panels
  wingOffsets.forEach(([x, y, z]) => {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(z === 0 ? 0.5 : 0.28, 0.028, z === 0 ? 0.04 : 0.5),
      mat(accent, { intensity: 0.2, metalness: 0.4, roughness: 0.3 }),
    );
    stripe.position.set(x, y + 0.02, z);
    if (z !== 0) stripe.rotation.y = Math.PI / 2;
    wings.add(stripe);
  });

  // Docking ring highlight
  const dock = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.018, 8, 20),
    mat(accent, { intensity: 0.35, metalness: 0.5, roughness: 0.3 }),
  );
  dock.rotation.y = Math.PI / 2;
  dock.position.set(variant === 'cn' ? -0.55 : 0.62, 0.1, 0);

  const orbitHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.008, 6, 32),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: selected ? 0.35 : 0.22,
    }),
  );
  orbitHalo.rotation.x = Math.PI / 2;
  orbitHalo.position.y = 0.1;

  root.add(stem, anchor, halo, mainTruss, crossTruss, coreModule, nodeModule, wings, dock, orbitHalo);
  root.scale.setScalar(selected ? 9.2 : 6.5);

  cache.set(key, root);
  return root.clone();
}
