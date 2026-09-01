// Enemies: a slow, predictable patrol between two x-bounds, and death.
//
// An enemy dies exactly when a lunge's swept path touches it -- it never
// blocks or shortens that path (that's lunge.ts's `resolveAimEndpoint`,
// which only checks solid platforms). `applyLungeSweep` is where those two
// facts meet: given the segment a fired lunge just resolved, mark every live
// enemy it passed through as dead, without touching the segment itself.

import type { Rect } from "../core/aabb.ts";
import { rectAt, sweepToFirstBlock, sweepTouches } from "../core/aabb.ts";
import { add, scale, sub, type Vec2 } from "../core/vec.ts";
import {
  ENEMY_H,
  ENEMY_LUNGE_DISTANCE,
  ENEMY_LUNGE_DURATION_MS,
  ENEMY_LUNGE_LEVEL_TOLERANCE,
  ENEMY_LUNGE_RANGE_X,
  ENEMY_LUNGE_TELEGRAPH_MS,
  ENEMY_PATROL_SPEED,
  ENEMY_W,
  HOPPER_HEIGHT,
  HOPPER_PERIOD_MS,
  PLAYER_H,
  PLAYER_W,
} from "./constants.ts";
import { bounce } from "./oscillate.ts";

export interface Enemy {
  id: string;
  x: number; // center x
  feetY: number; // bottom of the hitbox
  /** Which coordinate patrolMin/patrolMax/v bounce along. Unused by "hopper" and "lunger". */
  axis: "x" | "y";
  patrolMin: number;
  patrolMax: number;
  v: number;
  alive: boolean;
  kind: "patrol" | "hopper" | "lunger";
  /** "hopper" only: elapsed time within its hop cycle. */
  phaseMs: number;
  /** "lunger" only: patrol (dormant) -> telegraph (about to fire) -> dashing. */
  lungeState: "patrol" | "telegraph" | "dashing";
  lungeElapsedMs: number;
  lungeFrom: Vec2;
  lungeTo: Vec2;
}

function baseEnemy(id: string, x: number, feetY: number, axis: "x" | "y", patrolMin: number, patrolMax: number): Enemy {
  return {
    id,
    x,
    feetY,
    axis,
    patrolMin,
    patrolMax,
    v: ENEMY_PATROL_SPEED,
    alive: true,
    kind: "patrol",
    phaseMs: 0,
    lungeState: "patrol",
    lungeElapsedMs: 0,
    lungeFrom: { x: 0, y: 0 },
    lungeTo: { x: 0, y: 0 },
  };
}

export function newEnemy(
  id: string,
  x: number,
  feetY: number,
  patrolMinX: number,
  patrolMaxX: number,
): Enemy {
  return baseEnemy(id, x, feetY, "x", patrolMinX, patrolMaxX);
}

export function newVerticalEnemy(
  id: string,
  x: number,
  feetY: number,
  patrolMinY: number,
  patrolMaxY: number,
): Enemy {
  return baseEnemy(id, x, feetY, "y", patrolMinY, patrolMaxY);
}

/** Hops in place between `floorY` and `floorY - HOPPER_HEIGHT` on an eased cycle -- the motion curve itself is the animation. */
export function newHopperEnemy(id: string, x: number, floorY: number): Enemy {
  return { ...baseEnemy(id, x, floorY, "y", floorY - HOPPER_HEIGHT, floorY), kind: "hopper" };
}

/** Dormant until the player comes within range, then telegraphs and dashes toward them -- same shape as the player's own lunge. */
export function newLungerEnemy(id: string, x: number, feetY: number): Enemy {
  return { ...baseEnemy(id, x, feetY, "x", x, x), kind: "lunger" };
}

export function enemyRect(e: Readonly<Enemy>): Rect {
  return rectAt(e.x, e.feetY, ENEMY_W, ENEMY_H);
}

