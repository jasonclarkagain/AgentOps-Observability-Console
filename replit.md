# AgentOps

AgentOps is an observability console for autonomous systems that traces semantic agent behavior, attributes cost to outcomes, detects anomalies, and supports replay.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/agentops/` — React/Vite console with workspace, run explorer, run detail, anomalies, and MCP settings views.
- `artifacts/api-server/` — Express API serving dashboard summaries, runs, semantic trace events, anomalies, replay, and telemetry ingestion.
- `lib/api-spec/openapi.yaml` — source-of-truth API contract; regenerate clients with the codegen command above.
- `lib/db/src/schema/agentops.ts` — Drizzle schema for captured runs, trace events, and anomalies.

## Architecture decisions

- AgentOps telemetry uses semantic event types (`reasoning`, `tool_call`, `tool_result`, `context`, `correction`, `output`) so the UI can distinguish agent behavior from generic logs.
- The first build uses a small seeded trace dataset to make the console useful immediately; telemetry ingestion appends events to an existing run and updates its event count.
- The console is contract-first: the OpenAPI document generates both the API validation schemas and React Query hooks used by the frontend.
- Demo seeding is single-flight so concurrent first requests cannot race and insert duplicate seed data.

## Product

- Workspace overview with active runs, success rate, inference cost, latency, recent executions, open anomalies, and a selected semantic trace.
- Searchable and status-filtered run explorer with drill-down into each run's reasoning and tool sequence.
- Anomaly queue highlighting unexpected loops and repeated tool calls.
- Replay action for captured runs and MCP-style semantic telemetry ingestion from the settings screen.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
