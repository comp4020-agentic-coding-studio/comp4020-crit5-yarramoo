// Sound, synthesised on the fly. There are no audio files in this project and
// there should not be: the whole thing is procedural rectangles, the deploy is
// a static bundle, and a handful of oscillators costs a few hundred bytes where
// even one short sample costs tens of kilobytes.
//
// This is the impure layer, like src/render/ -- it reaches for the DOM, reads a
// wall clock (AudioContext.currentTime) and uses randomness for noise. None of
// that may leak into src/sim, which is exactly why it is driven by GameEvents
// rather than by inspecting state: the sim says what happened, this decides
// what that sounds like, and neither knows anything about the other.

import type { GameEvent } from "../sim/game.ts";

/** Master level. Everything below is written relative to this, so one number moves the mix. */
const MASTER = 0.18;

export interface Sfx {
  /** Play whatever this frame's events call for. */
  play(events: readonly GameEvent[]): void;
  /**
   * Browsers start an AudioContext suspended until a real gesture. Call this
   * from a genuine input handler; it is a no-op afterwards.
   */
  unlock(): void;
  toggleMute(): boolean;
  detach(): void;
}

interface ToneSpec {
  type: OscillatorType;
  /** Start and end frequency, in Hz. A glide between them is most of the character. */
  from: number;
  to: number;
  durationS: number;
  gain: number;
  delayS?: number;
}

export function createSfx(): Sfx {
  // Constructed lazily: making an AudioContext before a gesture gets it created
  // in a suspended state that some browsers never let you out of.
  let ctx: AudioContext | null = null;
  let muted = false;

  function audio(): AudioContext | null {
    if (muted) return null;
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null; // no Web Audio here; the game is still perfectly playable
      ctx = new Ctor();
    }
    return ctx;
  }

  function tone({ type, from, to, durationS, gain, delayS = 0 }: ToneSpec): void {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime + delayS;

    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    // Exponential, because pitch is heard logarithmically -- a linear ramp from
    // 700Hz to 180Hz spends most of its time in the top half and reads as a
    // click rather than a fall. Guarded above zero, which the ramp requires.
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + durationS);

    // A tiny attack rather than an instant one: a gain that steps straight to
    // full is a click on top of whatever you meant to play.
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain * MASTER, t0 + Math.min(0.012, durationS * 0.3));
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + durationS);

    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + durationS + 0.02);
  }

  /** A burst of filtered noise -- impacts and scrapes, which no oscillator does well. */
  function noise(durationS: number, gain: number, filterHz: number, sweepToHz = filterHz): void {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime;
    const frames = Math.max(1, Math.floor(ac.sampleRate * durationS));
    const buffer = ac.createBuffer(1, frames, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buffer;

    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(filterHz, t0);
    if (sweepToHz !== filterHz) filter.frequency.exponentialRampToValueAtTime(Math.max(1, sweepToHz), t0 + durationS);

    const amp = ac.createGain();
    amp.gain.setValueAtTime(gain * MASTER, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + durationS);

    src.connect(filter).connect(amp).connect(ac.destination);
    src.start(t0);
    src.stop(t0 + durationS + 0.02);
  }

  function sound(event: GameEvent): void {
    switch (event.kind) {
      case "aimStarted":
        // Quiet and high: the world just stopped, and the sound should get out
        // of the way of the decision the player is now making.
        tone({ type: "sine", from: 1320, to: 1760, durationS: 0.07, gain: 0.25 });
        break;
      case "aimCancelled":
        tone({ type: "sine", from: 1320, to: 660, durationS: 0.08, gain: 0.22 });
        break;
      case "meterExpired":
        // The one sound that is a warning rather than a report: the shot was
        // taken out of the player's hands.
        tone({ type: "square", from: 400, to: 200, durationS: 0.16, gain: 0.3 });
        break;
      case "dashFired":
        tone({ type: "sawtooth", from: 720, to: 170, durationS: 0.14, gain: 0.5 });
        noise(0.12, 0.28, 1800, 500);
        break;
      case "enemyKilled":
        tone({ type: "square", from: 1200, to: 260, durationS: 0.1, gain: 0.4 });
        noise(0.09, 0.5, 2600, 700);
        break;
      case "landed":
        tone({ type: "sine", from: 190, to: 85, durationS: 0.09, gain: 0.42 });
        noise(0.05, 0.18, 380);
        break;
      case "wallGrabbed":
        // A scrape, not a thud: it should read as catching, not as arriving.
        noise(0.13, 0.34, 900, 2400);
        tone({ type: "sine", from: 300, to: 420, durationS: 0.1, gain: 0.16 });
        break;
      case "died":
        tone({ type: "sawtooth", from: 240, to: 55, durationS: 0.55, gain: 0.5 });
        break;
      case "won":
        // The only sound with more than one note in it, so the ending is the
        // only thing in the game that resolves.
        tone({ type: "triangle", from: 523, to: 523, durationS: 0.12, gain: 0.42 });
        tone({ type: "triangle", from: 659, to: 659, durationS: 0.12, gain: 0.42, delayS: 0.1 });
        tone({ type: "triangle", from: 784, to: 784, durationS: 0.26, gain: 0.45, delayS: 0.2 });
        break;
    }
  }

  return {
    play(events) {
      if (muted || events.length === 0) return;
      // A single lunge through three enemies emits three kills on one frame.
      // Stacking three identical bursts is just clipping, so each KIND fires
      // once per frame and the shot reads as one hit rather than mush.
      const seen = new Set<GameEvent["kind"]>();
      for (const e of events) {
        if (seen.has(e.kind)) continue;
        seen.add(e.kind);
        sound(e);
      }
    },
    unlock() {
      void audio()?.resume();
    },
    toggleMute() {
      muted = !muted;
      if (muted && ctx) void ctx.suspend();
      else if (!muted && ctx) void ctx.resume();
      return muted;
    },
    detach() {
      void ctx?.close();
      ctx = null;
    },
  };
}
