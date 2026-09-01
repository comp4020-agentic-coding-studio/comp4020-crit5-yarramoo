// Minimal 2D vector helpers. Plain objects rather than a class: they cross
// into render/input code constantly, and a class buys nothing here.

export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Zero-guarded: normalising a vector shorter than `eps` returns a zero vector, not NaN. */
export function normalize(v: Vec2, eps = 1e-9): Vec2 {
  const len = length(v);
  if (len < eps) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Clamp a vector's length to at most `max`, preserving its direction. */
export function clampLength(v: Vec2, max: number): Vec2 {
  const len = length(v);
  if (len <= max || len === 0) return v;
  return scale(v, max / len);
}
