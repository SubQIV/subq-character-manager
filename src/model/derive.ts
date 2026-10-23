// Derived numbers. Every number on the sheet is built from labelled parts so
// the app can show exactly how it was worked out, and any number can be
// overridden by hand with the override shown alongside what it replaced.

import {
  ABILITIES,
  ABILITY_NAMES,
  HIT_DICE,
  SKILLS,
  type Ability,
  type AcFormula,
  type CharacterState,
  type HitDie,
  type Item,
  type ModTarget,
  type Modifier,
  type SkillId,
  type StatKey,
} from './types';

export interface Part {
  label: string;
  value: number;
}

export interface Calc {
  key: StatKey;
  label: string;
  /** The number shown: the override if there is one, otherwise the calculated value. */
  value: number;
  calculated: number;
  overridden: boolean;
  parts: Part[];
  /** Effects that change rolls rather than numbers, e.g. disadvantage. */
  notes: string[];
}

export interface AcCandidate {
  id: string;
  label: string;
  value: number;
}

export interface Attack {
  itemId: string;
  name: string;
  toHit: Calc;
  /** e.g. "1d8+3 slashing". */
  damage: string;
  /** Two-handed damage for versatile weapons. */
  versatile: string | null;
  damageParts: Part[];
  range: string;
  properties: string;
  mastery: string;
}

export interface Derived {
  level: number;
  attacks: Attack[];
  abilities: Record<Ability, { score: Calc; mod: number }>;
  proficiency: Calc;
  saves: Record<Ability, Calc>;
  skills: Record<SkillId, Calc>;
  passives: Record<'perception' | 'insight' | 'investigation', Calc>;
  initiative: Calc;
  ac: Calc & { candidates: AcCandidate[]; chosen: string; pinned: boolean };
  speed: Calc;
  hpMax: Calc;
  spellDC: Calc | null;
  spellAttack: Calc | null;
  attunement: { used: number; slots: Calc };
  carry: { capacity: Calc; carried: Calc };
  hitDice: { die: HitDie; total: number; spent: number }[];
  warnings: string[];
}

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);

export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '+0';
}

export function totalLevel(state: CharacterState): number {
  return state.classes.reduce((sum, entry) => sum + Math.max(0, entry.level), 0);
}

