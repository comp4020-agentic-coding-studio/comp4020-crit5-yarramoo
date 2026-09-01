// The lunge: press-hold-aim-release, with time frozen while aiming.
//
// This module only knows about geometry (the player's position, the aim
// vector, and solid platforms) -- it has no idea enemies exist. That's
// deliberate: `resolveAimEndpoint` is the one sweep that decides where a
// lunge lands, used identically by the aim-time preview line and the actual
// fired dash, and its answer must depend only on solid terrain. Enemies are
// layered on top by the caller (see enemy.ts's `applyLungeSweep`), which is
// exactly what makes "a lunge kills without stopping" a structural fact
// rather than a rule that has to be remembered at every call site.

import type { Rect } from "../core/aabb.ts";
import { sweepToFirstBlock } from "../core/aabb.ts";
import type { Vec2 } from "../core/vec.ts";
import { add, length, normalize, scale, sub } from "../core/vec.ts";
import { AIM_DEADZONE, LUNGE_DISTANCE, LUNGE_DURATION_MS, PLAYER_H, PLAYER_W } from "./constants.ts";

export type LungeState =
  | { kind: "idle" }
  | { kind: "aiming"; aimVector: Vec2 }
  | { kind: "dashing"; from: Vec2; to: Vec2; elapsedMs: number };

export function idleLunge(): LungeState {
  return { kind: "idle" };
}

export interface LungeInput {
  /** Is the aim/fire button currently held? */
  held: boolean;
  /** Pointer position relative to the player, in world units. */
  aimVector: Vec2;
}

/**
 * Where a lunge aimed along `rawAimVector` from `playerPos` would land.
 *
 * Below `AIM_DEADZONE`, the aim snaps to the player's last facing direction
 * rather than an undefined near-zero vector -- covering both the "barely
 * moved the mouse" case and the simple divide-by-zero guard.
 */
export function resolveAimEndpoint(
  playerPos: Vec2,
  rawAimVector: Vec2,
  facing: 1 | -1,
  platforms: readonly Rect[],
): Vec2 {
  const rawLen = length(rawAimVector);
  const dir = rawLen < AIM_DEADZONE ? { x: facing, y: 0 } : normalize(rawAimVector);
  const target = add(playerPos, scale(dir, LUNGE_DISTANCE));
  const t = sweepToFirstBlock(playerPos, target, PLAYER_W, PLAYER_H, platforms);
  return add(playerPos, scale(sub(target, playerPos), t));
}

/**
 * Advance the lunge state machine by one frame.
 *
 * `dashCharge` gates entering `aiming` from `idle`: with no charge, holding
 * the button does nothing at all -- no freeze, no line. That silence is how a
 * player discovers the charge economy without being told about it.
 *
 * Returns the new state, and -- only on the frame a dash fires -- the
 * resolved (from, to) segment, so the caller can apply it against enemies
 * exactly once, at the instant of release.
 */
export function stepLunge(
  state: Readonly<LungeState>,
  input: LungeInput,
  playerPos: Vec2,
  facing: 1 | -1,
  dashCharge: boolean,
  platforms: readonly Rect[],
  dtMs: number,
): { state: LungeState; fired: { from: Vec2; to: Vec2 } | null } {
  if (state.kind === "idle") {
    if (input.held && dashCharge) {
      return { state: { kind: "aiming", aimVector: input.aimVector }, fired: null };
    }
    return { state, fired: null };
  }

  if (state.kind === "aiming") {
    if (!input.held) {
      const to = resolveAimEndpoint(playerPos, input.aimVector, facing, platforms);
      const from = playerPos;
      return { state: { kind: "dashing", from, to, elapsedMs: 0 }, fired: { from, to } };
    }
    return { state: { kind: "aiming", aimVector: input.aimVector }, fired: null };
  }

  // dashing: time-boxed, fixed-speed motion that overrides ordinary physics
  // until it completes.
  const elapsedMs = state.elapsedMs + dtMs;
  if (elapsedMs >= LUNGE_DURATION_MS) {
    return { state: { kind: "idle" }, fired: null };
  }
  return { state: { ...state, elapsedMs }, fired: null };
}

/** The player's current position mid-dash, interpolated along the fixed segment. */
export function dashPosition(state: Readonly<Extract<LungeState, { kind: "dashing" }>>): Vec2 {
  const t = Math.min(1, state.elapsedMs / LUNGE_DURATION_MS);
  return add(state.from, scale(sub(state.to, state.from), t));
}
