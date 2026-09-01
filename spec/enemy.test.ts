import { describe, expect, it } from "vitest";
import { applyLungeSweep, newEnemy, stepEnemy } from "../src/sim/enemy.ts";
import { ENEMY_PATROL_SPEED } from "../src/sim/constants.ts";

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
