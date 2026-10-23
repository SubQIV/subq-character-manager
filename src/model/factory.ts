import {
  ABILITIES,
  SKILLS,
  type Ability,
  type ArmorInfo,
  type CharacterState,
  type Charges,
  type Item,
  type MagicInfo,
  type WeaponInfo,
  type Edition,
  type HitDie,
  type Proficiency,
  type SkillId,
  type Tracker,
} from './types';

export function uid(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('');
}

export const COINS = [
  { id: 'coin:pp', name: 'Platinum' },
  { id: 'coin:gp', name: 'Gold' },
  { id: 'coin:ep', name: 'Electrum' },
  { id: 'coin:sp', name: 'Silver' },
  { id: 'coin:cp', name: 'Copper' },
];

export function newTracker(fields: Partial<Tracker> & Pick<Tracker, 'name'>): Tracker {
  return {
    id: uid(),
    kind: 'counter',
    min: 0,
    max: null,
    value: 0,
    reset: 'manual',
    resetTo: 'max',
    note: '',
    ...fields,
  };
}

export function newItem(fields: Partial<Item> & Pick<Item, 'name'>): Item {
  return {
    id: uid(),
    quantity: 1,
    weight: 0,
    value: '',
    description: '',
    equipped: false,
    containerId: null,
    isContainer: false,
    ignoreContentsWeight: false,
    armor: null,
    weapon: null,
    magic: null,
    charges: null,
    modifiers: [],
    packRef: null,
    ...fields,
  };
}

export const blankWeapon = (): WeaponInfo => ({
  damage: '1d6',
  damageType: '',
  versatile: '',
  ranged: false,
  finesse: false,
  proficient: true,
  magicBonus: 0,
  range: '',
  properties: '',
  mastery: '',
});

export const blankArmor = (): ArmorInfo => ({ kind: 'light', base: 11, dexCap: null, stealthDisadvantage: false, strengthRequired: null });

export const blankMagic = (): MagicInfo => ({
  rarity: '',
  requiresAttunement: false,
  attuned: false,
  identified: true,
  unidentifiedName: '',
  unidentifiedDescription: '',
});

export const blankCharges = (): Charges => ({ max: 3, current: 3, recharge: 'dawn', rechargeAmount: '' });

export interface NewCharacterInput {
  name: string;
  player: string;
  edition: Edition;
  species: string;
  background: string;
  className: string;
  subclass: string;
  level: number;
  hitDie: HitDie;
  abilities: Record<Ability, number>;
  maxHp: number;
  speed: number;
}

export function newCharacter(input: NewCharacterInput): CharacterState {
  return {
    name: input.name.trim() || 'Unnamed',
    player: input.player.trim(),
    edition: input.edition,
    species: input.species.trim(),
    background: input.background.trim(),
    alignment: '',
    classes: input.className.trim()
      ? [{ id: uid(), name: input.className.trim(), subclass: input.subclass.trim(), level: Math.max(1, input.level), hitDie: input.hitDie }]
      : [],
    abilities: { ...input.abilities },
    saveProficiency: Object.fromEntries(ABILITIES.map((a) => [a, false])) as Record<Ability, boolean>,
    skillProficiency: Object.fromEntries(SKILLS.map((s) => [s.id, 0])) as Record<SkillId, Proficiency>,
    hp: { max: Math.max(1, input.maxHp), current: Math.max(1, input.maxHp), temp: 0 },
    deathSaves: { successes: 0, failures: 0 },
    hitDiceSpent: { 6: 0, 8: 0, 10: 0, 12: 0 },
    inspiration: false,
    speed: input.speed,
    acFormulas: [],
    acPinned: null,
    modifiers: [],
    overrides: {},
    trackers: COINS.map((coin) =>
      newTracker({ id: coin.id, name: coin.name, kind: 'currency', min: 0, max: null, value: 0, reset: 'never' }),
    ),
    spellSlots: Array.from({ length: 10 }, () => ({ max: 0, used: 0 })),
    pact: { level: 0, max: 0, used: 0 },
    spellcastingAbility: null,
    conditions: [],
    exhaustion: 0,
    inventory: [],
    notes: [],
    backstory: '',
    personality: { traits: '', ideals: '', bonds: '', flaws: '', appearance: '', allies: '' },
    portrait: null,
  };
}
