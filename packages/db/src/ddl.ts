/**
 * Boot-time schema definition. Deliberately idempotent (IF NOT EXISTS) and
 * word-for-word aligned with schema.ts. Replaced by drizzle-kit migrations
 * in M1 (tracing spine), so drift here is not the long-term risk it looks
 * like — see README "Status".
 */
export const ensureSchema = /* sql */ `
CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,
  objective   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  budget_usd  REAL,
  max_tokens  INTEGER,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  created_at  INTEGER NOT NULL,
  meta        TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT,
  provider   TEXT NOT NULL,
  model      TEXT NOT NULL,
  params     TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spans (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent_id        TEXT REFERENCES agents(id) ON DELETE CASCADE,
  parent_span_id  TEXT,
  type            TEXT NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  cost_usd        REAL,
  usage_fidelity  TEXT NOT NULL DEFAULT 'estimated',
  error           TEXT,
  retry_of        TEXT,
  data            TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent_id    TEXT REFERENCES agents(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'proposed',
  started_at  INTEGER,
  finished_at INTEGER,
  meta_data   TEXT
);

CREATE TABLE IF NOT EXISTS guardrail_events (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent_id   TEXT REFERENCES agents(id) ON DELETE CASCADE,
  rule       TEXT NOT NULL,
  severity   TEXT NOT NULL,
  action     TEXT NOT NULL,
  payload    TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_ledger (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  span_id       TEXT,
  tokens_in     INTEGER NOT NULL,
  tokens_out    INTEGER NOT NULL,
  cost_usd      REAL NOT NULL,
  price_version TEXT,
  fidelity      TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spans_run      ON spans(run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_cost_run       ON cost_ledger(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guardrail_run  ON guardrail_events(run_id, created_at);
`;
