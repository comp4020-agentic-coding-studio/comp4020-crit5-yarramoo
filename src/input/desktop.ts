// Keyboard + mouse: arrows/WASD to move, Space to jump, mouse position to
// aim, left button held to freeze time and fire on release.

import type { InputSource, PointerInput } from "./types.ts";

const LEFT_KEYS = new Set(["ArrowLeft", "a", "A"]);
const RIGHT_KEYS = new Set(["ArrowRight", "d", "D"]);
const JUMP_KEYS = new Set(["Space", "ArrowUp", "w", "W"]);
const CANCEL_KEYS = new Set(["Escape"]);

export function createDesktopInput(canvas: HTMLCanvasElement): InputSource {
  const keysDown = new Set<string>();
  let pointer = { x: canvas.width / 2, y: canvas.height / 2 };
  let held = false;

  const onKeyDown = (e: KeyboardEvent) => keysDown.add(e.key === " " ? "Space" : e.key);
  const onKeyUp = (e: KeyboardEvent) => keysDown.delete(e.key === " " ? "Space" : e.key);
  const onMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer = {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) held = true;
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) held = false;
  };
  // Releasing outside the canvas (or the window losing focus) must still end
  // the hold -- otherwise a shot can be left permanently "aiming".
  const onBlur = () => (held = false);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("blur", onBlur);

  function anyDown(keys: Set<string>): boolean {
    for (const k of keysDown) if (keys.has(k)) return true;
    return false;
  }

  return {
    read(): PointerInput {
      const left = anyDown(LEFT_KEYS);
      const right = anyDown(RIGHT_KEYS);
      const moveX = left === right ? 0 : left ? -1 : 1;
      return { moveX, jump: anyDown(JUMP_KEYS), held, cancel: anyDown(CANCEL_KEYS), pointer };
    },
    detach() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}
