// Canvas 2D rendering. Reads a Game and draws it -- never mutates it, never
// decides anything about it. The one piece of game logic this file leans on
// is resolveAimEndpoint, called read-only for the aim-time preview line: it's
// the same sweep the real dash uses, so the line drawn on screen and the dash
// that actually fires can never disagree about where a shot would land.

import type { Rect } from "../core/aabb.ts";
import type { Vec2 } from "../core/vec.ts";
import { bodyRect } from "../sim/body.ts";
import { ENEMY_H, ENEMY_W, PLAYER_H } from "../sim/constants.ts";
import { enemyRect } from "../sim/enemy.ts";
import type { Game } from "../sim/game.ts";
import { resolveAimEndpoint } from "../sim/lunge.ts";

export interface Camera {
  x: number;
  y: number;
}

const centerYOf = (feetY: number): number => feetY - PLAYER_H / 2;

/** Where the camera should sit, in world units, to frame the player within a canvasW x canvasH viewport. */
export function computeCamera(game: Readonly<Game>, canvasW: number, canvasH: number): Camera {
  const b = game.level.bounds;
  const x = clampAxis(game.body.x - canvasW / 2, b.x, b.w, canvasW);
  const y = clampAxis(centerYOf(game.body.feetY) - canvasH * 0.6, b.y, b.h, canvasH);
  return { x, y };
}

function clampAxis(desired: number, boundsMin: number, boundsSize: number, viewportSize: number): number {
  if (boundsSize <= viewportSize) return boundsMin - (viewportSize - boundsSize) / 2;
  return Math.min(Math.max(desired, boundsMin), boundsMin + boundsSize - viewportSize);
}

const COLORS = {
  sky: "#1a1f2e",
  platform: "#3a4a63",
  platformEdge: "#5a7099",
  player: "#f2c94c",
  enemy: "#e05c5c",
  goal: "#5ce0a0",
  aimLine: "rgba(255, 255, 255, 0.55)",
  aimMarker: "#ffffff",
};

export function render(ctx: CanvasRenderingContext2D, game: Readonly<Game>, canvasW: number, canvasH: number): void {
  const camera = computeCamera(game, canvasW, canvasH);
  const toScreen = (p: Vec2): Vec2 => ({ x: p.x - camera.x, y: p.y - camera.y });
  const rectToScreen = (r: Rect): Rect => ({ x: r.x - camera.x, y: r.y - camera.y, w: r.w, h: r.h });

  ctx.fillStyle = COLORS.sky;
  ctx.fillRect(0, 0, canvasW, canvasH);

  for (const platform of game.level.platforms) {
    const r = rectToScreen(platform);
    ctx.fillStyle = COLORS.platform;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = COLORS.platformEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  const goal = rectToScreen(game.level.goal);
  ctx.fillStyle = COLORS.goal;
  ctx.fillRect(goal.x, goal.y, goal.w, goal.h);

  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;
    const r = rectToScreen(enemyRect(enemy));
    ctx.fillStyle = COLORS.enemy;
    ctx.fillRect(r.x, r.y, ENEMY_W, ENEMY_H);
  }

  if (game.lunge.kind === "aiming") {
    const playerCenter: Vec2 = { x: game.body.x, y: centerYOf(game.body.feetY) };
    const endpoint = resolveAimEndpoint(
      playerCenter,
      game.lunge.aimVector,
      game.body.facing,
      game.level.platforms,
    );
    const from = toScreen(playerCenter);
    const to = toScreen(endpoint);

    ctx.save();
    ctx.strokeStyle = COLORS.aimLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = COLORS.aimMarker;
    ctx.beginPath();
    ctx.arc(to.x, to.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const player = rectToScreen(bodyRect(game.body));
  ctx.fillStyle = COLORS.player;
  ctx.fillRect(player.x, player.y, player.w, player.h);

  // A small notch on the facing edge -- the only visual cue for direction,
  // since there's no sprite art.
  ctx.fillStyle = COLORS.sky;
  const notchX = game.body.facing > 0 ? player.x + player.w - 6 : player.x;
  ctx.fillRect(notchX, player.y + 6, 6, 6);
}
