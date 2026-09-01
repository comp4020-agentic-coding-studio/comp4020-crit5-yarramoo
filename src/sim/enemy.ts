// Enemies: a slow, predictable patrol between two x-bounds, and death.
//
// An enemy dies exactly when a lunge's swept path touches it -- it never
// blocks or shortens that path (that's lunge.ts's `resolveAimEndpoint`,
// which only checks solid platforms). `applyLungeSweep` is where those two
// facts meet: given the segment a fired lunge just resolved, mark every live
// enemy it passed through as dead, without touching the segment itself.

import type { Rect } from "../core/aabb.ts";
import { rectAt, sweepTouches } from "../core/aabb.ts";
import type { Vec2 } from "../core/vec.ts";
import { ENEMY_H, ENEMY_PATROL_SPEED, ENEMY_W, PLAYER_H, PLAYER_W } from "./constants.ts";

export interface Enemy {
  id: string;
  x: number; // center x
  feetY: number; // bottom of the hitbox
  patrolMinX: number;
  patrolMaxX: number;
  vx: number;
  alive: boolean;
}

export function newEnemy(
  id: string,
  x: number,
  feetY: number,
  patrolMinX: number,
  patrolMaxX: number,
): Enemy {
  return { id, x, feetY, patrolMinX, patrolMaxX, vx: ENEMY_PATROL_SPEED, alive: true };
}

export function enemyRect(e: Readonly<Enemy>): Rect {
  return rectAt(e.x, e.feetY, ENEMY_W, ENEMY_H);
}

/** Bounce between patrolMinX and patrolMaxX at a constant speed. A no-op once dead. */
export function stepEnemy(e: Readonly<Enemy>, dtSec: number): Enemy {
  if (!e.alive) return e;

  let x = e.x + e.vx * dtSec;
  let vx = e.vx;
  if (x <= e.patrolMinX) {
    x = e.patrolMinX;
    vx = ENEMY_PATROL_SPEED;
  } else if (x >= e.patrolMaxX) {
    x = e.patrolMaxX;
    vx = -ENEMY_PATROL_SPEED;
  }

  return { ...e, x, vx };
}

/**
 * Mark every live enemy the segment (from -> to) swept through as dead.
 *
 * This is the flagship rule made concrete: it only ever changes `alive`,
 * never the segment, so a lunge that kills three enemies in a row travels
 * exactly as far as one that kills none.
 */
export function applyLungeSweep(enemies: readonly Enemy[], from: Vec2, to: Vec2): Enemy[] {
  return enemies.map((e) => {
    if (!e.alive) return e;
    return sweepTouches(from, to, PLAYER_W, PLAYER_H, enemyRect(e)) ? { ...e, alive: false } : e;
  });
}
