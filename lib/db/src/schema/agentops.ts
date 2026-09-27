import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const agentRunsTable = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  agentName: text("agent_name").notNull(),
  workflow: text("workflow").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms").notNull(),
  eventCount: integer("event_count").notNull(),
  toolCallCount: integer("tool_call_count").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  cost: doublePrecision("cost").notNull(),
  outcome: text("outcome").notNull(),
  outcomeScore: doublePrecision("outcome_score").notNull(),
  customer: text("customer").notNull(),
  model: text("model").notNull(),
  hasAnomaly: boolean("has_anomaly").notNull().default(false),
});

export const traceEventsTable = pgTable("trace_events", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => agentRunsTable.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  durationMs: integer("duration_ms").notNull().default(0),
  tokens: integer("tokens").notNull().default(0),
  cost: doublePrecision("cost").notNull().default(0),
  status: text("status").notNull(),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
});

export const anomaliesTable = pgTable("anomalies", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => agentRunsTable.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  signal: text("signal").notNull(),
  status: text("status").notNull(),
  stepCount: integer("step_count").notNull(),
  expectedSteps: integer("expected_steps").notNull(),
});

export const insertAgentRunSchema = createInsertSchema(agentRunsTable);
export const insertTraceEventSchema = createInsertSchema(traceEventsTable);
export const insertAnomalySchema = createInsertSchema(anomaliesTable);

export type AgentRun = typeof agentRunsTable.$inferSelect;
export type TraceEvent = typeof traceEventsTable.$inferSelect;
export type Anomaly = typeof anomaliesTable.$inferSelect;
export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;
export type InsertTraceEvent = z.infer<typeof insertTraceEventSchema>;
export type InsertAnomaly = z.infer<typeof insertAnomalySchema>;