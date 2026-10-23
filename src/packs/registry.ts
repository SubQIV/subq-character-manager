// Loaded content packs. For now only the built-in SRD packs; packs from the
// table's Drive folder join this list in phase 3.

import type { Edition } from '../model/types';
import { parsePack, type ConditionDefinition, type PackFile } from './schema';
import srd51 from './builtin/srd-5-1.yaml?raw';
import srd52 from './builtin/srd-5-2.yaml?raw';

export interface Condition extends ConditionDefinition {
  /** Pack-qualified id, e.g. "srd-5-2:poisoned". */
  key: string;
  edition: '2014' | '2024' | 'either';
  packName: string;
}

function load(text: string, label: string): PackFile {
  const result = parsePack(text);
  if (!result.ok) {
    const first = result.problems[0];
    throw new Error(`Built-in pack ${label} is invalid at line ${first.line}: ${first.message}`);
  }
  return result.pack;
}

export const builtinPacks: PackFile[] = [load(srd51, 'srd-5-1'), load(srd52, 'srd-5-2')];

export const allConditions: Condition[] = builtinPacks.flatMap((pack) =>
  pack.conditions.map((condition) => ({
    ...condition,
    key: `${pack.pack.id}:${condition.id}`,
    edition: condition.edition ?? pack.pack.edition,
    packName: pack.pack.name,
  })),
);

export function conditionsFor(edition: Edition): Condition[] {
  return allConditions
    .filter((condition) => condition.edition === edition || condition.edition === 'either')
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findCondition(key: string): Condition | undefined {
  return allConditions.find((condition) => condition.key === key);
}

/** The exhaustion rules for an edition, shown beside the exhaustion tracker. */
export function exhaustionRules(edition: Edition): Condition | undefined {
  return allConditions.find((condition) => condition.id === 'exhaustion' && condition.edition === edition);
}
