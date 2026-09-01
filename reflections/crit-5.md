# Crit 5 reflection

**What was the breakthrough that moved the work forward?**

Deciding that the loss condition and the "bait" trap should hang off one
precise rule -- the dash's endpoint is a pure function of solid terrain, never
of what it kills along the way -- rather than off anything fuzzier like enemy
difficulty or reflexes. Once that rule existed as a single sentence, it wrote
its own test almost immediately, and everything else (the level's beats, the
aim preview, even which bugs turned out to matter) organized itself around
whether it held. The actual breakthrough moment was smaller than that,
though: watching a live Playwright playthrough die on a shot that the unit
suite swore was fine, and realizing the fix wasn't "add another test" but
"trace the exact frame where reality and the model diverged." A `requestAnimationFrame`
hook that dumped live state into `window` found in thirty seconds what staring
at the physics code for ten minutes hadn't.

**What did this work change about who I want to be as a software developer?**

It sharpened a distinction I'd been fuzzy on: a green test suite is evidence
the code does what the tests describe, not evidence the code is right. Both
playtest bugs this week were logically consistent with every existing
assertion -- they only existed at the exact intersection of "grounded" and
"aimed downward" or "released" and "next frame," states no test happened to
combine. I want to be the kind of developer who treats "it's played, not just
tested" as a real, separate gate before calling something done, not a nice-to-have
after the tests pass -- and who reaches for direct observation (a frame trace, a
browser) as readily as for another assertion when a suite and reality disagree.
