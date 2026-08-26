import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Answers this week's published spec (crit 5, "a game"). Runs against the
// BUILT site, like the invariants — `pnpm build` first (the `check` script
// does). Retires with the brief: this file stays behind when the week does.

const dom = new JSDOM(readFileSync(resolve("dist/index.html"), "utf8"));
const doc = dom.window.document;

describe("no tutorial, anywhere on screen", () => {
  // The brief: "no instructions anywhere, on screen or off — the opening
  // screen invites the first move, and play teaches whatever comes next."
  // Weak but real backpressure: this can't confirm the opening screen reads
  // as an invitation (that's the pod's ten seconds to judge), but it can
  // catch the concrete regression of a how-to-play modal or instructions
  // panel creeping back in.
  const bannedPattern = /how\s*to\s*play|instructions?|tutorial/i;

  it("has no element flagged as instructions/tutorial/help", () => {
    for (const el of doc.querySelectorAll("[id], [class]")) {
      const flagged = [el.id, el.className].some((s) => bannedPattern.test(String(s)));
      expect(flagged, `<${el.tagName.toLowerCase()}> looks like a tutorial element`).toBe(false);
    }
  });

  it("has no visible body text naming itself as instructions", () => {
    const text = doc.body.textContent ?? "";
    expect(bannedPattern.test(text), "found instructional wording in the page text").toBe(false);
  });
});

// TODO once the mechanic is chosen: "one rule of the game has a focused
// automated test" (spec). Pick the rule that's easiest to get subtly wrong —
// a win/loss/finish condition is the brief's own suggestion — and test it
// against the game's own state/logic module, not the DOM. This is yours to
// write once there's a mechanic to have a rule about; it should start red.
