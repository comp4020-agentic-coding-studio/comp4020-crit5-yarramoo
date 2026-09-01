// The wall slide: the second foothold.
//
// Two halves, tested together because neither is the mechanic on its own --
// body.ts decides when a body is hanging on a wall, and game.ts decides that
// only a body on a foothold may start an aim.

import { describe, expect, it } from "vitest";
import type { Rect } from "../src/core/aabb.ts";
import { newBody, stepBody, type Body } from "../src/sim/body.ts";
import {
  AIM_METER_MAX_MS,
  PLAYER_W,
  WALL_SLIDE_SPEED,
} from "../src/sim/constants.ts";
import { newGame, stepGame, type Game, type GameInput } from "../src/sim/game.ts";
import type { Level } from "../src/sim/level.ts";

const DT = 1 / 60;
const FLOOR: Rect = { x: -1000, y: 800, w: 3000, h: 100 };
/** A tall face on the right of the shaft; its left edge is at x = 400. */
const WALL: Rect = { x: 400, y: 0, w: 200, h: 700 };

const INTO_WALL = { moveX: 1, jump: false };
const AWAY = { moveX: -1, jump: false };
const NEITHER = { moveX: 0, jump: false };

/** A body falling beside the wall's left face, just clear of touching it. */
function fallingBesideWall(): Body {
  return { ...newBody(WALL.x - PLAYER_W / 2 - 1, 200), vy: 400 };
}

function stepMany(body: Body, input: { moveX: number; jump: boolean }, frames: number): Body {
  let b = body;
  for (let i = 0; i < frames; i++) b = stepBody(b, [FLOOR, WALL], input, DT);
  return b;
}

describe("catching a wall", () => {
  it("grabs on when pressed into it while falling", () => {
    const b = stepMany(fallingBesideWall(), INTO_WALL, 3);
    expect(b.wallSliding).toBe(true);
    expect(b.wallDir).toBe(1);
    expect(b.grounded).toBe(false);
  });

  it("caps the fall, which is the whole point -- a free fall is a reflex test", () => {
    const b = stepMany(fallingBesideWall(), INTO_WALL, 3);
    expect(b.vy).toBeLessThanOrEqual(WALL_SLIDE_SPEED);

    // Still descending, though. A wall is a slower way down, not a ledge.
    expect(b.vy).toBeGreaterThan(0);
    const later = stepMany(b, INTO_WALL, 10);
    expect(later.feetY).toBeGreaterThan(b.feetY);
  });

  it("refreshes both resources, exactly as landing does", () => {
    const spent: Body = { ...fallingBesideWall(), dashCharge: false, aimMeter: 0 };
    const b = stepMany(spent, INTO_WALL, 3);
    expect(b.wallSliding).toBe(true);
    expect(b.dashCharge).toBe(true);
    expect(b.aimMeter).toBe(AIM_METER_MAX_MS);
  });

  it("lets go the moment the direction is released", () => {
    const clinging = stepMany(fallingBesideWall(), INTO_WALL, 3);
    expect(clinging.wallSliding).toBe(true);

    const released = stepBody(clinging, [FLOOR, WALL], NEITHER, DT);
    expect(released.wallSliding).toBe(false);
    expect(released.wallDir).toBe(0);

    // ...and gravity takes over again: the cap was the wall's doing, not a
    // new terminal velocity.
    const falling = stepMany(released, NEITHER, 30);
    expect(falling.vy).toBeGreaterThan(WALL_SLIDE_SPEED);
  });

  it("does not grab a wall the body is moving away from", () => {
    const b = stepMany(fallingBesideWall(), AWAY, 3);
    expect(b.wallSliding).toBe(false);
  });

  it("does not grab while rising -- a wall is caught on the way down", () => {
    const rising: Body = { ...fallingBesideWall(), vy: -400 };
    const b = stepBody(rising, [FLOOR, WALL], INTO_WALL, DT);
    expect(b.wallSliding).toBe(false);
  });

  it("prefers the floor: landing in a corner is a landing, not a cling", () => {
    // Feet on the floor, shoulder against the wall, still pressing into it.
    const inCorner: Body = { ...newBody(WALL.x - PLAYER_W / 2, FLOOR.y - 1), vy: 200 };
    const b = stepMany(inCorner, INTO_WALL, 5);
    expect(b.grounded).toBe(true);
    expect(b.wallSliding).toBe(false);
  });
});

describe("a lunge needs a foothold", () => {
  // A shaft: a floor far below, one wall to fall past, and nothing else.
  const shaft: Level = {
    platforms: [FLOOR, WALL],
    movingPlatforms: [],
    enemies: [],
    goal: { x: 2000, y: FLOOR.y - 40, w: 60, h: 40 },
    spawn: { x: 100, feetY: FLOOR.y },
    bounds: { x: -200, y: -100, w: 2600, h: 1200 },
  };

  const hold = (moveX: number): GameInput => ({
    move: { moveX, jump: false },
    lunge: { held: true, aimVector: { x: 1, y: 0 } },
  });

  it("can be started from solid ground", () => {
    const g = stepGame(newGame(shaft), hold(0), 16);
    expect(g.lunge.kind).toBe("aiming");
  });

  it("cannot be started in open air, however much charge is left", () => {
    let g: Game = newGame(shaft);
    // Drop the body into the middle of the shaft, well clear of the wall,
    // with a full charge it simply may not spend.
    g = { ...g, body: { ...g.body, x: 100, feetY: 200, grounded: false, vy: 300, dashCharge: true } };
    g = stepGame(g, hold(0), 16);
    expect(g.body.dashCharge).toBe(true);
    expect(g.lunge.kind).toBe("idle"); // no freeze, no aim line, no feedback at all
  });

  it("can be started from a wall, which is the point of having them", () => {
    let g: Game = newGame(shaft);
    g = { ...g, body: { ...g.body, x: WALL.x - PLAYER_W / 2 - 1, feetY: 200, grounded: false, vy: 400 } };
    // A few frames pressing into the wall to catch it...
    for (let i = 0; i < 3; i++) {
      g = stepGame(g, { move: { moveX: 1, jump: false }, lunge: { held: false, aimVector: { x: 1, y: 0 } } }, 16);
    }
    expect(g.body.wallSliding).toBe(true);

    g = stepGame(g, hold(1), 16);
    expect(g.lunge.kind).toBe("aiming");
  });

  it("holds the body still on the wall while aiming, so the clock really does stop", () => {
    let g: Game = newGame(shaft);
    g = { ...g, body: { ...g.body, x: WALL.x - PLAYER_W / 2 - 1, feetY: 200, grounded: false, vy: 400 } };
    for (let i = 0; i < 3; i++) {
      g = stepGame(g, { move: { moveX: 1, jump: false }, lunge: { held: false, aimVector: { x: 1, y: 0 } } }, 16);
    }
    g = stepGame(g, hold(1), 16);
    const heldAt = g.body.feetY;

    for (let i = 0; i < 20; i++) g = stepGame(g, hold(1), 16);
    expect(g.lunge.kind).toBe("aiming");
    expect(g.body.feetY).toBe(heldAt); // did not slide a single unit while frozen
    expect(g.body.aimMeter).toBeLessThan(AIM_METER_MAX_MS); // but the meter still ran
  });
});
