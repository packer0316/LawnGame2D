/** Presentation only: confirmed contacts, never a damage or payout multiplier. */
export const COMBO_WINDOW_MS = 6000;
export const COMBO_EXIT_MS = 450;
export interface ComboState { count: number; beat: number; remainingMs: number; windowMs: number }
export class ComboTracker {
  private count = 0;
  private remaining = 0;
  private beat = 0;
  /** Reject late replies belonging to a previous room/class. */
  generation = 0;
  hit(contacts: number): void {
    if (!Number.isFinite(contacts) || contacts < 1) return;
    this.count = Math.min(99999, (this.remaining > 0 ? this.count : 0) + Math.floor(contacts));
    this.remaining = COMBO_WINDOW_MS; this.beat++;
  }
  step(ms: number): void { this.remaining = Math.max(-COMBO_EXIT_MS, this.remaining - Math.max(0, ms)); }
  reset(): void { this.count = 0; this.remaining = 0; this.generation++; }
  snapshot(): ComboState | undefined {
    return this.count >= 2 && this.remaining > -COMBO_EXIT_MS
      ? { count: this.count, beat: this.beat, remainingMs: Math.max(0, this.remaining), windowMs: COMBO_WINDOW_MS } : undefined;
  }
}
