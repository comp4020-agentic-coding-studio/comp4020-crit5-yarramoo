// SENSOR (carries forward from minecraft-clone, not a contract for this brief).
//
// The whole architecture of this project rests on one rule: the rules of the
// game do not know they are being rendered. core/ and sim/ are pure, so the
// entire game -- including the mechanic the whole crit hinges on, the lunge's
// terrain-only landing point -- can be tested in node with no canvas anywhere
// in the suite.
//
// That rule is one careless import away from being false, and nothing else
// would notice: the game would still run, the tests would still pass, and the
// next person to write a test would find they needed a DOM. This makes the
// rule a check instead of a habit.
//
// The DOM is only half of it, though. A pure module that reads a wall clock or
// Math.random is just as broken and even harder to spot, because it still
// imports cleanly in node and still passes every existing test -- right up
// until a scripted playthrough becomes a coin flip. That half of the rule went
// unchecked until an animation layer (src/anim) made it a live risk: easing,
// jitter and decay are exactly the code that reaches for performance.now() out
// of habit. Both halves are sensors now.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PURE_DIRS = ["src/core", "src/sim"];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return name.endsWith(".ts") ? [path] : [];
  });
}

const files = PURE_DIRS.flatMap(tsFiles);

describe("the game rules are renderer-agnostic", () => {
  it("found the pure modules", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${file} does not import three`, () => {
      const src = readFileSync(file, "utf8");
      expect(
        /from\s+["']three["']/.test(src),
        `${file} imports three. Rendering belongs in src/render/ -- if the rules ` +
          `need this, the rules need a plain number passed in instead.`,
      ).toBe(false);
    });

    it(`${file} does not touch the DOM`, () => {
      const src = readFileSync(file, "utf8");
      // Word-boundary matches so a comment mentioning "the document" is fine.
      expect(
        /\b(document|window|navigator|localStorage)\s*\./.test(src),
        `${file} reaches for the DOM, which makes it untestable in node.`,
      ).toBe(false);
    });
  }
});

describe("the game rules are deterministic", () => {
  for (const file of files) {
    it(`${file} reads no wall clock and no randomness`, () => {
      const src = readFileSync(file, "utf8");
      // Call-shape, not a bare mention, so prose about "Date.now" is still fine.
      expect(
        /\b(Date\.now|performance\.now|Math\.random)\s*\(/.test(src),
        `${file} reads a wall clock or randomness. Same inputs must give the same ` +
          `run: every scripted playthrough in spec/ replays stepGame frame by frame, ` +
          `and one hidden clock read turns all of them into coin flips. Time arrives ` +
          `as a dtMs argument; anything that needs to vary takes a seed or a phase.`,
      ).toBe(false);
    });
  }
});

describe("the pure modules load in node with no browser globals", () => {
  for (const file of files) {
    it(`${file} imports cleanly`, async () => {
      const rel = file.replace(/^src\//, "../src/");
      await expect(import(rel)).resolves.toBeDefined();
    });
  }
});
