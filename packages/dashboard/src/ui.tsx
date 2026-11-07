import { useMemo } from 'react';
import type { Agent, Run, Span } from '@observatory/core';

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
    <div className="runlist">
      <div
        className="sidebar-title"
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
            className={run.id === props.selectedId ? 'runitem runitem-active' : 'runitem'}
            onClick={() => props.onSelect(run.id)}
          >
            <span className={`pill pill-${run.status}`}>{run.status}</span>
            <span className="runitem-objective">{run.objective}</span>
            <span className="runitem-meta">
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
  { label: 'blue', until: 25 },
  { label: 'green', until: 60 },
  { label: 'yellow', until: 85 },
  { label: 'red', until: 101 },
] as const;

export function healthTier(pct: number): (typeof TOKEN_HEALTH_TIERS)[number]['label'] {
  return TOKEN_HEALTH_TIERS.find((t) => pct < t.until)!.label;
}

/**
 * The header's always-visible token budget bar for the selected run.
 * Spent = input+output across every span of the run. When total usage was
 * only obtained by estimation that is surfaced in the tooltip — the bar
 * itself never claims exactness it doesn't have.
 */
export function TokenHealthBar(props: {
  run: Run;
  tokens: { in: number; out: number };
}): React.JSX.Element {
  const { run, tokens } = props;
  const spent = tokens.in + tokens.out;
  const cap = run.maxTokens;
  const pct = cap ? Math.min(100, (spent / cap) * 100) : 0;
  const tier = cap ? healthTier(pct) : 'nocap';

  const title = cap
    ? `Token health of the selected run: ${spent.toLocaleString()} spent of ${cap.toLocaleString()} allowed (${pct.toFixed(1)}%). ` +
      `Spent counts input + output across all spans. ` +
      `Color tiers: blue <25% · green 25–59% · yellow 60–84% · red ≥85% used. ` +
      `If any span's usage is estimated (usageFidelity: estimated) the count is approximate by honest labeling — see section 4 for per-span fidelity.`
    : `This run has no token cap set (maxTokens omitted at creation). ${spent.toLocaleString()} tokens spent across all spans. ` +
      `Spent = input + output across all spans; estimated tokens are included and flagged in section 4.`;

  return (
    <div className={`health h-${tier}`} title={title}>
      <span className="health-label">run tokens</span>
      <div className="health-bar" aria-hidden>
        <div
          className="health-fill"
          style={{ width: `${cap ? Math.max(pct, spent > 0 ? 2 : 0) : 100}%` }}
        />
      </div>
      <span className="health-text">
        {cap ? (
          <>
            {spent.toLocaleString()} / {cap.toLocaleString()}
            <span className="muted"> tok</span>
          </>
        ) : (
          <>
            {spent.toLocaleString()}
            <span className="muted"> tok · no cap</span>
          </>
        )}
      </span>
      {pct >= 85 && (
        <span className="health-warn" title="At least 85% of this run's token cap is spent.">
          {pct >= 100 ? 'over budget' : 'near cap'}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Timeline */

const spanTint: Record<Span['status'], string> = {
  pending: 's-pending',
  running: 's-running',
  completed: 's-completed',
  failed: 's-failed',
  interrupted: 's-interrupted',
};

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
    return <p className="muted">no spans yet — lanes appear here as soon as work happens</p>;
  }

  const spanWindow = layout.end - layout.start;

  return (
    <div className="timeline">
      <div className="lane-rows">
        {layout.lanes.map((lane) => (
          <div className="lane-row" key={lane.key}>
            <div
              className="lane-label"
              title={
                lane.agent
                  ? `Agent '${lane.agent.name}' — ${lane.agent.provider}:${lane.agent.model}. Every bar on this row is one unit of work this agent performed (an LLM call, tool run, or subagent spawn).`
                  : 'Spans not attributable to any spawned agent (orchestrator-level work).'
              }
            >
              <span className="lane-name">{lane.name}</span>
              <span className="lane-meta">
                {lane.spans.length} spans · tok {lane.tok.in}→{lane.tok.out}
              </span>
            </div>
            <div className="lane-track">
              {lane.spans.map((span) => {
                const from = ((span.startedAt - layout.start) / spanWindow) * 100;
                const to = (((span.endedAt ?? Date.now()) - layout.start) / spanWindow) * 100;
                const width = Math.max(to - from, 0.6);
                return (
                  <div
                    key={span.id}
                    className={`spanbar ${spanTint[span.status]}`}
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
      <div className="axis" aria-hidden>
        <div className="lane-label" />
        <div className="axis-track">
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
            <span
              key={f}
              className="axis-label"
              style={{ left: `${Math.min(97, f * 100 + (i === 0 ? 0 : 0))}%` }}
            >
              {(((layout.end - layout.start) * f) / 1000).toFixed(0)}s
            </span>
          ))}
        </div>
      </div>
      <div className="legend" aria-hidden>
        {(['running', 'completed', 'failed', 'interrupted', 'pending'] as const).map((status) => (
          <span key={status} className="legend-item">
            <span className={`legend-dot ${spanTint[status]}`} />
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
    <div className="cards">
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
            className={active ? 'card card-active' : 'card'}
            title={`Agent '${agent.name}' — one of the workers the run spawned. Its tokens/cost live on the spans it produced (see section 4), not on the agent itself.`}
          >
            <div className="card-head">
              <span className="card-name">{agent.name}</span>
              {active && <span className="pulse">● running</span>}
            </div>
            <div
              className="card-model"
              title="Which provider+model this agent talks to (OpenAI-compatible endpoint)."
            >
              {agent.provider}:{agent.model}
            </div>
            <div
              className="card-meta"
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
