// Rects, overlap, and the one sweep both the lunge and its aim-time preview
// lean on.
//
// The flush convention: overlap is STRICT inequality on every axis, no
// epsilon skin. Touching is not overlapping -- a body resting exactly on a
// platform's top edge, or a dash passing exactly along its surface, is not
// "inside" it. Getting this wrong is what makes standing still sink you into
// the floor, or makes a horizontal dash along the ground register as
// instantly blocked by the ground itself.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** A box of size (w, h) whose bottom-center sits at (centerX, feetY). */
export function rectAt(centerX: number, feetY: number, w: number, h: number): Rect {
  return { x: centerX - w / 2, y: feetY - h, w, h };
}

/**
 * Sweep a box of size (boxW, boxH) whose center travels from `from` to `to`,
 * and find the earliest fraction t in [0, 1] at which it first touches any
 * rect in `blockers`. Returns 1 if it never touches anything -- the box
 * travels the full distance unobstructed.
 *
 * This is a Minkowski-sum sweep: each blocker is expanded by half the moving
 * box's size on every side, reducing the problem to a point (the box's
 * center) crossing an expanded rect. It's the shared logic behind both the
 * lunge's real execution and its aim-time preview line -- they must never
 * disagree about where a dash would land, so there is exactly one
 * implementation of "how far can this travel before solid terrain stops it".
 */
export function sweepToFirstBlock(
  from: Readonly<{ x: number; y: number }>,
  to: Readonly<{ x: number; y: number }>,
  boxW: number,
  boxH: number,
  blockers: readonly Rect[],
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let earliest = 1;

  for (const b of blockers) {
    const expanded: Rect = {
      x: b.x - boxW / 2,
      y: b.y - boxH / 2,
      w: b.w + boxW,
      h: b.h + boxH,
    };
    const t = segmentEntryTime(from.x, from.y, dx, dy, expanded);
    if (t !== null && t < earliest) earliest = t;
  }

  return earliest;
}

/**
 * Slab-method ray/rect intersection, restricted to t in [0, 1]. Returns the
 * entry fraction, or null if the segment never enters the rect's interior.
 */
function segmentEntryTime(x: number, y: number, dx: number, dy: number, r: Rect): number | null {
  let tMin = 0;
  let tMax = 1;

  const axes: [number, number, number, number][] = [
    [x, dx, r.x, r.x + r.w],
    [y, dy, r.y, r.y + r.h],
  ];

  for (const [pos, delta, lo, hi] of axes) {
    if (Math.abs(delta) < 1e-9) {
      // Parallel to this axis: the whole segment must already be strictly
      // inside the slab, or it never enters the rect at all.
      if (pos <= lo || pos >= hi) return null;
      continue;
    }
    let t0 = (lo - pos) / delta;
    let t1 = (hi - pos) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return null;
  }

  return tMin;
}
