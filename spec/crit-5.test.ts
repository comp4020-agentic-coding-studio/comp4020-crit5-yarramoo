// CONTRACT (crit 5): teaches itself with zero on-screen text. The forced-
// discovery corridor and the visible-but-not-obvious bait are supposed to be
// the whole tutorial -- a page that quietly ships a "hold to aim" caption
// would make that claim false without any test noticing, since the game
// still plays fine either way. This is what turns "no instructions" from a
// thing I believe about my own copy into something the build can't undo.
//
// Scans the built HTML's visible text, not the bundled JS: minified source is
// full of DOM event names ("click", "drag") and property keys (`aimVector`,
// `lunge`) that would false-positive a whole-bundle word scan. What actually
// reaches a player's eyes is (a) whatever text ships in dist/index.html, and
// (b) whatever the canvas draws -- so the second check instead asserts the
// bundle contains no fillText/strokeText call at all, which structurally
// rules out canvas-drawn instructions rather than pattern-matching for them.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Deliberately verb+target phrases ("hold to aim", "press space") rather than
// bare nouns: the page's own title is "Lunge" and that's branding, not an
// instruction -- banning the word "lunge" outright would flag the game's own
// name the same way banning "doom" would flag a game called Doom.
const INSTRUCTIONAL_PHRASES = [
  /how to play/i,
  /\bcontrols?\b/i,
  /instructions?/i,
  /tutorial/i,
  /press\s+\S/i,
  /\bhold\s+(to|down)\b/i,
  /\brelease\s+to\b/i,
  /\bclick\s+to\b/i,
  /\btap\s+to\b/i,
  /\bdrag\s+to\b/i,
  /\baim\s+to\b/i,
  /\bwasd\b/i,
  /arrow keys?/i,
  /mouse button/i,
  /left[- ]click/i,
];

describe("crit 5: no instructions ship anywhere", () => {
  it("the built page's visible text has no instructional copy", () => {
    const html = readFileSync(resolve("dist/index.html"), "utf8");
    const doc = new JSDOM(html).window.document;
    const visibleText = doc.body.textContent ?? "";

    for (const phrase of INSTRUCTIONAL_PHRASES) {
      expect(
        visibleText,
        `dist/index.html's visible text matched ${phrase} -- the game is supposed to teach itself with no copy`,
      ).not.toMatch(phrase);
    }
  });

  it("the shipped bundle never draws text on the canvas", () => {
    const html = readFileSync(resolve("dist/index.html"), "utf8");
    const scriptSrc = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    expect(scriptSrc, "expected a bundled module script in dist/index.html").toBeTruthy();
    const bundle = readFileSync(resolve("dist", scriptSrc!.replace(/^\.\//, "")), "utf8");

    expect(
      /\.(fillText|strokeText)\(/.test(bundle),
      "the canvas draws text somewhere -- a caption here is exactly how instructions sneak back in unnoticed",
    ).toBe(false);
  });
});
