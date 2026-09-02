// Full scripted playthroughs for level 2 and level 3, same reactive style as
// spec/game.test.ts's level-1 scripts: each step drives off the game's
// *current* simulated state rather than a hand-counted frame number.

import { describe, expect, it } from "vitest";
import { isOver } from "../src/sim/run.ts";
import {
  buildLevel2,
  buildLevel3,
  buildLevel4,
  buildLevel5,
  buildLevel6,
  buildLevel7,
  CHIMNEY_FAR_X,
  GROUND_Y,
  PILLAR_TOP,
  PILLAR_W,
  PILLAR_X,
  SHUTTER_H,
  SHUTTER_X,
  PINCER_A_X,
  PINCER_B_X,
  PINCER_DROP,
  PINCER_FLOOR_Y,
  PINCER_LEDGE_END,
  PINCER_WINDOW_END,
  PINCER_WINDOW_START,
} from "../src/sim/level.ts";
import { newGame, stepGame, type Game, type GameInput } from "../src/sim/game.ts";
import {
  AIM_METER_MAX_MS,
  ENEMY_H,
  ENEMY_LUNGE_DISTANCE,
  ENEMY_LUNGE_RANGE_X,
  ENEMY_W,
  JUMP_APEX_HEIGHT,
  LUNGE_DISTANCE,
  MAX_JUMP_DISTANCE,
  PLAYER_H,
  PLAYER_W,
} from "../src/sim/constants.ts";

const DT_MS = 16;
const MAX_FRAMES = 3000; // these levels have a long ferry ride to simulate through

function runUntil(
  game: Game,
  predicate: (g: Game) => boolean,
  inputFor: (g: Game) => GameInput,
): Game {
  let g = game;
  for (let i = 0; i < MAX_FRAMES; i++) {
    if (predicate(g)) return g;
    g = stepGame(g, inputFor(g), DT_MS);
  }
  throw new Error(`runUntil: condition never met within ${MAX_FRAMES} frames`);
}

const NO_LUNGE = { held: false, aimVector: { x: 0, y: 0 } };
const walk = (moveX: -1 | 0 | 1): GameInput => ({ move: { moveX, jump: false }, lunge: NO_LUNGE });

/** Press-hold-aim, then release one frame later -- the whole fire sequence. */
function fireLunge(game: Game, aimVector: { x: number; y: number }): Game {
  const aiming = stepGame(game, { move: { moveX: 0, jump: false }, lunge: { held: true, aimVector } }, DT_MS);
  expect(aiming.lunge.kind).toBe("aiming");
  const fired = stepGame(aiming, { move: { moveX: 0, jump: false }, lunge: { held: false, aimVector } }, DT_MS);
  expect(fired.lunge.kind).toBe("dashing");
  return fired;
}

function waitForDashToEnd(game: Game): Game {
  return runUntil(game, (g) => g.lunge.kind === "idle", () => walk(0));
}

/**
 * The frame a dash completes, game.ts snaps the body straight to the dash's
 * endpoint without running stepBody -- so grounded/dashCharge/aimMeter are
 * stale (carried from before the dash) for exactly that one frame, and only
 * get recomputed for real on the next ordinary physics frame. Call this
 * after waitForDashToEnd whenever a test cares about the *post-landing*
 * meter/dashCharge value rather than merely "the dash is over".
 */
function settleAfterDash(game: Game): Game {
  return stepGame(game, walk(0), DT_MS);
}

/** Aim vector from the player's current center straight at a live enemy's current center. */
function aimAt(g: Game, enemyId: string): { x: number; y: number } {
  const enemy = g.enemies.find((e) => e.id === enemyId);
  if (!enemy) throw new Error(`no such enemy: ${enemyId}`);
  const playerCenterY = g.body.feetY - PLAYER_H / 2;
  const enemyCenterY = enemy.feetY - ENEMY_H / 2;
  return { x: enemy.x - g.body.x, y: enemyCenterY - playerCenterY };
}

