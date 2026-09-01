// computeCamera is exported, pure and deterministic, and had no tests at all --
// the one piece of src/render/ that never needed a canvas to verify.
//
// It is worth testing now specifically because it is about to get a second
// caller's worth of pressure: it is already computed twice per frame (main.ts
// maps the screen pointer into world space with it, renderer.ts draws with it),
// and any camera effect later -- smoothing, lookahead, shake -- has to keep
// those two in agreement or the aim line stops pointing where the mouse is.
// These tests pin the framing rules that any such change must preserve.

import { describe, expect, it } from "vitest";
import type { Rect } from "../src/core/aabb.ts";
import { computeCamera } from "../src/render/renderer.ts";
import { PLAYER_H } from "../src/sim/constants.ts";
import { newGame, type Game } from "../src/sim/game.ts";
import { buildLevel } from "../src/sim/level.ts";

const CANVAS_W = 800;
const CANVAS_H = 600;

/** A real Game, with only the two things computeCamera actually reads overridden. */
function gameAt(x: number, feetY: number, bounds: Rect): Game {
  const g = newGame(buildLevel());
  return { ...g, level: { ...g.level, bounds }, body: { ...g.body, x, feetY } };
}

/** Bounds comfortably larger than the viewport on both axes, so clamping is live. */
const WIDE: Rect = { x: 0, y: 0, w: 2000, h: 1000 };

describe("computeCamera frames the player", () => {
  it("centres the player horizontally when they are clear of both bounds", () => {
    const cam = computeCamera(gameAt(1000, 500, WIDE), CANVAS_W, CANVAS_H);
    expect(cam.x).toBe(1000 - CANVAS_W / 2);
    // i.e. the player lands exactly mid-screen.
    expect(1000 - cam.x).toBe(CANVAS_W / 2);
  });

  it("puts the player above centre, not on it, so there is room to see what is ahead below", () => {
    const cam = computeCamera(gameAt(1000, 500, WIDE), CANVAS_W, CANVAS_H);
    const playerScreenY = 500 - PLAYER_H / 2 - cam.y;
    expect(playerScreenY).toBeCloseTo(CANVAS_H * 0.6, 6);
    expect(playerScreenY).toBeGreaterThan(CANVAS_H / 2);
  });
});

describe("computeCamera never shows outside the level bounds", () => {
  it("stops at the left edge instead of following the player past it", () => {
    const cam = computeCamera(gameAt(100, 500, WIDE), CANVAS_W, CANVAS_H);
    expect(cam.x).toBe(WIDE.x);
  });

  it("stops at the right edge instead of following the player past it", () => {
    const cam = computeCamera(gameAt(1950, 500, WIDE), CANVAS_W, CANVAS_H);
    expect(cam.x).toBe(WIDE.x + WIDE.w - CANVAS_W);
    expect(cam.x + CANVAS_W).toBe(WIDE.x + WIDE.w);
  });

  it("stops at the top and bottom edges too", () => {
    const high = computeCamera(gameAt(1000, 60, WIDE), CANVAS_W, CANVAS_H);
    expect(high.y).toBe(WIDE.y);

    const low = computeCamera(gameAt(1000, 990, WIDE), CANVAS_W, CANVAS_H);
    expect(low.y).toBe(WIDE.y + WIDE.h - CANVAS_H);
  });

  it("holds that invariant across the whole width, at every position", () => {
    for (let x = WIDE.x; x <= WIDE.x + WIDE.w; x += 25) {
      const cam = computeCamera(gameAt(x, 500, WIDE), CANVAS_W, CANVAS_H);
      expect(cam.x).toBeGreaterThanOrEqual(WIDE.x);
      expect(cam.x + CANVAS_W).toBeLessThanOrEqual(WIDE.x + WIDE.w);
    }
  });
});

describe("computeCamera with bounds smaller than the viewport", () => {
  // The branch a level only hits if its bounds are narrower than the window --
  // easy to reach on a wide monitor, and the one case where "clamp" is the
  // wrong idea entirely: there is nothing to clamp to, so the bounds are
  // centred in the viewport instead and the player is allowed off-centre.
  const NARROW: Rect = { x: 0, y: 0, w: 500, h: 300 };

  it("centres the bounds in the viewport rather than clamping to an edge", () => {
    const cam = computeCamera(gameAt(250, 200, NARROW), CANVAS_W, CANVAS_H);
    expect(cam.x).toBe(-(CANVAS_W - NARROW.w) / 2);
    expect(cam.y).toBe(-(CANVAS_H - NARROW.h) / 2);

    // The bounds sit centred on screen: equal margin either side.
    const leftMargin = NARROW.x - cam.x;
    const rightMargin = cam.x + CANVAS_W - (NARROW.x + NARROW.w);
    expect(leftMargin).toBeCloseTo(rightMargin, 6);
  });

  it("gives the same framing wherever the player stands inside those bounds", () => {
    const a = computeCamera(gameAt(10, 200, NARROW), CANVAS_W, CANVAS_H);
    const b = computeCamera(gameAt(490, 200, NARROW), CANVAS_W, CANVAS_H);
    expect(a.x).toBe(b.x);
  });
});
