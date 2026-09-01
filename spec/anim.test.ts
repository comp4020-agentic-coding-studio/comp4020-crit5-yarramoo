// The animation layer is pure, so it can be tested the same way the sim is:
// exact values, bounds held across a long sweep, and no-ops that stay no-ops.
// None of this needs a canvas.

import { describe, expect, it } from "vitest";
import { arch, clamp01, hashTurns, inQuad, outQuad, wave } from "../src/anim/ease.ts";
import { applyPose, compose, composeAll, IDENTITY, pose, squash } from "../src/anim/pose.ts";
import type { Rect } from "../src/core/aabb.ts";

const BOX: Rect = { x: 100, y: 200, w: 24, h: 36 };

describe("easing curves", () => {
  it("all pin their endpoints, so an effect starts and ends neutral", () => {
    for (const f of [clamp01, inQuad, outQuad]) {
      expect(f(0)).toBeCloseTo(0, 10);
      expect(f(1)).toBeCloseTo(1, 10);
    }
  });

  it("stay inside 0..1 across their whole domain, including past the ends", () => {
    for (let t = -0.5; t <= 1.5; t += 0.01) {
      for (const f of [clamp01, inQuad, outQuad, arch]) {
        expect(f(t)).toBeGreaterThanOrEqual(0);
        expect(f(t)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("inQuad starts slow and outQuad ends slow", () => {
    expect(inQuad(0.5)).toBeLessThan(0.5);
    expect(outQuad(0.5)).toBeGreaterThan(0.5);
  });

  it("arch is a round trip that peaks in the middle and returns to zero", () => {
    expect(arch(0)).toBeCloseTo(0, 10);
    expect(arch(0.5)).toBeCloseTo(1, 10);
    expect(arch(1)).toBeCloseTo(0, 10);
    // Flattest at the peak -- the hangtime that makes a pop read as a pop.
    expect(arch(0.5) - arch(0.4)).toBeLessThan(arch(0.2) - arch(0.1));
  });
});

describe("wave", () => {
  it("measures phase in turns, not radians", () => {
    expect(wave(0)).toBeCloseTo(0, 10);
    expect(wave(0.25)).toBeCloseTo(1, 10);
    expect(wave(0.5)).toBeCloseTo(0, 10);
    expect(wave(0.75)).toBeCloseTo(-1, 10);
  });

  it("repeats every whole turn", () => {
    for (const t of [0.1, 0.37, 0.62, 0.99]) {
      expect(wave(t + 3)).toBeCloseTo(wave(t), 10);
    }
  });
});

describe("hashTurns", () => {
  it("is stable for the same id and spreads different ids apart", () => {
    expect(hashTurns("gate3a")).toBe(hashTurns("gate3a"));
    expect(hashTurns("gate3a")).not.toBe(hashTurns("gate3b"));
  });

  it("returns a real 0..1 phase for every id, including ones that hash negative", () => {
    // The bug this pins: `hash | 0` is signed, so `hash % 1000` was negative for
    // roughly half of all ids and the old version returned a negative "0..1".
    const ids = ["a", "bobber", "gate3a", "gate3b", "hopper4", "lunger4", "e1", "zzzzzzzzzzzz"];
    for (const id of ids) {
      expect(hashTurns(id)).toBeGreaterThanOrEqual(0);
      expect(hashTurns(id)).toBeLessThan(1);
    }
  });
});

describe("Pose composition", () => {
  it("composing with IDENTITY changes nothing", () => {
    const p = pose({ dx: 3, dy: -4, scaleX: 0.8, scaleY: 1.2, alpha: 0.5 });
    expect(compose(p, IDENTITY)).toEqual(p);
    expect(compose(IDENTITY, p)).toEqual(p);
  });

  it("adds translations and multiplies scales, so order does not matter", () => {
    const a = pose({ dx: 2, scaleY: 1.5, alpha: 0.5 });
    const b = pose({ dx: 5, scaleY: 2, alpha: 0.4 });
    const ab = compose(a, b);

    expect(ab.dx).toBeCloseTo(7, 10);
    expect(ab.scaleY).toBeCloseTo(3, 10);
    expect(ab.alpha).toBeCloseTo(0.2, 10);
    expect(compose(b, a)).toEqual(ab);
  });

  it("layers two effects at once -- the thing the old if/else chain could not do", () => {
    const walking = squash(0.04, 1);
    const landing = squash(-0.2, 1);
    const both = composeAll([walking, landing]);
    // Neither wins outright; the landing dominates but the walk still shows.
    expect(both.scaleY).toBeCloseTo(1.04 * 0.8, 10);
    expect(both.scaleY).toBeLessThan(walking.scaleY);
    expect(both.scaleY).toBeGreaterThan(landing.scaleY);
  });

  it("composeAll of nothing is IDENTITY", () => {
    expect(composeAll([])).toEqual(IDENTITY);
  });
});

describe("squash", () => {
  it("trades height against width, so a stretch narrows and a squash widens", () => {
    const tall = squash(0.2, 1);
    expect(tall.scaleY).toBeCloseTo(1.2, 10);
    expect(tall.scaleX).toBeCloseTo(0.8, 10);

    const flat = squash(-0.2, 1);
    expect(flat.scaleY).toBeCloseTo(0.8, 10);
    expect(flat.scaleX).toBeCloseTo(1.2, 10);
  });

  it("widthRatio sets how hard width answers back", () => {
    expect(squash(0.2, 0.5).scaleX).toBeCloseTo(0.9, 10);
    expect(squash(0.2, 0).scaleX).toBeCloseTo(1, 10);
  });

  it("zero amount is IDENTITY", () => {
    expect(squash(0)).toEqual(IDENTITY);
  });
});

describe("applyPose", () => {
  it("is a no-op for IDENTITY", () => {
    expect(applyPose(BOX, IDENTITY)).toEqual(BOX);
  });

  it("anchors at the bottom centre: feet stay planted, the entity grows upward", () => {
    const d = applyPose(BOX, pose({ scaleY: 2 }));
    const bottom = (r: Rect): number => r.y + r.h;
    const centreX = (r: Rect): number => r.x + r.w / 2;

    expect(bottom(d)).toBeCloseTo(bottom(BOX), 10);
    expect(centreX(d)).toBeCloseTo(centreX(BOX), 10);
    expect(d.h).toBeCloseTo(BOX.h * 2, 10);
    expect(d.y).toBeLessThan(BOX.y); // grew upward, not downward
  });

  it("keeps the bottom-centre anchor under a horizontal scale too", () => {
    const d = applyPose(BOX, pose({ scaleX: 0.5 }));
    expect(d.x + d.w / 2).toBeCloseTo(BOX.x + BOX.w / 2, 10);
    expect(d.w).toBeCloseTo(BOX.w / 2, 10);
  });

  it("applies translation after scaling", () => {
    const d = applyPose(BOX, pose({ dx: 10, dy: -5 }));
    expect(d.x).toBeCloseTo(BOX.x + 10, 10);
    expect(d.y).toBeCloseTo(BOX.y - 5, 10);
  });

  it("holds the anchor across a full oscillation, at every phase", () => {
    // The invariant the old copy-pasted anchoring arithmetic had no way to state:
    // however hard it squashes, an entity never sinks through its own floor.
    const bottom = BOX.y + BOX.h;
    for (let turns = 0; turns <= 2; turns += 0.01) {
      const d = applyPose(BOX, squash(wave(turns) * 0.08, 0.5));
      expect(d.y + d.h).toBeCloseTo(bottom, 10);
      expect(d.x + d.w / 2).toBeCloseTo(BOX.x + BOX.w / 2, 10);
    }
  });
});
