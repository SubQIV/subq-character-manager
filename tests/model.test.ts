import { describe, expect, it } from 'vitest';
import * as A from '../src/model/actions';
import {
  compact,
  lastUndoable,
  mergeEntries,
  replay,
  type CharacterDoc,
  type Entry,
} from '../src/model/changes';
import { derive, proficiencyFor } from '../src/model/derive';
import { newCharacter, newItem, type NewCharacterInput } from '../src/model/factory';
import type { CharacterState, Item } from '../src/model/types';

const input: NewCharacterInput = {
  name: 'Howerd',
  player: 'Dan',
  edition: '2014',
  species: 'Dwarf',
  background: 'Soldier',
  className: 'Fighter',
  subclass: '',
  level: 3,
  hitDie: 10,
  abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
  maxHp: 28,
  speed: 25,
};

let clock = 1_000;
let counter = 0;

/** A tiny in-memory sheet: actions become entries, state is replayed. */
function sheet(overrides: Partial<NewCharacterInput> = {}) {
  const base = newCharacter({ ...input, ...overrides });
  const entries: Entry[] = [];
  const api = {
    base,
    entries,
    get state(): CharacterState {
      return replay(base, entries);
    },
    do(make: (state: CharacterState) => A.Action, ts = (clock += 10)) {
      const action = make(api.state);
      const entry: Entry = { id: `e${(counter += 1)}`, ts, device: 'test', label: action.label, scope: action.scope, change: action.change };
      entries.push(entry);
      return entry;
    },
    undo(target?: Entry) {
      const victim = target ?? lastUndoable(entries);
      if (!victim) throw new Error('nothing to undo');
      entries.push({ id: `e${(counter += 1)}`, ts: (clock += 10), device: 'test', label: `Undo: ${victim.label}`, scope: victim.scope, undo: victim.id });
    },
  };
  return api;
}

