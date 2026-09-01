import { describe, expect, it } from "vitest";
import { newMovingPlatform, platformRect, stepMovingPlatform } from "../src/sim/platform.ts";

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
