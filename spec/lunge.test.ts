import { describe, expect, it } from "vitest";
import type { Rect } from "../src/core/aabb.ts";
import { LUNGE_DISTANCE, LUNGE_DURATION_MS } from "../src/sim/constants.ts";
import { applyLungeSweep, newEnemy } from "../src/sim/enemy.ts";
import { dashPosition, idleLunge, resolveAimEndpoint, stepLunge } from "../src/sim/lunge.ts";

const NO_PLATFORMS: Rect[] = [];
const START = { x: 0, y: 0 };

describe("resolveAimEndpoint (flagship rule: enemies never stop or shorten a lunge)", () => {
  it("kills an enemy in the path without the endpoint moving at all", () => {
    // An enemy standing well clear of any wall, directly in the aim path.
    const withoutEnemy = resolveAimEndpoint(START, { x: 1, y: 0 }, 1, NO_PLATFORMS);
    const enemy = newEnemy("e1", 150, 0, 100, 200);

    // The endpoint calculation only ever looks at platforms -- an enemy isn't
    // one, so its presence can't be represented to resolveAimEndpoint at all,
    // which is the point: there is no code path by which an enemy could
    // shorten the lunge.
    expect(withoutEnemy.x).toBeCloseTo(START.x + LUNGE_DISTANCE);
    expect(withoutEnemy.y).toBeCloseTo(START.y);

    const swept = applyLungeSweep([enemy], START, withoutEnemy);
    expect(swept[0]!.alive).toBe(false);
  });

  it("does stop early against a wall in the path", () => {
    const wall: Rect = { x: 100, y: -50, w: 40, h: 100 };
    const endpoint = resolveAimEndpoint(START, { x: 1, y: 0 }, 1, [wall]);
    expect(endpoint.x).toBeLessThan(START.x + LUNGE_DISTANCE);
    expect(endpoint.x).toBeLessThanOrEqual(wall.x);
  });

  it("kills every enemy lined up along a single dash, none of them stopping it", () => {
    const endpoint = resolveAimEndpoint(START, { x: 1, y: 0 }, 1, NO_PLATFORMS);
    const enemies = [
      newEnemy("a", 50, 0, 0, 300),
      newEnemy("b", 150, 0, 0, 300),
      newEnemy("c", 250, 0, 0, 300),
    ];
    const swept = applyLungeSweep(enemies, START, endpoint);
    expect(swept.every((e) => !e.alive)).toBe(true);
    expect(endpoint.x).toBeCloseTo(START.x + LUNGE_DISTANCE);
  });

  it("does not kill an enemy standing off the swept path", () => {
    const endpoint = resolveAimEndpoint(START, { x: 1, y: 0 }, 1, NO_PLATFORMS);
    const farAway = newEnemy("e1", 150, 500, 100, 200);
    const swept = applyLungeSweep([farAway], START, endpoint);
    expect(swept[0]!.alive).toBe(true);
  });

  it("snaps to facing when the aim vector is inside the deadzone", () => {
    const facingRight = resolveAimEndpoint(START, { x: 1, y: 1 }, 1, NO_PLATFORMS);
    const facingLeft = resolveAimEndpoint(START, { x: -1, y: -1 }, -1, NO_PLATFORMS);
    expect(facingRight.x).toBeCloseTo(START.x + LUNGE_DISTANCE);
    expect(facingLeft.x).toBeCloseTo(START.x - LUNGE_DISTANCE);
  });

  it("aims freely in any direction, not just left/right", () => {
    const up = resolveAimEndpoint(START, { x: 0, y: -100 }, 1, NO_PLATFORMS);
    expect(up.y).toBeCloseTo(START.y - LUNGE_DISTANCE);
    expect(up.x).toBeCloseTo(START.x);
  });
});

describe("stepLunge state machine", () => {
  it("does nothing on press with no dash charge available", () => {
    const result = stepLunge(
      idleLunge(),
      { held: true, aimVector: { x: 1, y: 0 } },
      START,
      1,
      false,
      NO_PLATFORMS,
      16,
    );
    expect(result.state.kind).toBe("idle");
    expect(result.fired).toBeNull();
  });

  it("enters aiming on press when a charge is available, and time-freezes there indefinitely", () => {
    let result = stepLunge(
      idleLunge(),
      { held: true, aimVector: { x: 1, y: 0 } },
      START,
      1,
      true,
      NO_PLATFORMS,
      16,
    );
    expect(result.state.kind).toBe("aiming");

    // Holding for a long real-time span doesn't advance or expire anything.
    for (let i = 0; i < 500; i++) {
      result = stepLunge(result.state, { held: true, aimVector: { x: 1, y: 0 } }, START, 1, true, NO_PLATFORMS, 16);
    }
    expect(result.state.kind).toBe("aiming");
  });

  it("fires exactly once, on release, using the aim at the moment of release", () => {
    const aiming = stepLunge(idleLunge(), { held: true, aimVector: { x: 100, y: 0 } }, START, 1, true, NO_PLATFORMS, 16)
      .state;
    const released = stepLunge(
      aiming,
      { held: false, aimVector: { x: 0, y: -100 } },
      START,
      1,
      true,
      NO_PLATFORMS,
      16,
    );
    expect(released.state.kind).toBe("dashing");
    expect(released.fired).not.toBeNull();
    expect(released.fired!.to.y).toBeCloseTo(START.y - LUNGE_DISTANCE);
  });

  it("returns to idle once the dash duration elapses", () => {
    let state = stepLunge(idleLunge(), { held: true, aimVector: { x: 1, y: 0 } }, START, 1, true, NO_PLATFORMS, 16)
      .state;
    state = stepLunge(state, { held: false, aimVector: { x: 1, y: 0 } }, START, 1, true, NO_PLATFORMS, 16).state;
    expect(state.kind).toBe("dashing");

    state = stepLunge(state, { held: false, aimVector: { x: 1, y: 0 } }, START, 1, true, NO_PLATFORMS, LUNGE_DURATION_MS + 1)
      .state;
    expect(state.kind).toBe("idle");
  });
});

describe("dashPosition", () => {
  it("interpolates linearly and clamps at the endpoint", () => {
    const dashing = { kind: "dashing" as const, from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, elapsedMs: 0 };
    expect(dashPosition(dashing).x).toBe(0);
    expect(dashPosition({ ...dashing, elapsedMs: LUNGE_DURATION_MS / 2 }).x).toBeCloseTo(50);
    expect(dashPosition({ ...dashing, elapsedMs: LUNGE_DURATION_MS * 10 }).x).toBe(100);
  });
});
