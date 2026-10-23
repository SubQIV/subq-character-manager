// The change log. A character is a base snapshot plus a list of entries; the
// sheet you see is the base with every entry replayed in time order. Undo is
// an entry that marks an earlier one as reversed, so it merges like any other
// change once sync arrives. This is the model proven in phase 0.

import type { CharacterState } from './types';
import { effectiveHpMax } from './derive';

export type Seg = string | number | { id: string };
export type Path = Seg[];
export type Bound = number | Path | null;

export type Change =
  | { t: 'set'; path: Path; value: unknown }
  | { t: 'add'; path: Path; delta: number; min?: Bound; max?: Bound }
  | { t: 'damage'; amount: number }
  | { t: 'heal'; amount: number }
  | { t: 'insert'; path: Path; item: { id: string } }
  | { t: 'remove'; path: Path; id: string }
  | { t: 'batch'; changes: Change[] };

export interface Entry {
  id: string;
  ts: number;
  /** Device name at the time, shown in history. */
  device: string;
  /** Human-readable description, e.g. "Damage 7: HP 32 → 25". */
  label: string;
  /** What the entry touches, for per-resource history: "hp", "tracker:<id>"… */
  scope: string[];
  change?: Change;
  /** Set on undo entries: the id of the entry being reversed. */
  undo?: string;
  /** Level-ups and similar, kept forever in the milestone log. */
  milestone?: boolean;
}

export interface Milestone {
  ts: number;
  label: string;
}

export interface CharacterDoc {
  id: string;
  schema: 1;
  createdAt: number;
  base: CharacterState;
  entries: Entry[];
  milestones: Milestone[];
}

export function compareEntries(a: Entry, b: Entry): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortedEntries(entries: Entry[]): Entry[] {
  return [...entries].sort(compareEntries);
}

export function undoneIds(entries: Entry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) if (entry.undo) ids.add(entry.undo);
  return ids;
}

/** Entries currently in force: not undo entries and not undone. */
export function liveEntries(entries: Entry[]): Entry[] {
  const undone = undoneIds(entries);
  return sortedEntries(entries).filter((entry) => !entry.undo && !undone.has(entry.id) && entry.change);
}

