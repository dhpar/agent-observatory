import { useMemo } from 'react';
import type { Agent, Run, Span } from '@observatory/core';
import { barTone, cx, healthFillTone, healthTextTone, pill, statusTone, type HealthTier } from './tone';

/* ------------------------------------------------------------------ RunList */

export function RunList(props: {
  runs: Run[];
  agents: Agent[];
  spans: Span[];
  selectedId?: string;
  onSelect: (runId: string) => void;
}): React.JSX.Element {
  const newestFirst = [...props.runs].sort((a, b) => b.startedAt - a.startedAt);
  return (
    <div>
      <div
        className="cursor-help px-1 pt-1 pb-2 text-[10px] tracking-[1.5px] text-obs-muted uppercase"
        title="Every observation run in the store, newest first. Click to select; the header bar shows the selected run's token health."
      >
        runs
      </div>
      {newestFirst.map((run) => {
        const spans = props.spans.filter((s) => s.runId === run.id);
        const agentCount = props.agents.filter((a) => a.runId === run.id).length;
        const tok = spans.reduce((acc, s) => acc + (s.inputTokens ?? 0) + (s.outputTokens ?? 0), 0);
        return (
          <button
            key={run.id}
            type="button"
            className={cx(
              'mb-3.5 flex w-full cursor-pointer flex-col gap-1.5 rounded-[10px] border bg-obs-panel px-4 py-3 text-left text-obs-text',
              run.id === props.selectedId
                ? 'border-obs-accent hover:bg-obs-panel'
                : 'border-obs-border hover:bg-obs-panel2',
            )}
            onClick={() => props.onSelect(run.id)}
          >
            <span className={cx(pill, statusTone[run.status])}>{run.status}</span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium">
              {run.objective}
            </span>
            <span className="text-[11px] tabular-nums text-obs-muted">
              {tok} tok · {spans.length} spans · {agentCount} agents
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ TokenHealthBar */

const TOKEN_HEALTH_TIERS = [
  { tier: 'blue' as const, until: 25 },
  { tier: 'green' as const, until: 60 },
  { tier: 'yellow' as const, until: 85 },
  { tier: 'red' as const, until: 101 },
];

export function healthTier(pct: number): HealthTier {
  return TOKEN_HEALTH_TIERS.find((t) => pct < t.until)!.tier;
}

/**
 * The header's always-visible token budget bar for the selected run.
 * Spent = input+output across every span of the run. When total usage was
 * only obtained by estimation that is surfaced in the tooltip — the bar
 * itself never claims exactness it doesn't have.
 */
export function TokenHealthBar(props: { run: Run; tokens: { in: number; out: number } }): React.JSX.Element {
  const { run, tokens } = props;
  const spent = tokens.in + tokens.out;
  const cap = run.maxTokens;
  const pct = cap ? Math.min(100, (spent / cap) * 100) : 0;
  const tier = cap ? healthTier(pct) : ('nocap' as HealthTier);

  const title = cap
    ? `Token health of the selected run: ${spent.toLocaleString()} spent of ${cap.toLocaleString()} allowed (${pct.toFixed(1)}%). ` +
      `Spent counts input + output across all spans. ` +
      `Color tiers: blue <25% · green 25–59% · yellow 60–84% · red ≥85% used. ` +
      `If any span's usage is estimated (usageFidelity: estimated) the count is approximate by honest labeling — see section 4 for per-span fidelity.`
    : `This run has no token cap set (maxTokens omitted at creation). ${spent.toLocaleString()} tokens spent across all spans. ` +
      `Spent = input + output across all spans; estimated tokens are included and flagged in section 4.`;

  return (
    <div className="ml-auto flex cursor-help items-center gap-2" title={title}>
      <span className="text-[10px] tracking-wider text-obs-muted uppercase">run tokens</span>
      <div
        className="h-3 w-[180px] overflow-hidden rounded-full border border-obs-border bg-obs-panel2"
        aria-hidden
      >
        <div
          className={cx('h-full rounded-full', healthFillTone[tier])}
          style={{ width: `${cap ? Math.max(pct, spent > 0 ? 2 : 0) : 100}%` }}
        />
      </div>
      <span className={cx('text-xs tabular-nums', healthTextTone[tier])}>
        {cap ? (
          <>
            {spent.toLocaleString()} / {cap.toLocaleString()}
            <span className="text-obs-muted font-normal"> tok</span>
          </>
        ) : (
          <>
            {spent.toLocaleString()}
            <span className="text-obs-muted"> tok · no cap</span>
          </>
        )}
      </span>
      {pct >= 85 && (
        <span
          className="animate-blink rounded-full border border-red-500 px-1.5 text-[10px] tracking-[0.5px] text-red-500 uppercase"
          title="At least 85% of this run's token cap is spent."
        >
          {pct >= 100 ? 'over budget' : 'near cap'}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Timeline */

interface Lane {
  key: string;
  /** Agent name, or null for the "no agent" catch-all lane. */
  agent: Agent | undefined;
  name: string;
  spans: Span[];
  tok: { in: number; out: number };
}

export function Timeline(props: { run: Run; agents: Agent[]; spans: Span[] }): React.JSX.Element {
  const layout = useMemo(() => {
    const start = props.run.startedAt;
    const end =
      props.spans.length === 0
        ? start + 1
        : Math.max(...props.spans.map((s) => s.endedAt ?? Date.now()), start + 1);

    // lanes follow section 2 (spawned agents, spawn order); any span whose
    // agent is missing from the store lands on the catch-all "no agent" lane
    const lanes: Lane[] = props.agents.map((agent) => {
      const owns = props.spans.filter((s) => s.agentId === agent.id);
      return {
        key: agent.id,
        agent,
        name: agent.name,
        spans: owns,
        tok: owns.reduce(
          (acc, s) => ({ in: acc.in + (s.inputTokens ?? 0), out: acc.out + (s.outputTokens ?? 0) }),
          { in: 0, out: 0 },
        ),
      };
    });
    const orphan = props.spans.filter((s) => !props.agents.some((a) => a.id === s.agentId));
    if (orphan.length > 0) {
      lanes.push({
        key: 'no-agent',
        agent: undefined,
        name: '(no agent)',
        spans: orphan,
        tok: orphan.reduce(
          (acc, s) => ({ in: acc.in + (s.inputTokens ?? 0), out: acc.out + (s.outputTokens ?? 0) }),
          { in: 0, out: 0 },
        ),
      });
    }
    return { start, end, lanes };
  }, [props.run, props.agents, props.spans]);

  if (props.spans.length === 0) {
    return <p className="text-obs-muted">no spans yet — lanes appear here as soon as work happens</p>;
  }

  const spanWindow = layout.end - layout.start;

  return (
    <div className="rounded-[10px] border border-obs-border bg-obs-panel px-3.5 py-3">
      <div>
        {layout.lanes.map((lane) => (
          <div key={lane.key} className="flex min-h-10 items-center">
            <div
              className="flex w-[190px] shrink-0 cursor-help flex-col overflow-hidden pr-3"
              title={
                lane.agent
                  ? `Agent '${lane.agent.name}' — ${lane.agent.provider}:${lane.agent.model}. Every bar on this row is one unit of work this agent performed (an LLM call, tool run, or subagent spawn).`
                  : 'Spans not attributable to any spawned agent (orchestrator-level work).'
              }
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold">
                {lane.name}
              </span>
              <span className="text-[11px] tabular-nums text-obs-muted">
                {lane.spans.length} spans · tok {lane.tok.in}→{lane.tok.out}
              </span>
            </div>
            <div className="relative h-10 flex-1 rounded-md bg-obs-panel2">
              {lane.spans.map((span) => {
                const from = ((span.startedAt - layout.start) / spanWindow) * 100;
                const to = ((span.endedAt ?? Date.now()) - layout.start) / spanWindow * 100;
                const width = Math.max(to - from, 0.6);
                return (
                  <div
                    key={span.id}
                    className={cx('absolute top-[9px] h-[22px] min-w-1 cursor-help rounded', barTone[span.status])}
                    style={{ left: `${from}%`, width: `${width}%` }}
                    title={`${span.name} (${span.type}) — ${span.status}${
                      span.inputTokens !== undefined || span.outputTokens !== undefined
                        ? ` · tok ${span.inputTokens ?? '?'}→${span.outputTokens ?? '?'} (${span.usageFidelity})`
                        : ''
                    }`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex" aria-hidden>
        <div className="w-[190px] shrink-0" />
        <div className="relative h-4 flex-1">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <span
              key={f}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums text-obs-muted"
              style={{ left: `${f * 100}%` }}
            >
              {(((layout.end - layout.start) * f) / 1000).toFixed(0)}s
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-3.5 border-t border-obs-border pt-2" aria-hidden>
        {(['running', 'completed', 'failed', 'interrupted', 'pending'] as const).map((status) => (
          <span key={status} className="inline-flex items-center gap-1 text-[11px] text-obs-muted">
            <span className={cx('inline-block h-2.5 w-2.5 rounded-sm', barTone[status])} />
            {status}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- AgentCards */

export function AgentCards(props: { agents: Agent[]; spans: Span[] }): React.JSX.Element | null {
  if (props.agents.length === 0) return null;
  const runningSet = new Set(
    props.spans.filter((s) => s.status === 'running').map((s) => s.agentId),
  );

  return (
    <div className="flex flex-wrap gap-2.5">
      {props.agents.map((agent) => {
        const spans = props.spans.filter((s) => s.agentId === agent.id);
        const tok = spans.reduce(
          (acc, s) => ({ in: acc.in + (s.inputTokens ?? 0), out: acc.out + (s.outputTokens ?? 0) }),
          { in: 0, out: 0 },
        );
        const active = runningSet.has(agent.id);
        return (
          <div
            key={agent.id}
            title={`Agent '${agent.name}' — one of the workers the run spawned. Its tokens/cost live on the spans it produced (see section 4), not on the agent itself.`}
            className={cx(
              'min-w-[250px] cursor-help rounded-[10px] border bg-obs-panel px-3.5 py-2.5',
              active ? 'border-blue-500' : 'border-obs-border',
            )}
          >
            <div className="flex justify-between gap-3">
              <span className="font-semibold">{agent.name}</span>
              {active && <span className="animate-blink text-[11px] text-blue-500">● running</span>}
            </div>
            <div
              className="my-1 text-xs text-obs-accent"
              title="Which provider+model this agent talks to (OpenAI-compatible endpoint)."
            >
              {agent.provider}:{agent.model}
            </div>
            <div
              className="text-xs tabular-nums text-obs-muted"
              title="How much work this agent has produced so far: unit count and token flow (input → output)."
            >
              {spans.length} spans · tok {tok.in}→{tok.out}
            </div>
          </div>
        );
      })}
    </div>
  );
}
