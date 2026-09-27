import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, agentRunsTable, anomaliesTable, traceEventsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetRunEventsResponse,
  GetRunEventsParams,
  GetRunParams,
  GetRunResponse,
  IngestTelemetryEventBody,
  IngestTelemetryEventResponse,
  ListAnomaliesQueryParams,
  ListAnomaliesResponse,
  ListRunsQueryParams,
  ListRunsResponse,
  ReplayRunBody,
  ReplayRunResponse,
  ReplayRunParams,
} from "@workspace/api-zod";
import { ensureAgentOpsSeeded } from "../lib/agentops-seed";

const router: IRouter = Router();

function toDateString(date: Date | null): Date | null {
  return date;
}

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  await ensureAgentOpsSeeded();
  const runs = await db.select().from(agentRunsTable);
  const anomalies = await db
    .select()
    .from(anomaliesTable)
    .where(eq(anomaliesTable.status, "open"));
  const completedRuns = runs.filter((run) => run.status === "completed");
  const totalCost = runs.reduce((sum, run) => sum + run.cost, 0);
  const summary = {
    activeRuns: runs.filter((run) => run.status === "running").length,
    totalRuns: runs.length,
    successRate:
      completedRuns.length === 0
        ? 0
        : completedRuns.reduce((sum, run) => sum + run.outcomeScore, 0) /
          completedRuns.length,
    totalCost: Number(totalCost.toFixed(2)),
    avgCost: Number((totalCost / Math.max(runs.length, 1)).toFixed(2)),
    openAnomalies: anomalies.length,
    avgLatencyMs: Math.round(
      runs.reduce((sum, run) => sum + run.durationMs, 0) / Math.max(runs.length, 1),
    ),
    costTrend: [
      { label: "Mon", value: 0.42 },
      { label: "Tue", value: 0.58 },
      { label: "Wed", value: 0.49 },
      { label: "Thu", value: 0.72 },
      { label: "Fri", value: 0.64 },
      { label: "Sat", value: 0.53 },
      { label: "Sun", value: totalCost },
    ],
    outcomeTrend: [
      { label: "Mon", value: 0.91 },
      { label: "Tue", value: 0.94 },
      { label: "Wed", value: 0.92 },
      { label: "Thu", value: 0.96 },
      { label: "Fri", value: 0.95 },
      { label: "Sat", value: 0.97 },
      { label: "Sun", value: completedRuns.length ? completedRuns[0].outcomeScore : 0 },
    ],
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/runs", async (req, res): Promise<void> => {
  await ensureAgentOpsSeeded();
  const parsed = ListRunsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, search, limit } = parsed.data;
  const filters = [];
  if (status !== "all") {
    filters.push(
      status === "anomalous"
        ? eq(agentRunsTable.hasAnomaly, true)
        : eq(agentRunsTable.status, status),
    );
  }
  if (search) {
    filters.push(
      or(
        ilike(agentRunsTable.agentName, `%${search}%`),
        ilike(agentRunsTable.workflow, `%${search}%`),
        ilike(agentRunsTable.customer, `%${search}%`),
      ),
    );
  }

  const runs = await db
    .select()
    .from(agentRunsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(agentRunsTable.startedAt))
    .limit(limit);
  res.json(ListRunsResponse.parse(runs.map((run) => ({ ...run, completedAt: toDateString(run.completedAt) }))));
});

router.get("/runs/:runId", async (req, res): Promise<void> => {
  await ensureAgentOpsSeeded();
  const params = GetRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [run] = await db
    .select()
    .from(agentRunsTable)
    .where(eq(agentRunsTable.id, params.data.runId))
    .limit(1);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(GetRunResponse.parse({ ...run, completedAt: toDateString(run.completedAt) }));
});

router.get("/runs/:runId/events", async (req, res): Promise<void> => {
  await ensureAgentOpsSeeded();
  const params = GetRunEventsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [run] = await db
    .select({ id: agentRunsTable.id })
    .from(agentRunsTable)
    .where(eq(agentRunsTable.id, params.data.runId))
    .limit(1);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const events = await db
    .select()
    .from(traceEventsTable)
    .where(eq(traceEventsTable.runId, params.data.runId))
    .orderBy(traceEventsTable.sequence);
  res.json(GetRunEventsResponse.parse(events));
});

router.post("/runs/:runId/replay", async (req, res): Promise<void> => {
  await ensureAgentOpsSeeded();
  const params = ReplayRunParams.safeParse(req.params);
  const body = ReplayRunBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid replay request" });
    return;
  }
  const [run] = await db
    .select({ id: agentRunsTable.id })
    .from(agentRunsTable)
    .where(eq(agentRunsTable.id, params.data.runId))
    .limit(1);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.status(202).json(
    ReplayRunResponse.parse({
      replayId: `replay_${randomUUID().slice(0, 8)}`,
      runId: params.data.runId,
      status: "queued",
      message: "Replay queued with the captured context window.",
    }),
  );
});

router.get("/anomalies", async (req, res): Promise<void> => {
  await ensureAgentOpsSeeded();
  const parsed = ListAnomaliesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const anomalies = await db
    .select()
    .from(anomaliesTable)
    .where(
      parsed.data.status === "all"
        ? undefined
        : eq(anomaliesTable.status, parsed.data.status),
    )
    .orderBy(desc(anomaliesTable.detectedAt));
  res.json(ListAnomaliesResponse.parse(anomalies));
});

router.post("/telemetry/events", async (req, res): Promise<void> => {
  await ensureAgentOpsSeeded();
  const parsed = IngestTelemetryEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [run] = await db
    .select({ id: agentRunsTable.id })
    .from(agentRunsTable)
    .where(eq(agentRunsTable.id, parsed.data.runId))
    .limit(1);
  if (!run) {
    res.status(400).json({ error: "Run not found for telemetry event" });
    return;
  }
  const existing = await db
    .select({ sequence: traceEventsTable.sequence })
    .from(traceEventsTable)
    .where(eq(traceEventsTable.runId, parsed.data.runId))
    .orderBy(desc(traceEventsTable.sequence))
    .limit(1);
  const sequence = (existing[0]?.sequence ?? 0) + 1;
  const eventId = `evt_${randomUUID().slice(0, 8)}`;
  const event = {
    id: eventId,
    runId: parsed.data.runId,
    parentId: parsed.data.parentId ?? null,
    sequence,
    type: parsed.data.type,
    title: parsed.data.title,
    detail: parsed.data.detail,
    timestamp: parsed.data.timestamp ? new Date(parsed.data.timestamp) : new Date(),
    durationMs: parsed.data.durationMs ?? 0,
    tokens: parsed.data.tokens ?? 0,
    cost: parsed.data.cost ?? 0,
    status: "complete",
    metadata: parsed.data.metadata ?? {},
  };
  await db.insert(traceEventsTable).values(event);
  await db
    .update(agentRunsTable)
    .set({ eventCount: sequence })
    .where(eq(agentRunsTable.id, parsed.data.runId));
  res.status(202).json(
    IngestTelemetryEventResponse.parse({
      accepted: true,
      eventId,
      sequence,
      semanticType: parsed.data.type,
    }),
  );
});

export default router;