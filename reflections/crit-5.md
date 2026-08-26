# Crit 5 — a game

*First pass, written on night zero. To be rewritten once the week has actually
happened.*

## What was the breakthrough that moved the work forward?

Deciding what to shrink. I wanted a full Minecraft clone and the arithmetic said
that was roughly 80 hours of work against about 50 available. The breakthrough
wasn't dropping features — it was realising I could keep every system I cared
about (chunking, meshing, lighting, physics, mobs) and shrink the *world* and
the *run* instead. One small bounded world, one night, one ending. A sandbox
can't be lost and never finishes; the same engine wrapped around a 110-second
night has stakes, a wrong move and an ending, and it uses every subsystem to get
there.

## What did this work change about who I want to be as a software developer?

I want to be the kind of developer who checks the instruments before trusting
them. Before writing any game code I planted a deliberately broken file in
`src/` and ran the typechecker: it passed, because `src` wasn't in the tsconfig
include list. Green checks had been telling me nothing about a directory that
was about to hold the entire project. I'd normally have found that out in three
days, via a bug that made no sense.

The habit I want isn't "write more tests" — it's testing whether the tests can
see the thing they claim to be watching.
