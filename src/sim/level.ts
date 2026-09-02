// Plain level data. y increases downward; a platform's `y` is its top
// surface, extending down by `h`. Coordinates are a first pass -- expected to
// be retuned once the level is actually played (see the plan's build order).

import type { Rect } from "../core/aabb.ts";
import { newEnemy, newHopperEnemy, newLungerEnemy, newVerticalEnemy, type Enemy } from "./enemy.ts";
import { GRAVITY, MAX_JUMP_DISTANCE, MOVE_SPEED, PLAYER_W } from "./constants.ts";
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
/**
 * Where a walk-off landing can put the player: from the ledge edge plus half a
 * body (a body stops being supported once its box clears the edge, not once its
 * centre does -- which is 12u further than the obvious answer, and cost a whole
 * playtest to notice) out to that plus the fall's horizontal carry.
 */
export const PINCER_WINDOW_START = PINCER_LEDGE_END + PLAYER_W / 2;
export const PINCER_WINDOW_END = PINCER_WINDOW_START + fallCarryDistance(PINCER_DROP);

// Centred on that window rather than on the ledge edge. An earlier pair sat 12u
// left of here and left the far end of the window outside lungerA's reach: it
// still played correctly, because a falling player crosses the trigger band ~36u
// before touchdown while still short of the limit, but it only worked in the
// air. Centring makes it true on the ground too, which is where it reads.
export const PINCER_A_X = 914;
export const PINCER_B_X = 1314;

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

  // 400u apart, straddling the landing window. Two constraints pin this, and
  // the second is why they can't simply be moved further apart for comfort:
  //
  //   - Both must trigger wherever in the window the player touches down. The
  //     window is ~105u wide and their combined 260u ranges overlap over 120u,
  //     so there is only ~7u of slack at each end. That is inherent, not sloppy:
  //     the drop has to clear a 137u jump apex to be one-way, and a fall that
  //     deep carries at least ~97u horizontally. Checked by a test, not by eye.
  //   - 400u apart means their dash endpoints (914+220 and 1314-220) finish 40u
  //     apart, closer than ENEMY_W + PLAYER_W (52u). A player who merely dodges
  //     both dashes by jumping comes down into a gap too narrow to stand in, so
  //     the pincer closes. Killing one is not optional.
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

/** Level 6's shutter: the y-range its top edge sweeps, and where it stops blocking. */
export const SHUTTER_TOP_MIN = 200;
export const SHUTTER_TOP_MAX = 320;
export const SHUTTER_H = 300;
export const SHUTTER_X = 700;

export function buildLevel6(): Level {
  // Every snipe so far has rewarded patience: press, and the world holds still
  // for as long as the meter lasts while the shot is lined up. That teaches
  // something slightly false. The freeze does not let a player WAIT for a
  // moment -- it preserves whatever moment they pressed in. Nothing has ever
  // charged them for that, because every target so far was always available.
  //
  // Here the only route is through a gap that opens and closes on a timer, and
  // the world stops the instant the button goes down. Press late and the aim
  // line -- drawn with resolveAimEndpoint, the same sweep the real dash uses --
  // shows the shot ending in mid-air over the pit before it is fired.
  //
  // Escape aborts that shot, and the level is built around what Escape cannot
  // do. Backing out is free, so a misread costs a cycle rather than a life; but
  // the meter is still draining the whole time it is held, and running it dry
  // fires the shot whether the lane is open or not. The demand is not "commit
  // blind", it is "decide before the clock decides for you" -- which is the
  // same lesson with a fairer floor under it.
  const floor6a: Rect = { x: -100, y: GROUND_Y, w: 700, h: 300 }; // spans -100..600
  const floor6b: Rect = { x: 820, y: GROUND_Y, w: 900, h: 300 }; // 220u pit at 600..820

  // A guillotine, not a door: its bottom edge sweeps from 500 (well clear of a
  // standing player's 564..600 flight band) to 620 (through it entirely), so
  // the lane is open a little over half the time. Slow enough to read from the
  // far side of the pit, quick enough that reading it is not the whole job.
  const shutter = newMovingPlatform(
    "shutter6",
    "y",
    SHUTTER_X,
    SHUTTER_TOP_MIN,
    60,
    SHUTTER_H,
    SHUTTER_TOP_MIN,
    SHUTTER_TOP_MAX,
    110,
  );

  const goal: Rect = { x: 1600, y: GROUND_Y - 40, w: 60, h: 40 };
  const bounds: Rect = { x: -150, y: 150, w: 2000, h: 850 };

  return {
    platforms: [floor6a, floor6b],
    movingPlatforms: [shutter],
    enemies: [],
    goal,
    spawn: { x: 60, feetY: GROUND_Y },
    bounds,
  };
}

/** Level 7's pillar: the one foothold in a crossing far too wide for a single lunge. */
export const PILLAR_X = 900;
export const PILLAR_W = 80;
export const PILLAR_TOP = 460;
export const CHIMNEY_FAR_X = 1200;

export function buildLevel7(): Level {
  // The crossing is 600u wide. A lunge is 320. There is no version of this that
  // one shot solves, and the pillar in the middle is not a platform to land on
  // -- its top is too high to reach from the near ledge, so what a shot into it
  // actually does is stop dead against its FACE, which is the existing rule
  // that a lunge is ended by solid terrain.
  //
  // Being stopped mid-gap used to be simply death: airborne, charge spent,
  // nothing to do but fall. A wall changes what that means. Hold the direction
  // into it and the body catches, the fall slows, and both resources come back
  // -- the pale pulse says so without a word. The pillar is not an obstacle
  // that happens to be climbable; it is the only foothold for 600u, and the
  // level is built so the player finds that out by being thrown against it.
  const floor7a: Rect = { x: -100, y: GROUND_Y, w: 700, h: 300 }; // spans -100..600
  const floor7b: Rect = { x: CHIMNEY_FAR_X, y: GROUND_Y, w: 800, h: 300 }; // spans 1200..2000

  // Top at 460, and that number is load-bearing. What matters is not the corner
  // itself but the corner of the sweep's EXPANDED blocker, half a body up and
  // left of it -- the point a shot has to clear to get over the pillar at all.
  // At 520 that point sat 318u from the near ledge's lip, inside a 320u lunge,
  // and one steep lucky shot skipped the entire level. At 460 it is ~331u away:
  // out of reach, and provably so in spec/levels.test.ts rather than by eye.
  const pillar: Rect = { x: PILLAR_X, y: PILLAR_TOP, w: PILLAR_W, h: 940 };

  const goal: Rect = { x: 1800, y: GROUND_Y - 40, w: 60, h: 40 };
  const bounds: Rect = { x: -150, y: 300, w: 2300, h: 800 };

  return {
    platforms: [floor7a, pillar, floor7b],
    movingPlatforms: [],
    enemies: [],
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
  buildLevel6(),
  buildLevel7(),
];
