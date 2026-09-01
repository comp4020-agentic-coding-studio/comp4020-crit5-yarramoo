// Canvas 2D rendering. Reads a Game and draws it -- never mutates it, never
// decides anything about it. The one piece of game logic this file leans on
// is resolveAimEndpoint, called read-only for the aim-time preview line: it's
// the same sweep the real dash uses, so the line drawn on screen and the dash
// that actually fires can never disagree about where a shot would land.

import type { Rect } from "../core/aabb.ts";
import type { Vec2 } from "../core/vec.ts";
import { bodyRect } from "../sim/body.ts";
import { AIM_METER_MAX_MS, ENEMY_LUNGE_TELEGRAPH_MS, PLAYER_H } from "../sim/constants.ts";
import { enemyRect, type Enemy } from "../sim/enemy.ts";
import type { Game } from "../sim/game.ts";
import { resolveAimEndpoint } from "../sim/lunge.ts";
import { platformRect } from "../sim/platform.ts";

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
  platformMoving: "#3a5f4a",
  platformMovingEdge: "#5ca57a",
  player: "#f2c94c",
  playerAiming: "#f2e29c",
  enemy: "#e05c5c",
  goal: "#5ce0a0",
  aimMarkerFull: { r: 255, g: 255, b: 255 },
  aimMarkerEmpty: { r: 224, g: 60, b: 60 },
};

/** White at a full meter, reddening as it drains -- the only on-screen cue the meter exists. */
function aimColor(meterFraction: number): string {
  const t = Math.max(0, Math.min(1, meterFraction));
  const { r: r0, g: g0, b: b0 } = COLORS.aimMarkerEmpty;
  const { r: r1, g: g1, b: b1 } = COLORS.aimMarkerFull;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/** A stable per-enemy phase offset (radians) so identical enemies don't bob in lockstep. */
function phaseOffset(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (hash % 1000) / 1000 * Math.PI * 2;
}

const WALK_STRIDE = 30; // u of horizontal travel per full leg-swing cycle
const IDLE_BOB_PERIOD_MS = 900;
const IDLE_BOB_AMOUNT = 2; // px
const PATROL_BOB_PERIOD_MS = 700;
const PATROL_SQUASH_AMOUNT = 0.08; // fraction of height

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Readonly<Enemy>, r: Rect, nowMs: number): void {
  if (enemy.kind === "lunger" && enemy.lungeState === "telegraph") {
    // A fast, accelerating flash reads as "about to fire" -- the only warning
    // before a lunger's dash, same fairness contract as the player reading an
    // aim line before committing.
    const t = enemy.lungeElapsedMs / ENEMY_LUNGE_TELEGRAPH_MS;
    const flashOn = Math.floor(t * 16) % 2 === 0;
    ctx.fillStyle = flashOn ? "#ffffff" : COLORS.enemy;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    return;
  }

  // Squash-and-stretch bob, purely cosmetic -- derived from wall-clock time
  // plus a per-id offset, not from patrol phase, so it never has to agree
  // with the sim's own bounce timing to look right.
  const phase = nowMs / PATROL_BOB_PERIOD_MS * Math.PI * 2 + phaseOffset(enemy.id);
  const squash = 1 + Math.sin(phase) * PATROL_SQUASH_AMOUNT;
  const h = r.h * squash;
  const w = r.w * (1 + (1 - squash) * 0.5); // slight inverse stretch on width, cartoon squash-and-stretch
  ctx.fillStyle = COLORS.enemy;
  ctx.fillRect(r.x - (w - r.w) / 2, r.y + (r.h - h), w, h);
}

function drawPlayer(ctx: CanvasRenderingContext2D, game: Readonly<Game>, r: Rect, nowMs: number): void {
  const body = game.body;
  const aiming = game.lunge.kind === "aiming";

  let drawY = r.y;
  let h = r.h;
  let w = r.w;

  if (aiming) {
    // A slight crouch reads as "holding, ready to fire" without any new art.
    h = r.h * 0.92;
    drawY = r.y + (r.h - h);
  } else if (body.grounded && body.vx === 0) {
    // Idle bob.
    drawY += Math.sin((nowMs / IDLE_BOB_PERIOD_MS) * Math.PI * 2) * IDLE_BOB_AMOUNT;
  } else if (body.grounded && body.vx !== 0) {
    // Walk-cycle squash, phase-locked to horizontal distance travelled so it
    // never drifts out of sync with the character's actual footsteps.
    const phase = (body.x / WALK_STRIDE) * Math.PI * 2;
    h = r.h * (1 + Math.sin(phase) * 0.04);
    w = r.w * (1 - Math.sin(phase) * 0.04);
    drawY = r.y + (r.h - h);
  }

  ctx.fillStyle = aiming ? COLORS.playerAiming : COLORS.player;
  ctx.fillRect(r.x - (w - r.w) / 2, drawY, w, h);

  if (!aiming) {
    // A small notch on the facing edge -- the only visual cue for direction,
    // since there's no sprite art.
    ctx.fillStyle = COLORS.sky;
    const notchX = body.facing > 0 ? r.x + r.w - 6 : r.x;
    ctx.fillRect(notchX, drawY + 6, 6, 6);
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  game: Readonly<Game>,
  canvasW: number,
  canvasH: number,
  nowMs = 0,
): void {
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

  for (const mp of game.movingPlatforms) {
    const r = rectToScreen(platformRect(mp));
    ctx.fillStyle = COLORS.platformMoving;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = COLORS.platformMovingEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  const goal = rectToScreen(game.level.goal);
  ctx.fillStyle = COLORS.goal;
  ctx.fillRect(goal.x, goal.y, goal.w, goal.h);

  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;
    drawEnemy(ctx, enemy, rectToScreen(enemyRect(enemy)), nowMs);
  }

  if (game.lunge.kind === "aiming") {
    const playerCenter: Vec2 = { x: game.body.x, y: centerYOf(game.body.feetY) };
    const collidable = [...game.level.platforms, ...game.movingPlatforms.map(platformRect)];
    const endpoint = resolveAimEndpoint(playerCenter, game.lunge.aimVector, game.body.facing, collidable);
    const from = toScreen(playerCenter);
    const to = toScreen(endpoint);
    const meterFraction = game.body.aimMeter / AIM_METER_MAX_MS;
    const color = aimColor(meterFraction);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(to.x, to.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (game.lunge.kind === "dashing") {
    // A fading streak behind the dash's current position, back toward where
    // it launched from -- the whoosh is only 140ms, so this is the one place
    // "the player is moving fast" actually reads on screen.
    const from = toScreen(game.lunge.from);
    const to = toScreen({ x: game.body.x, y: centerYOf(game.body.feetY) });
    ctx.save();
    ctx.strokeStyle = COLORS.player;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = PLAYER_H * 0.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawPlayer(ctx, game, rectToScreen(bodyRect(game.body)), nowMs);
}
