// The character data model. Everything a sheet can hold is defined here up
// front, including inventory and notes, so later phases add behaviour without
// reshaping saved characters.

export type Edition = '2014' | '2024';

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export const SKILLS = [
  { id: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { id: 'animalHandling', name: 'Animal Handling', ability: 'wis' },
  { id: 'arcana', name: 'Arcana', ability: 'int' },
  { id: 'athletics', name: 'Athletics', ability: 'str' },
  { id: 'deception', name: 'Deception', ability: 'cha' },
  { id: 'history', name: 'History', ability: 'int' },
  { id: 'insight', name: 'Insight', ability: 'wis' },
  { id: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { id: 'investigation', name: 'Investigation', ability: 'int' },
  { id: 'medicine', name: 'Medicine', ability: 'wis' },
  { id: 'nature', name: 'Nature', ability: 'int' },
  { id: 'perception', name: 'Perception', ability: 'wis' },
  { id: 'performance', name: 'Performance', ability: 'cha' },
  { id: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { id: 'religion', name: 'Religion', ability: 'int' },
  { id: 'sleightOfHand', name: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth', name: 'Stealth', ability: 'dex' },
  { id: 'survival', name: 'Survival', ability: 'wis' },
] as const satisfies readonly { id: string; name: string; ability: Ability }[];

export type SkillId = (typeof SKILLS)[number]['id'];

/** 0 none, 0.5 half (rounded down), 1 proficient, 2 expertise. */
export type Proficiency = 0 | 0.5 | 1 | 2;

export type HitDie = 6 | 8 | 10 | 12;
export const HIT_DICE: HitDie[] = [6, 8, 10, 12];

export interface ClassLevel {
  id: string;
  name: string;
  subclass: string;
  level: number;
  hitDie: HitDie;
}

/**
 * Where a bonus applies. Kept as a closed list so the engine always knows
 * what it means; anything else stays as text for the player to apply.
 */
export type ModTarget =
  | 'ac'
  | 'initiative'
  | 'speed'
  | 'hpMax'
  | 'spellDC'
  | 'spellAttack'
  | 'attunementSlots'
  | 'save:all'
  | 'check:all'
  | `save:${Ability}`
  | `check:${Ability}`
  | `ability:${Ability}`
  | `skill:${SkillId}`
  | `passive:${SkillId}`;

export interface Modifier {
  id: string;
  /** Shown in the calculation, e.g. "Ring of Protection". */
  source: string;
  target: ModTarget;
  /** add: adds the value. atLeast: the stat becomes at least the value (e.g. Gauntlets of Ogre Power). */
  mode: 'add' | 'atLeast';
  value: number;
  /** Bonuses sharing a stack name don't stack: only the highest applies. */
  stack: string;
  enabled: boolean;
}

/** One way of working out AC. The app uses the best one unless one is pinned. */
export interface AcFormula {
  id: string;
  label: string;
  base: number;
  addDex: boolean;
  /** Maximum Dex bonus, e.g. 2 for medium armor. Null for no cap. */
  dexCap: number | null;
  /** Second ability added, e.g. Con for Barbarian Unarmored Defense. */
  extraAbility: Ability | null;
}

export type ResetRule = 'short' | 'long' | 'dawn' | 'never' | 'manual';

export interface Tracker {
  id: string;
  name: string;
  /** meter: a bar between min and max. counter: a number with optional max. currency: coins and custom money. */
  kind: 'meter' | 'counter' | 'currency';
  min: number;
  max: number | null;
  value: number;
  reset: ResetRule;
  resetTo: 'max' | 'min';
  note: string;
}

export interface SlotLevel {
  max: number;
  used: number;
}

export interface PactSlots {
  level: number;
  max: number;
  used: number;
}

export interface ActiveCondition {
  id: string;
  /** Id of the condition in a content pack, e.g. "srd:poisoned". */
  conditionId: string;
  note: string;
}

export interface Charges {
  max: number;
  current: number;
  recharge: 'dawn' | 'short' | 'long' | 'none' | 'custom';
  /** How much comes back, e.g. "1d6+1". Rolled at the table and entered. */
  rechargeAmount: string;
}

export interface ArmorInfo {
  kind: 'light' | 'medium' | 'heavy' | 'shield';
  /** Base AC for armor, or the bonus for a shield. */
  base: number;
  dexCap: number | null;
  stealthDisadvantage: boolean;
  strengthRequired: number | null;
}

export interface MagicInfo {
  rarity: string;
  requiresAttunement: boolean;
  attuned: boolean;
  identified: boolean;
  unidentifiedName: string;
  unidentifiedDescription: string;
}

export interface Item {
  id: string;
  name: string;
  quantity: number;
  /** Weight of one, in pounds. */
  weight: number;
  value: string;
  description: string;
  equipped: boolean;
  /** Id of the container item this sits in, or null. */
  containerId: string | null;
  isContainer: boolean;
  /** For a bag of holding and similar: contents don't count toward carried weight. */
  ignoreContentsWeight: boolean;
  armor: ArmorInfo | null;
  magic: MagicInfo | null;
  charges: Charges | null;
  /** Apply while equipped, and attuned if the item requires it. */
  modifiers: Modifier[];
  /** Where it came from, when picked from a content pack. */
  packRef: PackRef | null;
}

export interface PackRef {
  pack: string;
  id: string;
  version: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
}

export type StatKey =
  | 'ac'
  | 'initiative'
  | 'speed'
  | 'hpMax'
  | 'proficiency'
  | 'spellDC'
  | 'spellAttack'
  | 'attunementSlots'
  | 'carryCapacity'
  | `ability:${Ability}`
  | `save:${Ability}`
  | `skill:${SkillId}`
  | `passive:${SkillId}`;

export interface CharacterState {
  name: string;
  player: string;
  edition: Edition;
  /** Called race in 2014 and species in 2024. */
  species: string;
  background: string;
  alignment: string;
  classes: ClassLevel[];
  abilities: Record<Ability, number>;
  saveProficiency: Record<Ability, boolean>;
  skillProficiency: Record<SkillId, Proficiency>;
  hp: { max: number; current: number; temp: number };
  deathSaves: { successes: number; failures: number };
  /** Spent hit dice by die size. */
  hitDiceSpent: Record<HitDie, number>;
  inspiration: boolean;
  speed: number;
  acFormulas: AcFormula[];
  acPinned: string | null;
  modifiers: Modifier[];
  overrides: Partial<Record<StatKey, number>>;
  trackers: Tracker[];
  /** Index 1 to 9 are spell levels; index 0 is unused. */
  spellSlots: SlotLevel[];
  pact: PactSlots;
  spellcastingAbility: Ability | null;
  conditions: ActiveCondition[];
  exhaustion: number;
  inventory: Item[];
  notes: Note[];
  backstory: string;
  personality: { traits: string; ideals: string; bonds: string; flaws: string; appearance: string; allies: string };
  /** Key of the portrait image in device storage, or null. */
  portrait: string | null;
}
