// A Pose is a deformation applied to an entity's rect at draw time. It carries
// no colour and no drawing -- just where a rect goes and how it is stretched.
//
// Why this exists: the renderer used to select one of four hardcoded poses in
// an if/else chain, each branch writing drawY/w/h directly. That meant two
// effects could never apply at once (only one branch runs), and the
// bottom-centre anchoring arithmetic was copy-pasted at four sites with two
// different conventions for how width should respond to height. `compose` fixes
// the first -- poses layer instead of overriding -- and `applyPose` fixes the
// second by being the only place the anchor is expressed.

import type { Rect } from "../core/aabb.ts";

export interface Pose {
  /** Translation, applied after scaling. */
  dx: number;
  dy: number;
  /** Multipliers about the anchor (bottom-centre). 1 is undeformed. */
  scaleX: number;
  scaleY: number;
  /** 0..1. Not part of the rect -- the caller applies it to the context. */
  alpha: number;
}

export const IDENTITY: Pose = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, alpha: 1 };

/** A pose that differs from IDENTITY in only the fields you name. */
export function pose(partial: Partial<Pose>): Pose {
  return { ...IDENTITY, ...partial };
}

/**
 * Layer two poses. Translations add, scales and alpha multiply -- so composing
 * with IDENTITY changes nothing, and order never matters.
 *
 * This is the whole point of the type: "walking, and also recovering from a
 * landing" is one composition rather than a fifth branch that has to re-derive
 * what the other four already knew.
 */
export function compose(a: Readonly<Pose>, b: Readonly<Pose>): Pose {
  return {
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    scaleX: a.scaleX * b.scaleX,
    scaleY: a.scaleY * b.scaleY,
    alpha: a.alpha * b.alpha,
  };
}

export function composeAll(poses: readonly Pose[]): Pose {
  return poses.reduce(compose, IDENTITY);
}

/**
 * Cartoon squash-and-stretch about the bottom-centre anchor. Positive `amount`
 * stretches vertically and narrows horizontally.
 *
 * `widthRatio` is how hard width answers back: 0.5 reads as soft and weighty
 * (an enemy settling), 1 as rubbery (a walk cycle). It's explicit because the
 * two call sites this replaces silently disagreed about it, and the difference
 * is the entire character of the motion.
 */
export function squash(amount: number, widthRatio = 0.5): Pose {
  return pose({ scaleY: 1 + amount, scaleX: 1 - amount * widthRatio });
}

/**
 * Deform a rect by a pose, anchored at its bottom centre -- feet stay planted
 * and the entity grows upward, which is what every entity in this game wants
 * (they are all bottom-anchored via `feetY`).
 */
export function applyPose(r: Readonly<Rect>, p: Readonly<Pose>): Rect {
  const w = r.w * p.scaleX;
  const h = r.h * p.scaleY;
  return {
    x: r.x + (r.w - w) / 2 + p.dx,
    y: r.y + (r.h - h) + p.dy,
    w,
    h,
  };
}