describe('hit points', () => {
  it('damage comes off temporary HP first', () => {
    const s = sheet();
    s.do((st) => A.setTempHp(st, 5));
    s.do((st) => A.damage(st, 8));
    expect(s.state.hp).toEqual({ max: 28, current: 25, temp: 0 });
  });

  it('labels damage with before and after', () => {
    const s = sheet();
    const entry = s.do((st) => A.damage(st, 7));
    expect(entry.label).toBe('Damage 7: HP 28 → 21');
  });

  it('HP never goes below 0, and damage at 0 fails a death save', () => {
    const s = sheet();
    s.do((st) => A.damage(st, 100));
    expect(s.state.hp.current).toBe(0);
    expect(s.state.deathSaves.failures).toBe(0);
    s.do((st) => A.damage(st, 3));
    expect(s.state.deathSaves.failures).toBe(1);
  });

  it('healing from 0 clears death saves and stops at the maximum', () => {
    const s = sheet();
    s.do((st) => A.damage(st, 100));
    s.do((st) => A.deathSave(st, 'failures', 1));
    s.do((st) => A.deathSave(st, 'successes', 1));
    s.do((st) => A.heal(st, 500));
    expect(s.state.hp.current).toBe(28);
    expect(s.state.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('healing respects bonuses to the maximum', () => {
    const s = sheet();
    s.do(() => A.addModifier({ source: 'Aid', target: 'hpMax', mode: 'add', value: 5, stack: '', enabled: true }));
    s.do((st) => A.heal(st, 100));
    expect(s.state.hp.current).toBe(33);
  });
});

describe('undo', () => {
  it('undo reverses the last change and is itself an entry', () => {
    const s = sheet();
    s.do((st) => A.damage(st, 7));
    s.undo();
    expect(s.state.hp.current).toBe(28);
    expect(s.entries).toHaveLength(2);
  });

  it('repeated undo steps back through earlier changes', () => {
    const s = sheet();
    s.do((st) => A.damage(st, 7));
    s.do((st) => A.damage(st, 3));
    s.undo();
    expect(s.state.hp.current).toBe(21);
    s.undo();
    expect(s.state.hp.current).toBe(28);
  });

  it('one undo restores everything a long rest changed', () => {
    const s = sheet();
    const ki = s.do(() => A.addTracker({ name: 'Second Wind', kind: 'counter', max: 1, value: 1, reset: 'short' }));
    const id = (ki.change as { item: { id: string } }).item.id;
    s.do((st) => A.adjustTracker(st.trackers.find((t) => t.id === id)!, -1));
    s.do((st) => A.damage(st, 20));
    s.do((st) => A.changeExhaustion(st, 2));
    const before = s.state;
    s.do((st) => A.longRest(st));
    expect(s.state.hp.current).toBe(28);
    expect(s.state.trackers.find((t) => t.id === id)!.value).toBe(1);
    expect(s.state.exhaustion).toBe(1);
    s.undo();
    expect(s.state).toEqual(before);
  });
});

describe('trackers', () => {
  it('a custom meter stays between its limits', () => {
    const s = sheet();
    const add = s.do(() => A.addTracker({ name: 'Corruption', kind: 'meter', min: 0, max: 10, value: 9, reset: 'never' }));
    const id = (add.change as { item: { id: string } }).item.id;
    const entry = s.do((st) => A.adjustTracker(st.trackers.find((t) => t.id === id)!, 3));
    expect(s.state.trackers.find((t) => t.id === id)!.value).toBe(10);
    expect(entry.label).toBe('Corruption +3 (9 → 10)');
    s.do((st) => A.adjustTracker(st.trackers.find((t) => t.id === id)!, -20));
    expect(s.state.trackers.find((t) => t.id === id)!.value).toBe(0);
  });

  it('custom currencies have no maximum', () => {
    const s = sheet();
    const add = s.do(() => A.addTracker({ name: 'Diomund Rays', kind: 'currency', reset: 'never' }));
    const id = (add.change as { item: { id: string } }).item.id;
    s.do((st) => A.adjustTracker(st.trackers.find((t) => t.id === id)!, 250));
    expect(s.state.trackers.find((t) => t.id === id)!.value).toBe(250);
  });

  it('short rest resets only short-rest trackers', () => {
    const s = sheet();
    const a = s.do(() => A.addTracker({ name: 'Action Surge', max: 1, value: 0, reset: 'short' }));
    const b = s.do(() => A.addTracker({ name: 'Indomitable', max: 1, value: 0, reset: 'long' }));
    s.do((st) => A.shortRest(st, []));
    const value = (entry: Entry) => s.state.trackers.find((t) => t.id === (entry.change as { item: { id: string } }).item.id)!.value;
    expect(value(a)).toBe(1);
    expect(value(b)).toBe(0);
  });
});

describe('rests and hit dice', () => {
  it('short rest spends hit dice and heals roll plus Con', () => {
    const s = sheet();
    s.do((st) => A.damage(st, 20));
    s.do((st) => A.shortRest(st, [{ die: 10, rolled: 6 }]));
    expect(s.state.hitDiceSpent[10]).toBe(1);
    expect(s.state.hp.current).toBe(8 + 6 + 2);
  });

  it('2014 long rest restores half the hit dice; 2024 restores all', () => {
    for (const [edition, expected] of [['2014', 3], ['2024', 0]] as const) {
      const s = sheet({ edition, level: 8 });
      s.do(() => A.setHitDiceSpent(10, 0, 7));
      s.do((st) => A.longRest(st));
      expect(s.state.hitDiceSpent[10]).toBe(expected);
    }
  });

  it('long rest restores spell slots and pact slots', () => {
    const s = sheet();
    s.do((st) => A.setSlotMax(st, 1, 4));
    s.do((st) => A.useSlot(st, 1, 1));
    s.do((st) => A.useSlot(st, 1, 1));
    s.do((st) => A.setPact(st, 2, 3));
    s.do((st) => A.usePact(st, 1));
    expect(s.state.spellSlots[1].used).toBe(2);
    s.do((st) => A.longRest(st));
    expect(s.state.spellSlots[1].used).toBe(0);
    expect(s.state.pact.used).toBe(0);
  });

  it('slots cannot be over-spent', () => {
    const s = sheet();
    s.do((st) => A.setSlotMax(st, 2, 1));
    s.do((st) => A.useSlot(st, 2, 1));
    s.do((st) => A.useSlot(st, 2, 1));
    expect(s.state.spellSlots[2].used).toBe(1);
  });
});

describe('calculations', () => {
  it('proficiency bonus follows character level', () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyFor)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });

  it('skills: proficiency, expertise and half proficiency', () => {
    const s = sheet({ level: 5 });
    s.do(() => A.setSkill('athletics', 0, 1));
    s.do(() => A.setSkill('stealth', 0, 2));
    s.do(() => A.setSkill('history', 0, 0.5));
    const d = derive(s.state);
    expect(d.skills.athletics.value).toBe(3 + 3);
    expect(d.skills.stealth.value).toBe(2 + 6);
    expect(d.skills.history.value).toBe(0 + 1);
    expect(d.skills.athletics.parts.map((p) => p.label)).toEqual(['Strength modifier', 'Proficient']);
  });

  it('passive perception is 10 plus the Perception bonus', () => {
    const s = sheet();
    s.do(() => A.setSkill('perception', 0, 1));
    expect(derive(s.state).passives.perception.value).toBe(10 + 1 + 2);
  });

  it('AC uses the best formula unless one is pinned', () => {
    const s = sheet();
    expect(derive(s.state).ac.value).toBe(12);
    s.do(() => A.addAcFormula({ label: 'Unarmored Defense', base: 10, addDex: true, dexCap: null, extraAbility: 'con' }));
    const d = derive(s.state);
    expect(d.ac.value).toBe(14);
    expect(d.ac.parts).toEqual([
      { label: 'Unarmored Defense', value: 10 },
      { label: 'Dexterity', value: 2 },
      { label: 'Constitution', value: 2 },
    ]);
    s.do(() => A.pinAc('unarmored', 'Unarmored'));
    expect(derive(s.state).ac.value).toBe(12);
  });

  it('equipped armor replaces unarmored formulas and caps Dex', () => {
    const s = sheet({ abilities: { ...input.abilities, dex: 18 } });
    const armor: Item = newItem({
      id: 'mail', name: 'Half plate', weight: 40, value: '750 gp', equipped: true,
      armor: { kind: 'medium', base: 15, dexCap: 2, stealthDisadvantage: true, strengthRequired: null },
    });
    const shield: Item = { ...armor, id: 'shield', name: 'Shield', weight: 6, armor: { kind: 'shield', base: 2, dexCap: null, stealthDisadvantage: false, strengthRequired: null } };
    s.base.inventory.push(armor, shield);
    const d = derive(s.state);
    expect(d.ac.value).toBe(15 + 2 + 2);
    expect(d.ac.parts[1].label).toBe('Dexterity (capped at +2)');
  });

  it('same-named bonuses do not stack; the highest applies', () => {
    const s = sheet();
    s.do(() => A.addModifier({ source: 'Cloak of Protection', target: 'save:all', mode: 'add', value: 1, stack: 'protection', enabled: true }));
    s.do(() => A.addModifier({ source: 'Ring of Protection', target: 'save:all', mode: 'add', value: 1, stack: 'protection', enabled: true }));
    s.do(() => A.addModifier({ source: 'Bless (average)', target: 'save:all', mode: 'add', value: 2, stack: '', enabled: true }));
    expect(derive(s.state).saves.wis.value).toBe(1 + 1 + 2);
  });

  it('"at least" bonuses raise a score only when lower', () => {
    const s = sheet();
    s.do(() => A.addModifier({ source: 'Gauntlets of Ogre Power', target: 'ability:str', mode: 'atLeast', value: 19, stack: '', enabled: true }));
    expect(derive(s.state).abilities.str.score.value).toBe(19);
    s.do((st) => A.setAbility(st, 'str', 20));
    expect(derive(s.state).abilities.str.score.value).toBe(20);
  });

  it('items apply bonuses only while equipped, and attuned when required', () => {
    const s = sheet();
    const ring: Item = newItem({
      id: 'ring', name: 'Ring of Protection', equipped: true,
      magic: { rarity: 'rare', requiresAttunement: true, attuned: false, identified: true, unidentifiedName: '', unidentifiedDescription: '' },
      modifiers: [{ id: 'm', source: '', target: 'ac', mode: 'add', value: 1, stack: '', enabled: true }],
    });
    s.base.inventory.push(ring);
    expect(derive(s.state).ac.value).toBe(12);
    ring.magic!.attuned = true;
    const d = derive(s.state);
    expect(d.ac.value).toBe(13);
    expect(d.ac.parts.at(-1)).toEqual({ label: 'Ring of Protection', value: 1 });
    expect(d.attunement.used).toBe(1);
  });

  it('an override replaces the number and remembers the calculation', () => {
    const s = sheet();
    s.do(() => A.setOverride('initiative', 'Initiative', 7, undefined));
    const d = derive(s.state);
    expect(d.initiative.value).toBe(7);
    expect(d.initiative.calculated).toBe(2);
    expect(d.initiative.overridden).toBe(true);
    s.do(() => A.setOverride('initiative', 'Initiative', null, 7));
    expect(derive(s.state).initiative.overridden).toBe(false);
  });

  it('exhaustion follows each edition', () => {
    const old = sheet({ edition: '2014' });
    old.do((st) => A.changeExhaustion(st, 2));
    const d14 = derive(old.state);
    expect(d14.speed.value).toBe(12);
    expect(d14.skills.athletics.notes[0]).toMatch(/Disadvantage on ability checks/);
    expect(d14.saves.str.value).toBe(3);

    const neu = sheet({ edition: '2024' });
    neu.do((st) => A.changeExhaustion(st, 2));
    const d24 = derive(neu.state);
    expect(d24.speed.value).toBe(15);
    expect(d24.saves.str.value).toBe(3 - 4);
    expect(d24.passives.perception.value).toBe(11);
  });

  it('2014 exhaustion 4 halves the hit point maximum', () => {
    const s = sheet({ edition: '2014' });
    s.do((st) => A.changeExhaustion(st, 4));
    expect(derive(s.state).hpMax.value).toBe(14);
  });

  it('carried weight counts coins and skips bag of holding contents', () => {
    const s = sheet();
    const bag: Item = newItem({ id: 'bag', name: 'Bag of Holding', weight: 15, isContainer: true, ignoreContentsWeight: true });
    const anvil: Item = { ...bag, id: 'anvil', name: 'Anvil', weight: 100, isContainer: false, ignoreContentsWeight: false, containerId: 'bag' };
    const rope: Item = { ...bag, id: 'rope', name: 'Rope', weight: 10, quantity: 2, isContainer: false, ignoreContentsWeight: false };
    s.base.inventory.push(bag, anvil, rope);
    s.do((st) => A.adjustTracker(st.trackers.find((t) => t.id === 'coin:gp')!, 100));
    expect(derive(s.state).carry.carried.value).toBe(15 + 20 + 2);
  });
});

describe('merging and retention', () => {
  it('merging is order independent and drops duplicates', () => {
    const phone = sheet();
    phone.do((st) => A.damage(st, 7), 100);
    const pc = sheet();
    pc.do((st) => A.damage(st, 5), 200);
    const ab = mergeEntries(phone.entries, pc.entries, phone.entries);
    const ba = mergeEntries(pc.entries, phone.entries);
    expect(ab).toEqual(ba);
    expect(replay(phone.base, ab).hp.current).toBe(16);
  });

  it('compaction keeps the sheet identical and trims old entries', () => {
    const s = sheet();
    const day = 24 * 60 * 60 * 1000;
    for (let i = 0; i < 40; i += 1) s.do((st) => (i % 3 === 0 ? A.heal(st, 2) : A.damage(st, 1)), i * day);
    s.undo(s.entries[5]);
    const doc: CharacterDoc = { id: 'x', schema: 1, createdAt: 0, base: s.base, entries: s.entries, milestones: [] };
    const now = 41 * day;
    const small = compact(doc, now, 10, 30);
    expect(replay(small.base, small.entries)).toEqual(replay(doc.base, doc.entries));
    expect(small.entries.length).toBeLessThan(doc.entries.length);
    expect(small.entries.length).toBeGreaterThanOrEqual(10);
  });

  it('compaction keeps everything newer than the day limit', () => {
    const s = sheet();
    for (let i = 0; i < 20; i += 1) s.do((st) => A.damage(st, 1), 1_000 + i);
    const doc: CharacterDoc = { id: 'x', schema: 1, createdAt: 0, base: s.base, entries: s.entries, milestones: [] };
    expect(compact(doc, 2_000, 5, 30).entries).toHaveLength(20);
  });
});
