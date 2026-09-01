import { describe, expect, it } from "vitest";
import {
  applyLungeSweep,
  newEnemy,
  newHopperEnemy,
  newLungerEnemy,
  newVerticalEnemy,
  stepEnemy,
  stepLungerEnemy,
} from "../src/sim/enemy.ts";
import {
  ENEMY_H,
  ENEMY_LUNGE_DISTANCE,
  ENEMY_LUNGE_DURATION_MS,
  ENEMY_LUNGE_TELEGRAPH_MS,
  ENEMY_PATROL_SPEED,
  ENEMY_W,
  HOPPER_HEIGHT,
  HOPPER_PERIOD_MS,
} from "../src/sim/constants.ts";
import { rectAt } from "../src/core/aabb.ts";

describe("stepEnemy", () => {
  it("bounces at its patrol bounds instead of wandering past them", () => {
    let e = newEnemy("e1", 195, 0, 100, 200);
    for (let i = 0; i < 60; i++) e = stepEnemy(e, 1 / 60);
    expect(e.x).toBeLessThanOrEqual(200);
    expect(e.x).toBeGreaterThanOrEqual(100);

    for (let i = 0; i < 600; i++) e = stepEnemy(e, 1 / 60);
    expect(e.x).toBeGreaterThanOrEqual(100);
    expect(e.x).toBeLessThanOrEqual(200);
  });

  it("does not move once dead", () => {
    const dead = { ...newEnemy("e1", 150, 0, 100, 200), alive: false };
    const after = stepEnemy(dead, 1);
    expect(after).toEqual(dead);
  });

  it("moves at exactly ENEMY_PATROL_SPEED", () => {
    const e = newEnemy("e1", 150, 0, 0, 1000);
    const after = stepEnemy(e, 1);
    expect(Math.abs(after.x - e.x)).toBeCloseTo(ENEMY_PATROL_SPEED);
  });
});

describe("newVerticalEnemy", () => {
  it("bounces along feetY instead of x, leaving x fixed", () => {
    let e = newVerticalEnemy("hopper", 300, 100, 100, 300);
    for (let i = 0; i < 600; i++) {
      e = stepEnemy(e, 1 / 60);
      expect(e.x).toBe(300);
      expect(e.feetY).toBeGreaterThanOrEqual(100);
      expect(e.feetY).toBeLessThanOrEqual(300);
    }
  });
});

describe("newHopperEnemy", () => {
  it("hops between the floor and HOPPER_HEIGHT above it, never past either bound", () => {
    let e = newHopperEnemy("h1", 300, 500);
    expect(e.x).toBe(300);
    expect(e.feetY).toBe(500);
    for (let i = 0; i < 600; i++) {
      e = stepEnemy(e, 1 / 60);
      expect(e.x).toBe(300); // a hopper never drifts horizontally
      expect(e.feetY).toBeLessThanOrEqual(500);
      expect(e.feetY).toBeGreaterThanOrEqual(500 - HOPPER_HEIGHT);
    }
  });

  it("returns to the floor at the top of each cycle", () => {
    let e = newHopperEnemy("h1", 0, 500);
    // Stepping by exactly one full period, in one shot, should land back on the floor.
    e = stepEnemy(e, HOPPER_PERIOD_MS / 1000);
    expect(e.feetY).toBeCloseTo(500, 5);
  });

  it("does not move once dead", () => {
    const dead = { ...newHopperEnemy("h1", 300, 500), alive: false };
    const after = stepEnemy(dead, 1);
    expect(after).toEqual(dead);
  });
});

describe("stepLungerEnemy", () => {
  const platforms = [rectAt(300, 1000, 2000, 40)]; // a wide floor well below both actors

  it("stays dormant until the player is within range and roughly level", () => {
    const e = newLungerEnemy("l1", 300, 500);
    const far = stepLungerEnemy(e, 1 / 60, { x: 3000, y: e.feetY - ENEMY_H / 2 }, platforms);
    expect(far.lungeState).toBe("patrol");

    const offLevel = stepLungerEnemy(e, 1 / 60, { x: e.x + 50, y: e.feetY - ENEMY_H / 2 - 5000 }, platforms);
    expect(offLevel.lungeState).toBe("patrol");
  });

  it("telegraphs for a fixed duration, then dashes toward the player's side and returns to patrol", () => {
    let e = newLungerEnemy("l1", 300, 500);
    const playerCenter = { x: e.x + 100, y: e.feetY - ENEMY_H / 2 };

    e = stepLungerEnemy(e, 1 / 1000, playerCenter, platforms); // one ms: enters range
    expect(e.lungeState).toBe("telegraph");

    // Advance through the telegraph, but not past it.
    e = stepLungerEnemy(e, (ENEMY_LUNGE_TELEGRAPH_MS - 1) / 1000, playerCenter, platforms);
    expect(e.lungeState).toBe("telegraph");

    // Cross into dashing.
    e = stepLungerEnemy(e, 2 / 1000, playerCenter, platforms);
    expect(e.lungeState).toBe("dashing");
    const startX = e.x;

    // Advance through the whole dash.
    e = stepLungerEnemy(e, (ENEMY_LUNGE_DURATION_MS + 1) / 1000, playerCenter, platforms);
    expect(e.lungeState).toBe("patrol");
    // The player was to the right, so the dash should have moved the enemy rightward.
    expect(e.x).toBeGreaterThan(startX);
    expect(e.x).toBeLessThanOrEqual(startX + ENEMY_LUNGE_DISTANCE + 1e-6);
  });

  it("stops its dash early against solid terrain, mirroring the player's own lunge rule", () => {
    let e = newLungerEnemy("l1", 300, 500);
    const playerCenter = { x: e.x + 100, y: e.feetY - ENEMY_H / 2 };
    const wall = rectAt(300 + ENEMY_LUNGE_DISTANCE / 2, 500, ENEMY_W, 200); // a wall halfway along the dash path

    e = stepLungerEnemy(e, 1 / 1000, playerCenter, [wall]);
    e = stepLungerEnemy(e, ENEMY_LUNGE_TELEGRAPH_MS / 1000, playerCenter, [wall]);
    expect(e.lungeState).toBe("dashing");

    e = stepLungerEnemy(e, (ENEMY_LUNGE_DURATION_MS + 1) / 1000, playerCenter, [wall]);
    expect(e.lungeState).toBe("patrol");
    expect(e.x).toBeLessThan(300 + ENEMY_LUNGE_DISTANCE - 1); // blocked well short of the full distance
  });

  it("does not move once dead", () => {
    const dead = { ...newLungerEnemy("l1", 300, 500), alive: false };
    const after = stepLungerEnemy(dead, 1, { x: 300, y: 500 }, platforms);
    expect(after).toEqual(dead);
  });
});

describe("applyLungeSweep", () => {
  it("kills a live enemy exactly once, leaving it dead on repeated sweeps", () => {
    let enemies = [newEnemy("e1", 50, 0, 0, 300)];
    enemies = applyLungeSweep(enemies, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(enemies[0]!.alive).toBe(false);

    // A second sweep over an already-dead enemy is a no-op, not an error.
    enemies = applyLungeSweep(enemies, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(enemies[0]!.alive).toBe(false);
  });

  it("only kills enemies the swept path actually touches", () => {
    const enemies = [newEnemy("near", 50, 0, 0, 300), newEnemy("far", 50, 1000, 900, 1100)];
    const swept = applyLungeSweep(enemies, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(swept.find((e) => e.id === "near")!.alive).toBe(false);
    expect(swept.find((e) => e.id === "far")!.alive).toBe(true);
  });
});
