/** Stable globe layer — mutate positions in place, refresh catalog only when ids change */

export function mergeSatelliteList(prev, next) {
  if (!next?.length) return prev?.length ? [...prev] : [];
  if (!prev?.length) return next.map(s => ({ ...s }));

  const incoming = new Map(next.map(s => [s.id, s]));
  const merged = [];

  for (const existing of prev) {
    const update = incoming.get(existing.id);
    if (update) {
      Object.assign(existing, update);
      incoming.delete(existing.id);
      merged.push(existing);
    }
  }

  for (const added of incoming.values()) {
    merged.push({ ...added });
  }

  return merged;
}

/** Mutate existing catalog — same array + object identities */
export function mergeSatelliteListInPlace(target, next) {
  if (!next?.length) return target;
  if (!target.length) {
    target.push(...next.map(s => ({ ...s })));
    return target;
  }

  const incoming = new Map(next.map(s => [s.id, s]));

  for (let i = target.length - 1; i >= 0; i -= 1) {
    if (!incoming.has(target[i].id)) target.splice(i, 1);
  }

  for (const existing of target) {
    const update = incoming.get(existing.id);
    if (update) Object.assign(existing, update);
    incoming.delete(existing.id);
  }

  for (const added of incoming.values()) {
    target.push({ ...added });
  }

  return target;
}

export function filterSatellites(list, filter, search) {
  return list.filter(s => {
    const matchesFilter = filter === 'all'
      || (filter === 'station' && s.group === 'station')
      || (filter === 'visual' && s.group !== 'station');
    const matchesSearch = !search
      || s.name.toLowerCase().includes(search.toLowerCase())
      || String(s.catId).includes(search);
    return matchesFilter && matchesSearch;
  });
}

export function catalogKey(list, filter, search) {
  return filterSatellites(list, filter, search).map(s => s.id).join(',');
}

const meshRegistry = new Map();

export function registerGlobeMesh(id, obj, sat) {
  const existing = meshRegistry.get(id);
  if (existing) {
    existing.obj = obj;
    existing.sat = sat;
    return;
  }
  meshRegistry.set(id, { obj, sat });
}

export function unregisterGlobeMesh(id) {
  meshRegistry.delete(id);
}

export function pruneGlobeMeshRegistry(activeIds) {
  for (const id of meshRegistry.keys()) {
    if (!activeIds.has(id)) meshRegistry.delete(id);
  }
}

export function clearGlobeMeshRegistry() {
  meshRegistry.clear();
}

export function forEachGlobeMesh(fn) {
  for (const entry of meshRegistry.values()) fn(entry);
}