export function lastUndoable(entries: Entry[], scope?: string): Entry | null {
  const live = liveEntries(entries).filter((entry) => !scope || entry.scope.includes(scope));
  return live.length ? live[live.length - 1] : null;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

type Container = Record<string | number, unknown> | unknown[];

function step(container: unknown, seg: Seg): { parent: Container; key: string | number } | null {
  if (container === null || typeof container !== 'object') return null;
  if (typeof seg === 'object') {
    if (!Array.isArray(container)) return null;
    const index = container.findIndex((item) => (item as { id?: string })?.id === seg.id);
    return index === -1 ? null : { parent: container, key: index };
  }
  return { parent: container as Container, key: seg };
}

function locate(state: unknown, path: Path): { parent: Container; key: string | number } | null {
  let current: unknown = state;
  let found: { parent: Container; key: string | number } | null = null;
  for (let i = 0; i < path.length; i += 1) {
    found = step(current, path[i]);
    if (!found) return null;
    if (i < path.length - 1) current = (found.parent as Record<string | number, unknown>)[found.key];
  }
  return found;
}

export function getAt(state: unknown, path: Path): unknown {
  if (!path.length) return state;
  const spot = locate(state, path);
  return spot ? (spot.parent as Record<string | number, unknown>)[spot.key] : undefined;
}

function setAt(state: unknown, path: Path, value: unknown): void {
  const spot = locate(state, path);
  if (spot) (spot.parent as Record<string | number, unknown>)[spot.key] = value;
}

function resolveBound(state: CharacterState, bound: Bound | undefined): number | null {
  if (bound === undefined || bound === null) return null;
  if (typeof bound === 'number') return bound;
  const value = getAt(state, bound);
  return typeof value === 'number' ? value : null;
}

// ---------------------------------------------------------------------------
// Applying changes
// ---------------------------------------------------------------------------

function apply(state: CharacterState, change: Change): void {
  switch (change.t) {
    case 'set':
      setAt(state, change.path, structuredClone(change.value));
      return;
    case 'add': {
      const current = getAt(state, change.path);
      if (typeof current !== 'number') return;
      let next = current + change.delta;
      const min = resolveBound(state, change.min);
      const max = resolveBound(state, change.max);
      if (max !== null) next = Math.min(max, next);
      if (min !== null) next = Math.max(min, next);
      setAt(state, change.path, next);
      return;
    }
    case 'damage': {
      let amount = Math.max(0, change.amount);
      const absorbed = Math.min(state.hp.temp, amount);
      state.hp.temp -= absorbed;
      amount -= absorbed;
      if (amount > 0) {
        // Damage while already at 0 HP counts as a failed death save.
        if (state.hp.current === 0) state.deathSaves.failures = Math.min(3, state.deathSaves.failures + 1);
        state.hp.current = Math.max(0, state.hp.current - amount);
      }
      return;
    }
    case 'heal': {
      const amount = Math.max(0, change.amount);
      if (amount === 0) return;
      if (state.hp.current === 0) state.deathSaves = { successes: 0, failures: 0 };
      state.hp.current = Math.min(effectiveHpMax(state), state.hp.current + amount);
      return;
    }
    case 'insert': {
      const list = getAt(state, change.path);
      if (Array.isArray(list) && !list.some((item) => (item as { id?: string })?.id === change.item.id)) {
        list.push(structuredClone(change.item));
      }
      return;
    }
    case 'remove': {
      const list = getAt(state, change.path);
      if (Array.isArray(list)) {
        const index = list.findIndex((item) => (item as { id?: string })?.id === change.id);
        if (index !== -1) list.splice(index, 1);
      }
      return;
    }
    case 'batch':
      for (const inner of change.changes) apply(state, inner);
      return;
  }
}

/** The sheet as it would be after one more change, for building labels. */
export function preview(state: CharacterState, change: Change): CharacterState {
  const next = structuredClone(state);
  apply(next, change);
  return next;
}

/** Rebuild the sheet: the base with every live entry applied in time order. */
export function replay(base: CharacterState, entries: Entry[]): CharacterState {
  const state = structuredClone(base);
  for (const entry of liveEntries(entries)) apply(state, entry.change as Change);
  return state;
}

export function currentState(doc: CharacterDoc): CharacterState {
  return replay(doc.base, doc.entries);
}

/** Merge two entry lists (for sync later): union by id. */
export function mergeEntries(...lists: Entry[][]): Entry[] {
  const byId = new Map<string, Entry>();
  for (const list of lists) for (const entry of list) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return sortedEntries([...byId.values()]);
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export const RETENTION = { entries: 500, days: 30 };

/**
 * Fold old entries into the base snapshot. Keeps full detail for the last
 * `keepEntries` entries or `keepDays` days, whichever keeps more. The sheet
 * looks exactly the same before and after.
 */
export function compact(
  doc: CharacterDoc,
  now: number,
  keepEntries = RETENTION.entries,
  keepDays = RETENTION.days,
): CharacterDoc {
  const sorted = sortedEntries(doc.entries);
  if (sorted.length <= keepEntries) return doc;
  const cutoffTs = now - keepDays * 24 * 60 * 60 * 1000;
  let cut = sorted.length - keepEntries;
  while (cut > 0 && sorted[cut - 1].ts >= cutoffTs) cut -= 1;
  if (cut <= 0) return doc;
  const undone = undoneIds(sorted);
  const old = sorted.slice(0, cut);
  const keptIds = new Set(sorted.slice(cut).map((entry) => entry.id));
  // An old undo entry that reverses a kept entry must stay with it.
  const carried = old.filter((entry) => entry.undo && keptIds.has(entry.undo));
  const kept = [...carried, ...sorted.slice(cut)];
  const base = structuredClone(doc.base);
  for (const entry of old) {
    if (entry.change && !entry.undo && !undone.has(entry.id)) apply(base, entry.change);
  }
  return { ...doc, base, entries: kept };
}
