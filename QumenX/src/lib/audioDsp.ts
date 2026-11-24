import { type AudioDsp, DEFAULT_AUDIO_DSP } from "@/types/project";

export interface AudioDspPreset {
  id: string;
  label: string;
  dsp: AudioDsp;
}

export const AUDIO_DSP_PRESETS: AudioDspPreset[] = [
  {
    id: "voice",
    label: "Voice clarity",
    dsp: {
      ...DEFAULT_AUDIO_DSP,
      enabled: true,
      highpassHz: 90,
      lowpassHz: 12000,
      lowGainDb: -3,
      midGainDb: 2,
      highGainDb: 4,
      compressor: true,
      thresholdDb: -18,
      ratio: 3,
      attackMs: 10,
      releaseMs: 180,
    },
  },
  {
    id: "podcast",
    label: "Podcast",
    dsp: {
      ...DEFAULT_AUDIO_DSP,
      enabled: true,
      highpassHz: 120,
      lowpassHz: 10000,
      lowGainDb: -6,
      midGainDb: 3,
      highGainDb: 2,
      compressor: true,
      thresholdDb: -20,
      ratio: 4,
      attackMs: 8,
      releaseMs: 160,
    },
  },
  {
    id: "music",
    label: "Music",
    dsp: {
      ...DEFAULT_AUDIO_DSP,
      enabled: true,
      highpassHz: 25,
      lowpassHz: 18000,
      lowGainDb: 2,
      midGainDb: 0,
      highGainDb: 1,
      compressor: true,
      thresholdDb: -12,
      ratio: 2,
      attackMs: 20,
      releaseMs: 250,
    },
  },
];

export function resolveAudioDsp(source?: AudioDsp | null): AudioDsp {
  return { ...DEFAULT_AUDIO_DSP, ...(source ?? {}) };
}

export function audioDspIsActive(dsp: AudioDsp): boolean {
  if (!dsp.enabled) return false;
  return dsp.highpassHz > 20
    || (dsp.lowpassHz > 100 && dsp.lowpassHz < 22000)
    || Math.abs(dsp.lowGainDb) > 0.05
    || Math.abs(dsp.midGainDb) > 0.05
    || Math.abs(dsp.highGainDb) > 0.05
    || dsp.compressor;
}

interface DspNodes {
  source: MediaElementAudioSourceNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  output: GainNode;
}

let context: AudioContext | null = null;
let nodes = new WeakMap<HTMLMediaElement, DspNodes>();

function getContext(): AudioContext | null {
  if (context && context.state !== "closed") return context;
  try {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    nodes = new WeakMap<HTMLMediaElement, DspNodes>();
    return context;
  } catch {
    return null;
  }
}

function ramp(param: AudioParam, value: number, ctx: AudioContext): void {
  try { param.setTargetAtTime(value, ctx.currentTime, 0.015); }
  catch { param.value = value; }
}

function createNodes(el: HTMLMediaElement, ctx: AudioContext): DspNodes | null {
  try {
    const source = ctx.createMediaElementSource(el);
    const highpass = ctx.createBiquadFilter();
    const lowpass = ctx.createBiquadFilter();
    const low = ctx.createBiquadFilter();
    const mid = ctx.createBiquadFilter();
    const high = ctx.createBiquadFilter();
    const compressor = ctx.createDynamicsCompressor();
    const output = ctx.createGain();

    highpass.type = "highpass";
    lowpass.type = "lowpass";
    low.type = "lowshelf";
    mid.type = "peaking";
    high.type = "highshelf";
    mid.Q.value = 1;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(compressor);
    compressor.connect(output);
    output.connect(ctx.destination);

    const created = { source, highpass, lowpass, low, mid, high, compressor, output };
    nodes.set(el, created);
    return created;
  } catch {
    return null;
  }
}

/** Apply clip DSP to a preview media element. Neutral settings bypass the graph. */
export function applyPreviewAudioDsp(
  el: HTMLMediaElement,
  dsp: AudioDsp,
  playing: boolean,
  gain: number,
): boolean {
  if (!audioDspIsActive(dsp) && !nodes.has(el)) return false;
  const ctx = getContext();
  if (!ctx) return false;
  if (playing && ctx.state === "suspended") {
    void ctx.resume().catch(() => { /* gesture may be required */ });
  }

  const graph = nodes.get(el) ?? createNodes(el, ctx);
  if (!graph) return false;

  const active = audioDspIsActive(dsp);
  const nyquist = Math.max(4000, ctx.sampleRate / 2 - 100);
  const hp = active ? Math.min(Math.max(dsp.highpassHz, 10), nyquist) : 10;
  const lp = active && dsp.lowpassHz > 100
    ? Math.min(Math.max(dsp.lowpassHz, hp + 50), nyquist)
    : nyquist;

  ramp(graph.highpass.frequency, hp, ctx);
  ramp(graph.lowpass.frequency, lp, ctx);
  ramp(graph.low.frequency, 160, ctx);
  ramp(graph.low.gain, active ? dsp.lowGainDb : 0, ctx);
  ramp(graph.mid.frequency, 1000, ctx);
  ramp(graph.mid.gain, active ? dsp.midGainDb : 0, ctx);
  ramp(graph.high.frequency, 8000, ctx);
  ramp(graph.high.gain, active ? dsp.highGainDb : 0, ctx);
  ramp(graph.compressor.threshold, active && dsp.compressor ? dsp.thresholdDb : 0, ctx);
  ramp(graph.compressor.ratio, active && dsp.compressor ? dsp.ratio : 1, ctx);
  ramp(graph.compressor.attack, active && dsp.compressor ? dsp.attackMs / 1000 : 0, ctx);
  ramp(graph.compressor.release, active && dsp.compressor ? dsp.releaseMs / 1000 : 0, ctx);
  ramp(graph.compressor.knee, 0, ctx);
  ramp(graph.output.gain, Math.max(0, Math.min(4, gain)), ctx);
  return true;
}

export function disposePreviewAudioDsp(): void {
  nodes = new WeakMap<HTMLMediaElement, DspNodes>();
  if (context && context.state !== "closed") {
    void context.close().catch(() => { /* already closing */ });
  }
  context = null;
}
