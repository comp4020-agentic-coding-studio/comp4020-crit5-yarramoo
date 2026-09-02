// Boot: wire game + renderer + input + loop. Nothing else lives here -- no
// HUD, no on-screen instructions. The only DOM beyond the canvas is a restart
// link that stays hidden until the run ends.

import { sub } from "./src/core/vec.ts";
import { createDesktopInput } from "./src/input/desktop.ts";
import { createTouchInput } from "./src/input/touch.ts";
import { shouldUseTouchUI, type InputSource } from "./src/input/types.ts";
import { createSfx } from "./src/audio/sfx.ts";
import { computeCamera, render } from "./src/render/renderer.ts";
import { newGame, stepGame, type Game, type GameInput } from "./src/sim/game.ts";
import { LEVELS } from "./src/sim/level.ts";
import { PLAYER_H } from "./src/sim/constants.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;
const restartLink = document.querySelector<HTMLAnchorElement>("#restart")!;

function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

let levelIndex = 0;
let game: Game = newGame(LEVELS[levelIndex]!);
const input: InputSource = shouldUseTouchUI() ? createTouchInput(canvas) : createDesktopInput(canvas);

// Audio needs a real gesture before it will make a sound, and it needs to be
// silenceable without any on-screen furniture (the brief allows no text). Both
// ride on listeners that are already justified: any input unlocks it, and "m"
// mutes.
const sfx = createSfx();
const unlock = (): void => sfx.unlock();
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);
window.addEventListener("keydown", (e) => {
  if (e.key === "m" || e.key === "M") sfx.toggleMute();
});

restartLink.hidden = true;
restartLink.addEventListener("click", (e) => {
  e.preventDefault();
  // The restart link is only ever shown on a loss (restart the level just
  // failed) or a win on the LAST level (loop back to the start) -- a win on
  // any earlier level auto-advances in the frame loop below and never
  // reaches a rendered frame with the link visible.
  if (game.run.outcome === "won") levelIndex = 0;
  game = newGame(LEVELS[levelIndex]!);
  restartLink.hidden = true;
});

let lastTime: number | null = null;

function frame(now: number): void {
  const dtMs = lastTime === null ? 0 : Math.min(now - lastTime, 50);
  lastTime = now;

  const raw = input.read();
  const camera = computeCamera(game, canvas.width, canvas.height);
  const playerCenter = { x: game.body.x, y: game.body.feetY - PLAYER_H / 2 };
  const worldPointer = { x: raw.pointer.x + camera.x, y: raw.pointer.y + camera.y };

  const gameInput: GameInput = {
    move: { moveX: raw.moveX, jump: raw.jump },
    lunge: { held: raw.held, cancel: raw.cancel, aimVector: sub(worldPointer, playerCenter) },
  };

  game = stepGame(game, gameInput, dtMs);
  sfx.play(game.events);

  // Advance immediately on a non-final win -- no pause, no restart link.
  if (game.run.outcome === "won" && levelIndex < LEVELS.length - 1) {
    levelIndex++;
    game = newGame(LEVELS[levelIndex]!);
  }

  render(ctx, game, canvas.width, canvas.height, now);

  restartLink.hidden = game.run.outcome === null;
  if (game.run.outcome === "won") restartLink.textContent = "You win — play again";
  else if (game.run.outcome === "lost") restartLink.textContent = "You died — try again";

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
