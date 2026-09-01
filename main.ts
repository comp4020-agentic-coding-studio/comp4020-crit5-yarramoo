// Boot: wire game + renderer + input + loop. Nothing else lives here -- no
// HUD, no on-screen instructions. The only DOM beyond the canvas is a restart
// link that stays hidden until the run ends.

import { sub } from "./src/core/vec.ts";
import { createDesktopInput } from "./src/input/desktop.ts";
import { createTouchInput } from "./src/input/touch.ts";
import { shouldUseTouchUI, type InputSource } from "./src/input/types.ts";
import { computeCamera, render } from "./src/render/renderer.ts";
import { newGame, stepGame, type Game, type GameInput } from "./src/sim/game.ts";
import { buildLevel } from "./src/sim/level.ts";
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

const level = buildLevel();
let game: Game = newGame(level);
const input: InputSource = shouldUseTouchUI() ? createTouchInput(canvas) : createDesktopInput(canvas);

restartLink.hidden = true;
restartLink.addEventListener("click", (e) => {
  e.preventDefault();
  game = newGame(level);
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
    lunge: { held: raw.held, aimVector: sub(worldPointer, playerCenter) },
  };

  game = stepGame(game, gameInput, dtMs);
  render(ctx, game, canvas.width, canvas.height);

  restartLink.hidden = game.run.outcome === null;
  if (game.run.outcome === "won") restartLink.textContent = "You win — play again";
  else if (game.run.outcome === "lost") restartLink.textContent = "You died — try again";

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
