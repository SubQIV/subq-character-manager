import { describe, expect, it } from 'vitest';
import * as A from '../src/model/actions';
import { lastUndoable, replay, type Entry } from '../src/model/changes';
import { derive } from '../src/model/derive';
import { blankArmor, blankCharges, blankMagic, blankWeapon, newCharacter, type NewCharacterInput } from '../src/model/factory';
import type { CharacterState, Item } from '../src/model/types';

const input: NewCharacterInput = {
  name: 'Howerd', player: 'Dan', edition: '2024', species: 'Dwarf', background: 'Soldier',
  className: 'Fighter', subclass: '', level: 5, hitDie: 10,
  abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, maxHp: 44, speed: 30,
};

let clock = 1_000;
let n = 0;

function sheet(overrides: Partial<NewCharacterInput> = {}) {
  const base = newCharacter({ ...input, ...overrides });
  const entries: Entry[] = [];
  const api = {
    get state(): CharacterState {
      return replay(base, entries);
    },
    do(make: (state: CharacterState) => A.Action) {
      const action = make(api.state);
      entries.push({ id: `e${(n += 1)}`, ts: (clock += 10), device: 't', label: action.label, scope: action.scope, change: action.change });
      return action;
    },
    undo() {
      const target = lastUndoable(entries)!;
      entries.push({ id: `e${(n += 1)}`, ts: (clock += 10), device: 't', label: 'undo', scope: [], undo: target.id });
    },
    item(name: string): Item {
      return api.state.inventory.find((item) => item.name === name)!;
    },
  };
  return api;
}

describe('inventory', () => {
  it('adds, equips and removes items with readable labels', () => {
    const s = sheet();
    s.do(() => A.addItem({ name: 'Chain mail', weight: 55, armor: { kind: 'heavy', base: 16, dexCap: 0, stealthDisadvantage: true, strengthRequired: 13 } }));
    const equip = s.do((st) => A.setEquipped(st, s.item('Chain mail'), true));
    expect(equip.label).toBe('Equipped Chain mail (AC 12 → 16)');
    expect(derive(s.state).ac.value).toBe(16);
    s.do((st) => A.removeItem(st, s.item('Chain mail')));
    expect(s.state.inventory).toHaveLength(0);
    s.undo();
    expect(s.item('Chain mail').equipped).toBe(true);
  });

  it('heavy armor without enough Strength costs 10 feet of speed', () => {
    const s = sheet({ abilities: { ...input.abilities, str: 12 } });
    s.do(() => A.addItem({ name: 'Plate', equipped: true, armor: { kind: 'heavy', base: 18, dexCap: 0, stealthDisadvantage: true, strengthRequired: 15 } }));
    const d = derive(s.state);
    expect(d.speed.value).toBe(20);
    expect(d.skills.stealth.notes).toContain('Disadvantage from Plate');
  });

  it('removing a container moves its contents out', () => {
    const s = sheet();
    s.do(() => A.addItem({ name: 'Backpack', isContainer: true }));
    s.do(() => A.addItem({ name: 'Rope', weight: 10 }));
    s.do(() => A.moveItem(s.item('Rope'), s.item('Backpack')));
    expect(s.item('Rope').containerId).toBe(s.item('Backpack').id);
    const action = s.do((st) => A.removeItem(st, s.item('Backpack')));
    expect(action.label).toBe('Removed Backpack (its 1 item moved out)');
    expect(s.item('Rope').containerId).toBeNull();
  });

  it('consumables count down', () => {
    const s = sheet();
    s.do(() => A.addItem({ name: 'Potion of Healing', quantity: 3 }));
    const used = s.do(() => A.adjustQuantity(s.item('Potion of Healing'), -1));
    expect(used.label).toBe('Used 1 Potion of Healing (2 left)');
    expect(s.item('Potion of Healing').quantity).toBe(2);
  });
});

