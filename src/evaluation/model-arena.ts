/**
 * Multi-Model Comparative Evaluation & Arena Mode
 * PRD-EVAL-005: Multi-Model Comparative Evaluation & Arena Mode
 */

export interface ModelStats {
  modelId: string;
  elo: number;
  wins: number;
  losses: number;
  ties: number;
  totalMatches: number;
}

export interface MatchResult {
  modelA: string;
  modelB: string;
  winner: "modelA" | "modelB" | "tie";
  judgePrompt?: string;
  rationale?: string;
}

export class ModelArena {
  private models: Map<string, ModelStats> = new Map();
  private matchHistory: MatchResult[] = [];
  private static readonly INITIAL_ELO = 1200;
  private static readonly K_FACTOR = 32;

  public registerModel(modelId: string, initialElo = ModelArena.INITIAL_ELO): void {
    if (!this.models.has(modelId)) {
      this.models.set(modelId, {
        modelId,
        elo: initialElo,
        wins: 0,
        losses: 0,
        ties: 0,
        totalMatches: 0,
      });
    }
  }

  public recordMatch(result: MatchResult): { newEloA: number; newEloB: number } {
    this.registerModel(result.modelA);
    this.registerModel(result.modelB);

    const statsA = this.models.get(result.modelA)!;
    const statsB = this.models.get(result.modelB)!;

    // Expected scores
    const expectedA = 1 / (1 + Math.pow(10, (statsB.elo - statsA.elo) / 400));
    const expectedB = 1 / (1 + Math.pow(10, (statsA.elo - statsB.elo) / 400));

    // Actual scores
    const scoreA = result.winner === "modelA" ? 1.0 : result.winner === "tie" ? 0.5 : 0.0;
    const scoreB = result.winner === "modelB" ? 1.0 : result.winner === "tie" ? 0.5 : 0.0;

    // Update Elo
    statsA.elo = Math.round(statsA.elo + ModelArena.K_FACTOR * (scoreA - expectedA));
    statsB.elo = Math.round(statsB.elo + ModelArena.K_FACTOR * (scoreB - expectedB));

    statsA.totalMatches++;
    statsB.totalMatches++;

    if (result.winner === "modelA") {
      statsA.wins++;
      statsB.losses++;
    } else if (result.winner === "modelB") {
      statsB.wins++;
      statsA.losses++;
    } else {
      statsA.ties++;
      statsB.ties++;
    }

    this.matchHistory.push(result);

    return { newEloA: statsA.elo, newEloB: statsB.elo };
  }

  public getLeaderboard(): ModelStats[] {
    return Array.from(this.models.values()).sort((a, b) => b.elo - a.elo);
  }

  public getModelStats(modelId: string): ModelStats | undefined {
    return this.models.get(modelId);
  }
}
