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
  x += vx * dtSec;
  let box = rectAt(x, feetY, PLAYER_W, PLAYER_H);
  for (const p of platforms) {
    if (!overlaps(box, p)) continue;
    x = vx > 0 ? p.x - PLAYER_W / 2 : p.x + p.w + PLAYER_W / 2;
    vx = 0;
    box = rectAt(x, feetY, PLAYER_W, PLAYER_H);
  }

  feetY += vy * dtSec;
  grounded = false;
  box = rectAt(x, feetY, PLAYER_W, PLAYER_H);
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