function hopFeetY(floorY: number, phaseMs: number): number {
  const t = (phaseMs % HOPPER_PERIOD_MS) / HOPPER_PERIOD_MS; // 0..1
  const height = HOPPER_HEIGHT * Math.sin(t * Math.PI); // eases up from and back down to the floor
  return floorY - height;
}

/**
 * Advance a patrol or hopper enemy by one frame. A no-op once dead, and a
 * no-op for "lunger" enemies -- those need the player's position and solid
 * terrain, so they're stepped separately via `stepLungerEnemy`.
 */
export function stepEnemy(e: Readonly<Enemy>, dtSec: number): Enemy {
  if (!e.alive || e.kind === "lunger") return e;

  if (e.kind === "hopper") {
    const phaseMs = e.phaseMs + dtSec * 1000;
    return { ...e, phaseMs, feetY: hopFeetY(e.patrolMax, phaseMs) };
  }

  const before = e.axis === "x" ? e.x : e.feetY;
  const advanced = before + e.v * dtSec;
  const { pos, v } = bounce(advanced, e.v, e.patrolMin, e.patrolMax, ENEMY_PATROL_SPEED);

  return e.axis === "x" ? { ...e, x: pos, v } : { ...e, feetY: pos, v };
}

/**
 * Advance a "lunger" enemy by one frame: dormant until the player is within
 * range and roughly level, then a fixed telegraph, then a dash resolved once
 * (like the player's own lunge) against solid terrain via `sweepToFirstBlock`
 * so it also stops at a wall rather than passing through it. Touching the
 * player mid-dash is ordinary contact death -- no new death channel.
 */
export function stepLungerEnemy(
  e: Readonly<Enemy>,
  dtSec: number,
  playerCenter: Vec2,
  platforms: readonly Rect[],
): Enemy {
  if (!e.alive) return e;
  const dtMs = dtSec * 1000;
  const enemyCenter: Vec2 = { x: e.x, y: e.feetY - ENEMY_H / 2 };

  if (e.lungeState === "patrol") {
    const dx = playerCenter.x - enemyCenter.x;
    const dy = playerCenter.y - enemyCenter.y;
    const inRange = Math.abs(dx) <= ENEMY_LUNGE_RANGE_X && Math.abs(dy) <= ENEMY_LUNGE_LEVEL_TOLERANCE;
    return inRange ? { ...e, lungeState: "telegraph", lungeElapsedMs: 0 } : e;
  }

  if (e.lungeState === "telegraph") {
    const lungeElapsedMs = e.lungeElapsedMs + dtMs;
    if (lungeElapsedMs < ENEMY_LUNGE_TELEGRAPH_MS) return { ...e, lungeElapsedMs };

    // Telegraph over: lock a direction and resolve the whole dash's endpoint
    // once, exactly like the player's own lunge, so it also stops early
    // against solid terrain instead of tunnelling through it.
    const dir = playerCenter.x >= enemyCenter.x ? 1 : -1;
    const target: Vec2 = { x: enemyCenter.x + dir * ENEMY_LUNGE_DISTANCE, y: enemyCenter.y };
    const t = sweepToFirstBlock(enemyCenter, target, ENEMY_W, ENEMY_H, platforms);
    const lungeTo = add(enemyCenter, scale(sub(target, enemyCenter), t));
    return { ...e, lungeState: "dashing", lungeElapsedMs: 0, lungeFrom: enemyCenter, lungeTo };
  }

  // dashing
  const lungeElapsedMs = e.lungeElapsedMs + dtMs;
  if (lungeElapsedMs >= ENEMY_LUNGE_DURATION_MS) {
    return {
      ...e,
      lungeState: "patrol",
      lungeElapsedMs: 0,
      x: e.lungeTo.x,
      feetY: e.lungeTo.y + ENEMY_H / 2,
    };
  }
  const t = lungeElapsedMs / ENEMY_LUNGE_DURATION_MS;
  const pos = add(e.lungeFrom, scale(sub(e.lungeTo, e.lungeFrom), t));
  return { ...e, lungeElapsedMs, x: pos.x, feetY: pos.y + ENEMY_H / 2 };
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
