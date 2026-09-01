// Ordinary platforming physics: gravity, run, jump, and axis-separated
// collision against a static list of platforms. The lunge overrides this
// entirely for its short duration (see lunge.ts); this file never knows the
// lunge exists.

import type { Rect } from "../core/aabb.ts";
import { overlaps, rectAt } from "../core/aabb.ts";
import { GRAVITY, JUMP_SPEED, MOVE_SPEED, PLAYER_H, PLAYER_W } from "./constants.ts";

export interface Body {
  x: number; // center x
  feetY: number; // bottom of the hitbox
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  /** One lunge charge, refreshed only by touching solid ground. */
  dashCharge: boolean;
}

export function newBody(x: number, feetY: number): Body {
  return { x, feetY, vx: 0, vy: 0, facing: 1, grounded: false, dashCharge: true };
}

export interface BodyInput {
  /** -1, 0, or 1. */
  moveX: number;
  /** Jump requested this frame. */
  jump: boolean;
}

export function bodyRect(b: Readonly<Body>): Rect {
  return rectAt(b.x, b.feetY, PLAYER_W, PLAYER_H);
}

/** Advance ordinary platforming physics by one frame. Returns a new Body. */
export function stepBody(
  body: Readonly<Body>,
  platforms: readonly Rect[],
  input: BodyInput,
  dtSec: number,
): Body {
  let { x, feetY, vy, grounded, dashCharge } = body;
  let facing = body.facing;
  let vx: number;

  if (input.moveX !== 0) {
    vx = input.moveX * MOVE_SPEED;
    facing = input.moveX > 0 ? 1 : -1;
  } else {
    vx = 0;
  }

  if (input.jump && grounded) {
    vy = -JUMP_SPEED;
    grounded = false;
  } else {
    vy += GRAVITY * dtSec;
  }

  // X, then Y -- resolving both against the same combined box would let a
  // diagonal move clip a corner it should have been stopped by on one axis
  // alone.
  //
  // Only resolve horizontally when actually moving (vx !== 0). A body can
  // arrive here already embedded in a platform with vx === 0 -- the lunge
  // lands its target by teleporting straight to the resolved endpoint, which
  // (deliberately, see lunge.ts's isSupportingPlatform) can end up embedded
  // in the platform the player was standing on for any aim with a downward
  // component. The `vx > 0 ? ... : ...` ternary has no "didn't move" case, so
  // it was treating that stationary embedding as a leftward approach and
  // ejecting the player out the platform's FAR right edge -- catapulting a
  // safely-landed lunge out into the next gap. A stationary body has nothing
  // to resolve on this axis; the Y pass below correctly settles it onto the
  // surface instead.
  if (vx !== 0) {
    x += vx * dtSec;
    let box = rectAt(x, feetY, PLAYER_W, PLAYER_H);
    for (const p of platforms) {
      if (!overlaps(box, p)) continue;
      x = vx > 0 ? p.x - PLAYER_W / 2 : p.x + p.w + PLAYER_W / 2;
      vx = 0;
      box = rectAt(x, feetY, PLAYER_W, PLAYER_H);
    }
  }

  feetY += vy * dtSec;
  grounded = false;
  let box = rectAt(x, feetY, PLAYER_W, PLAYER_H);
  for (const p of platforms) {
    if (!overlaps(box, p)) continue;
    if (vy > 0) {
      feetY = p.y; // land on top
      grounded = true;
      dashCharge = true;
    } else if (vy < 0) {
      feetY = p.y + p.h + PLAYER_H; // bump the underside
    }
    vy = 0;
    box = rectAt(x, feetY, PLAYER_W, PLAYER_H);
  }

  return { x, feetY, vx, vy, facing, grounded, dashCharge };
}
