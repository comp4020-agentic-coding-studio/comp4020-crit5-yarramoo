// The one seam game logic reads through, regardless of which device produced
// it. Desktop (mouse + keyboard) and touch each implement this identically --
// main.ts's loop never knows which one it's holding.

import type { Vec2 } from "../core/vec.ts";

export interface PointerInput {
  /** -1, 0, or 1. */
  moveX: -1 | 0 | 1;
  jump: boolean;
  /** Is the aim/fire button or touch currently held? */
  held: boolean;
  /**
   * Abort the aim without firing. Desktop is Escape; touch reuses the jump
   * band, which is dead weight while time is frozen anyway (stepBody does not
   * run mid-aim, so a jump pressed then is already swallowed).
   */
  cancel: boolean;
  /** The aim pointer's current position, in canvas pixel coordinates. */
  pointer: Vec2;
}

export interface InputSource {
  read(): PointerInput;
  /** Release any DOM listeners this source attached. */
  detach(): void;
}

/** True when the primary pointer is touch, not a mouse -- picks which InputSource main.ts wires up. */
export function shouldUseTouchUI(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}
