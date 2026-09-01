import { describe, expect, it } from "vitest";
import type { Rect } from "../src/core/aabb.ts";
import { newBody, stepBody } from "../src/sim/body.ts";
import {
  GRAVITY,
  JUMP_SPEED,
  LUNGE_DISTANCE,
  MAX_JUMP_DISTANCE,
  MOVE_SPEED,
} from "../src/sim/constants.ts";
import { newRun, step as stepRun } from "../src/sim/run.ts";

const GROUND: Rect = { x: -1000, y: 400, w: 3000, h: 100 };

describe("stepBody", () => {
  it("falls under gravity when airborne", () => {
    const body = newBody(0, 0);
    const after = stepBody(body, [], { moveX: 0, jump: false }, 0.1);
    expect(after.vy).toBeCloseTo(GRAVITY * 0.1);
    expect(after.feetY).toBeGreaterThan(body.feetY);
  });

  it("lands on a platform, becomes grounded, and refreshes the dash charge", () => {
    let body = newBody(0, 390); // just above the ground
    body = { ...body, dashCharge: false };
    for (let i = 0; i < 30; i++) {
      body = stepBody(body, [GROUND], { moveX: 0, jump: false }, 1 / 60);
    }
    expect(body.grounded).toBe(true);
    expect(body.feetY).toBe(GROUND.y);
    expect(body.dashCharge).toBe(true);
  });

  it("only jumps when grounded", () => {
    const grounded = { ...newBody(0, GROUND.y), grounded: true };
    const jumped = stepBody(grounded, [GROUND], { moveX: 0, jump: true }, 1 / 60);
    expect(jumped.vy).toBe(-JUMP_SPEED);

    const airborne = { ...newBody(0, GROUND.y - 50), grounded: false };
    const stillFalling = stepBody(airborne, [GROUND], { moveX: 0, jump: true }, 1 / 60);
    expect(stillFalling.vy).toBeGreaterThan(0);
  });

  it("stops horizontal movement at a wall instead of passing through it", () => {
    const wall: Rect = { x: 100, y: 300, w: 40, h: 200 };
    let body = { ...newBody(50, GROUND.y), grounded: true };
    for (let i = 0; i < 120; i++) {
      body = stepBody(body, [GROUND, wall], { moveX: 1, jump: false }, 1 / 60);
    }
    expect(body.x).toBeLessThanOrEqual(wall.x);
    expect(body.vx).toBe(0);
  });

  it("updates facing to match the last horizontal move", () => {
    const body = newBody(0, 0);
    const right = stepBody(body, [], { moveX: 1, jump: false }, 1 / 60);
    expect(right.facing).toBe(1);
    const left = stepBody(right, [], { moveX: -1, jump: false }, 1 / 60);
    expect(left.facing).toBe(-1);
  });
});

describe("derived constants", () => {
  it("MAX_JUMP_DISTANCE matches its own formula", () => {
    const timeToApex = JUMP_SPEED / GRAVITY;
    expect(MAX_JUMP_DISTANCE).toBeCloseTo(MOVE_SPEED * 2 * timeToApex);
  });

  it("the lunge comfortably outreaches the farthest possible jump", () => {
    expect(LUNGE_DISTANCE).toBeGreaterThan(MAX_JUMP_DISTANCE * 1.3);
  });
});

describe("run", () => {
  it("is absorbing: further input after an outcome is a no-op", () => {
    let run = newRun();
    run = stepRun(run, { dtMs: 16, died: true, won: false });
    expect(run.outcome).toBe("lost");
    const ended = run;
    run = stepRun(run, { dtMs: 1000, died: false, won: true });
    expect(run).toEqual(ended);
  });

  it("treats a simultaneous death and win as a loss", () => {
    const run = stepRun(newRun(), { dtMs: 16, died: true, won: true });
    expect(run.outcome).toBe("lost");
  });

  it("wins when told to win and nothing has died", () => {
    const run = stepRun(newRun(), { dtMs: 16, died: false, won: true });
    expect(run.outcome).toBe("won");
  });

  it("stays undecided otherwise, with the clock still advancing", () => {
    const run = stepRun(newRun(), { dtMs: 16, died: false, won: false });
    expect(run.outcome).toBeNull();
    expect(run.elapsedMs).toBe(16);
  });
});
