# Agent Observatory — Plan

> **Feature:** Observability-first multiagent orchestrator
> **Working names (pick one later):** `agent-observatory`, `ScopeDeck`, `Glassbox Agents`
> **Status:** Draft v1 — Plan mode
> **Author:** GLM-5.3-Flash (OpenCode) with David
> **Date:** 2026-11-06

---

## 1. Problem & Vision

When you run multiple LLM agents, you fly blind:

- Is each agent still making progress? What is its _actual current task_?
- How long has it been running? (Real ETA is unknowable — see §3 — but an honest estimate is possible.)
- How many tokens/money has the run burned, and what will it _likely_ cost to finish?
- How full is the model's context window, and **what** is filling it (system prompt? tool definitions? stale tool output? accordion history)?
- Did any guardrail fire — budget, allowlist, schema, PII?

**Vision:** a local-first, single-developer orchestrator where _every_ agent run is a first-class observable object: a live span/Gantt timeline, a cost ledger, a context-usage audit with actionable (advisory) suggestions, and a guardrail event feed.

**Direct answer to your question — "should the project be about creating chat with its guardrails?"**
No — not as the core. Chat is a _consumer_ surface, observability is the _product_. A chat console can arrive later (v1.5+) as a thin pane over the same runs. Guardrails belong in the orchestrator core regardless of UI shape.

---

## 2. Decisions locked in (from Q&A)

| Topic              | Decision                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Product identity   | **Observability-first orchestrator** built on existing LLM SDKs (not a new framework, not a layer over LangGraph/CrewAI)     |
| Audience           | **Single developer**, local-first, no auth, no multi-tenancy                                                                 |
| UI                 | **React web dashboard** (Vite + React + TS), live-updating                                                                   |
| Providers          | **OpenAI + Anthropic + local (Ollama)**                                                                                      |
| Context management | **Advisory first** — measure, flag, one-click actions requiring human approval; auto-compaction deferred to v2 behind a flag |
| Guardrails         | **Foundational**: schema validation, tool allowlists, spend/step budgets, PII-redaction hooks, event feed                    |
| Language           | **TypeScript/Node everywhere** (no PHP)                                                                                      |
| Storage            | **SQLite** (better-sqlite3), Postgres adapter later                                                                          |

---

## 3. Honest limits — what CANNOT be done exactly

Write these on the project's README. They are physics, not v1 shortcuts.

