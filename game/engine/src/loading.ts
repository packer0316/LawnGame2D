/** Overall progress is stage-weighted, not a byte-size estimate. Counts describe the current batch. */
export interface LoadingProgress {
  stage: string;
  percent: number;
  loaded: number;
  total: number;
}

export class LoadingReporter {
  private percent = 0;
  constructor(private readonly report?: (progress: LoadingProgress) => void) {}

  update(stage: string, from: number, to: number, loaded = 0, total = 0, fraction?: number): void {
    const ratio = fraction ?? (total > 0 ? loaded / total : 0);
    this.percent = Math.max(this.percent, Math.min(99, Math.floor(from + (to - from) * Math.max(0, Math.min(1, ratio)))));
    this.report?.({ stage, percent: this.percent, loaded, total });
  }

  complete(): void {
    this.percent = 100;
    this.report?.({ stage: '準備完成', percent: 100, loaded: 0, total: 0 });
  }
}