export function proficiencyFor(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

const sum = (parts: Part[]) => parts.reduce((total, part) => total + part.value, 0);

function finish(state: CharacterState, key: StatKey, label: string, parts: Part[], notes: string[] = []): Calc {
  const calculated = sum(parts);
  const override = state.overrides[key];
  const overridden = typeof override === 'number';
  return { key, label, value: overridden ? override : calculated, calculated, overridden, parts, notes };
}

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

/** Equipped items apply their bonuses; items that need attunement apply them only while attuned. */
export function itemIsActive(item: Item): boolean {
  if (!item.equipped) return false;
  if (item.magic && item.magic.requiresAttunement && !item.magic.attuned) return false;
  return true;
}

export function activeModifiers(state: CharacterState): Modifier[] {
  const mods = state.modifiers.filter((mod) => mod.enabled);
  for (const item of state.inventory) {
    if (!itemIsActive(item)) continue;
    for (const mod of item.modifiers) {
      if (mod.enabled) mods.push({ ...mod, source: mod.source || item.name });
    }
  }
  return mods;
}

/**
 * Bonuses for some targets. Same-named stacks don't stack: only the highest
 * of each named stack applies; unnamed bonuses all apply.
 */
function modifierParts(mods: Modifier[], targets: ModTarget[], running: number): Part[] {
  const relevant = mods.filter((mod) => targets.includes(mod.target));
  const adds = relevant.filter((mod) => mod.mode === 'add');
  const best = new Map<string, Modifier>();
  const parts: Part[] = [];
  for (const mod of adds) {
    if (!mod.stack) {
      parts.push({ label: mod.source, value: mod.value });
      continue;
    }
    const current = best.get(mod.stack);
    if (!current || mod.value > current.value) best.set(mod.stack, mod);
  }
  for (const mod of best.values()) parts.push({ label: `${mod.source} (${mod.stack}, doesn't stack)`, value: mod.value });
  const total = running + sum(parts);
  const floors = relevant.filter((mod) => mod.mode === 'atLeast');
  if (floors.length) {
    const top = floors.reduce((a, b) => (b.value > a.value ? b : a));
    if (top.value > total) parts.push({ label: `${top.source} (sets it to ${top.value})`, value: top.value - total });
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Exhaustion, which works differently in each edition
// ---------------------------------------------------------------------------

function exhaustion2024Penalty(state: CharacterState): Part[] {
  if (state.edition !== '2024' || state.exhaustion <= 0) return [];
  return [{ label: `Exhaustion ${state.exhaustion} (2024: −2 per level to D20 Tests)`, value: -2 * state.exhaustion }];
}

function exhaustion2014Notes(state: CharacterState, kind: 'check' | 'save' | 'attack'): string[] {
  if (state.edition !== '2014') return [];
  const level = state.exhaustion;
  if (kind === 'check' && level >= 1) return [`Disadvantage on ability checks (exhaustion ${level})`];
  if ((kind === 'save' || kind === 'attack') && level >= 3) {
    return [`Disadvantage on ${kind === 'save' ? 'saving throws' : 'attack rolls'} (exhaustion ${level})`];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Individual numbers
// ---------------------------------------------------------------------------

export function effectiveHpMax(state: CharacterState): number {
  return hpMaxCalc(state, activeModifiers(state)).value;
}

function hpMaxCalc(state: CharacterState, mods: Modifier[]): Calc {
  const parts: Part[] = [{ label: 'Hit point maximum', value: state.hp.max }];
  parts.push(...modifierParts(mods, ['hpMax'], sum(parts)));
  if (state.edition === '2014' && state.exhaustion >= 4) {
    const before = sum(parts);
    parts.push({ label: `Exhaustion ${state.exhaustion} (2014: maximum halved)`, value: Math.floor(before / 2) - before });
  }
  return finish(state, 'hpMax', 'Hit point maximum', parts);
}

function acCandidates(state: CharacterState, mods: Record<Ability, number>): { formula: AcFormula; value: number }[] {
  const armor = state.inventory.filter((item) => itemIsActive(item) && item.armor && item.armor.kind !== 'shield');
  const formulas: AcFormula[] = armor.length
    ? armor.map((item) => {
        const info = item.armor!;
        return {
          id: `item:${item.id}`,
          label: item.name,
          base: info.base,
          addDex: info.kind !== 'heavy',
          dexCap: info.kind === 'medium' ? (info.dexCap ?? 2) : info.kind === 'heavy' ? 0 : info.dexCap,
          extraAbility: null,
        };
      })
    : [
        { id: 'unarmored', label: 'Unarmored', base: 10, addDex: true, dexCap: null, extraAbility: null },
        ...state.acFormulas,
      ];
  return formulas.map((formula) => {
    const dex = formula.addDex ? Math.min(mods.dex, formula.dexCap ?? Infinity) : 0;
    const extra = formula.extraAbility ? mods[formula.extraAbility] : 0;
    return { formula, value: formula.base + dex + extra };
  });
}

function acCalc(state: CharacterState, mods: Modifier[], abilityMods: Record<Ability, number>): Derived['ac'] {
  const candidates = acCandidates(state, abilityMods);
  const pinned = candidates.find((candidate) => candidate.formula.id === state.acPinned);
  const chosen = pinned ?? candidates.reduce((a, b) => (b.value > a.value ? b : a));
  const { formula } = chosen;
  const parts: Part[] = [{ label: formula.label, value: formula.base }];
  if (formula.addDex) {
    const dex = Math.min(abilityMods.dex, formula.dexCap ?? Infinity);
    const capped = formula.dexCap !== null && abilityMods.dex > formula.dexCap;
    parts.push({ label: capped ? `Dexterity (capped at ${signed(formula.dexCap!)})` : 'Dexterity', value: dex });
  }
  if (formula.extraAbility) parts.push({ label: ABILITY_NAMES[formula.extraAbility], value: abilityMods[formula.extraAbility] });
  for (const item of state.inventory) {
    if (itemIsActive(item) && item.armor?.kind === 'shield') parts.push({ label: item.name, value: item.armor.base });
  }
  parts.push(...modifierParts(mods, ['ac'], sum(parts)));
  const notes: string[] = [];
  if (candidates.length > 1) {
    notes.push(
      pinned
        ? `Pinned to ${formula.label}.`
        : `Using the best of ${candidates.map((c) => `${c.formula.label} ${c.value}`).join(', ')}.`,
    );
  }
  const calc = finish(state, 'ac', 'Armor Class', parts, notes);
  return {
    ...calc,
    candidates: candidates.map((c) => ({ id: c.formula.id, label: c.formula.label, value: c.value })),
    chosen: formula.id,
    pinned: Boolean(pinned),
  };
}

function speedCalc(state: CharacterState, mods: Modifier[], strength: number): Calc {
  const parts: Part[] = [{ label: 'Base speed', value: state.speed }];
  parts.push(...modifierParts(mods, ['speed'], sum(parts)));
  for (const item of state.inventory) {
    const need = item.armor?.strengthRequired;
    if (itemIsActive(item) && need && strength < need) {
      parts.push({ label: `${item.name} (needs Strength ${need})`, value: -10 });
    }
  }
  const level = state.exhaustion;
  if (state.edition === '2024' && level > 0) {
    parts.push({ label: `Exhaustion ${level} (2024: −5 ft per level)`, value: -5 * level });
  } else if (state.edition === '2014' && level >= 5) {
    parts.push({ label: `Exhaustion ${level} (2014: speed 0)`, value: -sum(parts) });
  } else if (state.edition === '2014' && level >= 2) {
    const before = sum(parts);
    parts.push({ label: `Exhaustion ${level} (2014: speed halved)`, value: Math.floor(before / 2) - before });
  }
  const calc = finish(state, 'speed', 'Speed', parts);
  return calc.value < 0 ? { ...calc, value: 0 } : calc;
}

function coinWeight(state: CharacterState): number {
  const coins = state.trackers.filter((tracker) => tracker.id.startsWith('coin:'));
  return coins.reduce((total, coin) => total + Math.max(0, coin.value), 0) / 50;
}

/** Weight of an item and its contents, skipping contents of a bag of holding and similar. */
function itemWeight(item: Item, all: Item[], seen = new Set<string>()): number {
  if (seen.has(item.id)) return 0;
  seen.add(item.id);
  let weight = item.weight * item.quantity;
  if (item.isContainer && !item.ignoreContentsWeight) {
    for (const inner of all.filter((other) => other.containerId === item.id)) weight += itemWeight(inner, all, seen);
  }
  return weight;
}

function carriedCalc(state: CharacterState): Calc {
  // Items count at the top level unless they sit in something that is still a container.
  const containerIds = new Set(state.inventory.filter((item) => item.isContainer).map((item) => item.id));
  const topLevel = state.inventory.filter((item) => !item.containerId || !containerIds.has(item.containerId));
  const parts: Part[] = topLevel
    .map((item) => ({ label: item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name, value: itemWeight(item, state.inventory) }))
    .filter((part) => part.value > 0)
    .map((part) => ({ ...part, value: Math.round(part.value * 100) / 100 }));
  const coins = coinWeight(state);
  if (coins > 0) parts.push({ label: 'Coins (50 to a pound)', value: Math.round(coins * 100) / 100 });
  return { key: 'carryCapacity', label: 'Carried weight', value: Math.round(sum(parts) * 100) / 100, calculated: sum(parts), overridden: false, parts, notes: [] };
}

// ---------------------------------------------------------------------------
// Everything at once
// ---------------------------------------------------------------------------

export function derive(state: CharacterState): Derived {
  const mods = activeModifiers(state);
  const level = totalLevel(state);

  const abilities = {} as Derived['abilities'];
  for (const ability of ABILITIES) {
    const parts: Part[] = [{ label: 'Score', value: state.abilities[ability] }];
    parts.push(...modifierParts(mods, [`ability:${ability}`], sum(parts)));
    const score = finish(state, `ability:${ability}`, ABILITY_NAMES[ability], parts);
    abilities[ability] = { score, mod: abilityMod(score.value) };
  }
  const abilityMods = Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].mod])) as Record<Ability, number>;

  const proficiency = finish(state, 'proficiency', 'Proficiency bonus', [
    { label: `Character level ${Math.max(1, level)}`, value: proficiencyFor(level) },
  ]);
  const pb = proficiency.value;
  const rolledPenalty = exhaustion2024Penalty(state);

  const saves = {} as Derived['saves'];
  for (const ability of ABILITIES) {
    const parts: Part[] = [{ label: `${ABILITY_NAMES[ability]} modifier`, value: abilityMods[ability] }];
    if (state.saveProficiency[ability]) parts.push({ label: 'Proficient', value: pb });
    parts.push(...modifierParts(mods, [`save:${ability}`, 'save:all'], sum(parts)));
    parts.push(...rolledPenalty);
    saves[ability] = finish(state, `save:${ability}`, `${ABILITY_NAMES[ability]} save`, parts, exhaustion2014Notes(state, 'save'));
  }

  const skills = {} as Derived['skills'];
  const checkBonus = {} as Record<SkillId, number>;
  for (const skill of SKILLS) {
    const parts: Part[] = [{ label: `${ABILITY_NAMES[skill.ability]} modifier`, value: abilityMods[skill.ability] }];
    const prof = state.skillProficiency[skill.id];
    if (prof === 2) parts.push({ label: 'Expertise', value: pb * 2 });
    else if (prof === 1) parts.push({ label: 'Proficient', value: pb });
    else if (prof === 0.5) parts.push({ label: 'Half proficiency', value: Math.floor(pb / 2) });
    parts.push(...modifierParts(mods, [`skill:${skill.id}`, `check:${skill.ability}`, 'check:all'], sum(parts)));
    checkBonus[skill.id] = sum(parts);
    parts.push(...rolledPenalty);
    const notes = exhaustion2014Notes(state, 'check');
    if (skill.id === 'stealth') {
      for (const item of state.inventory) {
        if (itemIsActive(item) && item.armor?.stealthDisadvantage) notes.push(`Disadvantage from ${item.name}`);
      }
    }
    skills[skill.id] = finish(state, `skill:${skill.id}`, skill.name, parts, notes);
  }

  const attacks: Attack[] = state.inventory
    .filter((item) => item.weapon && item.equipped)
    .map((item) => {
      const weapon = item.weapon!;
      const ability: Ability = weapon.ranged
        ? 'dex'
        : weapon.finesse && abilityMods.dex > abilityMods.str
          ? 'dex'
          : 'str';
      const hitParts: Part[] = [{ label: `${ABILITY_NAMES[ability]} modifier`, value: abilityMods[ability] }];
      if (weapon.proficient) hitParts.push({ label: 'Proficient', value: pb });
      if (weapon.magicBonus) hitParts.push({ label: 'Magic weapon', value: weapon.magicBonus });
      hitParts.push(...modifierParts(mods, ['weaponAttack'], sum(hitParts)));
      hitParts.push(...rolledPenalty);
      const damageParts: Part[] = [{ label: `${ABILITY_NAMES[ability]} modifier`, value: abilityMods[ability] }];
      if (weapon.magicBonus) damageParts.push({ label: 'Magic weapon', value: weapon.magicBonus });
      damageParts.push(...modifierParts(mods, ['weaponDamage'], sum(damageParts)));
      const bonus = sum(damageParts);
      const withBonus = (dice: string) => `${dice}${bonus ? signed(bonus) : ''}${weapon.damageType ? ` ${weapon.damageType}` : ''}`;
      const name = item.magic && !item.magic.identified ? item.magic.unidentifiedName || 'Unidentified weapon' : item.name;
      return {
        itemId: item.id,
        name,
        toHit: finish(state, `attack:${item.id}`, `${name} attack`, hitParts, exhaustion2014Notes(state, 'attack')),
        damage: withBonus(weapon.damage || '1'),
        versatile: weapon.versatile ? withBonus(weapon.versatile) : null,
        damageParts,
        range: weapon.range,
        properties: weapon.properties,
        mastery: weapon.mastery,
      };
    });

  const passive = (id: 'perception' | 'insight' | 'investigation', name: string): Calc => {
    const skillValue = state.overrides[`skill:${id}`] ?? checkBonus[id];
    const parts: Part[] = [
      { label: 'Base', value: 10 },
      { label: `${name} bonus`, value: skillValue },
    ];
    parts.push(...modifierParts(mods, [`passive:${id}`], sum(parts)));
    return finish(state, `passive:${id}`, `Passive ${name}`, parts);
  };
  const passives = {
    perception: passive('perception', 'Perception'),
    insight: passive('insight', 'Insight'),
    investigation: passive('investigation', 'Investigation'),
  };

  const initiativeParts: Part[] = [{ label: 'Dexterity modifier', value: abilityMods.dex }];
  initiativeParts.push(...modifierParts(mods, ['initiative', 'check:dex', 'check:all'], sum(initiativeParts)));
  initiativeParts.push(...rolledPenalty);
  const initiative = finish(state, 'initiative', 'Initiative', initiativeParts, exhaustion2014Notes(state, 'check'));

  let spellDC: Calc | null = null;
  let spellAttack: Calc | null = null;
  if (state.spellcastingAbility) {
    const ability = state.spellcastingAbility;
    const dcParts: Part[] = [
      { label: 'Base', value: 8 },
      { label: 'Proficiency bonus', value: pb },
      { label: `${ABILITY_NAMES[ability]} modifier`, value: abilityMods[ability] },
    ];
    dcParts.push(...modifierParts(mods, ['spellDC'], sum(dcParts)));
    spellDC = finish(state, 'spellDC', 'Spell save DC', dcParts);
    const attackParts: Part[] = [
      { label: 'Proficiency bonus', value: pb },
      { label: `${ABILITY_NAMES[ability]} modifier`, value: abilityMods[ability] },
    ];
    attackParts.push(...modifierParts(mods, ['spellAttack'], sum(attackParts)));
    attackParts.push(...rolledPenalty);
    spellAttack = finish(state, 'spellAttack', 'Spell attack bonus', attackParts, exhaustion2014Notes(state, 'attack'));
  }

  const slotsParts: Part[] = [{ label: 'Base', value: 3 }];
  slotsParts.push(...modifierParts(mods, ['attunementSlots'], sum(slotsParts)));
  const attunement = {
    used: state.inventory.filter((item) => item.magic?.requiresAttunement && item.magic.attuned).length,
    slots: finish(state, 'attunementSlots', 'Attunement slots', slotsParts),
  };

  const strength = abilities.str.score.value;
  const carry = {
    capacity: finish(state, 'carryCapacity', 'Carrying capacity', [{ label: `Strength ${strength} × 15 lb`, value: strength * 15 }]),
    carried: carriedCalc(state),
  };

  const hitDice = HIT_DICE.map((die) => ({
    die,
    total: state.classes.filter((entry) => entry.hitDie === die).reduce((total, entry) => total + entry.level, 0),
    spent: state.hitDiceSpent[die] ?? 0,
  })).filter((pool) => pool.total > 0 || pool.spent > 0);

  const warnings: string[] = [];
  if (state.exhaustion >= 6) warnings.push('Exhaustion 6: the character dies.');
  if (attunement.used > attunement.slots.value) {
    warnings.push(`Attuned to ${attunement.used} items, but only ${attunement.slots.value} slots.`);
  }
  if (state.deathSaves.failures >= 3) warnings.push('Three failed death saves: the character dies.');

  if (carry.carried.value > carry.capacity.value) {
    warnings.push(`Carrying ${carry.carried.value} lb, more than your capacity of ${carry.capacity.value} lb.`);
  }

  return {
    level,
    attacks,
    abilities,
    proficiency,
    saves,
    skills,
    passives,
    initiative,
    ac: acCalc(state, mods, abilityMods),
    speed: speedCalc(state, mods, strength),
    hpMax: hpMaxCalc(state, mods),
    spellDC,
    spellAttack,
    attunement,
    carry,
    hitDice,
    warnings,
  };
}
