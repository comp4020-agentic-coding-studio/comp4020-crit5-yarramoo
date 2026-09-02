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
  | { kind: "dashing"; from: Vec2; to: Vec2; elapsedMs: number }
  /**
   * The aim was cancelled and the button is STILL DOWN. Without this, a cancel
   * is invisible: it returns to idle, and idle sees a held button on the very
   * next frame and starts a fresh aim, so the world unfreezes and refreezes
   * within 16ms and nothing appears to have happened. Waiting for the release
   * is what makes cancelling mean "I am done with this shot" rather than "skip
   * one frame".
   */
  | { kind: "cancelled" };

export function idleLunge(): LungeState {
  return { kind: "idle" };
}

export interface LungeInput {
  /** Is the aim/fire button currently held? */
  held: boolean;
  /**
   * Abort this aim and fire nothing. Optional so every existing caller and
   * test keeps compiling -- absent means "no cancel", which is what they all
   * meant before the affordance existed.
   */
  cancel?: boolean;
  /** Pointer position relative to the player, in world units. */
  aimVector: Vec2;
}

/**
 * A player resting exactly flush on a platform's top has its center sitting
 * exactly on that platform's Minkowski-expanded boundary (see aabb.ts). The
 * generic sweep's flush-convention fix only catches a diagonal graze where
 * both axes' valid windows collapse to a single instant; it does NOT catch
 * this case, because the y-axis alone is already a real, sustained entry for
 * any aim with a downward component, however slight. Left alone, that makes
 * `resolveAimEndpoint` collapse to zero distance for almost any mouse-aimed
 * near-horizontal shot fired from the ground -- a few pixels of vertical
 * mouse noise is enough. A player can't be blocked by the ground they're
 * currently standing on; excluding it from the sweep is what makes aiming
 * roughly sideways while grounded actually work.
 */
function isSupportingPlatform(playerPos: Vec2, platform: Rect): boolean {
  const bottom = playerPos.y + PLAYER_H / 2;
  const flush = Math.abs(bottom - platform.y) < 1e-6;
  const overlapsX = playerPos.x + PLAYER_W / 2 > platform.x && playerPos.x - PLAYER_W / 2 < platform.x + platform.w;
  return flush && overlapsX;
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
  const blockers = platforms.filter((p) => !isSupportingPlatform(playerPos, p));
  const t = sweepToFirstBlock(playerPos, target, PLAYER_W, PLAYER_H, blockers);
  return add(playerPos, scale(sub(target, playerPos), t));
}

/**
 * Advance the lunge state machine by one frame.
 *
 * `canAim` gates entering `aiming` from `idle`: when it's false, holding the
 * button does nothing at all -- no freeze, no line. That silence is how a
 * player discovers the economy without being told about it. What feeds it is
 * the caller's business (game.ts combines the dash charge with standing on a
 * foothold); this module only needs to know whether an aim may begin.
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
  canAim: boolean,
  platforms: readonly Rect[],
  dtMs: number,
): { state: LungeState; fired: { from: Vec2; to: Vec2 } | null } {
  if (state.kind === "idle") {
    if (input.held && canAim) {
      return { state: { kind: "aiming", aimVector: input.aimVector }, fired: null };
    }
    return { state, fired: null };
  }

  if (state.kind === "aiming") {
    // Cancel outranks release: if both arrive on the same frame, nothing fires.
    // The charge is NOT spent -- backing out of a shot you never took should
    // cost you the time it took to decide, and nothing else.
    if (input.cancel) return { state: { kind: "cancelled" }, fired: null };

    if (!input.held) {
      const to = resolveAimEndpoint(playerPos, input.aimVector, facing, platforms);
      const from = playerPos;
      return { state: { kind: "dashing", from, to, elapsedMs: 0 }, fired: { from, to } };
    }
    return { state: { kind: "aiming", aimVector: input.aimVector }, fired: null };
  }

  if (state.kind === "cancelled") {
    // Nothing happens until the button is let go, however long that takes.
    return { state: input.held ? state : { kind: "idle" }, fired: null };
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
