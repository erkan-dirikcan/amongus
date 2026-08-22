// Central audio manager: synthesized SFX + ambient drone, persistent mute.
import { createAudioContext, playTone, playNoise, playChord } from "./synth.js";

export type SoundName =
  | "kill"
  | "alarm"
  | "report"
  | "taskComplete"
  | "sabotageAlarm"
  | "vent"
  | "eject"
  | "victory"
  | "defeat"
  | "click";

const MUTE_KEY = "amongus_muted";

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = localStorage.getItem(MUTE_KEY) === "1";

  // Ambient drone nodes
  private ambientGain: GainNode | null = null;
  private ambientLfo: OscillatorNode | null = null;
  private ambientPlaying = false;

  private ensureCtx(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = createAudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
      } catch {
        return null; // Web Audio unavailable
      }
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  play(name: SoundName): void {
    const ctx = this.ensureCtx();
    if (!ctx || !this.master || this.muted) return;

    switch (name) {
      case "kill":
        // Low-frequency thud with a downward pitch drop
        playTone(ctx, this.master, { freq: 90, endFreq: 40, durMs: 350, type: "sine", gain: 0.5 });
        playNoise(ctx, this.master, { durMs: 120, gain: 0.15, filterHz: 300 });
        break;
      case "alarm":
        // Two-tone emergency siren (880/660 alternating)
        for (let i = 0; i < 4; i++) {
          playTone(ctx, this.master, {
            freq: i % 2 === 0 ? 880 : 660,
            durMs: 220,
            type: "square",
            gain: 0.12,
            delayMs: i * 220,
          });
        }
        break;
      case "report":
        // Short rising sweep
        playTone(ctx, this.master, { freq: 300, endFreq: 900, durMs: 320, type: "sine", gain: 0.25 });
        break;
      case "taskComplete":
        // Ding
        playTone(ctx, this.master, { freq: 1318, durMs: 220, type: "sine", gain: 0.2 });
        playTone(ctx, this.master, { freq: 1760, durMs: 260, type: "sine", gain: 0.12, delayMs: 90 });
        break;
      case "sabotageAlarm":
        // Low pulsating alarm
        for (let i = 0; i < 6; i++) {
          playTone(ctx, this.master, { freq: 180, durMs: 140, type: "square", gain: 0.16, delayMs: i * 250 });
        }
        break;
      case "vent":
        // Filtered noise burst
        playNoise(ctx, this.master, { durMs: 200, gain: 0.3, filterHz: 500 });
        break;
      case "eject":
        // Shhh — white noise fade
        playNoise(ctx, this.master, { durMs: 1100, gain: 0.25, filterHz: 2000, fadeOut: true });
        break;
      case "victory":
        // Major chord (C-E-G)
        playChord(ctx, this.master, [523, 659, 784], 900);
        break;
      case "defeat":
        // Minor chord (A-C-E), darker
        playChord(ctx, this.master, [440, 523, 659], 1100, 0.12);
        break;
      case "click":
        // Short UI tick
        playTone(ctx, this.master, { freq: 2000, durMs: 40, type: "square", gain: 0.06 });
        break;
    }
  }

  /** Low ambient drone during gameplay: two detuned oscillators + slow LFO. */
  startAmbient(): void {
    const ctx = this.ensureCtx();
    if (!ctx || !this.master || this.ambientPlaying) return;
    this.ambientPlaying = true;

    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.05;

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = 55.4; // slow beating

    // LFO modulates the drone level
    this.ambientLfo = ctx.createOscillator();
    this.ambientLfo.frequency.value = 0.08; // Hz — very slow swell
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    this.ambientLfo.connect(lfoGain).connect(this.ambientGain.gain);

    o1.connect(this.ambientGain);
    o2.connect(this.ambientGain);
    this.ambientGain.connect(this.master);

    o1.start();
    o2.start();
    this.ambientLfo.start();
  }

  /** Meeting tension: double the LFO swell speed. */
  setMeetingTempo(inMeeting: boolean): void {
    if (this.ambientLfo && this.ctx) {
      this.ambientLfo.frequency.setTargetAtTime(inMeeting ? 0.16 : 0.08, this.ctx.currentTime, 0.5);
    }
  }

  stopAmbient(): void {
    if (!this.ambientPlaying) return;
    this.ambientPlaying = false;
    try {
      this.ambientLfo?.stop();
    } catch { /* already stopped */ }
    this.ambientGain?.disconnect();
    this.ambientLfo = null;
    this.ambientGain = null;
  }
}

export const audio = new AudioManager();
