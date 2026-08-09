import * as THREE from 'three';

/** Position + orient a custom-layer object on the globe surface normal */

const HALO_NAME = 'zg-selection-halo';
const HALO_COLOR = 0xf5f4fa;

export function placeOnGlobe(obj, globe, lat, lng, alt) {
  if (!globe || lat == null || lng == null) return;
  Object.assign(obj.position, globe.getCoords(lat, lng, alt));
  obj.lookAt(0, 0, 0);
  obj.rotateX(-Math.PI / 2);
}

export function applySelectionScale(obj, selected, { station = false } = {}) {
  const base = station ? 6.5 : 3.6;
  const sel = station ? 9.2 : 7.4;
  const target = selected ? sel : base;
  if (obj.userData.baseScale !== target) {
    obj.userData.baseScale = target;
    obj.scale.setScalar(target);
  }
}

/** Pulsing ring halo for selected mesh — no body color shift */
export function applySelectionHighlight(obj, selected, { station = false, timeMs = 0 } = {}) {
  let halo = obj.getObjectByName(HALO_NAME);

  if (selected) {
    if (!halo) {
      const radius = station ? 0.62 : 0.52;
      halo = new THREE.Group();
      halo.name = HALO_NAME;

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.018, 8, 40),
        new THREE.MeshBasicMaterial({
          color: HALO_COLOR,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;

      const outer = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.9, radius * 1.22, 40),
        new THREE.MeshBasicMaterial({
          color: HALO_COLOR,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      outer.rotation.x = Math.PI / 2;
      outer.userData.isOuter = true;

      halo.add(ring, outer);
      halo.position.y = 0.06;
      obj.add(halo);
    }

    halo.visible = true;
    const pulse = 0.55 + Math.sin(timeMs * 0.004) * 0.25;
    halo.children.forEach((child) => {
      if (!child.material) return;
      child.material.opacity = child.userData.isOuter
        ? pulse * 0.55
        : 0.7 + pulse * 0.25;
    });
  } else if (halo) {
    halo.visible = false;
  }
}