/**
 * Ride the (single) moving platform from its near bound to its far bound.
 * `boardX` must land solidly inside the ferry's footprint once docked --
 * edgeX + 10 is NOT enough: the ferry docks flush against the departure
 * floor's own edge, so a target that close never actually leaves solid
 * ground, and the "ride" phase below then waits forever for a platform that
 * was never actually carrying anyone (confirmed with a throwaway probe
 * script; the fix is simply to walk further onto the platform before
 * switching to passive riding).
 */
function boardAndRideFerry(g: Game, edgeX: number, boardX: number, farBound: number): Game {
  let s = runUntil(g, (s) => s.body.x >= edgeX, () => walk(1)); // approach the gap's edge
  s = runUntil(s, (s) => s.movingPlatforms[0]!.x <= s.movingPlatforms[0]!.min + 1, () => walk(0)); // wait for the ferry's return swing
  s = runUntil(s, (s) => s.body.x >= boardX, () => walk(1)); // walk solidly onto the ferry's deck
  s = runUntil(s, (s) => s.movingPlatforms[0]!.x >= farBound, () => walk(0)); // ride, carried passively
  return s;
}

describe("level 2: ferry crossing + a mandatory timed snipe", () => {
  it("an expert script reaches the goal", () => {
    let g: Game = newGame(buildLevel2());

    g = boardAndRideFerry(g, 285, 340, 800);
    g = runUntil(g, (s) => s.body.x >= 1050, () => walk(1)); // step off onto floor2b

    g = runUntil(g, (s) => s.body.x >= 1250, () => walk(1)); // approach the gate
    g = fireLunge(g, aimAt(g, "bobber"));
    g = waitForDashToEnd(g);
    g = settleAfterDash(g);
    expect(g.enemies.find((e) => e.id === "bobber")!.alive).toBe(false);

    g = runUntil(g, (s) => isOver(s.run), () => walk(1));
    expect(g.run.outcome).toBe("won");
  });

  it("walking into the bobbing gate enemy without killing it is fatal, at any bob phase", () => {
    let g: Game = newGame(buildLevel2());
    g = boardAndRideFerry(g, 285, 340, 800);
    g = runUntil(g, (s) => s.body.x >= 1050, () => walk(1));

    g = runUntil(g, (s) => isOver(s.run), () => walk(1)); // walk straight into the gate, no lunge
    expect(g.run.outcome).toBe("lost");
    expect(g.enemies.find((e) => e.id === "bobber")!.alive).toBe(true);
  });
});

describe("level 3: two mandatory timed snipes bracketing a ferry crossing", () => {
  it("an expert script reaches the goal, each snipe drawing on a freshly-reset meter", () => {
    let g: Game = newGame(buildLevel3());

    g = runUntil(g, (s) => s.body.x >= 260, () => walk(1)); // approach the first gate
    g = fireLunge(g, aimAt(g, "gate3a"));
    g = waitForDashToEnd(g);
    g = settleAfterDash(g); // the reset lands one ordinary physics frame after the dash's endpoint snap
    expect(g.enemies.find((e) => e.id === "gate3a")!.alive).toBe(false);
    // Landing after the dash refills the meter -- the second snipe gets its own full budget.
    expect(g.body.aimMeter).toBe(AIM_METER_MAX_MS);

    g = boardAndRideFerry(g, 685, 740, 1000);
    g = runUntil(g, (s) => s.body.x >= 1250, () => walk(1)); // step off onto floor3b

    g = runUntil(g, (s) => s.body.x >= 1350, () => walk(1)); // approach the second gate
    g = fireLunge(g, aimAt(g, "gate3b"));
    g = waitForDashToEnd(g);
    expect(g.enemies.find((e) => e.id === "gate3b")!.alive).toBe(false);

    g = runUntil(g, (s) => isOver(s.run), () => walk(1));
    expect(g.run.outcome).toBe("won");
  });

  it("walking into the first gate enemy without killing it is fatal", () => {
    let g: Game = newGame(buildLevel3());
    g = runUntil(g, (s) => isOver(s.run), () => walk(1)); // walk straight into gate3a, no lunge
    expect(g.run.outcome).toBe("lost");
    expect(g.enemies.find((e) => e.id === "gate3a")!.alive).toBe(true);
  });
});

