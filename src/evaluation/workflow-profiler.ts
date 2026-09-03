/**
 * Performance Profiling & Bottleneck Analyzer for Multi-Agent Workflows
 * PRD-PART2-314: Performance Profiling & Bottleneck Analyzer for Multi-Agent Workflows
 */

export interface AgentExecutionSpan {
  agentId: string;
  taskName: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  isParallel?: boolean;
}

export interface WorkflowProfileReport {
  totalDurationMs: number;
  cumulativeAgentDurationMs: number;
  parallelEfficiency: number; // cumulative / totalDurationMs
  criticalPathSpan: AgentExecutionSpan;
  bottlenecks: Array<{ agentId: string; taskName: string; durationMs: number; percentOfTotal: number }>;
}

export class WorkflowProfiler {
  private spans: AgentExecutionSpan[] = [];

  public recordSpan(agentId: string, taskName: string, startedAt: number, completedAt: number): AgentExecutionSpan {
    const durationMs = Math.max(0, completedAt - startedAt);
    const span: AgentExecutionSpan = {
      agentId,
      taskName,
      startedAt,
      completedAt,
      durationMs,
    };
    this.spans.push(span);
    return span;
  }

  public analyzeProfile(workflowStartTime: number, workflowEndTime: number): WorkflowProfileReport {
    const totalDurationMs = Math.max(1, workflowEndTime - workflowStartTime);
    const cumulativeAgentDurationMs = this.spans.reduce((acc, s) => acc + s.durationMs, 0);

    // Sort by duration descending to find bottlenecks
    const sorted = [...this.spans].sort((a, b) => b.durationMs - a.durationMs);
    const criticalPathSpan = sorted[0] ?? {
      agentId: "none",
      taskName: "none",
      startedAt: workflowStartTime,
      completedAt: workflowEndTime,
      durationMs: totalDurationMs,
    };

    const bottlenecks = sorted.map((s) => ({
      agentId: s.agentId,
      taskName: s.taskName,
      durationMs: s.durationMs,
      percentOfTotal: Number(((s.durationMs / totalDurationMs) * 100).toFixed(1)),
    }));

    const parallelEfficiency = Number((cumulativeAgentDurationMs / totalDurationMs).toFixed(2));

    return {
      totalDurationMs,
      cumulativeAgentDurationMs,
      parallelEfficiency,
      criticalPathSpan,
      bottlenecks,
    };
  }
}