describe('magic items', () => {
  it('attunement turns bonuses on and counts slots', () => {
    const s = sheet();
    s.do(() =>
      A.addItem({
        name: 'Cloak of Protection',
        equipped: true,
        magic: { ...blankMagic(), requiresAttunement: true },
        modifiers: [
          { id: 'a', source: '', target: 'ac', mode: 'add', value: 1, stack: 'protection', enabled: true },
          { id: 'b', source: '', target: 'save:all', mode: 'add', value: 1, stack: 'protection', enabled: true },
        ],
      }),
    );
    expect(derive(s.state).ac.value).toBe(12);
    const attune = s.do((st) => A.setAttuned(st, s.item('Cloak of Protection'), true));
    expect(attune.label).toBe('Attuned to Cloak of Protection (AC 12 → 13)');
    const d = derive(s.state);
    expect(d.saves.wis.value).toBe(1 + 1);
    expect(d.attunement.used).toBe(1);
  });

  it('warns when attuned to more items than slots', () => {
    const s = sheet();
    for (const name of ['A', 'B', 'C', 'D']) {
      s.do(() => A.addItem({ name, equipped: true, magic: { ...blankMagic(), requiresAttunement: true, attuned: true } }));
    }
    expect(derive(s.state).warnings[0]).toMatch(/Attuned to 4 items, but only 3 slots/);
  });

  it('unidentified items show their placeholder name until identified', () => {
    const s = sheet();
    s.do(() => A.addItem({ name: 'Ring of Spell Storing', magic: { ...blankMagic(), identified: false, unidentifiedName: 'Strange ring' } }));
    expect(A.itemName(s.item('Ring of Spell Storing'))).toBe('Strange ring');
    const identify = s.do(() => A.identifyItem(s.item('Ring of Spell Storing')));
    expect(identify.label).toBe('Identified Strange ring as Ring of Spell Storing');
    expect(A.itemName(s.item('Ring of Spell Storing'))).toBe('Ring of Spell Storing');
  });

  it('charges are spent and refilled at dawn by a rolled amount', () => {
    const s = sheet();
    s.do(() => A.addItem({ name: 'Wand of Magic Missiles', charges: { max: 7, current: 7, recharge: 'dawn', rechargeAmount: '1d6+1' } }));
    s.do(() => A.useCharges(s.item('Wand of Magic Missiles'), -3));
    s.do(() => A.useCharges(s.item('Wand of Magic Missiles'), -3));
    expect(s.item('Wand of Magic Missiles').charges!.current).toBe(1);
    expect(A.rechargeRollsNeeded(s.state, ['dawn']).map((i) => i.name)).toEqual(['Wand of Magic Missiles']);
    const wand = s.item('Wand of Magic Missiles');
    const dawn = s.do((st) => A.dawn(st, { [wand.id]: 5 }));
    expect(dawn.label).toBe('Dawn: Wand of Magic Missiles +5 charges');
    expect(s.item('Wand of Magic Missiles').charges!.current).toBe(6);
  });

  it('charges never go past the maximum and long rest refills "all"', () => {
    const s = sheet();
    s.do(() => A.addItem({ name: 'Staff', charges: { ...blankCharges(), max: 10, current: 2, recharge: 'long', rechargeAmount: 'all' } }));
    s.do((st) => A.longRest(st));
    expect(s.item('Staff').charges!.current).toBe(10);
    s.do(() => A.useCharges(s.item('Staff'), 5));
    expect(s.item('Staff').charges!.current).toBe(10);
  });

  it('dice recharges are skipped until a roll is entered', () => {
    const s = sheet();
    s.do(() => A.addItem({ name: 'Wand', charges: { max: 7, current: 0, recharge: 'dawn', rechargeAmount: '1d6+1' } }));
    s.do((st) => A.dawn(st));
    expect(s.item('Wand').charges!.current).toBe(0);
  });
});

describe('attacks', () => {
  it('melee uses Strength; finesse uses the better of Strength and Dexterity', () => {
    const s = sheet({ abilities: { ...input.abilities, str: 12, dex: 18 } });
    s.do(() => A.addItem({ name: 'Longsword', equipped: true, weapon: { ...blankWeapon(), damage: '1d8', damageType: 'slashing', versatile: '1d10' } }));
    s.do(() => A.addItem({ name: 'Rapier', equipped: true, weapon: { ...blankWeapon(), damage: '1d8', damageType: 'piercing', finesse: true } }));
    const [sword, rapier] = derive(s.state).attacks;
    expect(sword.toHit.value).toBe(1 + 3);
    expect(sword.damage).toBe('1d8+1 slashing');
    expect(sword.versatile).toBe('1d10+1 slashing');
    expect(rapier.toHit.value).toBe(4 + 3);
    expect(rapier.damage).toBe('1d8+4 piercing');
  });

  it('magic weapons and weapon bonuses add to hit and damage', () => {
    const s = sheet();
    s.do(() => A.addItem({ name: '+1 Longbow', equipped: true, weapon: { ...blankWeapon(), damage: '1d8', damageType: 'piercing', ranged: true, magicBonus: 1 } }));
    s.do(() => A.addModifier({ source: 'Archery', target: 'weaponAttack', mode: 'add', value: 2, stack: '', enabled: true }));
    const [bow] = derive(s.state).attacks;
    expect(bow.toHit.value).toBe(2 + 3 + 1 + 2);
    expect(bow.toHit.parts.map((p) => p.label)).toEqual(['Dexterity modifier', 'Proficient', 'Magic weapon', 'Archery']);
    expect(bow.damage).toBe('1d8+3 piercing');
  });

  it('only equipped weapons are listed, and 2024 exhaustion lowers attack rolls', () => {
    const s = sheet();
    s.do(() => A.addItem({ name: 'Dagger', weapon: blankWeapon() }));
    expect(derive(s.state).attacks).toHaveLength(0);
    s.do((st) => A.setEquipped(st, s.item('Dagger'), true));
    s.do((st) => A.changeExhaustion(st, 1));
    expect(derive(s.state).attacks[0].toHit.value).toBe(3 + 3 - 2);
  });

  it('armor items still work as before', () => {
    const s = sheet();
    s.do(() => A.addItem({ name: 'Leather', equipped: true, armor: blankArmor() }));
    expect(derive(s.state).ac.value).toBe(11 + 2);
  });
});
