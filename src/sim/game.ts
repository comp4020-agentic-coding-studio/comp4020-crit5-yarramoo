// Composes body + enemies + lunge + run into one steppable Game.
//
// The one seam worth calling out: Body and Enemy are bottom-anchored
// (`feetY`), but the lunge's sweep treats a moving point as the box's
// CENTER (see aabb.ts's Minkowski expansion). This module is where that
// gets bridged -- the player's position is converted to center coordinates
// before it's handed to the lunge, and back to feetY when a dash's position
// is written into Body. Neither body.ts nor lunge.ts has to know the other
// convention exists.

import { overlaps, type Rect } from "../core/aabb.ts";
import type { Vec2 } from "../core/vec.ts";
import { bodyRect, newBody, stepBody, type Body, type BodyInput } from "./body.ts";
import { PLAYER_H, VOID_Y } from "./constants.ts";
import { applyLungeSweep, enemyRect, stepEnemy, type Enemy } from "./enemy.ts";
import type { Level } from "./level.ts";
import { dashPosition, idleLunge, stepLunge, type LungeInput, type LungeState } from "./lunge.ts";
import { platformRect, stepMovingPlatform, type MovingPlatform } from "./platform.ts";
import { isOver, newRun, step as stepRun, type RunState } from "./run.ts";

export interface Game {
  level: Level;
  body: Body;
  enemies: Enemy[];
  movingPlatforms: MovingPlatform[];
  lunge: LungeState;
  run: RunState;
}

export interface GameInput {
  move: BodyInput;
  lunge: LungeInput;
}

export function newGame(level: Level): Game {
  return {
    level,
    body: newBody(level.spawn.x, level.spawn.feetY),
    enemies: level.enemies,
    movingPlatforms: level.movingPlatforms,
    lunge: idleLunge(),
    run: newRun(),
  };
}

/** Every solid surface a body or a lunge can collide with this frame: the level's static platforms plus each moving platform's current footprint. */
function collidablePlatforms(level: Level, movingPlatforms: readonly MovingPlatform[]): Rect[] {
  return [...level.platforms, ...movingPlatforms.map(platformRect)];
}

const centerYOf = (feetY: number): number => feetY - PLAYER_H / 2;
const feetYOfCenter = (centerY: number): number => centerY + PLAYER_H / 2;

/** Advance the whole game by one frame. Returns a NEW state; never mutates its argument. */
export function stepGame(game: Readonly<Game>, input: GameInput, dtMs: number): Game {
  if (isOver(game.run)) return game;

  const dtSec = dtMs / 1000;
  const playerCenter: Vec2 = { x: game.body.x, y: centerYOf(game.body.feetY) };

  // The aim meter: drains only while actually aiming, resets only on
  // landing (see body.ts's stepBody). Running it out mid-aim is treated as
  // if the player had let go this instant -- reusing stepLunge's existing
  // release branch verbatim, rather than a separate cancel/timeout path.
  const aimMeterAfterDrain =
    game.lunge.kind === "aiming" ? Math.max(0, game.body.aimMeter - dtMs) : game.body.aimMeter;
  const meterExpired = game.lunge.kind === "aiming" && aimMeterAfterDrain <= 0;

  // A single snapshot of solid ground for the whole frame -- both the lunge
  // resolution below and stepBody later this frame collide against the same
  // moving-platform positions, rather than each seeing a different instant.
  const platformsThisFrame = collidablePlatforms(game.level, game.movingPlatforms);

  const lungeResult = stepLunge(
    game.lunge,
    meterExpired ? { ...input.lunge, held: false } : input.lunge,
    playerCenter,
    game.body.facing,
    game.body.dashCharge,
    platformsThisFrame,
    dtMs,
  );

  let body = aimMeterAfterDrain === game.body.aimMeter ? game.body : { ...game.body, aimMeter: aimMeterAfterDrain };
  let enemies = game.enemies;
  let movingPlatforms = game.movingPlatforms;

  if (lungeResult.state.kind === "aiming") {
    // Time is frozen: gravity off, velocity held, patrol and moving
    // platforms frozen. Nothing below moves this frame (the meter, drained
    // above, is the one exception -- it's the cost of maintaining the freeze).
  } else {
    enemies = enemies.map((e) => stepEnemy(e, dtSec));
    const steppedMovingPlatforms = movingPlatforms.map((mp) => stepMovingPlatform(mp, dtSec));

    if (lungeResult.state.kind === "dashing") {
      const pos = dashPosition(lungeResult.state);
      body = { ...body, x: pos.x, feetY: feetYOfCenter(pos.y), vx: 0, vy: 0 };
    } else if (game.lunge.kind === "dashing") {
      // The dash completed this very frame -- stepLunge has already
      // returned to idle, but the body must still land exactly on the
      // dash's resolved endpoint before ordinary physics resumes next
      // frame. Without this, the last fractional frame of travel (up to
      // ~one dtMs worth of distance) is silently dropped in favor of
      // stepBody's gravity/move physics from one frame short of the true
      // landing spot.
      const to = game.lunge.to;
      body = { ...body, x: to.x, feetY: feetYOfCenter(to.y), vx: 0, vy: 0 };
    } else {
      body = stepBody(body, platformsThisFrame, input.move, dtSec);

      // Carry: a body resting flush on a moving platform's frame-start top
      // rides along with wherever that platform slides to this frame, on
      // both axes -- horizontal because ordinary physics has no notion of
      // the platform having moved, and vertical because otherwise a
      // downward-moving platform would leave the body hanging in the air it
      // just snapped onto (or a rising one would shove through the body).
      if (body.grounded) {
        for (let i = 0; i < movingPlatforms.length; i++) {
          const before = platformRect(movingPlatforms[i]!);
          const flush = Math.abs(body.feetY - before.y) < 1e-6;
          const overlapsX = body.x >= before.x && body.x <= before.x + before.w;
          if (flush && overlapsX) {
            const after = platformRect(steppedMovingPlatforms[i]!);
            body = { ...body, x: body.x + (after.x - before.x), feetY: body.feetY + (after.y - before.y) };
            break;
          }
        }
      }
    }

    movingPlatforms = steppedMovingPlatforms;
  }

  if (lungeResult.fired) {
    enemies = applyLungeSweep(enemies, lungeResult.fired.from, lungeResult.fired.to);
    body = { ...body, dashCharge: false };
  }

  const playerRect: Rect = bodyRect(body);
  const touchedLiveEnemy = enemies.some((e) => e.alive && overlaps(playerRect, enemyRect(e)));
  const fellInVoid = body.feetY > VOID_Y;
  const reachedGoal = overlaps(playerRect, game.level.goal);

  const run = stepRun(game.run, { dtMs, died: touchedLiveEnemy || fellInVoid, won: reachedGoal });

  return { level: game.level, body, enemies, movingPlatforms, lunge: lungeResult.state, run };
}
