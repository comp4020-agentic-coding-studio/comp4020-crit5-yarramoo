// Plain level data. y increases downward; a platform's `y` is its top
// surface, extending down by `h`. Coordinates are a first pass -- expected to
// be retuned once the level is actually played (see the plan's build order).

import type { Rect } from "../core/aabb.ts";
import { newEnemy, newHopperEnemy, newLungerEnemy, newVerticalEnemy, type Enemy } from "./enemy.ts";
import { GRAVITY, MAX_JUMP_DISTANCE, MOVE_SPEED } from "./constants.ts";
import { newMovingPlatform, type MovingPlatform } from "./platform.ts";

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

/**
 * The vertical-gate recipe shared by level 2 and level 3: a full-height
 * ceiling paired with a vertically-bobbing enemy whose patrol band leaves at
 * most (channel height - enemy height) / 2 = 11u of clearance on either side
 * at any phase -- well under PLAYER_H (36u) -- so there is no bob phase a
 * player can walk through untouched. The only way past is a lunge-kill.
 */
function verticalGate(id: string, x: number): { ceiling: Rect; enemy: Enemy } {
  return {
    ceiling: { x, y: -2000, w: 160, h: 2550 }, // bottom edge at y=550
    enemy: newVerticalEnemy(id, x + 80, 589, 578, 600),
  };
}

export function buildLevel2(): Level {
  // Beat 1: a single ferry is the only way across -- the 700u gap it spans
  // is far past both MAX_JUMP_DISTANCE and LUNGE_DISTANCE, so waiting for it
  // and riding it is the only option. It starts flush against floor2a (so
  // the very first ride is available immediately) and its far bound is
  // flush against floor2b.
  const floor2a: Rect = { x: -100, y: GROUND_Y, w: 400, h: 300 }; // spans -100..300
  const ferry = newMovingPlatform("ferry2", "x", 300, GROUND_Y, 140, 20, 300, 860, 90);
  const floor2b: Rect = { x: 1000, y: GROUND_Y, w: 1200, h: 300 }; // spans 1000..2200

  // Beat 2: the first mandatory timed snipe -- a bobbing enemy blocking a
  // low tunnel. Aiming freezes the bob along with everything else, so the
  // "tricky timing" is in reading the bob and committing, not in outrunning
  // the meter -- but the meter still caps how long that commitment can wait.
  const gate = verticalGate("bobber", 1300);

  const goal: Rect = { x: 1900, y: 560, w: 60, h: 40 };
  const bounds: Rect = { x: -150, y: 250, w: 2500, h: 750 };

  return {
    platforms: [floor2a, floor2b, gate.ceiling],
    movingPlatforms: [ferry],
    enemies: [gate.enemy],
    goal,
    spawn: { x: 60, feetY: GROUND_Y },
    bounds,
  };
}

export function buildLevel3(): Level {
  // Two mandatory timed snipes bracketing a ferry crossing, each with its
  // own fresh aimMeter (landing between them resets it) -- the "multiple
  // lunges, each individually time-capped" beat the meter was built for.
  const floor3a: Rect = { x: -100, y: GROUND_Y, w: 800, h: 300 }; // spans -100..700
  const gateA = verticalGate("gate3a", 340);

  const ferry = newMovingPlatform("ferry3", "x", 700, GROUND_Y, 150, 20, 700, 1050, 85);
  const floor3b: Rect = { x: 1200, y: GROUND_Y, w: 800, h: 300 }; // spans 1200..2000
  const gateB = verticalGate("gate3b", 1400);

  const goal: Rect = { x: 1900, y: 560, w: 60, h: 40 };
  const bounds: Rect = { x: -150, y: 250, w: 2300, h: 750 };

  return {
    platforms: [floor3a, gateA.ceiling, floor3b, gateB.ceiling],
    movingPlatforms: [ferry],
    enemies: [gateA.enemy, gateB.enemy],
    goal,
    spawn: { x: 60, feetY: GROUND_Y },
    bounds,
  };
}

