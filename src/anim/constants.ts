// Animation tuning numbers, in one place -- the same standard src/sim/constants.ts
// holds gameplay to, which the render layer never had. Everything here is
// cosmetic: no value in this file can change whether a level is winnable.
//
// Units are in the names, and that is load-bearing rather than tidy. The old
// renderer had WALK_STRIDE (world units, because it divides body.x) sitting in
// the same block as IDLE_BOB_AMOUNT (screen pixels, because it was added to an
// already-camera-transformed y). They were indistinguishable and happened to
// agree only because the canvas is 1:1 -- main.ts sets canvas.width from
// innerWidth with no devicePixelRatio handling and no zoom transform. Add
// either and half of these change meaning silently.

/** World units of horizontal travel per full leg-swing cycle. */
export const WALK_STRIDE_U = 30;
/** Fraction of height, at the extremes of the walk cycle. */
export const WALK_SQUASH = 0.04;
/**
 * The walk cycle is rubbery: width answers height one-for-one. Phase-locked to
 * distance travelled rather than to time, so footfalls can never drift out of
 * sync with the ground going past.
 */
export const WALK_WIDTH_RATIO = 1;

export const IDLE_BOB_PERIOD_MS = 900;
/** Screen pixels of vertical drift while standing still. */
export const IDLE_BOB_AMOUNT_PX = 2;

/** Held-and-ready: a slight crouch, as a fraction of full height. */
export const AIM_CROUCH_SCALE = 0.92;

export const PATROL_BOB_PERIOD_MS = 700;
/** Fraction of height. Softer than the player's walk -- see PATROL_WIDTH_RATIO. */
export const PATROL_SQUASH_AMOUNT = 0.08;
/** Enemies read as weighty rather than rubbery: width answers at half rate. */
export const PATROL_WIDTH_RATIO = 0.5;

/** Full on/off cycles across a lunger's whole telegraph. */
export const TELEGRAPH_FLASHES = 8;

/** Side length and inset of the facing notch, in screen pixels. */
export const NOTCH_PX = 6;
export const NOTCH_INSET_PX = 6;
