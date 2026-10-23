// The app's character store: loads characters from the device, turns actions
// into log entries, saves after every change and tells the screens to redraw.

import { useSyncExternalStore } from 'react';
import type { Action } from '../model/actions';
import {
  RETENTION,
  compact,
  lastUndoable,
  replay,
  type CharacterDoc,
  type Entry,
} from '../model/changes';
import { derive, type Derived } from '../model/derive';
import { uid } from '../model/factory';
import type { CharacterState } from '../model/types';
import { deleteCharacter, loadCharacters, requestPersistence, saveCharacter } from './db';
import { device } from './device';

export type StoreStatus = 'loading' | 'ready' | 'memory-only';

export interface View {
  doc: CharacterDoc;
  state: CharacterState;
  derived: Derived;
}

export interface LastAction {
  characterId: string;
  entryId: string;
  label: string;
  isUndo: boolean;
  at: number;
}

class CharacterStore {
  private docs = new Map<string, CharacterDoc>();
  private views = new WeakMap<CharacterDoc, View>();
  private listeners = new Set<() => void>();
  private lastTs = 0;
  status: StoreStatus = 'loading';
  version = 0;
  lastAction: LastAction | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  async init() {
    try {
      for (const doc of await loadCharacters()) this.docs.set(doc.id, doc);
      this.status = 'ready';
    } catch {
      this.status = 'memory-only';
    }
    this.emit();
  }

  list(): View[] {
    return [...this.docs.values()].map((doc) => this.viewOf(doc)).sort((a, b) => a.state.name.localeCompare(b.state.name));
  }

  view(id: string): View | null {
    const doc = this.docs.get(id);
    return doc ? this.viewOf(doc) : null;
  }

  private viewOf(doc: CharacterDoc): View {
    let view = this.views.get(doc);
    if (!view) {
      const state = replay(doc.base, doc.entries);
      view = { doc, state, derived: derive(state) };
      this.views.set(doc, view);
    }
    return view;
  }

  private save(doc: CharacterDoc) {
    this.docs.set(doc.id, doc);
    if (this.status === 'memory-only') return;
    saveCharacter(doc).catch(() => {
      this.status = 'memory-only';
      this.emit();
    });
  }

  private nextTs(): number {
    this.lastTs = Math.max(Date.now(), this.lastTs + 1);
    return this.lastTs;
  }

  create(state: CharacterState): string {
    const doc: CharacterDoc = { id: uid(), schema: 1, createdAt: Date.now(), base: state, entries: [], milestones: [] };
    this.save(doc);
    void requestPersistence();
    this.emit();
    return doc.id;
  }

  remove(id: string) {
    this.docs.delete(id);
    if (this.status !== 'memory-only') void deleteCharacter(id);
    if (this.lastAction?.characterId === id) this.lastAction = null;
    this.emit();
  }

  private append(id: string, entry: Entry, milestone: boolean) {
    const doc = this.docs.get(id);
    if (!doc) return;
    let next: CharacterDoc = {
      ...doc,
      entries: [...doc.entries, entry],
      milestones: milestone ? [...doc.milestones, { ts: entry.ts, label: entry.label }] : doc.milestones,
    };
    if (next.entries.length > RETENTION.entries + 50) next = compact(next, Date.now());
    this.save(next);
    this.lastAction = { characterId: id, entryId: entry.id, label: entry.label, isUndo: Boolean(entry.undo), at: Date.now() };
    this.emit();
  }

  commit(id: string, action: Action) {
    const entry: Entry = {
      id: uid(),
      ts: this.nextTs(),
      device: device().name,
      label: action.label,
      scope: action.scope,
      change: action.change,
      ...(action.milestone ? { milestone: true } : {}),
    };
    this.append(id, entry, Boolean(action.milestone));
  }

  /** Undo a specific entry, or the most recent change still in force. */
  undo(id: string, entryId?: string) {
    const doc = this.docs.get(id);
    if (!doc) return;
    const target = entryId ? doc.entries.find((entry) => entry.id === entryId) : lastUndoable(doc.entries);
    if (!target || target.undo) return;
    const entry: Entry = {
      id: uid(),
      ts: this.nextTs(),
      device: device().name,
      label: `Undo: ${target.label}`,
      scope: target.scope,
      undo: target.id,
    };
    this.append(id, entry, false);
  }

  canUndo(id: string): boolean {
    const doc = this.docs.get(id);
    return Boolean(doc && lastUndoable(doc.entries));
  }

  dismissLastAction() {
    this.lastAction = null;
    this.emit();
  }
}

export const store = new CharacterStore();

/** Redraw whenever the store changes. */
export function useStore(): CharacterStore {
  useSyncExternalStore(store.subscribe, () => store.version);
  return store;
}
