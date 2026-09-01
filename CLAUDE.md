# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked --- not this repo, and not "it works on my machine". It's
marked live in Chrome against the deployed URL at two viewports --- 1920×1080
(desktop) and 390×844 (phone) --- and both count in full.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Run `pnpm check` before you push.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't --- the `agent-browser` CLI (see the course
  site's backpressure topic) is a good way to do this from the agent itself.
- When a check fails, read its output before you change anything. Treat a red
  check as authoritative --- the page is wrong until the check is green, not
  until you decide it should be.
- Never commit a red state.
- Commit sensibly and incrementally *as you go*, not as one dump at the end of
  a session. Once a logically-scoped piece of work is green, commit it with a
  message explaining why before moving to the next piece. This isn't
  hypothetical: in Assignment 1, an entire feature arc sat uncommitted across
  ~2400 lines and 19 files for a whole session and had to be reconstructed into
  three retroactive commits afterwards, losing the true chronology. Commit as
  each piece lands instead.

## Never `toEqual` a large structure

`expect(a).toEqual(b)` on large arrays/objects walks them element by element
and can blow past vitest's 5 s default timeout well before it blows past any
sane amount of real work. That reads as a flake (passes alone, times out under
full-suite load) rather than as the O(n) comparison it actually is, and it
"fails" with a diff nobody can read. Prefer a targeted comparison (native
`Buffer.equals` for byte data, or comparing lengths + a spot-check) and report
the first differing index yourself. If a test starts failing on timing rather
than logic, suspect the assertion before the code under test — the commit that
goes red is not always the commit that introduced the problem, since a slow
assertion can sit latent until a later, unrelated test makes the suite heavier.

## Slow tests need a real timeout, not luck

A test that legitimately simulates a lot of frames (a full scripted
playthrough, say) can take long enough that vitest's 5 s default turns it into
an occasional flake rather than a reliable pass or fail. If a suite has tests
like this, set `testTimeout` explicitly in `vitest.config.ts` rather than
hoping the default is enough, and prefer a coarser simulated timestep in tests
that only care about the outcome, not every frame — the underlying stepper
should already substep internally, so a coarser test tick doesn't change what's
being verified. Before trusting a green suite here, run it a few times: one
green run distinguishes "passing" from nothing at all.

## Full-bleed canvas gotcha

An absolutely-positioned replaced element (`<canvas>`, `<img>`, `<video>`)
with `inset: 0` and no explicit `width`/`height` does **not** stretch to fill
its container — it keeps its intrinsic size (300×150 for a bare canvas) and
just gets positioned in the corner. Caught this by actually opening the page;
`pnpm check` has no way to see it, since nothing in the DOM structure is
wrong. Always pair `inset: 0` with explicit `width: 100%; height: 100%` on a
replaced element you want full-bleed.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so look at the deployed head when you add pages.

## The checks

`pnpm check` runs them (`pnpm check:evidence` is the extra gate before you
ship); CI runs the same plus links, secrets and the deploy. Read the failure.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook. As you learn what your prototype needs --- a
convention the work has to hold to, a sensor that keeps catching you out (a
linter, say), a fact about the stack that is easy to get wrong --- write it down
here and wire it into `check`. Growing this file is the work.
