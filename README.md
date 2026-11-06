# agent-observatory

An observability-first multiagent orchestrator: live span timelines, cost/token
ledgers, context-window audits with actionable advisories, and foundational
guardrails. Local-first, single developer, SQLite.

## Working spec

The full plan (decisions, milestones, edge cases, honest limits, bibliography)
lives at [`docs/plan/observability-first-orchestrator.md`](docs/plan/observability-first-orchestrator.md).
Read it before touching anything inside `packages/`.

## Repository layout

```
packages/
  core/   domain types & schemas (Run, Agent, Span, Budget, ModelRef, ...) — no deps beyond zod
  db/     SQLite persistence via Drizzle ORM (schema, data service)
```

## Development

```bash
pnpm install
pnpm test        # runs all workspace package tests (vitest)
pnpm typecheck   # tsc --noEmit across packages
pnpm lint        # eslint (flat config, typescript-eslint)
pnpm format      # prettier
```

Prerequisites: Node.js >= 24 (match the Node version you build with — native
modules like better-sqlite3 bind to the Node ABI), pnpm 11+.

### If tests fail with `NODE_MODULE_VERSION ... requires NODE_MODULE_VERSION ...`

You switched Node versions after a native module (better-sqlite3) was built.
Re-target it to the Node you're running now:

```bash
pnpm rebuild better-sqlite3
```

## Status

M0 (scaffold) in progress — see plan §7 for milestones. Persistence currently
uses ensure-schema DDL at boot; drizzle-kit migration tooling arrives with M1
(tracing spine).
