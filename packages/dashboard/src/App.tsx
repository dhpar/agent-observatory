import { useEffect, useMemo, useState } from 'react';
import type { Agent, Run, Span } from '@observatory/core';
import { Activity, Bot, Layers, Rocket } from 'lucide-react';
import { connectToObservatory, type Store } from './api';
import { AgentCards, RunList, Timeline, TokenHealthBar } from './ui';
import { cx, pill, statusTone, typeTone } from './tone';

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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-obs-border px-4 py-2.5">
        <span className="font-bold tracking-[0.5px]">Agent Observatory</span>
        {runScope.run && <TokenHealthBar run={runScope.run} tokens={tokens} />}
        <span
          className={cx(
            'ml-4 text-xs',
            store.connected ? 'text-green-500' : 'text-obs-muted',
          )}
        >
          {store.connected ? '● live' : '○ reconnecting…'}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-obs-border p-2.5">
          <RunList
            runs={store.runs}
            agents={store.agents}
            spans={store.spans}
            selectedId={selectedRun?.id}
            onSelect={setSelectedRunId}
          />
        </aside>

        <main className="flex-1 overflow-y-auto px-5 py-4">
          {runScope.run ? (
            <>
              {/* ---- 1 · RUN ---- */}
              <Section
                n={1}
                title="Run"
                icon={<Rocket size={15} aria-hidden />}
                info="1 · Run — one orchestration execution: an objective, participant agents, budgets, and everything that happened under it. The objective is a human-readable label, not the prompt itself; actual prompts live on individual spans below."
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <h1 className="text-xl leading-[1.3] font-semibold tracking-tight">
                    {runScope.run.objective}
                  </h1>
                  <span
                    className={cx(pill, statusTone[runScope.run.status])}
                    title="Run lifecycle: pending → running → completed / failed / cancelled / incomplete."
                  >
                    {runScope.run.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-[18px]">
                  <span
                    className="cursor-help text-xs tabular-nums text-obs-muted"
                    title="Agents spawned by this run. Each agent is a named worker with its own provider/model."
                  >
                    <b className="font-semibold text-obs-text">{runScope.agents.length}</b> agents
                  </span>
                  <span
                    className="cursor-help text-xs tabular-nums text-obs-muted"
                    title="Units of work observed in this run — every bar in the timeline below is one of these."
                  >
                    <b className="font-semibold text-obs-text">{runScope.spans.length}</b> spans
                  </span>
                  <span
                    className="cursor-help text-xs tabular-nums text-obs-muted"
                    title={
                      hasEstimates
                        ? 'Input→output tokens across all spans. Some counts are ESTIMATED by a local tokenizer (usageFidelity: estimated) — they are never claimed provider-exact.'
                        : 'Input→output tokens across all of this run’s spans, reported exact by the provider (usageFidelity: exact).'
                    }
                  >
                    <b className="font-semibold text-obs-text">{tokens.in + tokens.out}</b> tok
                    <span className="text-obs-muted">
                      {' '}
                      ({tokens.in} in → {tokens.out} out{hasEstimates ? ', incl. estimated' : ''})
                    </span>
                  </span>
                  {runScope.run.maxTokens !== undefined && (
                    <span
                      className="cursor-help text-xs tabular-nums text-obs-muted"
                      title="Hard token cap for the whole run, set when the run was created (maxTokens). Cost budgets in USD arrive in M3."
                    >
                      cap <b className="font-semibold text-obs-text">{runScope.run.maxTokens.toLocaleString()}</b> tok
                    </span>
                  )}
                </div>
              </Section>

              {/* ---- 2 · AGENTS ---- */}
              <Section
                n={2}
                title="Agents"
                icon={<Bot size={15} aria-hidden />}
                info="2 · Agents — named workers inside the run (e.g. 'researcher' on ollama/Qwen:latest). An agent is the doer; it does not hold tokens or cost directly — those attach to the spans it produces (section 4)."
              >
                {runScope.agents.length === 0 ? (
                  <p className="text-obs-muted">
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
                icon={<Activity size={15} aria-hidden />}
                info="3 · Timeline — time flows left to right. Each row (lane) is one agent from section 2; each bar on a lane is one span. A bar grows live while its span is running. Colors = span status: blue running · green completed · red failed · amber interrupted · grey pending."
              >
                <Timeline run={runScope.run} agents={runScope.agents} spans={runScope.spans} />
              </Section>

              {/* ---- 4 · SPANS ---- */}
              <Section
                n={4}
                title="Spans · full record"
                icon={<Layers size={15} aria-hidden />}
                info="4 · Spans — one observed unit of work each: an LLM call, a tool invocation, or a subagent spawn. Token counts and cost attach here, never to the run or agent directly. usageFidelity: 'exact' = reported by the provider; 'estimated' = derived locally, never claimed exact."
              >
                <SpanInspectorList spans={runScope.spans} />
              </Section>
            </>
          ) : (
            <p className="text-obs-muted">
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
  icon?: React.ReactNode;
  info: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="mb-16">
      <h2 className="mb-6 flex items-center gap-2.5 border-b border-obs-accent pb-1.5 text-2xl font-semibold tracking-[1.2px] text-obs-text uppercase">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-obs-accent text-[11px] font-bold text-obs-bg">
          {props.n}
        </span>
        <span className="shrink-0 text-obs-accent">{props.icon}</span>
        {props.title}
        <span
          className="inline-flex h-3.75 w-3.75 cursor-help items-center justify-center rounded-full border border-obs-accent text-[10px] text-obs-accent hover:border-obs-accent hover:text-obs-accent"
          title={props.info}
        >
          ?
        </span>
      </h2>
      {props.children}
    </section>
  );
}

/** M2 inspector: full field view via expandable rows (no drill-down modal yet). */
function SpanInspectorList(props: { spans: Span[] }): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);

  if (props.spans.length === 0) return <p className="text-obs-muted">no spans recorded yet</p>;

  return (
    <div className="flex flex-col gap-1">
      {props.spans.map((span) => (
        <div
          key={span.id}
          className={cx(
            'rounded-lg border bg-obs-panel',
            span.id === openId ? 'border-obs-accent' : 'border-obs-border',
          )}
        >
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-3 bg-transparent p-2 text-left text-obs-text hover:rounded-lg hover:bg-obs-panel2"
            onClick={() => setOpenId(openId === span.id ? null : span.id)}
          >
            <span
              className={cx('rounded bg-obs-panel2 px-1.5 py-0.5 text-[10px] tracking-wider uppercase', typeTone[span.type])}
              title="Span type: llm (model call) · tool (deterministic action) · subagent (spawned worker) · custom."
            >
              {span.type}
            </span>
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium">
              {span.name}
            </span>
            <span
              className={cx(pill, statusTone[span.status])}
              title="Span lifecycle: pending → running → completed / failed / interrupted."
            >
              {span.status}
            </span>
            {span.inputTokens !== undefined || span.outputTokens !== undefined ? (
              <span
                className={cx(
                  'cursor-help text-xs tabular-nums',
                  span.usageFidelity === 'estimated'
                    ? 'border-b border-dashed border-yellow-500 text-yellow-500'
                    : 'text-obs-muted',
                )}
                title="usageFidelity — 'exact': these counts came from the provider's own usage report; 'estimated': derived locally because the provider did not report usage. Never claimed exact without a report."
              >
                tok {span.inputTokens ?? '?'}→{span.outputTokens ?? '?'} · {span.usageFidelity}
              </span>
            ) : null}
          </button>
          {openId === span.id && <pre className="m-0 max-h-80 overflow-auto px-3 pb-2.5 text-[11px] text-obs-muted">{JSON.stringify(span, null, 2)}</pre>}
        </div>
      ))}
    </div>
  );
}
