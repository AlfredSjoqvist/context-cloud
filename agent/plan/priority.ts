export interface FileScanState {
  readonly path: string;
  readonly lastScannedCycle: number;
  readonly cleanScanStreak: number;
}

export interface PriorityInput {
  readonly cycleNumber: number;
  readonly candidates: readonly string[];
  readonly history: readonly FileScanState[];
  readonly budget: number;
}

export interface PriorityPick {
  readonly path: string;
  readonly reason: string;
}

export function priorityPicks(input: PriorityInput): PriorityPick[] {
  if (input.budget <= 0) return [];

  const byPath = new Map(input.history.map((h) => [h.path, h]));
  const scored = input.candidates.map((path) => {
    const h = byPath.get(path);
    if (!h) {
      return {
        path,
        reason: "never scanned",
        score: Number.POSITIVE_INFINITY,
      };
    }
    const staleness = input.cycleNumber - h.lastScannedCycle;
    const cleanPenalty = h.cleanScanStreak * 0.5;
    return {
      path,
      reason: `stale by ${staleness} cycles (clean streak ${h.cleanScanStreak})`,
      score: staleness - cleanPenalty,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, input.budget).map(({ path, reason }) => ({ path, reason }));
}
