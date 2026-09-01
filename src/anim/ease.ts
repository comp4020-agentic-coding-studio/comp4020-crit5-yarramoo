// Easing and oscillation. Pure, deterministic, and time-as-an-argument: no
// module in here ever reads a clock (spec/purity.test.ts enforces that).
//
// Everything is phrased in TURNS rather than radians. A turn is one full cycle,
// so `wave(elapsedMs / periodMs)` reads as "how far through the cycle are we"
// with no stray 2*PI at the call site -- which is where the factor kept getting
// mixed up with a per-entity phase offset in the old renderer.

/** Clamp to the 0..1 an easing curve is defined on. */
export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

/** Slow out. The default for anything decaying or settling. */
export const outQuad = (t: number): number => {
  const u = 1 - clamp01(t);
  return 1 - u * u;
};

/** Slow in. For anything winding up. */
export const inQuad = (t: number): number => {
  const u = clamp01(t);
  return u * u;
};

/**
 * A full 0 -> 1 -> 0 round trip across t in [0, 1], flattest at its peak.
 *
 * The shape almost every transient "pop" wants, and the same curve the hopper's
 * hop already uses in the sim (enemy.ts's hopFeetY) -- which is exactly why it
 * has visible hangtime at the top.
 */
export const arch = (t: number): number => Math.sin(clamp01(t) * Math.PI);

/** Continuous oscillation, -1..1, from a phase measured in turns. */
export const wave = (turns: number): number => Math.sin(turns * Math.PI * 2);

/**
 * A stable 0..1 phase offset derived from an id, so identical entities don't
 * animate in lockstep.
 *
 * Deterministic by construction: the same id always gives the same offset, on
 * any machine and in any run, which is what keeps it usable from a pure module.
 * The double modulo is load-bearing -- `hash | 0` is a SIGNED 32-bit int, so
 * `hash % 1000` can be negative, and the previous version of this returned a
 * negative "0..1" phase for roughly half of all ids. Harmless once it reached
 * Math.sin, but the claim was false and nothing could see it.
 */
export function hashTurns(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (((hash % 1000) + 1000) % 1000) / 1000;
}
