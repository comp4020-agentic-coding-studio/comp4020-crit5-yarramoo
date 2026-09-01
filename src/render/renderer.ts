// Canvas 2D rendering. Reads a Game and draws it -- never mutates it, never
// decides anything about it. The one piece of game logic this file leans on
// is resolveAimEndpoint, called read-only for the aim-time preview line: it's
// the same sweep the real dash uses, so the line drawn on screen and the dash
// that actually fires can never disagree about where a shot would land.

import {
  AIM_CROUCH_SCALE,
  IDLE_BOB_AMOUNT_PX,
  IDLE_BOB_PERIOD_MS,
  NOTCH_INSET_PX,
  NOTCH_PX,
  PATROL_BOB_PERIOD_MS,
  PATROL_SQUASH_AMOUNT,
  PATROL_WIDTH_RATIO,
  TELEGRAPH_FLASHES,
  WALL_CLING_LEAN_PX,
  WALL_CLING_PULSE,
  WALL_CLING_PULSE_PERIOD_MS,
  WALL_CLING_SQUEEZE,
  WALL_CLING_STRETCH,
  WALK_SQUASH,
  WALK_STRIDE_U,
  WALK_WIDTH_RATIO,
} from "../anim/constants.ts";
import { hashTurns, wave } from "../anim/ease.ts";
import { applyPose, compose, IDENTITY, pose, squash, type Pose } from "../anim/pose.ts";
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
  telegraph: "#ffffff",
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

/** How an enemy is deformed this frame. Pure geometry -- colour is enemyFill's job. */
function enemyPose(enemy: Readonly<Enemy>, nowMs: number): Pose {
  // A telegraphing lunger holds its shape. The flash is the entire warning the
  // player gets before a dash, and a bob layered over it only muddies the one
  // frame-accurate cue they have to read.
  if (enemy.kind === "lunger" && enemy.lungeState === "telegraph") return IDENTITY;

  // Squash-and-stretch bob, purely cosmetic -- derived from wall-clock time
  // plus a per-id offset, not from patrol phase, so it never has to agree
  // with the sim's own bounce timing to look right.
  const turns = nowMs / PATROL_BOB_PERIOD_MS + hashTurns(enemy.id);
  return squash(wave(turns) * PATROL_SQUASH_AMOUNT, PATROL_WIDTH_RATIO);
}

function enemyFill(enemy: Readonly<Enemy>): string {
  if (enemy.kind === "lunger" && enemy.lungeState === "telegraph") {
    // A fast, accelerating flash reads as "about to fire" -- the same fairness
    // contract as the player reading an aim line before committing.
    const t = enemy.lungeElapsedMs / ENEMY_LUNGE_TELEGRAPH_MS;
    return Math.floor(t * TELEGRAPH_FLASHES * 2) % 2 === 0 ? COLORS.telegraph : COLORS.enemy;
  }
  return COLORS.enemy;
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Readonly<Enemy>, r: Rect, nowMs: number): void {
  const d = applyPose(r, enemyPose(enemy, nowMs));
  ctx.fillStyle = enemyFill(enemy);
  ctx.fillRect(d.x, d.y, d.w, d.h);
}

/** How the player is deformed this frame. One pose out, no drawing. */
function playerPose(game: Readonly<Game>, nowMs: number): Pose {
  const body = game.body;
  const aiming = game.lunge.kind === "aiming";

  // Clinging to a wall, pressed thin against the face and pulsing slowly to say
  // the charge is back. This one COMPOSES rather than winning outright, because
  // aiming from a wall is the entire reason walls exist -- the player needs to
  // see both "I am attached" and "I am holding a shot" at once. It is exactly
  // the case the old one-branch-wins chain could not express.
  if (body.wallSliding) {
    const cling = compose(
      pose({
        scaleX: 1 - WALL_CLING_SQUEEZE,
        scaleY: 1 + WALL_CLING_STRETCH,
        dx: body.wallDir * WALL_CLING_LEAN_PX,
      }),
      squash(wave(nowMs / WALL_CLING_PULSE_PERIOD_MS) * WALL_CLING_PULSE, 0),
    );
    return aiming ? compose(cling, pose({ scaleY: AIM_CROUCH_SCALE })) : cling;
  }

  // A slight crouch reads as "holding, ready to fire" without any new art.
  if (aiming) return pose({ scaleY: AIM_CROUCH_SCALE });

  // Mid-dash the body is snapped along the dash segment and stepBody never
  // runs, so `grounded` and `vx` still hold whatever they were before launch
  // (spec/levels.test.ts's settleAfterDash documents the same staleness from
  // the sim side). A dash fired from standing therefore satisfied
  // `grounded && vx === 0` and used to idle-bob its way across the screen
  // behind the streak. The dash has its own motion; it needs no pose.
  if (game.lunge.kind === "dashing") return IDENTITY;

  // Airborne: undeformed, and now explicitly so rather than by falling off the
  // end of a chain with no else.
  if (!body.grounded) return IDENTITY;

  if (body.vx === 0) return pose({ dy: wave(nowMs / IDLE_BOB_PERIOD_MS) * IDLE_BOB_AMOUNT_PX });

  // Walk-cycle squash, phase-locked to horizontal distance travelled so it
  // never drifts out of sync with the character's actual footsteps.
  return squash(wave(body.x / WALK_STRIDE_U) * WALK_SQUASH, WALK_WIDTH_RATIO);
}

function drawPlayer(ctx: CanvasRenderingContext2D, game: Readonly<Game>, r: Rect, nowMs: number): void {
  const aiming = game.lunge.kind === "aiming";
  const d = applyPose(r, playerPose(game, nowMs));

  // The pale body already means "a shot is available here" while aiming; a wall
  // grab borrows it rather than inventing a second colour for the same fact.
  ctx.fillStyle = aiming || game.body.wallSliding ? COLORS.playerAiming : COLORS.player;
  ctx.fillRect(d.x, d.y, d.w, d.h);

  if (!aiming) {
    // A small notch on the facing edge -- the only visual cue for direction,
    // since there's no sprite art. Measured off the DEFORMED rect: taking it
    // from the undeformed one left it drifting a fraction off the body's edge
    // through the walk cycle.
    ctx.fillStyle = COLORS.sky;
    const notchX = game.body.facing > 0 ? d.x + d.w - NOTCH_PX : d.x;
    ctx.fillRect(notchX, d.y + NOTCH_INSET_PX, NOTCH_PX, NOTCH_PX);
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
