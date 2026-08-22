// Web Audio synthesis primitives — no audio assets, everything is generated.

export type WaveKind = OscillatorType;

export function createAudioContext(): AudioContext {
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  return new Ctor();
}

/** Play a single tone with an exponential decay envelope. */
export function playTone(
  ctx: AudioContext,
  dest: AudioNode,
  opts: {
    freq: number;
    durMs: number;
    type?: WaveKind;
    gain?: number;
    delayMs?: number;
    endFreq?: number; // pitch glide target
  }
): void {
  const { freq, durMs, type = "sine", gain = 0.2, delayMs = 0, endFreq } = opts;
  const t0 = ctx.currentTime + delayMs / 1000;
  const t1 = t0 + durMs / 1000;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t1);
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.connect(env).connect(dest);
  osc.start(t0);
  osc.stop(t1 + 0.05);
}

/** White-noise buffer (reusable, 1 second). */
let noiseBuffer: AudioBuffer | null = null;
export function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = ctx.sampleRate; // 1s
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/** Filtered noise burst (vents, eject hiss). */
export function playNoise(
  ctx: AudioContext,
  dest: AudioNode,
  opts: { durMs: number; gain?: number; filterHz?: number; fadeOut?: boolean; delayMs?: number }
): void {
  const { durMs, gain = 0.2, filterHz = 800, fadeOut = false, delayMs = 0 } = opts;
  const t0 = ctx.currentTime + delayMs / 1000;
  const t1 = t0 + durMs / 1000;

  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterHz;

  const env = ctx.createGain();
  env.gain.setValueAtTime(fadeOut ? gain : 0.0001, t0);
  if (fadeOut) {
    env.gain.exponentialRampToValueAtTime(0.0001, t1); // hiss fading out
  } else {
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);
  }

  src.connect(filter).connect(env).connect(dest);
  src.start(t0);
  src.stop(t1 + 0.05);
}

/** Chord (victory/defeat): several tones at once with a longer decay. */
export function playChord(ctx: AudioContext, dest: AudioNode, freqs: number[], durMs: number, gain = 0.15): void {
  freqs.forEach((f, i) => {
    playTone(ctx, dest, { freq: f, durMs, type: "triangle", gain, delayMs: i * 90 });
  });
}
