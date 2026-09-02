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
import { ENEMY_H, PLAYER_H, VOID_Y } from "./constants.ts";
import { applyLungeSweep, enemyRect, stepEnemy, stepLungerEnemy, type Enemy } from "./enemy.ts";
import type { Level } from "./level.ts";
import { dashPosition, idleLunge, stepLunge, type LungeInput, type LungeState } from "./lunge.ts";
import { platformRect, stepMovingPlatform, type MovingPlatform } from "./platform.ts";
import { isOver, newRun, step as stepRun, type RunState } from "./run.ts";

/**
 * Something that happened during the step that produced this state.
 *
 * Pure data, no wall clock, so emitting these keeps src/sim deterministic and
 * makes them assertable ("one lunge through two enemies emits two kills") --
 * but the reason they exist is that presentation cannot reconstruct them.
 * Renderer and audio both need "an enemy died THIS frame", and a state
 * snapshot cannot say that: by the time anyone looks, the enemy is just
 * absent. stepGame already knew; it simply used to throw the knowledge away.
 */
export type GameEvent =
  | { kind: "aimStarted" }
  | { kind: "aimCancelled" }
  | { kind: "meterExpired" }
  | { kind: "dashFired" }
  | { kind: "enemyKilled"; id: string; at: Vec2 }
  | { kind: "landed" }
  | { kind: "wallGrabbed" }
  | { kind: "died" }
  | { kind: "won" };

export interface Game {
  level: Level;
  body: Body;
  enemies: Enemy[];
  movingPlatforms: MovingPlatform[];
  lunge: LungeState;
  run: RunState;
  /** Events from the step that produced this state. Empty on a fresh game. */
  events: readonly GameEvent[];
}

export interface GameInput {
  move: BodyInput;
  lunge: LungeInput;
}

export function newGame(level: Level): Game {
  return {
    level,
    // Spawned standing. A Level's spawn is on solid ground by contract, and
    // stepBody would work that out for itself one frame later -- but "one frame
    // later" became visible once a lunge required a foothold: pressing on the
    // very first frame of a level did nothing, because the body had not yet
    // fallen the zero distance onto the floor it was already resting on.
    body: { ...newBody(level.spawn.x, level.spawn.feetY), grounded: true },
    enemies: level.enemies,
    movingPlatforms: level.movingPlatforms,
    lunge: idleLunge(),
    run: newRun(),
    events: [],
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
  // A finished run emits nothing further -- including re-emitting the death or
  // win that ended it, which would otherwise retrigger every frame forever.
  if (isOver(game.run)) return game.events.length === 0 ? game : { ...game, events: [] };

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

  // A lunge is launched from a foothold, never from open air: solid ground, or
  // a wall the body is currently hanging on. The charge alone used to be the
  // whole gate, which meant one free mid-air lunge per landing -- fine while
  // every level was a floor, but it makes a fall a place to think rather than a
  // consequence. Requiring contact is what turns "where can I reach from here"
  // into a question with an answer, and it is why walls are worth having.
  const onFoothold = game.body.grounded || game.body.wallSliding;
  const canAim = game.body.dashCharge && onFoothold;

  const lungeResult = stepLunge(
    game.lunge,
    meterExpired ? { ...input.lunge, held: false } : input.lunge,
    playerCenter,
    game.body.facing,
    canAim,
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
    enemies = enemies.map((e) =>
      e.kind === "lunger" ? stepLungerEnemy(e, dtSec, playerCenter, platformsThisFrame) : stepEnemy(e, dtSec),
    );
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

  const events: GameEvent[] = [];
  if (game.lunge.kind !== "aiming" && lungeResult.state.kind === "aiming") events.push({ kind: "aimStarted" });
  if (game.lunge.kind === "aiming" && lungeResult.state.kind === "idle") events.push({ kind: "aimCancelled" });
  if (meterExpired) events.push({ kind: "meterExpired" });

  if (lungeResult.fired) {
    events.push({ kind: "dashFired" });
    const before = enemies;
    enemies = applyLungeSweep(enemies, lungeResult.fired.from, lungeResult.fired.to);
    for (let i = 0; i < enemies.length; i++) {
      if (before[i]!.alive && !enemies[i]!.alive) {
        const e = enemies[i]!;
        events.push({ kind: "enemyKilled", id: e.id, at: { x: e.x, y: e.feetY - ENEMY_H / 2 } });
      }
    }
    body = { ...body, dashCharge: false };
  }

  if (!game.body.grounded && body.grounded) events.push({ kind: "landed" });
  if (!game.body.wallSliding && body.wallSliding) events.push({ kind: "wallGrabbed" });

  const playerRect: Rect = bodyRect(body);
  const touchedLiveEnemy = enemies.some((e) => e.alive && overlaps(playerRect, enemyRect(e)));
  const fellInVoid = body.feetY > VOID_Y;
  const reachedGoal = overlaps(playerRect, game.level.goal);

  const run = stepRun(game.run, { dtMs, died: touchedLiveEnemy || fellInVoid, won: reachedGoal });
  if (game.run.outcome === null && run.outcome === "lost") events.push({ kind: "died" });
  if (game.run.outcome === null && run.outcome === "won") events.push({ kind: "won" });

  return { level: game.level, body, enemies, movingPlatforms, lunge: lungeResult.state, run, events };
}
