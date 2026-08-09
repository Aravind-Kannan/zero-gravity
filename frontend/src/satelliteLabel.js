import { altitudeBand, altitudeBandLabel, escapeHtml } from './orbitPath.js';
import { getGroupLabel, getSatelliteGroup } from './satelliteTypes.js';

function fmtCoord(value, suffix = '°') {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(2)}${suffix}`;
}

function fmtGroup(group) {
  return getGroupLabel({ group: getSatelliteGroup({ group }) });
}

export function buildCompactSatelliteLabelHtml(d, { flag = '🛰️' } = {}) {
  const name = escapeHtml(d.name);
  const group = escapeHtml(getGroupLabel(d));
  const groupKey = escapeHtml(getSatelliteGroup(d));

  return `
    <span class="zg-sat-label__tail" aria-hidden="true"></span>
    <div class="zg-sat-label__compact">
      <span class="zg-sat-label__flag" aria-hidden="true">${flag}</span>
      <span class="zg-sat-label__name">${name}</span>
      <span class="zg-sat-label__tag zg-sat-label__tag--${groupKey}">${group}</span>
    </div>
  `;
}

export function buildSatelliteLabelHtml(d, { pinned = false, flag = '🛰️' } = {}) {
  const name = escapeHtml(d.name);
  const band = altitudeBandLabel(d);
  const bandKey = altitudeBand(d);
  const alt = d.alt != null ? `${d.alt} km` : '—';
  const vel = d.velocity != null ? `${d.velocity} km/s` : '—';
  const norad = d.catId || d.id || '—';
  const hint = pinned ? 'Selected target' : 'Click to track';

  return `
    <span class="zg-sat-label__tail" aria-hidden="true"></span>
    <div class="zg-sat-label__body">
    <div class="zg-sat-label__head">
      <span class="zg-sat-label__flag" aria-hidden="true">${flag}</span>
      <div class="zg-sat-label__title-wrap">
        <span class="zg-sat-label__name">${name}</span>
        <span class="zg-sat-label__norad">NORAD ${escapeHtml(norad)}</span>
      </div>
    </div>
    <div class="zg-sat-label__tags">
      <span class="zg-sat-label__tag zg-sat-label__tag--${escapeHtml(getSatelliteGroup(d))}">${fmtGroup(d.group)}</span>
      <span class="zg-sat-label__tag zg-sat-label__tag--${bandKey}">${band}</span>
    </div>
    <div class="zg-sat-label__grid">
      <div class="zg-sat-label__stat">
        <span class="zg-sat-label__stat-label">Altitude</span>
        <strong class="zg-sat-label__stat-value">${alt}</strong>
      </div>
      <div class="zg-sat-label__stat">
        <span class="zg-sat-label__stat-label">Velocity</span>
        <strong class="zg-sat-label__stat-value">${vel}</strong>
      </div>
      <div class="zg-sat-label__stat">
        <span class="zg-sat-label__stat-label">Latitude</span>
        <strong class="zg-sat-label__stat-value">${fmtCoord(d.lat)}</strong>
      </div>
      <div class="zg-sat-label__stat">
        <span class="zg-sat-label__stat-label">Longitude</span>
        <strong class="zg-sat-label__stat-value">${fmtCoord(d.lng)}</strong>
      </div>
    </div>
    <div class="zg-sat-label__foot">
      <span class="zg-sat-label__hint">${hint}</span>
    </div>
    </div>
  `;
}
