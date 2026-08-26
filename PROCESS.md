# Process overview

## What I built

A small browser voxel game. You spawn in a bounded world at dawn, break and
place blocks, and the run ends — one way or the other — before five minutes are
up. The scope started much larger than that, and the most important decision in
the week was the one that made it smaller in the right direction.

## The moments that mattered

*(In progress — this file is written as the work happens, not reconstructed at
the end. Moments are added as they land.)*

### 1. Choosing which axis to cut on

I set out to build a full Minecraft clone: chunking, meshing, lighting, physics,
mob AI, inventory, a day/night cycle. Planning put the honest figure at ~134
hours of design work, ~80 hours after every subsystem had been stress-tested
down to its floor, against a real budget of roughly 50.

The obvious response is to cut features until the list fits. I cut on a
different axis: I kept every named system as a real system and shrank the
**world** and the **run** instead — one small bounded world, one night, one
ending. That way chunking, meshing, lighting, physics and mob AI all stayed in,
but each became load-bearing for the ending rather than decorative. A sandbox
has no ending; this has one, and it arrives on a clock.

*Citation to be added when the world-shape commit lands.*

### 2. A correction that landed in the harness, not in a retry

Before writing any game code I probed the repo's own checks rather than trusting
them. `tsconfig.json` shipped with `"include": ["*.ts", "spec", "scripts"]` —
non-recursive, and with no `src`. I planted a deliberately broken file at
`src/__probe.ts` (`const n: number = "definitely not a number"`) and ran
`pnpm typecheck`: **exit 0**. Adding `"src"` to `include` and re-running gave
exit 2 and the expected `TS2322`.

Left alone, every line of game code in `src/` would have been invisible to the
typechecker all week, while `pnpm check` reported green. The fix went into the
harness — the tsconfig and a note in `CLAUDE.md` — rather than into a habit of
remembering to check manually.

Cited: [`0b10ae8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-yarramoo/commit/0b10ae8)

### 3. The change that came from playing, not reading

*To be written after the first real playtest on a phone. This one has to come
from watching the game be played, not from reading its code.*

## The harness

`CLAUDE.md` came forward from last week's repo rather than starting from the
template — carried in its own commit, [`e716b71`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-yarramoo/commit/e716b71), before any
prototype work, so its provenance is visible in the history rather than asserted
here. The rules in it that earned their place are the ones written after
something went wrong: the full-bleed canvas gotcha, and the commit-as-you-go
rule that came out of Assignment 1.

## Before you ship

`pnpm check` and `pnpm check:evidence` both need to be green, and they check
different things — the second is not part of the first.
