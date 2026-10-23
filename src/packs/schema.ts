// The content pack format. The SRD ships in this format and homebrew uses it
// too, so homebrew is never second-class. Packs are YAML text files; every
// entry has a permanent id and every pack has a version number.

import { z } from 'zod';
import { LineCounter, isNode, parseDocument } from 'yaml';

const editionField = z.enum(['2014', '2024', 'either']);

export const conditionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes'),
  name: z.string().min(1),
  edition: editionField.optional(),
  summary: z.string().min(1),
  rules: z.array(z.string().min(1)).min(1),
  /** For leveled conditions such as exhaustion: what each level does. */
  levels: z
    .array(z.object({ level: z.number().int().min(1), effect: z.string().min(1) }))
    .optional(),
});

export const packSchema = z.object({
  pack: z.object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes'),
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Use a version like 1.0.0'),
    edition: editionField,
    license: z.string().optional(),
    attribution: z.string().optional(),
  }),
  conditions: z.array(conditionSchema).default([]),
});

export type PackFile = z.infer<typeof packSchema>;
export type ConditionDefinition = z.infer<typeof conditionSchema>;

export interface PackProblem {
  message: string;
  line: number | null;
  path: string;
}

export type PackResult = { ok: true; pack: PackFile } | { ok: false; problems: PackProblem[] };

/** Parse and check a pack, pointing at the line of each mistake. */
export function parsePack(text: string): PackResult {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false });
  if (doc.errors.length) {
    return {
      ok: false,
      problems: doc.errors.map((error) => ({
        message: error.message.split('\n')[0],
        line: lines.linePos(error.pos[0]).line,
        path: '',
      })),
    };
  }
  const result = packSchema.safeParse(doc.toJS());
  if (result.success) return { ok: true, pack: result.data };
  return {
    ok: false,
    problems: result.error.issues.map((issue) => {
      const path = issue.path.filter((seg): seg is string | number => typeof seg !== 'symbol');
      let node = doc.getIn(path, true);
      // A missing field has no node; point at the nearest parent that exists.
      for (let depth = path.length - 1; !isNode(node) && depth >= 0; depth -= 1) node = doc.getIn(path.slice(0, depth), true);
      const offset = isNode(node) && node.range ? node.range[0] : null;
      return {
        message: issue.message,
        line: offset === null ? null : lines.linePos(offset).line,
        path: path.map((seg) => (typeof seg === 'number' ? `[${seg}]` : `.${seg}`)).join('').replace(/^\./, ''),
      };
    }),
  };
}
