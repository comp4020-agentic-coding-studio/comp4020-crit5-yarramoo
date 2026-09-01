// All tuning numbers, in one place, with the derivations that justify them.
// See the plan's "Constants and their derivations" table for the reasoning;
// this file is the source of truth the level and its tests both check
// against, so a gap that's meant to be "too wide to jump" is provably that,
// not eyeballed.

export const GRAVITY = 1400; // u/s^2
export const MOVE_SPEED = 220; // u/s, horizontal run speed
export const JUMP_SPEED = 620; // u/s, initial upward velocity on jump

export const PLAYER_W = 24;
export const PLAYER_H = 36;

export const ENEMY_W = 28;
export const ENEMY_H = 28;
export const ENEMY_PATROL_SPEED = 60; // u/s

export const LUNGE_DISTANCE = 320; // u, always travelled unless solid terrain stops it early
export const LUNGE_DURATION_MS = 140; // a fast whoosh, not a teleport
export const LUNGE_SPEED = LUNGE_DISTANCE / (LUNGE_DURATION_MS / 1000); // u/s, ~2286

export const AIM_DEADZONE = 8; // u; below this, snap to last facing rather than divide-by-zero

// The aim-freeze resource: drains while aiming, resets only on landing.
// Existing scripted holds run ~16-300ms, so this stays generous enough that
// ordinary play never brushes it -- it only matters in levels built to test
// it, where lingering on the "perfect" shot has a real cost.
export const AIM_METER_MAX_MS = 2500;

// A vertical hop's height and full up-down cycle time.
export const HOPPER_HEIGHT = 90; // u
export const HOPPER_PERIOD_MS = 900;

// An enemy that lunges back: same telegraph-then-dash shape as the player's
// own mechanic, tuned shorter/slower so it reads as fair to react to.
export const ENEMY_LUNGE_RANGE_X = 260; // u; horizontal trigger range
export const ENEMY_LUNGE_LEVEL_TOLERANCE = 40; // u; how level with the player counts as "in line"
export const ENEMY_LUNGE_TELEGRAPH_MS = 450;
export const ENEMY_LUNGE_DISTANCE = 220; // u
export const ENEMY_LUNGE_DURATION_MS = 220;
export const ENEMY_LUNGE_SPEED = ENEMY_LUNGE_DISTANCE / (ENEMY_LUNGE_DURATION_MS / 1000);

// Time to reach the top of a jump, and how high that is.
export const TIME_TO_APEX_S = JUMP_SPEED / GRAVITY; // ~0.443s
export const JUMP_APEX_HEIGHT = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY); // ~137u

// The farthest a flat-ground jump can possibly carry the player: a run-up
// already at MOVE_SPEED, held for the whole up-and-down arc. Any gap wider
// than this is provably uncrossable by jumping alone.
export const MAX_JUMP_DISTANCE = MOVE_SPEED * (2 * TIME_TO_APEX_S); // ~195u

export const VOID_Y = 2000; // falling below this is death
