// A platform that oscillates back and forth along one axis between two
// bounds -- the same bounce arithmetic as enemy patrol, applied to a solid
// rect a player can stand on and be carried by.

import type { Rect } from "../core/aabb.ts";
import { bounce } from "./oscillate.ts";

export interface MovingPlatform {
  id: string;
  axis: "x" | "y";
  x: number; // top-left, same convention as a static platform Rect
  y: number;
  w: number;
  h: number;
  min: number;
  max: number;
  speed: number; // magnitude
  v: number; // current signed velocity along `axis`
}

export function newMovingPlatform(
  id: string,
  axis: "x" | "y",
  x: number,
  y: number,
  w: number,
  h: number,
  min: number,
  max: number,
  speed: number,
): MovingPlatform {
  return { id, axis, x, y, w, h, min, max, speed, v: speed };
}

export function platformRect(mp: Readonly<MovingPlatform>): Rect {
  return { x: mp.x, y: mp.y, w: mp.w, h: mp.h };
}

/** Bounce between min and max along the platform's axis, at a constant speed. */
export function stepMovingPlatform(mp: Readonly<MovingPlatform>, dtSec: number): MovingPlatform {
  const before = mp.axis === "x" ? mp.x : mp.y;
  const advanced = before + mp.v * dtSec;
  const { pos, v } = bounce(advanced, mp.v, mp.min, mp.max, mp.speed);
  return mp.axis === "x" ? { ...mp, x: pos, v } : { ...mp, y: pos, v };
}
