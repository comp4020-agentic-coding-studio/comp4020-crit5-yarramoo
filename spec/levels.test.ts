// Full scripted playthroughs for level 2 and level 3, same reactive style as
// spec/game.test.ts's level-1 scripts: each step drives off the game's
// *current* simulated state rather than a hand-counted frame number.

import { describe, expect, it } from "vitest";
import { isOver } from "../src/sim/run.ts";
import { buildLevel2, buildLevel3 } from "../src/sim/level.ts";
import { newGame, stepGame, type Game, type GameInput } from "../src/sim/game.ts";
import { AIM_METER_MAX_MS, PLAYER_H, ENEMY_H } from "../src/sim/constants.ts";

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
});
