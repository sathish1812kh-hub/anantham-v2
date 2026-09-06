import { z } from "zod";

/**
 * TUI View Mode selection.
 */
export const TuiViewModeSchema = z.enum([
  "dashboard",
  "session",
  "tasks",
  "workflows",
  "agents",
  "jobs",
  "nodes",
  "approvals",
  "events",
  "help",
  "usage",
  "teamwork",
]);
export type TuiViewMode = z.infer<typeof TuiViewModeSchema>;

/**
 * Terminal Dimensions.
 */
export const TuiDimensionsSchema = z.object({
  width: z.number().int().min(20).default(80),
  height: z.number().int().min(10).default(24),
});
export type TuiDimensions = z.infer<typeof TuiDimensionsSchema>;

/**
 * TUI Status Banner State.
 */
export const TuiStatusSchema = z.enum(["NORMAL", "RECOVERING", "RECOVERED", "RECOVERY_FAILED", "OFFLINE"]);
export type TuiStatus = z.infer<typeof TuiStatusSchema>;

/**
 * View Model for System Dashboard.
 */
export const DashboardViewModelSchema = z.object({
  activeProjectId: z.string().optional(),
  activeSessionId: z.string().optional(),
  status: TuiStatusSchema.default("NORMAL"),
  totalProjects: z.number().default(0),
  totalSessions: z.number().default(0),
  taskCounts: z.record(z.number()).default({}),
  activeWorkflows: z.number().default(0),
  activeJobs: z.number().default(0),
  onlineNodes: z.number().default(0),
  pendingApprovals: z.number().default(0),
  recentEvents: z.array(z.record(z.unknown())).default([]),
});
export type DashboardViewModel = z.infer<typeof DashboardViewModelSchema>;
