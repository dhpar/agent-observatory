import { randomUUID } from 'node:crypto';

/**
 * Prefixed ULID-ish identifiers. Prefixes make every id self-describing in
 * logs, the ledger and the UI — cheap to do now, popular later.
 */
const PREFIXES = {
  run: 'run',
  agent: 'agent',
  span: 'span',
  task: 'task',
  guardrail: 'gr',
  ledger: 'cl',
  contextReport: 'ctx',
  advisory: 'adv',
} as const;

export type IdPrefix = keyof typeof PREFIXES;

export function newId(prefix: IdPrefix): string {
  return `${PREFIXES[prefix]}_${randomUUID()}`;
}

export function isIdOf(prefix: IdPrefix, value: string): boolean {
  return value.startsWith(`${PREFIXES[prefix]}_`);
}
