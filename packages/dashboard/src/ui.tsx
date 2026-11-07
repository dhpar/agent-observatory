import { useMemo } from 'react';
import type { Agent, Run, Span } from '@observatory/core';

/* ------------------------------------------------------------------ RunList */

export function RunList(props: {
  runs: Run[];
  spans: Span[];
  selectedId?: string;
  onSelect: (runId: string) => void;
}): React.JSX.Element {
  const newestFirst = [...props.runs].sort((a, b) => b.startedAt - a.startedAt);
  return (
    <div className="runlist">
      {newestFirst.map((run) => {
        const spans = props.spans.filter((s) => s.runId === run.id);
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
              {tok} tok · {spans.length} spans
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Timeline */

const colors: Record<Span['status'], string> = {
  pending: '#8b8fa3',
  running: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444',
  interrupted: '#f59e0b',
};

export function Timeline(props: { run: Run; spans: Span[] }): React.JSX.Element {
  const layout = useMemo(() => {
    const start = props.run.startedAt;
    const now = Date.now();
    const end =
      props.spans.length === 0
        ? start + 1
        : Math.max(...props.spans.map((s) => s.endedAt ?? now), start + 1);
    const scale = 1000 / (end - start + 1); // px per ms
    const lanes = [...new Set(props.spans.map((s) => s.agentId))];
    return { start, end, scale, lanes };
  }, [props.run, props.spans]);

  const width = 1000;
  const laneHeight = 34;
  const height = layout.lanes.length * laneHeight + 18;

  const bar = (span: Span): { x: number; width: number } => {
    const from = (span.startedAt - layout.start) * layout.scale;
    const to = ((span.endedAt ?? Date.now()) - layout.start) * layout.scale;
    return { x: from, width: Math.max(to - from, 2) };
  };

  return (
    <div className="timeline-wrap">
      {!props.spans.length && <p className="muted">no spans yet — the timeline will grow live</p>}
      <svg viewBox={`0 0 ${width} ${height}`} className="timeline" preserveAspectRatio="none">
        {layout.lanes.map((agentId, index) => (
          <g key={agentId ?? 'adhoc'}>
            <rect
              x={0}
              y={index * laneHeight}
              width={width}
              height={laneHeight - 4}
              className={`lane ${agentId ? '' : 'lane-adhoc'}`}
            />
            {props.spans
              .filter((s) => (s.agentId ?? undefined) === agentId)
              .map((span) => {
                const geometry = bar(span);
                return (
                  <rect
                    key={span.id}
                    x={geometry.x}
                    y={index * laneHeight + 2}
                    width={Math.max(geometry.width, 3)}
                    height={laneHeight - 10}
                    rx={3}
                    fill={colors[span.status]}
                  >
                    <title>
                      {span.name} — {span.status}
                      {span.inputTokens !== undefined
                        ? ` · tok ${span.inputTokens}→${span.outputTokens} (${span.usageFidelity})`
                        : ''}
                    </title>
                  </rect>
                );
              })}
          </g>
        ))}
        <line x1={0} y1={height - 12} x2={width} y2={height - 12} className="axis" />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text
            key={f}
            x={Math.min(width - 30, f * width + (f === 0 ? 2 : 0))}
            y={height - 1}
            className="axis-label"
            fontSize="9"
          >
            {(((layout.end - layout.start) * f) / 1000).toFixed(0)}s
          </text>
        ))}
      </svg>
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
          <div key={agent.id} className={active ? 'card card-active' : 'card'}>
            <div className="card-head">
              <span className="card-name">{agent.name}</span>
              {active && <span className="pulse">● running</span>}
            </div>
            <div className="card-model">
              {agent.provider}:{agent.model}
            </div>
            <div className="card-meta">
              {spans.length} spans · tok {tok.in}→{tok.out}
            </div>
          </div>
        );
      })}
    </div>
  );
}