describe("level 4: a hopper hazard and a lunger ambush", () => {
  it("an expert script snipes both new enemy types and reaches the goal", () => {
    let g: Game = newGame(buildLevel4());

    // The hopper: kill it with a lunge from a safe standoff -- reading its
    // current bob phase via aimAt, same as the bobbing gates in level 2/3.
    g = runUntil(g, (s) => s.body.x >= 250, () => walk(1));
    g = fireLunge(g, aimAt(g, "hopper4"));
    g = waitForDashToEnd(g);
    g = settleAfterDash(g);
    expect(g.enemies.find((e) => e.id === "hopper4")!.alive).toBe(false);

    // The lunger: stop just outside its trigger range (260u) so it stays
    // dormant, then snipe it before it ever gets a chance to dash.
    g = runUntil(g, (s) => s.body.x >= 970, () => walk(1));
    expect(g.enemies.find((e) => e.id === "lunger4")!.lungeState).toBe("patrol");
    g = fireLunge(g, aimAt(g, "lunger4"));
    g = waitForDashToEnd(g);
    g = settleAfterDash(g);
    expect(g.enemies.find((e) => e.id === "lunger4")!.alive).toBe(false);

    g = runUntil(g, (s) => isOver(s.run), () => walk(1));
    expect(g.run.outcome).toBe("won");
  });

  it("walking straight through without ever responding to the lunger is fatal", () => {
    let g: Game = newGame(buildLevel4());
    g = runUntil(g, (s) => isOver(s.run), () => walk(1)); // never aims, never stops
    expect(g.run.outcome).toBe("lost");
  });
});

