// A single ping-pong step, shared by horizontal/vertical enemy patrol and
// moving platforms -- three call sites doing the same "advance, then bounce
// off a bound and reverse" arithmetic.

/** Given a position already advanced by one frame, clamp it to [min, max] and flip v if it hit either bound. */
export function bounce(
  pos: number,
  v: number,
  min: number,
  max: number,
  speed: number,
): { pos: number; v: number } {
  if (pos <= min) return { pos: min, v: speed };
  if (pos >= max) return { pos: max, v: -speed };
  return { pos, v };
}
