import { describe, expect, it } from "vitest";
import { newGame, stepGame, type Game, type GameInput } from "../src/sim/game.ts";
import type { Level } from "../src/sim/level.ts";
import { newMovingPlatform, platformRect, stepMovingPlatform, type MovingPlatform } from "../src/sim/platform.ts";

const DT_MS = 16;
const NO_LUNGE = { held: false, aimVector: { x: 0, y: 0 } };
const walk = (moveX: -1 | 0 | 1): GameInput => ({ move: { moveX, jump: false }, lunge: NO_LUNGE });

describe("stepMovingPlatform", () => {
  it("oscillates along x between min and max without leaving them", () => {
    let mp = newMovingPlatform("mp1", "x", 100, 500, 80, 20, 100, 400, 60);
    for (let i = 0; i < 6000; i++) {
      mp = stepMovingPlatform(mp, 1 / 60);
      expect(mp.x).toBeGreaterThanOrEqual(100);
      expect(mp.x).toBeLessThanOrEqual(400);
      expect(mp.y).toBe(500); // fixed axis never moves
    }
  });

  it("oscillates along y, leaving x fixed", () => {
    let mp = newMovingPlatform("mp2", "y", 700, 100, 80, 20, 100, 300, 40);
    for (let i = 0; i < 6000; i++) {
      mp = stepMovingPlatform(mp, 1 / 60);
      expect(mp.y).toBeGreaterThanOrEqual(100);
      expect(mp.y).toBeLessThanOrEqual(300);
      expect(mp.x).toBe(700);
    }
  });

  it("reverses velocity on hitting a bound", () => {
    let mp = newMovingPlatform("mp3", "x", 395, 0, 80, 20, 100, 400, 60);
    expect(mp.v).toBeGreaterThan(0);
    mp = stepMovingPlatform(mp, 1); // overshoots max by a lot
    expect(mp.x).toBe(400);
    expect(mp.v).toBeLessThan(0);
  });
});

describe("platformRect", () => {
  it("matches the platform's current top-left and footprint", () => {
    const mp = newMovingPlatform("mp1", "x", 120, 480, 90, 24, 100, 400, 60);
    expect(platformRect(mp)).toEqual({ x: 120, y: 480, w: 90, h: 24 });
  });
});

/** A minimal level whose only solid ground is the given moving platform, with the player spawned standing on it. */
function levelWithPlatform(mp: MovingPlatform): Level {
  return {
    platforms: [],
    movingPlatforms: [mp],
    enemies: [],
    goal: { x: 1e6, y: 1e6, w: 1, h: 1 }, // unreachable -- these tests never care about winning
    spawn: { x: mp.x + mp.w / 2, feetY: mp.y },
    bounds: { x: -1000, y: -1000, w: 5000, h: 5000 },
  };
}

describe("stepGame with a moving platform", () => {
  it("carries a grounded body horizontally as the platform slides", () => {
    const mp = newMovingPlatform("mp", "x", 100, 500, 200, 20, 100, 400, 60);
    let g: Game = newGame(levelWithPlatform(mp));
    for (let i = 0; i < 5; i++) g = stepGame(g, walk(0), DT_MS); // settle onto the platform
    expect(g.body.grounded).toBe(true);

    const xBefore = g.body.x;
    g = stepGame(g, walk(0), DT_MS);
    expect(g.body.x).toBeGreaterThan(xBefore); // rode along with the platform's rightward slide
    expect(g.body.grounded).toBe(true);
  });

  it("carries a grounded body vertically as the platform bobs, via the ordinary landing snap", () => {
    const mp = newMovingPlatform("mp", "y", 700, 100, 200, 20, 100, 300, 40);
    let g: Game = newGame(levelWithPlatform(mp));
    for (let i = 0; i < 30; i++) {
      g = stepGame(g, walk(0), DT_MS);
      expect(g.body.grounded).toBe(true);
      expect(g.body.feetY).toBeCloseTo(g.movingPlatforms[0]!.y);
    }
  });

  it("freezes moving platforms while the player is aiming, same as enemies", () => {
    const mp = newMovingPlatform("mp", "x", 100, 500, 200, 20, 100, 400, 60);
    let g: Game = newGame(levelWithPlatform(mp));
    for (let i = 0; i < 5; i++) g = stepGame(g, walk(0), DT_MS);

    const xBeforeAim = g.movingPlatforms[0]!.x;
    const aiming = stepGame(g, { move: { moveX: 0, jump: false }, lunge: { held: true, aimVector: { x: 1, y: 0 } } }, DT_MS);
    expect(aiming.lunge.kind).toBe("aiming");
    expect(aiming.movingPlatforms[0]!.x).toBe(xBeforeAim);

    const stillAiming = stepGame(aiming, { move: { moveX: 0, jump: false }, lunge: { held: true, aimVector: { x: 1, y: 0 } } }, DT_MS);
    expect(stillAiming.lunge.kind).toBe("aiming");
    expect(stillAiming.movingPlatforms[0]!.x).toBe(xBeforeAim);
  });
});
