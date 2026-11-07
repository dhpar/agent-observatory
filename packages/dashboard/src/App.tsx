import { useEffect, useMemo, useState } from 'react';
import type { Agent, Run, Span } from '@observatory/core';
import { connectToObservatory, type Store } from './api';
import { AgentCards, RunList, Timeline, TokenHealthBar } from './ui';

export interface TokenTotals {
  in: number;
  out: number;
}

export const totalTokens = (spans: Span[]): TokenTotals =>
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
    const agents = store.agents
      .filter((a) => a.runId === run.id)
      .sort((a, b) => a.createdAt - b.createdAt);
    const spans = store.spans
      .filter((s) => s.runId === run.id)
      .sort((a, b) => a.startedAt - b.startedAt);
    return { run, agents, spans };
  }, [selectedRun, store.agents, store.spans]);

  const tokens = totalTokens(runScope.spans);
  const hasEstimates = runScope.spans.some((s) => s.usageFidelity === 'estimated');

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">agent-observatory</span>
        {runScope.run && <TokenHealthBar run={runScope.run} tokens={tokens} />}
        <span className={`conn ${store.connected ? 'conn-on' : 'conn-off'}`}>
          {store.connected ? '● live' : '○ reconnecting…'}
        </span>
      </header>

      <div className="cols">
        <aside className="sidebar">
          <RunList
            runs={store.runs}
            agents={store.agents}
            spans={store.spans}
            selectedId={selectedRun?.id}
            onSelect={setSelectedRunId}
          />
        </aside>

        <main className="main">
          {runScope.run ? (
            <>
              {/* ---- 1 · RUN ---- */}
              <Section
                n={1}
                title="Run"
                info="1 · Run — one orchestration execution: an objective, participant agents, budgets, and everything that happened under it. The objective is a human-readable label, not the prompt itself; actual prompts live on individual spans below."
              >
                <div className="runhead">
                  <h1 className="objective">{runScope.run.objective}</h1>
                  <span
                    className={`pill pill-${runScope.run.status}`}
                    title="Run lifecycle: pending → running → completed / failed / cancelled / incomplete."
                  >
                    {runScope.run.status}
                  </span>
                </div>
                <div className="statrow">
                  <span
                    className="stat"
                    title="Agents spawned by this run. Each agent is a named worker with its own provider/model."
                  >
                    <b>{runScope.agents.length}</b> agents
                  </span>
                  <span
                    className="stat"
                    title="Units of work observed in this run — every bar in the timeline below is one of these."
                  >
                    <b>{runScope.spans.length}</b> spans
                  </span>
                  <span
                    className="stat"
                    title={
                      hasEstimates
                        ? 'Input→output tokens across all spans. Some counts are ESTIMATED by a local tokenizer (usageFidelity: estimated) — they are never claimed provider-exact.'
                        : 'Input→output tokens across all of this run’s spans, reported exact by the provider (usageFidelity: exact).'
                    }
                  >
                    <b>{tokens.in + tokens.out}</b> tok
                    <span className="muted">
                      {' '}
                      ({tokens.in} in → {tokens.out} out{hasEstimates ? ', incl. estimated' : ''})
                    </span>
                  </span>
                  {runScope.run.maxTokens !== undefined && (
                    <span
                      className="stat"
                      title="Hard token cap for the whole run, set when the run was created (maxTokens). Cost budgets in USD arrive in M3."
                    >
                      cap <b>{runScope.run.maxTokens.toLocaleString()}</b> tok
                    </span>
                  )}
                </div>
              </Section>

              {/* ---- 2 · AGENTS ---- */}
              <Section
                n={2}
                title="Agents"
                info="2 · Agents — named workers inside the run (e.g. 'researcher' on ollama/Qwen:latest). An agent is the doer; it does not hold tokens or cost directly — those attach to the spans it produces (section 4)."
              >
                {runScope.agents.length === 0 ? (
                  <p className="muted">
                    no agents spawned yet — cards appear the moment the run spawns one
                  </p>
                ) : (
                  <AgentCards agents={runScope.agents} spans={runScope.spans} />
                )}
              </Section>

              {/* ---- 3 · TIMELINE ---- */}
              <Section
                n={3}
                title="Timeline · work over time"
                info="3 · Timeline — time flows left to right. Each row (lane) is one agent from section 2; each bar on a lane is one span. A bar grows live while its span is running. Colors = span status: blue running · green completed · red failed · amber interrupted · grey pending."
              >
                <Timeline run={runScope.run} agents={runScope.agents} spans={runScope.spans} />
              </Section>

              {/* ---- 4 · SPANS ---- */}
              <Section
                n={4}
                title="Spans · full record"
                info="4 · Spans — one observed unit of work each: an LLM call, a tool invocation, or a subagent spawn. Token counts and cost attach here, never to the run or agent directly. usageFidelity: 'exact' = reported by the provider; 'estimated' = derived locally, never claimed exact."
              >
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

function Section(props: {
  n: number;
  title: string;
  info: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="section">
      <h2 className="section-title">
        <span className="stepnum">{props.n}</span>
        {props.title}
        <span className="info" title={props.info}>
          ?
        </span>
      </h2>
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
            <span
              className={`typechip t-${span.type}`}
              title="Span type: llm (model call) · tool (deterministic action) · subagent (spawned worker) · custom."
            >
              {span.type}
            </span>
            <span className="span-name">{span.name}</span>
            <span
              className={`pill pill-${span.status}`}
              title="Span lifecycle: pending → running → completed / failed / interrupted."
            >
              {span.status}
            </span>
            {span.inputTokens !== undefined || span.outputTokens !== undefined ? (
              <span
                className={span.usageFidelity === 'estimated' ? 'toktok tok-est' : 'toktok'}
                title="usageFidelity — 'exact': these counts came from the provider's own usage report; 'estimated': derived locally because the provider did not report usage. Never claimed exact without a report."
              >
                tok {span.inputTokens ?? '?'}→{span.outputTokens ?? '?'} · {span.usageFidelity}
              </span>
            ) : null}
          </button>
          {openId === span.id && <pre className="ins-body">{JSON.stringify(span, null, 2)}</pre>}
        </div>
      ))}
    </div>
  );
}