describe("level 5: two lungers at once, one charge", () => {
  const byId = (g: Game, id: string) => g.enemies.find((e) => e.id === id)!;

  // The geometry this level stands on, asserted against the real constants
  // rather than eyeballed -- the same standard as GAP1_EXCEEDS_MAX_JUMP. The
  // margins here are single-digit, so "looks about right" is not good enough.
  describe("its geometry holds", () => {
    it("both lungers cover the whole landing window, so the pincer always springs", () => {
      // Where a player is inside BOTH trigger ranges at once. The window must
      // sit entirely inside it: a landing that only trips one of the pair is
      // level 4 again, not a pincer.
      const coveredFrom = PINCER_B_X - ENEMY_LUNGE_RANGE_X;
      const coveredTo = PINCER_A_X + ENEMY_LUNGE_RANGE_X;

      expect(PINCER_WINDOW_START).toBeGreaterThanOrEqual(coveredFrom);
      expect(PINCER_WINDOW_END).toBeLessThanOrEqual(coveredTo);
    });

    it("counts the player's own width in that window", () => {
      // A body stops being supported when its BOX clears the ledge, not its
      // centre, so it leaves 12u further right than the edge itself. Missing
      // that put the far end of the window outside lungerA's reach, and the
      // level still played -- the trigger fires mid-fall, before the limit --
      // which is exactly the kind of "works for the wrong reason" a live
      // playtest catches and arithmetic on the wrong number does not.
      expect(PINCER_WINDOW_START - PINCER_LEDGE_END).toBe(PLAYER_W / 2);
    });

    it("the drop is past a jump apex, so arriving in the chamber is a commitment", () => {
      expect(PINCER_DROP).toBeGreaterThan(JUMP_APEX_HEIGHT);
    });

    it("closes on a player who dodges both dashes instead of killing one", () => {
      // Each dash ends 220u toward the player, so the two endpoints finish
      // closer together than a player is wide plus the two half-enemies
      // flanking them: there is no gap left to come down in.
      const aEnds = PINCER_A_X + ENEMY_LUNGE_DISTANCE;
      const bEnds = PINCER_B_X - ENEMY_LUNGE_DISTANCE;
      expect(Math.abs(bEnds - aEnds)).toBeLessThan(ENEMY_W + PLAYER_W);
    });
  });

  it("an expert script kills one, is carried clear of the other, and reaches the goal", () => {
    let g: Game = newGame(buildLevel5());

    // Walk off the ledge holding the direction all the way down -- the far end
    // of the landing window, and so the tightest case for the margins above.
    g = runUntil(g, (s) => s.body.grounded && s.body.feetY >= PINCER_FLOOR_Y, () => walk(1));

    // The beat the level exists for: both are already winding up, on one frame.
    expect(byId(g, "pincerA").lungeState).toBe("telegraph");
    expect(byId(g, "pincerB").lungeState).toBe("telegraph");

    // One charge, two enemies. The shot that kills A is also what saves the
    // player from B: it travels its full fixed 320u regardless of the kill,
    // dumping them well outside B's reach before B's telegraph even ends.
    g = fireLunge(g, aimAt(g, "pincerA"));
    g = waitForDashToEnd(g);
    g = settleAfterDash(g);
    expect(byId(g, "pincerA").alive).toBe(false);

    // Out of B's reach now -- so B's telegraph resolves into a lunge at where
    // the player WAS, and lands short.
    expect(Math.abs(byId(g, "pincerB").x - g.body.x)).toBeGreaterThan(ENEMY_LUNGE_RANGE_X);
    const reachBefore = Math.abs(PINCER_B_X - g.body.x);
    expect(reachBefore).toBeGreaterThan(LUNGE_DISTANCE); // couldn't have shot back even if charged

    g = runUntil(g, (s) => byId(s, "pincerB").lungeState === "dashing", () => walk(0));
    g = runUntil(g, (s) => byId(s, "pincerB").lungeState === "patrol", () => walk(0));
    expect(g.run.outcome).toBe(null);
    expect(byId(g, "pincerB").alive).toBe(true);
    // A lunger's dash permanently repositions it -- it stays where it landed.
    expect(byId(g, "pincerB").x).toBeLessThan(PINCER_B_X);

    // ...which is the actual point of the beat: by missing, B has closed the
    // gap itself. It was out of the player's reach before its lunge and is
    // inside it afterwards. The enemy hands the player the shot.
    const reachAfter = Math.abs(byId(g, "pincerB").x - g.body.x);
    expect(reachAfter).toBeLessThan(LUNGE_DISTANCE);
    expect(reachAfter).toBeLessThan(reachBefore);

    // Landing refilled the charge, and the survivor is back within reach.
    g = fireLunge(g, aimAt(g, "pincerB"));
    g = waitForDashToEnd(g);
    g = settleAfterDash(g);
    expect(byId(g, "pincerB").alive).toBe(false);

    g = runUntil(g, (s) => isOver(s.run), () => walk(1));
    expect(g.run.outcome).toBe("won");
  });

  it("dropping in and walking on without ever aiming is fatal", () => {
    let g: Game = newGame(buildLevel5());
    g = runUntil(g, (s) => isOver(s.run), () => walk(1)); // never aims, never stops
    expect(g.run.outcome).toBe("lost");
    // Killed by a lunger rather than by falling: the chamber floor caught them.
    expect(g.enemies.some((e) => e.alive)).toBe(true);
    expect(g.body.feetY).toBeLessThanOrEqual(PINCER_FLOOR_Y);
  });
});

describe("level 6: the shutter -- pressing is committing", () => {
  const shutterTop = (g: Game) => g.movingPlatforms[0]!.y;
  /** Clear of a standing player's flight band once the bottom edge is above it. */
  const laneOpen = (g: Game) => shutterTop(g) + SHUTTER_H < GROUND_Y - PLAYER_H;

  it("the pit is uncrossable by jumping but inside a lunge", () => {
    const pit = 820 - 600;
    expect(pit).toBeGreaterThan(MAX_JUMP_DISTANCE);
    expect(pit).toBeLessThan(LUNGE_DISTANCE);
  });

  it("an expert script waits for the lane, then crosses", () => {
    let g: Game = newGame(buildLevel6());

    g = runUntil(g, (s) => s.body.x >= 585, () => walk(1)); // out to the lip
    g = runUntil(g, laneOpen, () => walk(0)); // read the shutter, don't press yet

    g = fireLunge(g, { x: LUNGE_DISTANCE, y: 0 });
    g = waitForDashToEnd(g);
    g = settleAfterDash(g);
    expect(g.body.x).toBeGreaterThan(820); // cleared the pit
    expect(g.body.grounded).toBe(true);

    g = runUntil(g, (s) => isOver(s.run), () => walk(1));
    expect(g.run.outcome).toBe("won");
  });

  it("pressing while the lane is shut fires a blocked shot into the pit", () => {
    let g: Game = newGame(buildLevel6());
    g = runUntil(g, (s) => s.body.x >= 585, () => walk(1));
    g = runUntil(g, (s) => !laneOpen(s), () => walk(0)); // press at the wrong moment

    g = fireLunge(g, { x: LUNGE_DISTANCE, y: 0 });
    g = waitForDashToEnd(g);
    // Stopped dead against the shutter, well short of the far side.
    expect(g.body.x).toBeLessThan(SHUTTER_X);
    expect(g.body.x).toBeLessThan(820);

    // ...and with nothing under them, and no foothold to fire from again.
    g = runUntil(g, (s) => isOver(s.run), () => walk(0));
    expect(g.run.outcome).toBe("lost");
  });
});

