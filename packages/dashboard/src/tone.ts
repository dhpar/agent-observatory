import type { Run, Span } from '@observatory/core';

/** Join class parts, skipping falsy ones. */
export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

/** Base classes for status pills. Tone comes from statusTone. */
export const pill = cx(
  'inline-block',
  'whitespace-nowrap',
  'rounded-full',
  'border',
  'px-2',
  'py-0.5',
  'text-[11px]',
);

/**
 * Static tone classes for every lifecycle status. Tailwind scans literal
 * strings — dynamic `border-${status}` patterns never resolve, so the full
 * map is spelled out here. Keyed by the union of run and span statuses.
 */
export const statusTone: Record<Run['status'] | Span['status'], string> = {
  pending: 'border-obs-border text-obs-muted',
  running: 'border-blue-500 text-blue-500',
  completed: 'border-green-500 text-green-500',
  failed: 'border-red-500 text-red-500',
  interrupted: 'border-amber-500 text-amber-500',
  cancelled: 'border-obs-border text-obs-muted',
  incomplete: 'border-obs-border text-obs-muted',
};

/** Background classes for timeline bars and legend dots. */
export const barTone: Record<Span['status'], string> = {
  pending: 'bg-obs-muted',
  running: 'bg-blue-500 animate-pulse-soft',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  interrupted: 'bg-amber-500',
};

/** Type chips in the span inspector. */
export const typeTone: Record<Span['type'], string> = {
  llm: 'bg-obs-panel2 text-obs-accent',
  tool: 'bg-obs-panel2 text-obs-muted',
  subagent: 'bg-obs-panel2 text-amber-500',
  custom: 'bg-obs-panel2 text-obs-muted',
};

export type HealthTier = 'blue' | 'green' | 'yellow' | 'red' | 'nocap';

/** Fill classes for the header token-health bar. */
export const healthFillTone: Record<HealthTier, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  nocap: 'bg-gradient-to-r from-obs-panel2 to-obs-border',
};

/** Text classes accompanying the health bar tiers. */
export const healthTextTone: Record<HealthTier, string> = {
  blue: 'text-obs-text',
  green: 'text-obs-text',
  yellow: 'text-yellow-500',
  red: 'text-red-500 font-semibold',
  nocap: 'text-obs-text',
};
