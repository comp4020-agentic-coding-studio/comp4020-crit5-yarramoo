// Full scripted playthroughs, driven through the real stepGame reducer.
//
// These scripts are reactive, not frame-precomputed: each helper drives
// input off the game's *current* simulated state (walk until past x,
// jump once close to a hazard) rather than a hand-counted frame number.
// That's deliberately more robust than baking in exact tick counts, and
// it's the same reason level.ts's geometry was tuned against the real
// sweep instead of derived by hand.

import { describe, expect, it } from "vitest";
import { isOver } from "../src/sim/run.ts";
import { buildLevel } from "../src/sim/level.ts";
import { newGame, stepGame, type Game, type GameInput } from "../src/sim/game.ts";
import { AIM_METER_MAX_MS } from "../src/sim/constants.ts";

const DT_MS = 16;
const MAX_FRAMES = 2000; // ~32s of simulated time -- generous, still a hard bound

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

function runFrames(game: Game, input: GameInput, n: number): Game {
  let g = game;
  for (let i = 0; i < n; i++) g = stepGame(g, input, DT_MS);
  return g;
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

describe("full playthroughs", () => {
  it("an expert script reaches the goal well under 5 minutes", () => {
    const level = buildLevel();
    let g: Game = newGame(level);

    // Beat 1-2: walk up to the gated corridor, lunge straight through the
    // stationary gate enemy (it dies; the dash doesn't even slow down).
    g = runUntil(g, (s) => s.body.x >= 480, () => walk(1));
    g = fireLunge(g, { x: 500, y: 0 });
    g = waitForDashToEnd(g);
    expect(g.enemies.find((e) => e.id === "gate")!.alive).toBe(false);

    // A couple of idle frames to touch back down and refresh the charge.
    g = runFrames(g, walk(0), 5);
    expect(g.body.dashCharge).toBe(true);

    // Beat 3: the pure gap -- same button, no target, just distance.
    g = runUntil(g, (s) => s.body.x >= 870, () => walk(1));
    g = fireLunge(g, { x: 500, y: 0 });
    g = waitForDashToEnd(g);
    expect(g.body.x).toBeGreaterThan(1180); // past the gap, onto floor2
    g = runFrames(g, walk(0), 5);
    expect(g.body.dashCharge).toBe(true);

    // Beat 4: the bait. The safe play is to jump clean over it, not lunge.
    g = runUntil(
      g,
      (s) => s.body.x >= 1430,
      (s) => ({ move: { moveX: 1, jump: s.body.x >= 1250 }, lunge: NO_LUNGE }),
    );
    expect(g.enemies.find((e) => e.id === "bait")!.alive).toBe(true); // walked past, never touched
    expect(g.run.outcome).toBeNull();

    // Beat 5: the vertical beat. A steep up-right lunge clears floor3's
    // corner; gravity settles the landing onto its top surface.
    const angle = (74 * Math.PI) / 180;
    g = fireLunge(g, { x: Math.cos(angle) * 500, y: -Math.sin(angle) * 500 });
    g = waitForDashToEnd(g);
    g = runUntil(g, (s) => s.body.grounded, () => walk(0));
    expect(g.body.feetY).toBeCloseTo(380);

    // Walk to the goal.
    g = runUntil(g, (s) => isOver(s.run), () => walk(1));
    expect(g.run.outcome).toBe("won");
    expect(g.run.elapsedMs).toBeLessThan(5 * 60 * 1000);
  });

  it("firing the lunge straight at the bait instead of jumping it is fatal", () => {
    const level = buildLevel();
    let g: Game = newGame(level);

    g = runUntil(g, (s) => s.body.x >= 480, () => walk(1));
    g = fireLunge(g, { x: 500, y: 0 });
    g = waitForDashToEnd(g);
    g = runFrames(g, walk(0), 5);

    g = runUntil(g, (s) => s.body.x >= 870, () => walk(1));
    g = fireLunge(g, { x: 500, y: 0 });
    g = waitForDashToEnd(g);
    g = runFrames(g, walk(0), 5);

    // On floor2, well clear of the enemy's own body, reflexively fire flat
    // at it -- the dash overshoots past floor2's edge, grazes floor3's wall,
    // and leaves the player hanging over the pit.
    g = runUntil(g, (s) => s.body.x >= 1250, () => walk(1));
    g = fireLunge(g, { x: 500, y: 0 });
    g = waitForDashToEnd(g);

    g = runUntil(g, (s) => isOver(s.run), () => walk(0));
    expect(g.run.outcome).toBe("lost");
  });

  it("further input after the run ends is a no-op", () => {
    const level = buildLevel();
    let g: Game = newGame(level);
    // Walk straight into the stationary gate enemy without ever lunging --
    // the simplest possible loss, ordinary contact death.
    g = runUntil(g, (s) => isOver(s.run), () => walk(1));
    expect(g.run.outcome).toBe("lost");
    const ended = g.run;

    g = stepGame(g, walk(1), DT_MS);
    expect(g.run).toEqual(ended);
  });
});

describe("aim meter", () => {
  const AIM_RIGHT = (held: boolean) => ({ move: { moveX: 0, jump: false }, lunge: { held, aimVector: { x: 1, y: 0 } } });

  it("starts full and drains only while aiming", () => {
    let g: Game = newGame(buildLevel());
    expect(g.body.aimMeter).toBe(AIM_METER_MAX_MS);

    // The press-frame transitions idle -> aiming but doesn't drain yet (same
    // convention as the lunge's own elapsedMs, which starts at 0 on entry);
    // draining begins on the first frame spent continuously aiming.
    g = stepGame(g, AIM_RIGHT(true), DT_MS);
    expect(g.lunge.kind).toBe("aiming");
    expect(g.body.aimMeter).toBe(AIM_METER_MAX_MS);

    g = stepGame(g, AIM_RIGHT(true), DT_MS);
    expect(g.lunge.kind).toBe("aiming");
    expect(g.body.aimMeter).toBeCloseTo(AIM_METER_MAX_MS - DT_MS);
  });

  it("forces a real dash once the meter runs out, even while still held", () => {
    let g: Game = newGame(buildLevel());
    g = stepGame(g, AIM_RIGHT(true), DT_MS);
    expect(g.lunge.kind).toBe("aiming");

    const framesToExhaust = Math.ceil(AIM_METER_MAX_MS / DT_MS) + 2;
    for (let i = 0; i < framesToExhaust && g.lunge.kind === "aiming"; i++) {
      g = stepGame(g, AIM_RIGHT(true), DT_MS);
    }
    expect(g.lunge.kind).toBe("dashing");
    expect(g.body.aimMeter).toBe(0);
  });

  it("resets to full once grounded again after a dash", () => {
    let g: Game = newGame(buildLevel());
    g = fireLunge(g, { x: 500, y: 0 });
    g = waitForDashToEnd(g);
    g = runFrames(g, walk(0), 5);
    expect(g.body.grounded).toBe(true);
    expect(g.body.aimMeter).toBe(AIM_METER_MAX_MS);
  });
});
