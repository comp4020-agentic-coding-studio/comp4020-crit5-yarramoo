// Touch: left half of the canvas is move (drag left/right from where you
// touched down) plus a jump band along its bottom edge; the right half is
// the aim/fire drag zone -- touch and hold to freeze time and aim, lift to
// fire, exactly like the desktop mouse button but with the pointer's own
// position standing in for the cursor.

import type { InputSource, PointerInput } from "./types.ts";

const JOYSTICK_DEADZONE_PX = 12;
const JUMP_BAND_HEIGHT_PX = 96;

interface TrackedTouch {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
}

export function createTouchInput(canvas: HTMLCanvasElement): InputSource {
  let moveTouch: TrackedTouch | null = null;
  let jumpTouch: TrackedTouch | null = null;
  let aimTouch: TrackedTouch | null = null;
  // The last real aim position, kept even after the touch lifts. A lift
  // nulls aimTouch synchronously in the DOM event, before the game loop's
  // next read() -- and that next read() is exactly the one stepLunge uses to
  // resolve the fired dash. Falling back to a canvas-center default there
  // (as if aiming had never happened) would fire the dash in whatever
  // direction the center happens to be, not the direction actually aimed.
  let lastAimPointer = { x: canvas.width / 2, y: canvas.height / 2 };

  function toCanvasPoint(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const p = toCanvasPoint(e);
    const touch: TrackedTouch = { pointerId: e.pointerId, startX: p.x, startY: p.y, x: p.x, y: p.y };

    if (p.x < canvas.width / 2) {
      if (p.y > canvas.height - JUMP_BAND_HEIGHT_PX) {
        if (!jumpTouch) jumpTouch = touch;
      } else if (!moveTouch) {
        moveTouch = touch;
      }
    } else if (!aimTouch) {
      aimTouch = touch;
      lastAimPointer = { x: touch.x, y: touch.y };
    }
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    const p = toCanvasPoint(e);
    if (moveTouch?.pointerId === e.pointerId) {
      moveTouch.x = p.x;
      moveTouch.y = p.y;
    } else if (aimTouch?.pointerId === e.pointerId) {
      aimTouch.x = p.x;
      aimTouch.y = p.y;
      lastAimPointer = { x: p.x, y: p.y };
    }
  };

  const endTouch = (e: PointerEvent) => {
    if (moveTouch?.pointerId === e.pointerId) moveTouch = null;
    if (jumpTouch?.pointerId === e.pointerId) jumpTouch = null;
    if (aimTouch?.pointerId === e.pointerId) aimTouch = null;
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endTouch);
  canvas.addEventListener("pointercancel", endTouch);

  return {
    read(): PointerInput {
      let moveX: -1 | 0 | 1 = 0;
      if (moveTouch) {
        const dx = moveTouch.x - moveTouch.startX;
        if (dx > JOYSTICK_DEADZONE_PX) moveX = 1;
        else if (dx < -JOYSTICK_DEADZONE_PX) moveX = -1;
      }
      return { moveX, jump: jumpTouch !== null, held: aimTouch !== null, pointer: lastAimPointer };
    },
    detach() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endTouch);
      canvas.removeEventListener("pointercancel", endTouch);
    },
  };
}
