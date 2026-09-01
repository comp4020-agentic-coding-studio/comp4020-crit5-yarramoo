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
import { isOver, newRun, step as stepRun, type RunState } from "./run.ts";

export interface Game {
  level: Level;
  body: Body;
  enemies: Enemy[];
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
    lunge: idleLunge(),
    run: newRun(),
  };
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

  const lungeResult = stepLunge(
    game.lunge,
    meterExpired ? { ...input.lunge, held: false } : input.lunge,
    playerCenter,
    game.body.facing,
    game.body.dashCharge,
    game.level.platforms,
    dtMs,
  );

  let body = aimMeterAfterDrain === game.body.aimMeter ? game.body : { ...game.body, aimMeter: aimMeterAfterDrain };
  let enemies = game.enemies;

  if (lungeResult.state.kind === "aiming") {
    // Time is frozen: gravity off, velocity held, patrol frozen. Nothing
    // below moves this frame (the meter, drained above, is the one
    // exception -- it's the cost of maintaining the freeze).
  } else {
    enemies = enemies.map((e) => stepEnemy(e, dtSec));
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
      body = stepBody(body, game.level.platforms, input.move, dtSec);
    }
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

  return { level: game.level, body, enemies, lunge: lungeResult.state, run };
}
