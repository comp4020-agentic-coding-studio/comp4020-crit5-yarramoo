import { defineConfig } from "vitest/config";

// Only the timeout is set here -- everything else stays on vitest's defaults
// (node environment, the default `**/*.test.ts` discovery that already picks up
// both spec/ and scripts/).
//
// The 5 s default is not enough for this suite, and CLAUDE.md says to make that
// explicit rather than hope. Two kinds of test legitimately run long:
//
//   - scripts/check-evidence.test.ts spawns real subprocesses that resolve
//     commit citations. Under full-suite load these intermittently crossed 5 s
//     and failed, which reads as a flake but is really just an unset budget.
//   - spec/levels.test.ts and spec/game.test.ts run scripted playthroughs of up
//     to MAX_FRAMES (3000) simulated frames each.
//
// Neither is slow because something is wrong; they're slow because they do a
// lot of real work. 20 s is far above their observed worst case while still
// being low enough that a genuinely hung test fails instead of hanging CI.
export default defineConfig({
  test: {
    testTimeout: 20_000,
  },
});