export function buildLevel4(): Level {
  // Bonus beat: the stretch-goal enemy types, each shown off for what makes
  // them distinct from ordinary patrol/vertical enemies rather than reusing
  // a gate recipe wholesale.
  //
  // The hopper sits in the open (no ceiling): it spends most of its cycle
  // low enough to touch a walking player, but eases up to HOPPER_HEIGHT
  // (90u) above the floor and lingers there (the sine curve is flattest at
  // its peak) -- comfortably enough clearance for PLAYER_H (36u) to walk
  // underneath untouched. Reading that hangtime and walking under it is the
  // whole beat; killing it with a lunge also works, but isn't required.
  // One continuous floor -- this level's beats are about timing and range,
  // not traversal, so there's no gap to cross.
  const floor4: Rect = { x: -100, y: GROUND_Y, w: 1800, h: 300 }; // spans -100..1700
  const hopper = newHopperEnemy("hopper4", 400, GROUND_Y);

  // The lunger is dormant and silent until the player is within
  // ENEMY_LUNGE_RANGE_X (260u) and roughly level -- so it reads as an
  // ambush, not a gate. Placed with clear runway on both sides so an expert
  // script can approach to just outside its trigger range, wait for the
  // telegraph flash, and snipe it before the dash ever lands -- while a
  // script that just keeps walking gets caught by the dash instead.
  const lunger = newLungerEnemy("lunger4", 1250, GROUND_Y);

  const goal: Rect = { x: 1500, y: 560, w: 60, h: 40 };
  const bounds: Rect = { x: -150, y: 250, w: 1900, h: 750 };

  return {
    platforms: [floor4],
    movingPlatforms: [],
    enemies: [hopper, lunger],
    goal,
    spawn: { x: 60, feetY: GROUND_Y },
    bounds,
  };
}

/**
 * How far a walk-off fall carries horizontally, for a player who keeps holding
 * the direction they walked off in. Used to size level 5's landing window
 * against the lungers' trigger range, rather than eyeballing it.
 */
export function fallCarryDistance(dropHeight: number): number {
  return MOVE_SPEED * Math.sqrt((2 * dropHeight) / GRAVITY);
}

/** Level 5's drop: past a jump apex (~137u), so the chamber is a commitment. */
export const PINCER_DROP = 160;
export const PINCER_LEDGE_END = 1050;
export const PINCER_FLOOR_Y = GROUND_Y + PINCER_DROP;
export const PINCER_A_X = 902;
export const PINCER_B_X = 1302;

export function buildLevel5(): Level {
  // Every lunger so far has been fought one at a time, at a distance the player
  // chose: level 4's is met head-on with a full charge and all the time in the
  // world. This pair is met simultaneously, at a distance the level chooses.
  //
  // The drop is what makes it simultaneous, and it is the whole reason this
  // isn't just level 4 twice. Walking in from the left would put the player
  // inside the near lunger's 260u trigger range roughly 400u before the far
  // one's, turning a pincer into two separate, easy duels. Arriving from above
  // lands the player between them, inside both ranges on the same frame.
  //
  // The aha is a rule the player has so far only been punished by: a lunge
  // always travels its FULL fixed distance. Level 1's bait enemy uses that to
  // fling an over-eager player into a pit. Here the same overshoot is the
  // escape -- the shot that kills one lunger carries the player 320u clear,
  // out of the survivor's range, which is the only reason one charge is enough
  // for two enemies.
  const ledge: Rect = { x: -100, y: GROUND_Y, w: PINCER_LEDGE_END + 100, h: 60 };

  // Reaches well to the LEFT of the drop, because that's where a leftward
  // killing shot puts the player down: a 320u dash fired at lungerA from the
  // landing window ends around x=780, and it has to end on solid ground.
  const floor5: Rect = { x: 600, y: PINCER_FLOOR_Y, w: 1400, h: 300 };

  // 400u apart, straddling the landing window. Two constraints pin this:
  //
  //   - Both must trigger wherever in the window the player touches down. The
  //     window is [1050, 1050 + fallCarryDistance(160) ~= 1155]; each lunger
  //     covers +/-260u, so their overlap is [1042, 1162]. It fits, with only
  //     ~8u of slack at each end -- checked by a test, not by eye.
  //   - 400u apart means their dash endpoints (902+220=1122 and 1302-220=1082)
  //     land 40u apart, closer than ENEMY_W + PLAYER_W (52u). So a player who
  //     merely dodges both dashes by jumping comes down into a gap too narrow
  //     to stand in: the pincer closes. Killing one is not optional.
  const lungerA = newLungerEnemy("pincerA", PINCER_A_X, PINCER_FLOOR_Y);
  const lungerB = newLungerEnemy("pincerB", PINCER_B_X, PINCER_FLOOR_Y);

  const goal: Rect = { x: 1750, y: PINCER_FLOOR_Y - 40, w: 60, h: 40 };
  const bounds: Rect = { x: -150, y: 420, w: 2250, h: 780 };

  return {
    platforms: [ledge, floor5],
    movingPlatforms: [],
    enemies: [lungerA, lungerB],
    goal,
    spawn: { x: 60, feetY: GROUND_Y },
    bounds,
  };
}

export const LEVELS: Level[] = [
  buildLevel(),
  buildLevel2(),
  buildLevel3(),
  buildLevel4(),
  buildLevel5(),
];
