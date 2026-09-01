# Process overview

## What I built

A tiny side-view platformer built around one mechanic: hold the mouse button to
freeze time completely (gravity off, enemies frozen mid-patrol) while a free
360° aim line tracks the pointer, then release to dash a fixed distance along
that line. The dash kills any enemy it passes through without slowing, but
still stops dead against solid terrain -- so an enemy can be planted as bait,
tempting a player who fires straight at it to overshoot the platform they were
standing on. There's no on-screen text; the time-freeze itself is the tutorial,
and a forced corridor early in the level makes trying "the other button" the
only way forward.

## The moments that mattered

### 1. The one rule the whole design depends on, made into the flagship test

The bait trap only works if the dash's endpoint is a pure function of solid
terrain -- killing an enemy on the way must never shorten or stop it, or a
player who fires "through" the bait would be rewarded, not punished. Rather
than trust that `resolveAimEndpoint`'s sweep did this by construction, I wrote
the test first: dash toward an enemy standing clear of any wall and assert the
player travels the *full* fixed distance past where the enemy stood, then
separately assert a dash toward a bare wall stops short of it. Both passed
against the first real implementation, but the test is what makes that a
verified property rather than an assumption.

Cited: [`42cceca`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-yarramoo/commit/42cceca)

### 2. Two bugs invisible to 77 green tests, found by actually playing

CLAUDE.md's "open the page and look at it" rule earned its keep twice in one
sitting. Aiming near-horizontally while standing on a platform collapsed every
lunge to zero length -- the player's center sits exactly on the swept boundary
of the platform they're standing on, so the existing (correct) flush-convention
sweep read that as an instant block. Every test vector so far had used an
exact horizontal or steep angle, so nothing caught it. And on touch, releasing
a drag nulled the aim pointer *before* the game loop's next read, so every
touch-fired dash used a stale canvas-center default instead of the aimed
direction. Neither was a logic error the suite could see; both were "hold the
mouse where a real hand would" problems. Fixed by excluding the currently-
supporting platform from the sweep, and by tracking the last aim position
separately from the live pointer.

Cited: [`f40d919`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-yarramoo/commit/f40d919)

### 3. A test suite that stayed green while a live playthrough died

After fixing (2), a scripted Playwright playthrough still died lunging through
the gate enemy, even though `spec/game.test.ts`'s expert script passed. Rather
than guess, I hooked `requestAnimationFrame` to sample the live game state every
frame and diffed the exact transition: the player landed safely, then the very
next physics frame catapulted it to `x=912`. The cause was `stepBody`'s
horizontal collision ternary having no "didn't move" case -- a lunge landing
with a downward y-component arrives embedded in the platform it just landed on
(deliberate, per fix 2) with `vx === 0`, and the ternary read that stationary
overlap as a leftward approach, ejecting the player out the platform's *far*
edge. No existing test exercised a zero-velocity embedded body, so this needed
a live frame trace, not a failing assertion, to find.

Cited: [`fac768b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-yarramoo/commit/fac768b)

### 4. The mandatory playtest-driven tuning change

Firing a genuinely mouse-aimed (not hand-typed) shot across the beat-3 gap kept
landing short: any real aim has a slight downward tilt, and that tilt eats into
the dash's horizontal reach enough to clip the far platform's vertical face
instead of clearing onto its top. `GAP1_WIDTH` had only 40 units of slack under
`LUNGE_DISTANCE`; I narrowed it to give a realistically-imprecise aim more room,
and re-verified with the same Playwright rig driving real mouse and keyboard
events against the running dev server end-to-end -- gate killed, gap cleared,
bait survived by jumping over it, vertical beat landed on the far ledge, goal
reached, `outcome: "won"`. That live run, not just `pnpm check`, is what
confirmed the fix.

Cited: [`4b85b75`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-yarramoo/commit/4b85b75)

## Before you ship

`pnpm check:evidence` verifies your citations resolve to real commits, that a
reflection entry the marker reads is in `reflections/`, and that your
`CLAUDE.md` is there --- before a marker ever opens the file. It checks that
your map is traceable, not that it is good: the marker judges whether your
small, deliberately chosen set of moments shows real judgement and reflection. A
green check is not a substitute for that curation.

Images aren't checked: unlike a citation whose SHA doesn't resolve, a broken
image is visible the moment this file is rendered on GitHub.