1. **"Expected time to finish" is an estimate, always.** We can build a decent heuristic ETA from: elapsed time, tokens burned vs. budgeted, progress markers emitted by agents, and historical runs of similar task _shapes_. It gets better with accumulated local history. Label it "ETA (est.)" in the UI forever.
2. **Tokens used by an answer are only exact after the response completes.** OpenAI (`usage` in final chunk) and Anthropic (`usage` in message_stop / final message) both return exact counts; Ollama returns `eval_count`/`prompt_eval_count`. Pre-completion counts are estimates via provider tokenizers (`@voke-ai/tiktoken`-style / `js-tiktoken` for OpenAI; Anthropic's official `@anthropic-ai/tokenizer` web count-tokens endpoint or an approximation client-side). The UI must distinguish **estimated vs. exact**.
3. **Agents we don't instrument are invisible.** Every agent must be launched through our SDK/wrapper (or emit OpenTelemetry spans via OTLP). Observing foreign frameworks' agents only works via adapters (v2: LangGraph.js adapter).
4. **Cost is only as good as the price table.** Pricing changes without notice; local models cost $0 compute but real electricity. Prices are data, loaded from a versioned JSON table the user can edit; never hardcode prices in logic.
5. **Context accounting for a model's internal cache is approximate.** Prompt-cache reads/writes are reported differently per provider (OpenAI `cached_tokens`, Anthropic `cache_read_input_tokens` / `cache_creation_input_tokens`). We surface them but cannot always reconcile to the penny.

---

## 4. Core domain model

```
Run          one orchestration execution (id, objective, status, budget, started/finished)
 ├─ Agent    a participant (name, model, role, provider, params)
 │   └─ Span an observed unit (LLM call | tool call | subagent | custom),
 │            parent/child links, start/end, tokens, cost, status
 ├─ Task     named unit of work an agent claims ("current_task" lives here)
 ├─ Budget   spend cap (USD), token cap, step cap, wall-clock cap
 ├─ ContextReport  per-LLM-call audit: window size, used, breakdown
 │                 (system, tools, history, tool-results, last user msg),
 │                 % full, headroom, advisories
 ├─ Advisory  suggested minimization action (type, evidence, impact est.,
 │            status: proposed|approved|dismissed|applied)
 ├─ GuardrailEvent  fired rule, severity, action (log|block|redact), payload
 └─ CostLedger      append-only per-token-event rows (exact or estimated)
```

Storage: SQLite schema via **Drizzle ORM**; spans/events append-heavy, runs read-heavy. Append-only ledger → no destructive updates on cost rows (auditability).

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────┐
│  Dashboard (Vite + React + TS, TanStack Query)       │
│  ← REST (Fastify) + WebSocket for live delta feed    │
└───────────────▲──────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────┐
│  observatory-server (Node 22, TS, Fastify)           │
│  - run/agent/span/task CRUD                          │
│  - event pump → WS broadcast → SQLite (buffered)     │
│  - guardrail engine hooks   - advisory engine        │
│  - ETA engine               - cost ledger            │
└───────────────▲──────────────────────────────────────┘
                │  tracing (OpenTelemetry GenAI semconv)
┌───────────────┴──────────────────────────────────────┐
│  observatory-sdk (npm workspace package)             │
│  - defineRun / spawnAgent / wrapLLM / wrapTool       │
│  - provider adapters: Vercel AI SDK v5               │
│    (openai, anthropic, ollama) → unified span+usage  │
│  - Zod schemas for agent I/O                         │
└──────────────────────────────────────────────────────┘
```

Monorepo (pnpm workspaces + Turborepo):

```
packages/
  core/          domain types, event bus, budget engine
  sdk/           developer-facing API (the thing user code imports)
  server/        Fastify API + WS + persistence + engines
  dashboard/     React UI
  pricing/       versioned JSON price table + loader
apps/
  playground/    example multiagent scripts (dogfooding)
```

Key choice: **Vercel AI SDK as the model-access layer** instead of raw provider SDKs — one streaming/usage surface for OpenAI + Anthropic + Ollama, strong TS types, built-in `telemetry` hook that maps to OpenTelemetry spans.

---

## 6. v1 Features (acceptance criteria)

**F1 — Live run timeline (Gantt/spans).** Agents as lanes, spans as bars, colors by type (LLM / tool / subagent). Live via WS; scrubbing history after completion.
_Accepts:_ 3 concurrent agents × 10 spans each renders without miss-ordered bars; reconnecting the socket re-syncs.

**F2 — Agent cards.** Objective, claimed `current_task`, elapsed time, ETA (est.), tokens/cost so far, budget bar, context % full.
_Accepts:_ card updates within ~1s of span close.

**F3 — Cost & token ledger.** Per-span and per-run: prompt/completion/total tokens, cost, **estimated|exact** flag, cache hit/miss token split.
_Accepts:_ sum of spans == run total; ledger replays from SQLite identically after restart.

**F4 — Context audit.** Per LLM call: window size vs. used, % full, breakdown stack (system / tool defs / history / tool results / last message), biggest-item list.
_Accepts:_ breakdown sums to within ±2% of total reported usage (there are always tokenizer tails).

**F5 — Advisory engine (v1: propose-only).** Rules like:

- "System prompt is 41% of context" → suggest trimming/hoisting to cache.
- "Tool X returned 12k tokens last 5 calls, never referenced since" → suggest dropping from history (one-click, requires approval, produces a _preview diff_ — never silently mutates).
- "Nachat history > 60% of window" → suggest summarization checkpoint.
  _Accepts:_ dismised/approved state persisted; approved action emits a _proposed plan_, not an auto-edit, in v1.

**F6 — ETA engine.** Burn-rate + historical-similarity heuristic; wide confidence band shown ("~4m ±2m").
_Accepts:_ band always rendered; no point estimate without a band; gracefully degrades to "unknown" for <20% progress.

**F7 — Foundational guardrails.** Zod schema validation on agent I/O; tool allowlist per agent; budget stops (soft: warn / hard: cancel run); PII redaction hook (regex/Presidio-lite patterns; pluggable, default off); all events land in the feed.
_Accepts:_ hard budget kill fires within one in-flight call; guardrail feed shows rule, severity, action.

**F8 — Run history & replay.** List runs, open finished runs, inspect every span, ledger, context report.
**F9 — Ollama support.** `baseURL` swap, `eval_count` usage mapping, cost=0 rows flagged "local".

---

## 7. Phases / Milestones

- **M0 — Scaffold (½ day–1 day).** pnpm monorepo, TS strict, Vitest, ESLint+Prettier, Drizzle+SQLite, CI-less (local). _Exit:_ `pnpm test` green, hello-run writes one span to SQLite.
- **M1 — Tracing spine (2–3 days).** SDK `defineRun/spawnAgent/wrapLLM`; OpenAI streaming with usage capture; spans → server → SQLite; CLI `observatory tail` prints spans live. _Exit:_ playground script runs end-to-end offline from the DB (replay works).
- **M2 — Live dashboard, read-only (3–4 days).** Fastify REST+WS; timeline + agent cards + span inspector; Anthropic added. _Exit:_ watch a 2-agent run live; refresh-safe.
- **M3 — Money & context (3–4 days).** CostLedger + pricing table (OpenAI/Anthropic current, editable JSON); ContextReport breakdown; estimated-vs-exact flags; Ollama adapter. _Exit:_ a run reports cost within tolerance of provider console; context breakdown renders.
- **M4 — ETA + advisories (3–4 days).** ETA engine (v0 heuristic: burn rate + progress markers; store per-run history). Advisory rules 1–3 from F5 with preview-diff + approve/dismiss. _Exit:_ advisory shows on a seeded bloated-context fixture run.
- **M5 — Guardrails (2–3 days).** Schema validation, allowlists, soft/hard budgets, kill switch, guardrail feed. _Exit:_ forced-overspend fixture run gets killed and feeds events.
- **M6 — Polish + eval harness (2–3 days).** Run history UI, replay downloads (JSONL/OTLP export), promptfoo-style scripted evals for the _orchestrator's_ own advisory rules, README. _Exit:_ v1 cut, tag `v0.1.0`.

**Total rough: ~3–4 weeks of focused evenings.** Cut scope at M4 if needed: v1 is already valuable at M3.

---

## 8. Use cases to satisfy

1. **UC1** Ship a "research-and-summarize" 2-agent run; watch live; get final cost. ✅ ≤5 min from `pnpm playground research`
2. **UC2** Fan out 4 subagents; see interleaved lanes without span confusion.
3. **UC3** Budget $0.50 hard cap; run gets killed; ledger shows exactly what was spent when.
4. **UC4** Context bloat: long tool-happy run flags "stale tool output" advisory; developer approves proposed drop; sees projected savings on next call.
5. **UC5** Crash recovery: kill the server mid-run; restart; history/ledger intact; running spans marked `interrupted` (never silently "lost").
6. **UC6** Local-only mode: Ollama run, $0 cost rows, no external calls.
7. **UC7** Postmortem: reopen a failed run; see the exact span order, guardrail events, and the context state at the failing call.

---

## 9. UI details (dashboard)

- **Left rail:** runs list (status dot, model icons, $ spent).
- **Main:** timeline (lanes × spans, hover = span detail popover: tokens, cost, first 300 chars of prompt/response preview, expanded in inspector).
- **Right rail (context):** per-agent context meter (donut), breakdown stacked bar, advisory inbox with Approve/Dismiss.
- **Bottom strip:** cost ledger table + guardrail events feed.
- **okane-run page:** replay scrubber (drag to any timestamp, all meters re-render at that time). This is the post-mortem killer feature; keep it simple: time-indexed snapshots from the event log.
- Design: dark-first, no focus over utility; Tailwind; TanStack Query; no chart lib needed v1 (plain SVG/divs); revisit if the timeline becomes painful.

---

## 10. Guardrails & evals

**Guardrail layers (in order of execution):**

1. **Input:** Zod schema on task/agent input; PII redaction hook (opt-in).
2. **Policy:** tool allowlist per agent; max steps per agent; budget (soft warn → hard kill); wall-clock cap.
3. **Output:** Zod schema on agent output; guardrail violation → event + (configurable) retry-once / fail-span / fail-run.
4. **Feed:** every event persisted + shown; nothing silent.

**Evals — two different things, don't conflate:**

- **Agent output evals** (does the summarizer summarize well?) — _out of scope v1_; note as future feature; recommend promptfoo/Braintrust-style scripted graders later.
- **System self-evals** (does _our_ telemetry work?) — in scope v1:
  - Fixture runs (recorded provider responses) replayed through the pipeline; assert ledger spans/costs/context breakdowns match golden files.
  - Property tests: span sum == run total; no negative costs; context breakdown ≤ reported usage.
  - Advisory precision harness: seed known-bloat contexts, assert each rule fires (and doesn't fire on clean fixtures).

---

## 11. Testing guidelines

- **Unit (Vitest):** budget engine edge math, ETA math, pricing loader, context-breakdown assembler, tokenizer wrappers (cached).
- **Integration (Vitest + msw/recorded fixtures):** full span pipeline with mocked provider streams; WebSocket snapshot+delta contract.
- **Contract tests:** provider adapters must emit the same unified `Usage` shape for OpenAI / Anthropic / Ollama — this is the highest-value test in the repo.
- **Golden/replay:** record one run per provider; store as JSONL; every PR replays them and diffs the ledger.
- **UI:** React Testing Library for meters/cards; Playwright smoke (launch run → dashboard renders live) at M6.
- **Load sanity:** 500 spans/run × 20 runs must keep WS broadcast < 1s and SQLite writes buffered (no per-event flush).

---

## 12. Edge cases & failure paths

| #   | Edge case                                                                    | Handling                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Provider omits `usage` (older Ollama models, aborted streams)                | fallback tokenizer estimate, flag `estimated`, never block the run                                                                                                  |
| E2  | Stream disconnects mid-call                                                  | span closed as `interrupted`, partial tokens counted from received chunks if reported; retry is a _new_ span (link via `retryOf`)                                   |
| E3  | Retries double-count cost                                                    | retry chain aggregates; UI shows "3 attempts, $0.04 total", not 3 separate charges                                                                                  |
| E4  | Parallel agents, interleaved spans                                           | spans are tree-structured w/ parent ids and start offsets; timeline sorts by start, not insertion order; no wall-clock clock assumptions (use monotonic per-run t0) |
| E5  | Agent crashes / server killed                                                | orphan spans → `interrupted` at boot-time sweep (unfinished spans older than TTL); run marked `incomplete`, never silently dropped                                  |
| E6  | Context overflow mid-run (provider 400)                                      | capture error span, report exact vs. window, **abort respectfully** vs auto-retry-with-trim — advisory suggests the trim, human approves (v1 policy)                |
| E7  | SQLite lock contention on high-frequency events                              | single writer (better-sqlite3 is sync; WAL mode), event-pump batching; no WAL viewers issue                                                                         |
| E8  | Stale price table → wrong cost                                               | versioned JSON, `priceAsOf` date shown; costs stored with the price version used                                                                                    |
| E9  | Local model tokenizer ≠ provider count                                       | label counts as model-specific; an Ollama model's tokenizer is whatever the GGUF says; don't pretend                                                                |
| E10 | WS reconnect / page refresh                                                  | snapshot-on-connect + delta stream; client re-requests missed window                                                                                                |
| E11 | Hard budget kill fires while a model call is in flight                       | in-flight call completes (real-world: you can't un-spend), no further calls allowed; ledger reflects reality                                                        |
| E12 | Advisory that would corrupt reasoning (dropping a tool result that's needed) | advisories show evidence + projected savings; always human-approved; declined adversarial cases feed the advisory eval fixtures                                     |
| E13 | Clock skew between SDK and server                                            | server assigns receive-time; SDK sends send-time; display server time only                                                                                          |
| E14 | Extremely long single response filling context                               | streaming chunk counter; context meter updates mid-call (est. flag)                                                                                                 |
| E15 | User edits/delete the SQLite file mid-run                                    | serializable: no deletions during active run; UI warns                                                                                                              |
| E16 | ` tiktoken` download blocked offline                                         | bundle counts offline / graceful "est. unavailable"                                                                                                                 |

---

## 13. Constraints — what it must NOT do

1. No silent mutation of agent context (advisory + approve only, in v1 and v2's auto-mode must log every change as an applied Advisory).
2. No multi-tenancy, auth, or cloud sync in v1.
3. No cloud dependency for core function (pure-local must work; "phone home" only if user explicitly asks — price-table refresh is opt-in).
4. No sending your prompts/outputs anywhere (observability stays local; export is explicit).
5. No inventing a new agent framework paradigm — SDK wraps simple, explicit agent definitions; no magic planning loops.
6. No exact-claims: every derived number (ETA, pre-completion tokens, projected savings) is labeled as estimate with a visible confidence band.
7. No guardrail action without an event (fail-open or fail-closed, both must be logged).
8. No PHP packages — TS everywhere (decided).
9. No storing raw API keys in the SQLite DB — env/config file only.

---

## 14. Tech stack (summary)

- **Runtime:** Node 22 LTS, TypeScript strict, ESM.
- **Orchestrator/serve:** Fastify + `@fastify/websocket`; OpenTelemetry JS SDK (`@opentelemetry/sdk-node`) with a custom SQLite span exporter; **Vercel AI SDK v5** (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `ollama via @ai-sdk/openai-compatible`), Zod v4.
- **Data:** better-sqlite3 + Drizzle ORM + drizzle-kit migrations; JSONL export.
- **Tokenizers:** `js-tiktoken` (OpenAI families); Anthropic: official count-tokens API when online, offline approximation otherwise; Ollama: report model-reported counts only.
- **UI:** Vite + React 19 + TS, TanStack Query, Zustand (live store), Tailwind, plain SVG timeline.
- **Tooling:** pnpm workspaces, Turborepo, Biome or ESLint+Prettier, Vitest, Playwright (M6).

---

## 15. Pain points / risks (sincere)

1. **Token-count truth differs per provider/vendor model.** The provider-adapter contract test suite (§11) is the project's most valuable asset. Skimp there and every number is a lie.
2. **ETA quality** will be mediocre for novel task shapes early on. Communicate bands, gather history, improve later. Do not promise minutes.
3. **Streaming + tracing + persistence** glue is fiddly (async spans, backpressure, batching). Expect a debugging-heavy M1–M2. Budget time accordingly.
4. **Pricing drift** every few weeks. Fine for a single-user tool; automated refresh is a v2 item (with an `opt-in` note).
5. **Advisory quality risk:** bad advice ("delete context") is worse than no advice. The preview-diff + human-approve pattern (E12) and the adverse-fixture eval harness are the mitigation; don't ship a rule without fixtures proving it.
6. **Scope gravity:** "just one more guardrail feature" — the plan's M-list is the shield; cut at M4 if real life intervenes.

---

## 16. Suggested next steps (immediately actionable)

1. Pick the project name → create repo folder `C:\Users\David\Documents\Coding - Powershell\<name>\`.
2. (After switching agents) copy this plan file into `<repo>\docs\plan\observability-first-orchestrator.md` as the working spec.
3. Run M0 scaffold: `pnpm init` monorepo + Vitest + Drizzle SQLite + a `core` package with the domain types from §4.
4. Build the smallest end-to-end slice: `defineRun` → one OpenAI streaming call → span row in SQLite → `observatory tail` CLI prints it. (_This_ is the day-one "it's alive" moment.)
5. Then commit to M1 → M2 order; don't build the dashboard first (biggest temptation, biggest regret if the tracing spine is wrong underneath).
6. Optional warm-up exercise: write every item from §3 (honest limits) into the README as "What this tool can and cannot tell you." Instantly differentiates the project and keeps future-you honest.

---

## 17. Roadmap / future features (v1.5+)

- **Chat console** with same guardrails (the question you asked): pane over the run model — same engine, different consumer surface.
- **Auto-compaction (opt-in, behind flag):** summarization checkpoint with preview diff + one-click full audit trail of _exactly what was removed and why_. This is the highest-risk, highest-reward future feature.
- **Cross-provider concurrency:** A/B same prompt via OpenAI & Anthropic & Ollama side-by-side, diff cost/latency/quality.
- **Budget forecasting:** "this run shape historically costs $X ± Y" before you launch.
- **Eval suite for agents** (promptfoo-style graders wired to run records).
- **Adapters:** LangGraph.js span import; MCP-tool span normalization.
- **Export:** OTLP → Jaeger; JSONL; session "postmortem bundles."
- **Team mode:** Postgres adapter + simple token auth (still no SaaS).

---

## 18. Bibliography

> ⚠️ **Note:** web search was unavailable during planning (HTTP 402), so these are from established knowledge; **verify each link** when setting up the repo. All sources are primary/official docs or long-established projects.

1. **OpenTelemetry — Semantic Conventions for Generative AI systems** (span naming, `gen_ai.*` attributes for model, tokens, cost). The standard this project's tracing follows. `https://opentelemetry.io/docs/specs/semconv/gen-ai/`
2. **OpenAI API Reference — Chat Completions (`usage`: prompt_tokens, completion_tokens, cached_tokens)** and **Streaming (`stream_options: {"include_usage": true}`)**. `https://platform.openai.com/docs/api-reference/chat`
3. **OpenAI — tiktoken / `openai-cookbook` "How to count tokens"**. `https://github.com/openai/tiktoken`
4. **Anthropic — Messages API (`usage`: input_tokens, output_tokens, cache_read/creation_input_tokens)** and **Context windows doc**; **`count_tokens` endpoint**. `https://docs.anthropic.com/en/docs/build-with-claude/messages`
5. **Anthropic — Prompt caching** (the "hoist static prefix to cache" advisory source of truth). `https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching`
6. **Ollama — API docs (`/api/chat`, `eval_count`, `prompt_eval_count`)**. `https://github.com/ollama/ollama/blob/main/docs/api.md`
7. **Vercel AI SDK — Telemetry (OpenTelemetry integration), Stream text / generateText, providers.** `https://sdk.vercel.ai/docs/ai-sdk-core/telemetry`
8. **OpenTelemetry JS — SDK Node, custom exporters.** `https://opentelemetry.io/docs/languages/js/instrumentation/`
9. **better-sqlite3 + WAL mode** (concurrency story E7). `https://github.com/WiseLibs/better-sqlite3`
10. **Drizzle ORM — SQLite.** `https://orm.drizzle.team/docs/get-started-sqlite`
11. **Langfuse / LangSmith / Arize Phoenix / OpenLIT** — prior art to study (fine to borrow both UI and data-model ideas; we deliberately differ by being an _orchestrator_ with local-first storage). `https://langfuse.com/docs` `https://docs.smith.langchain.com` `https://github.com/Arize-ai/phoenix` `https://github.com/openlit/openlit`
12. **NVIDIA NeMo Guardrails / Guardrails AI / Zod** — guardrail patterns and schema-validation primitives (we implement the _foundational_ subset ourselves; Zod is our v1 validator). `https://github.com/NVIDIA/NeMo-Guardrails` `https://github.com/guardrails-ai/guardrails` `https://zod.dev`
13. **promptfoo / DeepEval** — eval harness patterns for when agent-output evals enter scope. `https://www.promptfoo.dev/docs/intro/`
14. **LiteLLM — community model→price database** (reference for the pricing JSON table format/issues). `https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json`
15. **Helicone blog — LLM cost tracking & token accounting pitfalls** (practical prior art). `https://www.helicone.ai/blog`

---

## Amendment A — Model-selection pivot (2026-11-06)

Recorded before M1, supersedes the "OpenAI + Anthropic + local" provider row in §2.

- **Decision:** OpenAI-compatible-first. The SDK speaks the OpenAI chat
  protocol for _most_ providers (Ollama, vLLM, LM Studio, llama.cpp,
  OpenRouter free tiers, Groq, Together, future endpoints) via a unified
  adapter; native OpenAI and Anthropic adapters exist for when David moves
  to a paid tier.
- **Consequences for the domain:** `Agent.provider` is an open string (the
  known-provider list is UI guidance, not a gate); `Agent.baseURL` and
  `ModelRef` (provider, model, baseURL, openWeights, freeTier) are now
  domain concepts in `@observatory/core`.
- **Consequences for cost:** per-model prices live ONLY in the versioned
  pricing table (M3); free-tier/local rows carry 0 USD flagged `free`,
  never silently zero — budgets must know a run was "free" on purpose.
- **Consequences for the usage contract:** usage-report fidelity varies by
  endpoint (not all report the prompt/completion split). The existing
  `exact|estimated` fidelity flag handles this; the contract test suite in
  §11 now covers Ollama/OpenRouter-style usage payloads, not just OpenAI's.
- **Things NOT done here (deferred to M1/M3):** actual transport (SDK), the
  pricing table itself, provider selection UI.

---

## Amendment A2 — Owned transport instead of AI SDK (2026-11-06)

- Decision: M1's model access is a thin, owned OpenAI-compatible streaming
  client (`fetch` + SSE, ~120 lines, zero runtime deps) inside
  `@observatory/sdk`, behind a provider-agnostic `ChatTransport` seam.
- Why: the Vercel AI SDK (plan §14) has moved to v7 — two majors beyond any
  baseline verified in this workspace — while the M1 spine is the
  highest-risk component and is tested offline via that seam. The owned
  client covers every OpenAI-compatible endpoint (Ollama, vLLM, LM Studio,
  llama.cpp, OpenRouter, Groq, Together, paid OpenAI).
- Honest limitation: tool-calling/parallel-tool-call ergonomics may later
  justify the AI SDK for M5+ guardrails on outputs; the seam makes swapping
  (or dual-hosting) transports cheap. Re-evaluate at M6.
- Consequence: `packages/sdk` has no LLM SDK dependency; offline contract
  tests simulate SSE chunks through an injectable `fetch`.

---

_End of plan._
