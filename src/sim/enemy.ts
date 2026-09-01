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
import { bounce } from "./oscillate.ts";

export interface Enemy {
  id: string;
  x: number; // center x
  feetY: number; // bottom of the hitbox
  /** Which coordinate patrolMin/patrolMax/v bounce along. */
  axis: "x" | "y";
  patrolMin: number;
  patrolMax: number;
  v: number;
  alive: boolean;
}

export function newEnemy(
  id: string,
  x: number,
  feetY: number,
  patrolMinX: number,
  patrolMaxX: number,
): Enemy {
  return { id, x, feetY, axis: "x", patrolMin: patrolMinX, patrolMax: patrolMaxX, v: ENEMY_PATROL_SPEED, alive: true };
}

export function newVerticalEnemy(
  id: string,
  x: number,
  feetY: number,
  patrolMinY: number,
  patrolMaxY: number,
): Enemy {
  return { id, x, feetY, axis: "y", patrolMin: patrolMinY, patrolMax: patrolMaxY, v: ENEMY_PATROL_SPEED, alive: true };
}

export function enemyRect(e: Readonly<Enemy>): Rect {
  return rectAt(e.x, e.feetY, ENEMY_W, ENEMY_H);
}

/** Bounce between patrolMin and patrolMax along the enemy's axis, at a constant speed. A no-op once dead. */
export function stepEnemy(e: Readonly<Enemy>, dtSec: number): Enemy {
  if (!e.alive) return e;

  const before = e.axis === "x" ? e.x : e.feetY;
  const advanced = before + e.v * dtSec;
  const { pos, v } = bounce(advanced, e.v, e.patrolMin, e.patrolMax, ENEMY_PATROL_SPEED);

  return e.axis === "x" ? { ...e, x: pos, v } : { ...e, feetY: pos, v };
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