describe("level 7: the chimney -- a crossing wider than a lunge", () => {
  it("is too wide for one lunge, so the pillar is not optional", () => {
    expect(CHIMNEY_FAR_X - 600).toBeGreaterThan(LUNGE_DISTANCE);
  });

  it("keeps the pillar top out of reach of a shot from the near ledge", () => {
    // Otherwise one lucky steep shot skips the entire level. The point that
    // actually has to be cleared is the corner of the sweep's EXPANDED blocker
    // -- half a body up and left of the real corner -- not the corner itself.
    const from = { x: 588, y: GROUND_Y - PLAYER_H / 2 };
    const clearAt = { x: PILLAR_X - PLAYER_W / 2, y: PILLAR_TOP - PLAYER_H / 2 };
    const reach = Math.hypot(clearAt.x - from.x, clearAt.y - from.y);
    expect(reach).toBeGreaterThan(LUNGE_DISTANCE);
  });

  it("an expert script is stopped by the pillar, catches it, and climbs out", () => {
    let g: Game = newGame(buildLevel7());

    // Beat 1: lunge for the far side. It cannot get there -- the pillar's face
    // stops it dead, mid-gap, with the charge spent.
    g = runUntil(g, (s) => s.body.x >= 585, () => walk(1));
    g = fireLunge(g, { x: LUNGE_DISTANCE, y: 0 });
    g = waitForDashToEnd(g);
    expect(g.body.x).toBeLessThan(PILLAR_X);
    expect(g.body.x).toBeGreaterThan(800);

    // Beat 2: hold into the face. The body catches instead of falling.
    g = runUntil(g, (s) => s.body.wallSliding, () => walk(1));
    expect(g.body.wallDir).toBe(1);
    expect(g.body.dashCharge).toBe(true); // the wall gave it back
    expect(g.body.aimMeter).toBe(AIM_METER_MAX_MS);

    // Beat 3: launch straight up off the face, then feather right onto the top.
    g = fireLunge(g, { x: 0, y: -LUNGE_DISTANCE });
    g = waitForDashToEnd(g);
    expect(g.body.feetY).toBeLessThan(PILLAR_TOP);
    g = runUntil(g, (s) => s.body.grounded, (s) => walk(s.body.x < PILLAR_X + PILLAR_W / 2 ? 1 : 0));
    expect(g.body.feetY).toBe(PILLAR_TOP);

    // Beat 4: from the top, the far side is an ordinary lunge away.
    g = fireLunge(g, { x: LUNGE_DISTANCE, y: 0 });
    g = waitForDashToEnd(g);
    g = settleAfterDash(g);
    g = runUntil(g, (s) => isOver(s.run), () => walk(1));
    expect(g.run.outcome).toBe("won");
  });

  it("letting go of the wall instead of holding it is fatal", () => {
    let g: Game = newGame(buildLevel7());
    g = runUntil(g, (s) => s.body.x >= 585, () => walk(1));
    g = fireLunge(g, { x: LUNGE_DISTANCE, y: 0 });
    g = waitForDashToEnd(g);

    // No direction held: nothing catches, and there is no foothold in open air.
    g = runUntil(g, (s) => isOver(s.run), () => walk(0));
    expect(g.run.outcome).toBe("lost");
  });
});
