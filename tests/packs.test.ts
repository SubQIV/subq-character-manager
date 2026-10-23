import { describe, expect, it } from 'vitest';
import { parsePack } from '../src/packs/schema';
import { builtinPacks, conditionsFor, exhaustionRules } from '../src/packs/registry';

const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible',
  'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
];

describe('built-in SRD packs', () => {
  it('both editions have all fifteen conditions', () => {
    for (const edition of ['2014', '2024'] as const) {
      expect(conditionsFor(edition).map((c) => c.id).sort()).toEqual([...CONDITIONS].sort());
    }
  });

  it('each edition only sees its own conditions', () => {
    expect(conditionsFor('2014').every((c) => c.key.startsWith('srd-5-1:'))).toBe(true);
    expect(conditionsFor('2024').every((c) => c.key.startsWith('srd-5-2:'))).toBe(true);
  });

  it('exhaustion has six levels in both editions', () => {
    expect(exhaustionRules('2014')?.levels).toHaveLength(6);
    expect(exhaustionRules('2024')?.levels?.[0].effect).toMatch(/−2/);
  });

  it('carry the CC-BY attribution', () => {
    for (const pack of builtinPacks) expect(pack.pack.attribution).toMatch(/Creative\s+Commons Attribution 4\.0/);
  });
});

describe('pack checking', () => {
  it('points at the line of a YAML mistake', () => {
    const result = parsePack('pack:\n  id: test\n  name: [unclosed\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0].line).toBeGreaterThan(0);
  });

  it('points at the line of a missing field', () => {
    const text = [
      'pack:',
      '  id: my-homebrew',
      '  name: My homebrew',
      '  version: 1.0.0',
      "  edition: '2024'",
      'conditions:',
      '  - id: corrupted',
      '    name: Corrupted',
      '    rules:',
      '      - Something bad.',
    ].join('\n');
    const result = parsePack(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems[0].path).toBe('conditions[0].summary');
      expect(result.problems[0].line).toBe(7);
    }
  });

  it('rejects ids with spaces and bad versions', () => {
    const result = parsePack("pack:\n  id: My Pack\n  name: x\n  version: one\n  edition: '2014'\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.map((p) => p.line)).toEqual([2, 4]);
  });
});
