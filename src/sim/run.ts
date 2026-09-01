// The run: a pure reducer from (state, elapsed time, events) to a new state.
//
// It knows nothing about lunges, enemies, or platforms -- only about a clock
// and how an attempt ends. That means the loss channel can come from anywhere
// (a fall, an enemy's touch) without this file changing.
//
// The invariant that matters most: an outcome is ABSORBING. Once an attempt
// has ended it cannot end differently, and further input is a no-op. Without
// that, reaching the goal and dying on the same frame is ambiguous, and input
// after death could resurrect the run.

export type Outcome = "won" | "lost";

export interface RunState {
  elapsedMs: number;
  outcome: Outcome | null;
  endedAtMs: number | null;
}

export interface RunInput {
  /** Milliseconds to advance. Must be >= 0. */
  dtMs: number;
  died: boolean;
  won: boolean;
}

export function newRun(): RunState {
  return { elapsedMs: 0, outcome: null, endedAtMs: null };
}

/**
 * Advance the run. Returns a NEW state; never mutates its argument.
 *
 * Death takes priority over the goal: dying and reaching the goal on the same
 * frame is a loss, not a win.
 */
export function step(state: Readonly<RunState>, input: RunInput): RunState {
  if (state.outcome !== null) return state;

  const dtMs = Math.max(0, input.dtMs);
  const elapsedMs = state.elapsedMs + dtMs;

  if (input.died) {
    return { elapsedMs, outcome: "lost", endedAtMs: elapsedMs };
  }
  if (input.won) {
    return { elapsedMs, outcome: "won", endedAtMs: elapsedMs };
  }
  return { elapsedMs, outcome: null, endedAtMs: null };
}

export function isOver(state: Readonly<RunState>): boolean {
  return state.outcome !== null;
}
