// Pure logic for the phase 0 sync test: the character file format,
// merging change logs from several devices, undo, and HP calculation.
// No browser or network code here, so it can be tested in Node.

export const FORMAT = 'subq-phase0-character';

export function newCharacter(name, player, maxHp = 40) {
  return {
    format: FORMAT,
    version: 1,
    name,
    player,
    baseHp: maxHp,
    maxHp,
    events: [],
    lastEdited: null,
  };
}

export function validateDoc(doc) {
  if (!doc || typeof doc !== 'object' || doc.format !== FORMAT) {
    throw new Error('Not a phase 0 test character file');
  }
  if (!Array.isArray(doc.events)) doc.events = [];
  return doc;
}

// Events are ordered by time, then by id so every device agrees on the order
// even when two changes share a timestamp.
export function compareEvents(a, b) {
  if (a.ts !== b.ts) return a.ts - b.ts;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Union of two change logs. An id seen twice is the same change, kept once.
export function mergeEvents(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const event of list || []) {
      if (event && event.id && !byId.has(event.id)) byId.set(event.id, event);
    }
  }
  return [...byId.values()].sort(compareEvents);
}

export function mergeDoc(remote, localEvents) {
  return { ...remote, events: mergeEvents(remote.events, localEvents) };
}

export function undoneIds(events) {
  const ids = new Set();
  for (const event of events) {
    if (event.kind === 'undo' && event.target) ids.add(event.target);
  }
  return ids;
}

// HP changes still in force: not undone by any undo entry.
export function effectiveEvents(events) {
  const undone = undoneIds(events);
  return events
    .filter((event) => event.kind === 'hp' && !undone.has(event.id))
    .sort(compareEvents);
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Changes apply in time order, clamped between 0 and max HP after each one,
// so a long rest merged in after damage restores HP as expected.
export function computeHp(doc) {
  let hp = doc.baseHp;
  for (const event of effectiveEvents(doc.events)) {
    if (event.set) hp = clamp(event.value, 0, doc.maxHp);
    else hp = clamp(hp + event.delta, 0, doc.maxHp);
  }
  return hp;
}

export function lastUndoable(events) {
  const live = effectiveEvents(events);
  return live.length ? live[live.length - 1] : null;
}

// Ids from `ids` that are not in `events`.
export function missingIds(events, ids) {
  const present = new Set((events || []).map((event) => event.id));
  return ids.filter((id) => !present.has(id));
}

export function describeEvent(event, events = []) {
  if (event.kind === 'undo') {
    const target = events.find((other) => other.id === event.target);
    return target ? `Undo (${describeEvent(target)})` : 'Undo';
  }
  if (event.set) return `Long rest: HP set to ${event.value}`;
  const sign = event.delta > 0 ? '+' : '−';
  return `${sign}${Math.abs(event.delta)} HP`;
}
