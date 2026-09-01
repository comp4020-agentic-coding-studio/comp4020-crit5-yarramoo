// Plain level data. y increases downward; a platform's `y` is its top
// surface, extending down by `h`. Coordinates are a first pass -- expected to
// be retuned once the level is actually played (see the plan's build order).

import type { Rect } from "../core/aabb.ts";
import { newEnemy, type Enemy } from "./enemy.ts";
import { MAX_JUMP_DISTANCE } from "./constants.ts";
import type { MovingPlatform } from "./platform.ts";

export const GROUND_Y = 600;

/**
 * Beat 3's pure traversal gap: wider than any jump can cross, narrower than
 * a lunge. Was 280 (only 40u of slack under LUNGE_DISTANCE) until a live
 * mouse-aimed playtest showed the problem with that: a real aim is never
 * perfectly horizontal, and any downward tilt eats into the dash's
 * horizontal reach. A shot fired confidently across the gap would land with
 * its box straddling floor2's left FACE instead of its top -- read as a
 * blocked collision, not a landing -- and the player fell straight through
 * since they were never horizontally over solid ground. Narrowed to 220 so
 * a realistically-imprecise aim still clears well onto floor2's surface.
 */
export const GAP1_WIDTH = 220;
export const GAP1_START = 960;
export const GAP1_END = GAP1_START + GAP1_WIDTH;

export interface Level {
  platforms: Rect[];
  movingPlatforms: MovingPlatform[];
  enemies: Enemy[];
  goal: Rect;
  spawn: { x: number; feetY: number };
  /** World-space region the camera stays within -- hand-picked to frame the
   * level's playable content, not derived from platform extents (a couple of
   * platforms, like the tunnel ceiling, reach far beyond what's ever worth
   * showing on screen). */
  bounds: Rect;
}

export function buildLevel(): Level {
  // Beat 1-2-3: one long floor. Beat 2's low ceiling sits over a stationary
  // enemy, blocking the single walkable lane -- there is no side to walk
  // around it, so the only way through is to lunge-kill it.
  const floor1: Rect = { x: -100, y: GROUND_Y, w: GAP1_START + 100, h: 300 }; // right edge flush with the gap
  const tunnelCeiling: Rect = { x: 560, y: -2000, w: 160, h: 2550 }; // bottom edge at y=550
  const gateEnemy = newEnemy("gate", 640, GROUND_Y, 640, 640);

  // Beat 4: the bait. Floor2 has NO ceiling, so jumping over the enemy is
  // trivially possible (its 28u height is far under a normal jump's ~137u
  // apex) -- the trap only catches a player who reflexively lunges at it out
  // of habit from beat 2, since the lunge always travels its full fixed
  // distance and floor2 isn't wide enough to absorb that before its far edge.
  const floor2: Rect = { x: 1180, y: GROUND_Y, w: 270, h: 300 };
  const baitEnemy = newEnemy("bait", 1300, GROUND_Y, 1300, 1300);

  // Beat 5: the vertical beat. Floor3 sits higher than a jump can reach, so
  // it's only reachable by an upward-angled lunge -- and its tall left face
  // gives a too-flat shot something solid to graze against (ending up
  // suspended beside the wall, not on top of it) rather than sailing clean
  // over the corner. Aimed from floor2's right edge (x=1438), the safe window
  // is roughly 73-77 degrees off horizontal: steep enough that the dash
  // clears the corner entirely and lands high above the platform, from where
  // the subsequent fall settles the player onto its top surface. Verified
  // empirically against the real sweep (see git history for the probe script
  // this was tuned with), not just derived by hand.
  const floor3: Rect = { x: 1520, y: 380, w: 350, h: 400 };

  // Sits well clear of the vertical beat's landing zone (around x=1510-1540)
  // so reaching it after landing is a short, unambiguous walk.
  const goal: Rect = { x: 1750, y: 340, w: 60, h: 40 };

  // Covers every beat's playable area with margin for a jump apex or a
  // vertical-beat overshoot, but stops well short of the tunnel ceiling's
  // real extent and of VOID_Y -- there's nothing worth showing up there.
  const bounds: Rect = { x: -150, y: 250, w: 2070, h: 750 };

  return {
    platforms: [floor1, tunnelCeiling, floor2, floor3],
    movingPlatforms: [],
    enemies: [gateEnemy, baitEnemy],
    goal,
    spawn: { x: 60, feetY: GROUND_Y },
    bounds,
  };
}

// A geometry fact the level depends on, checked in spec/physics.test.ts:
// GAP1_WIDTH must exceed MAX_JUMP_DISTANCE. Exported so the test can assert
// it directly against the real constant rather than a copied number.
export const GAP1_EXCEEDS_MAX_JUMP = GAP1_WIDTH > MAX_JUMP_DISTANCE;
