import { useEffect, useMemo, useState } from 'react';
import type { Agent, Run, Span } from '@observatory/core';
import { connectToObservatory, type Store } from './api';
import { AgentCards, RunList, Timeline } from './ui';

const totalTokens = (spans: Span[]): { in: number; out: number } =>
  spans.reduce(
    (acc, s) => ({ in: acc.in + (s.inputTokens ?? 0), out: acc.out + (s.outputTokens ?? 0) }),
    { in: 0, out: 0 },
  );

export default function App(): React.JSX.Element {
  const [store, setStore] = useState<Store>({ runs: [], agents: [], spans: [], connected: false });
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => connectToObservatory(setStore), []);

  const selectedRun = useMemo<Run | undefined>(
    () => store.runs.find((r) => r.id === selectedRunId) ?? store.runs[0],
    [store.runs, selectedRunId],
  );

  const runScope = useMemo(() => {
    const run = selectedRun;
    if (!run) return { run: undefined, agents: [] as Agent[], spans: [] as Span[] };
    const agents = store.agents.filter((a) => a.runId === run.id);
    const spans = store.spans
      .filter((s) => s.runId === run.id)
      .sort((a, b) => a.startedAt - b.startedAt);
    return { run, agents, spans };
  }, [selectedRun, store.agents, store.spans]);

  const tokens = totalTokens(runScope.spans);

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">agent-observatory</span>
        <span className={`conn ${store.connected ? 'conn-on' : 'conn-off'}`}>
          {store.connected ? '● live' : '○ reconnecting…'}
        </span>
      </header>

      <div className="cols">
        <aside className="sidebar">
          <RunList
            runs={store.runs}
            spans={store.spans}
            selectedId={selectedRun?.id}
            onSelect={setSelectedRunId}
          />
        </aside>

        <main className="main">
          {runScope.run ? (
            <>
              <div className="runheader">
                <h1 className="objective">{runScope.run.objective}</h1>
                <span className={`pill pill-${runScope.run.status}`}>{runScope.run.status}</span>
                <span className="tokens">
                  tok {tokens.in} → {tokens.out}
                </span>
              </div>
              <Timeline run={runScope.run} spans={runScope.spans} />
              <AgentCards agents={runScope.agents} spans={runScope.spans} />
              <Section title="span inspector">
                <SpanInspectorList spans={runScope.spans} />
              </Section>
            </>
          ) : (
            <p className="muted">
              No runs yet. Start one with <code>pnpm hello</code>, or run your own through the SDK.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="section">
      <h2 className="section-title">{props.title}</h2>
      {props.children}
    </div>
  );
}

/** M2 inspector: full field view via expandable rows (no drill-down modal yet). */
function SpanInspectorList(props: { spans: Span[] }): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);

  if (props.spans.length === 0) return <p className="muted">no spans recorded yet</p>;

  return (
    <div className="inspector">
      {props.spans.map((span) => (
        <div key={span.id} className={span.id === openId ? 'ins-row ins-open' : 'ins-row'}>
          <button
            type="button"
            className="ins-head"
            onClick={() => setOpenId(openId === span.id ? null : span.id)}
          >
            <span className="span-name">{span.name}</span>
            <span className={`pill pill-${span.status}`}>{span.status}</span>
            {span.inputTokens !== undefined || span.outputTokens !== undefined ? (
              <span className="muted">
                tok {span.inputTokens ?? '?'}→{span.outputTokens ?? '?'} ({span.usageFidelity})
              </span>
            ) : null}
          </button>
          {openId === span.id && <pre className="ins-body">{JSON.stringify(span, null, 2)}</pre>}
        </div>
      ))}
    </div>
  );
}
