// Events, and the cancel that rides on the same input seam.
//
// These are assertions about the SIM, not about sound: the audio layer is one
// consumer, the renderer will be another. What matters here is that a frame
// reports exactly what happened on it, once.

import { describe, expect, it } from "vitest";
import { newEnemy } from "../src/sim/enemy.ts";
import { newGame, stepGame, type Game, type GameEvent, type GameInput } from "../src/sim/game.ts";
import { buildLevel, type Level } from "../src/sim/level.ts";
import { LUNGE_DISTANCE, PLAYER_H } from "../src/sim/constants.ts";

const DT = 16;
const kinds = (g: Game): GameEvent["kind"][] => g.events.map((e) => e.kind);
const has = (g: Game, k: GameEvent["kind"]): boolean => kinds(g).includes(k);

const idle: GameInput = { move: { moveX: 0, jump: false }, lunge: { held: false, aimVector: { x: 1, y: 0 } } };
const hold: GameInput = { move: { moveX: 0, jump: false }, lunge: { held: true, aimVector: { x: 1, y: 0 } } };
const escape: GameInput = {
  move: { moveX: 0, jump: false },
  lunge: { held: true, cancel: true, aimVector: { x: 1, y: 0 } },
};

describe("a frame reports what happened on it", () => {
  it("a fresh game has no events", () => {
    expect(newGame(buildLevel()).events).toEqual([]);
  });

  it("emits aimStarted on the press frame only", () => {
    let g = stepGame(newGame(buildLevel()), hold, DT);
    expect(has(g, "aimStarted")).toBe(true);

    g = stepGame(g, hold, DT); // still aiming, but nothing NEW happened
    expect(has(g, "aimStarted")).toBe(false);
  });

  it("emits dashFired on release", () => {
    let g = stepGame(newGame(buildLevel()), hold, DT);
    g = stepGame(g, idle, DT);
    expect(has(g, "dashFired")).toBe(true);
    expect(g.lunge.kind).toBe("dashing");
  });

  it("emits landed when the feet find ground, not every frame they are on it", () => {
    let g: Game = newGame(buildLevel());
    g = { ...g, body: { ...g.body, feetY: 400, grounded: false, vy: 300 } };
    let landings = 0;
    for (let i = 0; i < 60; i++) {
      g = stepGame(g, idle, DT);
      if (has(g, "landed")) landings++;
    }
    expect(landings).toBe(1);
  });
});

describe("cancelling an aim", () => {
  it("fires nothing and reports itself", () => {
    let g = stepGame(newGame(buildLevel()), hold, DT);
    expect(g.lunge.kind).toBe("aiming");

    g = stepGame(g, escape, DT);
    expect(g.lunge.kind).toBe("idle");
    expect(has(g, "aimCancelled")).toBe(true);
    expect(has(g, "dashFired")).toBe(false);
  });

  it("keeps the charge -- backing out costs the time spent, and nothing else", () => {
    let g = stepGame(newGame(buildLevel()), hold, DT);
    g = stepGame(g, escape, DT);
    expect(g.body.dashCharge).toBe(true);

    // ...so the very next press can still aim.
    g = stepGame(g, hold, DT);
    expect(g.lunge.kind).toBe("aiming");
  });

  it("outranks release when both land on the same frame", () => {
    let g = stepGame(newGame(buildLevel()), hold, DT);
    g = stepGame(g, { ...escape, lunge: { held: false, cancel: true, aimVector: { x: 1, y: 0 } } }, DT);
    expect(g.lunge.kind).toBe("idle");
    expect(has(g, "dashFired")).toBe(false);
  });
});

describe("one lunge through two enemies", () => {
  // The claim made in game.ts's comment, and the reason events beat diffing a
  // state snapshot: after the fact both enemies are simply absent, and nothing
  // says they went down on the same shot.
  const twoInARow: Level = {
    platforms: [{ x: -200, y: 400, w: 2000, h: 100 }],
    movingPlatforms: [],
    enemies: [newEnemy("first", 200, 400, 200, 200), newEnemy("second", 320, 400, 320, 320)],
    goal: { x: 1800, y: 360, w: 60, h: 40 },
    spawn: { x: 100, feetY: 400 },
    bounds: { x: -250, y: 0, w: 2200, h: 800 },
  };

  it("emits one enemyKilled per enemy, on the same frame", () => {
    let g: Game = newGame(twoInARow);
    const aim = { x: LUNGE_DISTANCE, y: 0 };
    g = stepGame(g, { move: { moveX: 0, jump: false }, lunge: { held: true, aimVector: aim } }, DT);
    g = stepGame(g, { move: { moveX: 0, jump: false }, lunge: { held: false, aimVector: aim } }, DT);

    const kills = g.events.filter((e) => e.kind === "enemyKilled");
    expect(kills.length).toBe(2);
    expect(kills.map((k) => (k as { id: string }).id).sort()).toEqual(["first", "second"]);
    expect(g.enemies.every((e) => !e.alive)).toBe(true);
  });

  it("carries where each kill happened, for whatever wants to draw it", () => {
    let g: Game = newGame(twoInARow);
    const aim = { x: LUNGE_DISTANCE, y: 0 };
    g = stepGame(g, { move: { moveX: 0, jump: false }, lunge: { held: true, aimVector: aim } }, DT);
    g = stepGame(g, { move: { moveX: 0, jump: false }, lunge: { held: false, aimVector: aim } }, DT);

    const first = g.events.find((e) => e.kind === "enemyKilled" && e.id === "first");
    expect(first).toBeDefined();
    expect((first as { at: { x: number } }).at.x).toBeCloseTo(200, 6);
  });
});

describe("an ending is announced once", () => {
  it("emits died on the frame it happens and never again", () => {
    let g: Game = newGame(buildLevel());
    g = { ...g, body: { ...g.body, feetY: 3000 } }; // below VOID_Y

    let deaths = 0;
    for (let i = 0; i < 20; i++) {
      g = stepGame(g, idle, DT);
      if (has(g, "died")) deaths++;
    }
    expect(deaths).toBe(1);
    expect(g.run.outcome).toBe("lost");
    // ...and a finished run keeps reporting nothing, rather than replaying it.
    expect(g.events).toEqual([]);
  });

  it("emits won when the goal is reached", () => {
    const level = buildLevel();
    let g: Game = newGame(level);
    g = { ...g, body: { ...g.body, x: level.goal.x + 10, feetY: level.goal.y + PLAYER_H } };
    g = stepGame(g, idle, DT);
    expect(has(g, "won")).toBe(true);
    expect(g.run.outcome).toBe("won");
  });
});
