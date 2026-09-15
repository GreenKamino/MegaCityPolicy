import type { GameState } from "@/engine/types";

// Lifetime gross-income tracker. `state.totalCreditsEarned` is a monotonic
// running total of every positive credit grant the player receives over a
// city's life — tax/trade/tourism, mission & contract rewards, sales, event
// payouts, etc. Unlike the live `resources.credits` balance (which falls when
// the player spends), this only ever climbs, so `syncProfileFromGameState`
// and the Steam `stat_total_credits_earned` can report true career earnings
// instead of the old peak-balance proxy that under-counted earned-then-spent
// credits.
//
// Spending is deliberately ignored here (callers only pipe income through
// `recordCreditsEarned`), so a tick that both earns and spends still books the
// full gross income. Non-finite / non-positive amounts are no-ops, which keeps
// upkeep deductions and corrupted blobs from polluting the tally.
export function recordCreditsEarned(s: GameState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  s.totalCreditsEarned = (s.totalCreditsEarned ?? 0) + amount;
}
