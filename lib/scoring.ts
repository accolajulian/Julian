import type { CallOutcome } from "@/lib/types";

// Base scores by outcome
const BASE_SCORES: Record<CallOutcome, number> = {
  booked: 10,
  interested: 8,
  callback_requested: 6,
  voicemail: 3,
  no_answer: 2,
  not_interested: 2,
  wrong_number: 1,
  do_not_call: 1,
};

/**
 * Returns a 1–10 lead score from a call outcome.
 *
 * Rules:
 *   - Outcome drives the base score.
 *   - A named callback time signals real intent → +1 for interested/callback.
 *   - Long calls (>120 s) mean the prospect engaged → +1, capped at 9 for non-booked.
 *   - All other values stay at the outcome base.
 */
export function scoreLeadFromCall({
  outcome,
  durationSeconds,
  hasCallbackTime,
}: {
  outcome: CallOutcome;
  durationSeconds: number;
  hasCallbackTime: boolean;
}): number {
  let score = BASE_SCORES[outcome] ?? 2;

  // Named callback time → genuine intent
  if (hasCallbackTime && (outcome === "interested" || outcome === "callback_requested")) {
    score = Math.min(score + 1, 9);
  }

  // Long call engagement bonus (non-booked outcomes only — booked is already 10)
  if (outcome !== "booked" && durationSeconds > 120) {
    score = Math.min(score + 1, 9);
  }

  return score;
}
