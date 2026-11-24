// QumenX project data model.
// All new fields are optional or have defaults so older project files load unchanged.

export type AssetType = "video" | "audio" | "image";
export type TrackType = "video" | "audio" | "text" | "overlay" | "image";
export type TransitionKind =
  | "fade" | "dissolve" | "crossfade" | "slide" | "zoom" | "wipe" | "blur";
export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5" | "21:9" | "custom";
export type EffectKind =
  | "brightness" | "contrast" | "saturation" | "exposure" | "temperature" | "tint"
  | "highlights" | "shadows" | "gamma" | "sharpness" | "blur" | "gaussianBlur"
  | "vignette" | "grayscale" | "sepia" | "fadeIn" | "fadeOut";
export type KeyframeProperty =
  | "positionX" | "positionY" | "scale" | "rotation" | "opacity" | "volume"
  | "cropTop" | "cropRight" | "cropBottom" | "cropLeft";
export type TextAnimationKind =
  | "none" | "fadeIn" | "fadeOut" | "slideIn" | "slideOut"
  | "zoomIn" | "zoomOut" | "typewriter";

export interface Point { x: number; y: number; }
export interface Size { width: number; height: number; }

/** Per-clip audio processing applied in preview and in the real FFmpeg export. */
export interface AudioDsp {
  enabled: boolean;
  highpassHz: number;   // 0 = bypass
  lowpassHz: number;    // 0 = bypass
  lowGainDb: number;    // 160 Hz shelf
  midGainDb: number;    // 1 kHz bell
  highGainDb: number;   // 8 kHz shelf
  compressor: boolean;
  thresholdDb: number;  // -60..0
  ratio: number;        // 1..20
  attackMs: number;     // 1..200
  releaseMs: number;    // 10..2000
}
export interface Crop { top: number; right: number; bottom: number; left: number; }

export type MaskKind = "none" | "rectangle" | "ellipse";

/** Normalized (0..1) mask geometry applied to a media clip in preview and export. */
export interface ClipMask {
  kind: MaskKind;
  x: number;         // center X, 0..1 of the clip frame
  y: number;         // center Y, 0..1
  width: number;     // 0..1
  height: number;    // 0..1
  rotation: number;  // degrees
  feather: number;   // edge softness, 0..0.5 of the shorter side
  invert: boolean;
}

export interface Transform {
  position: Point;       // pixel offset from center in preview coords
  scale: number;         // 1.0 = 100%
  rotation: number;      // degrees
  opacity: number;       // 0..1
  width?: number;        // optional explicit width (source pixels before scale)
  height?: number;
}

export interface Keyframe {
  id: string;
  time: number;          // seconds within clip
  value: number;
  property: KeyframeProperty;
  easing: "linear" | "easeIn" | "easeOut" | "easeInOut";
}

export interface ClipEffect {
  id: string;
  kind: EffectKind;
  enabled: boolean;
  value: number;         // normalized, meaning depends on kind
  startTime?: number;    // seconds within clip
  endTime?: number;
}

export interface TextStyle {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  outlineWidth: number;
  outlineColor: string;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  background: boolean;
  backgroundColor: string;
  backgroundPadding: number;
  letterSpacing: number;
  lineSpacing: number;
  animation: TextAnimationKind;
  animationDuration: number;
}

export interface Clip {
  id: string;
  trackId: string;
  assetId: string;       // empty for text clips
  name: string;
  start: number;         // timeline start (seconds)
  duration: number;      // timeline duration (seconds)
  sourceOffset: number;  // source start (seconds, pre-speed)
  speed: number;         // 1.0 normal, negative = reverse
  transform: Transform;
  opacity: number;       // 0..1
  keyframes: Keyframe[];
  effects: ClipEffect[];
  muted: boolean;
  volume: number;        // 0..1+ (gain)
  transitionIn?: { kind: TransitionKind; duration: number };
  transitionOut?: { kind: TransitionKind; duration: number };
  zIndex: number;
  colorTag?: string;
  // --- editing-engine fields (all optional for backward compatibility) ---
  crop?: Crop;
  mask?: ClipMask;
  flipH?: boolean;
  flipV?: boolean;
  freeze?: { enabled: boolean; at: number; duration: number };
  fadeIn?: number;       // seconds
  fadeOut?: number;      // seconds
  audioFadeIn?: number;  // seconds
  audioFadeOut?: number; // seconds
  audioDsp?: AudioDsp;   // local EQ/dynamics processing
  text?: TextStyle;
  caption?: boolean;     // true for imported/manual subtitle clips
  groupId?: string;
  blendMode?: "normal" | "screen" | "multiply" | "overlay";
  detachOf?: string;     // audio clip detached from this video clip id
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  visible: boolean;
  locked: boolean;
  muted: boolean;
  order: number;
  height: number;        // px
  groupId?: string;
}

export interface ProjectSettings {
  id: string;
  aspectRatio: AspectRatio;
  customWidth?: number;
  customHeight?: number;
  fps: number;
  resolution: "480p" | "720p" | "1080p" | "1440p" | "4K" | "custom";
  codec: "h264" | "h265" | "vp9" | "av1";
  audioBitrate: number;  // kbps
  videoBitrate?: number;
  crf?: number;
  proxyEnabled?: boolean;
  previewQuality?: "low" | "medium" | "high";
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  path: string;          // absolute source path (never modified)
  duration: number;      // seconds
  width: number;
  height: number;
  fps: number;
  size: number;          // bytes
  thumbPath?: string;
  dateAdded: number;
  proxyPath?: string;
  hasAudio?: boolean;
  waveform?: number[];   // cached peaks (generated, never modifies source)
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  path?: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  assets: Asset[];
  tracks: Track[];
  clips: Clip[];
  markers: Marker[];
  version: number;
}

export interface ExportJob {
  id: string;
  status: "queued" | "encoding" | "completed" | "cancelled" | "failed";
  progress: number;
  outputPath: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  estimatedRemainingMs?: number;
}

export interface UndoEntry {
  id: string;
  timestamp: number;
  label: string;
  inverse: () => void;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  id: "settings",
  aspectRatio: "16:9",
  fps: 30,
  resolution: "1080p",
  codec: "h264",
  audioBitrate: 128,
  crf: 23,
  proxyEnabled: true,
  previewQuality: "medium",
};

export const DEFAULT_CROP: Crop = { top: 0, right: 0, bottom: 0, left: 0 };

export const DEFAULT_MASK: ClipMask = {
  kind: "none",
  x: 0.5,
  y: 0.5,
  width: 0.5,
  height: 0.5,
  rotation: 0,
  feather: 0,
  invert: false,
};

export const DEFAULT_AUDIO_DSP: AudioDsp = {
  enabled: false,
  highpassHz: 0,
  lowpassHz: 0,
  lowGainDb: 0,
  midGainDb: 0,
  highGainDb: 0,
  compressor: false,
  thresholdDb: -18,
  ratio: 3,
  attackMs: 10,
  releaseMs: 180,
};

export const DEFAULT_TEXT: TextStyle = {
  text: "Text",
  fontFamily: "Arial",
  fontSize: 64,
  fontWeight: 400,
  color: "#ffffff",
  align: "center",
  outlineWidth: 0,
  outlineColor: "#000000",
  shadow: false,
  shadowColor: "#000000",
  shadowBlur: 8,
  background: false,
  backgroundColor: "#000000",
  backgroundPadding: 12,
  letterSpacing: 0,
  lineSpacing: 1.2,
  animation: "none",
  animationDuration: 0.5,
};

export const ASPECT_RATIOS: Array<{ label: string; value: AspectRatio; w: number; h: number }> = [
  { label: "16:9 (Widescreen)", value: "16:9", w: 1920, h: 1080 },
  { label: "9:16 (Vertical/Shorts)", value: "9:16", w: 1080, h: 1920 },
  { label: "1:1 (Square)", value: "1:1", w: 1080, h: 1080 },
  { label: "4:5 (Portrait)", value: "4:5", w: 1080, h: 1350 },
  { label: "21:9 (Cinematic)", value: "21:9", w: 2560, h: 1080 },
  { label: "Custom", value: "custom", w: 1920, h: 1080 },
];

export const RESOLUTIONS: Array<{ label: string; value: ProjectSettings["resolution"]; w: number; h: number }> = [
  { label: "480p", value: "480p", w: 854, h: 480 },
  { label: "720p (HD)", value: "720p", w: 1280, h: 720 },
  { label: "1080p (Full HD)", value: "1080p", w: 1920, h: 1080 },
  { label: "1440p (QHD)", value: "1440p", w: 2560, h: 1440 },
  { label: "4K (UHD)", value: "4K", w: 3840, h: 2160 },
  { label: "Custom", value: "custom", w: 1920, h: 1080 },
];

export const FRAME_RATES = [24, 25, 30, 50, 60];

export const DEFAULT_TRANSFORM: Transform = {
  position: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
  opacity: 1,
};

export function newClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: crypto.randomUUID(),
    trackId: "",
    assetId: "",
    name: "",
    start: 0,
    duration: 0,
    sourceOffset: 0,
    speed: 1,
    transform: { ...DEFAULT_TRANSFORM, position: { ...DEFAULT_TRANSFORM.position } },
    opacity: 1,
    keyframes: [],
    effects: [],
    muted: false,
    volume: 1,
    zIndex: 0,
    crop: { ...DEFAULT_CROP },
    flipH: false,
    flipV: false,
    fadeIn: 0,
    fadeOut: 0,
    audioFadeIn: 0,
    audioFadeOut: 0,
    ...overrides,
  };
}

export function newAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: crypto.randomUUID(),
    name: "",
    type: "video",
    path: "",
    duration: 0,
    width: 0,
    height: 0,
    fps: 30,
    size: 0,
    dateAdded: Date.now(),
    ...overrides,
  };
}

export function newTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: crypto.randomUUID(),
    name: "",
    type: "video",
    visible: true,
    locked: false,
    muted: false,
    order: 0,
    height: 70,
    ...overrides,
  };
}

/** Frame-accurate time helpers ------------------------------------------------ */
export function timeToFrame(t: number, fps: number): number {
  return Math.max(0, Math.round(t * fps));
}
export function frameToTime(frame: number, fps: number): number {
  return Math.max(0, frame) / fps;
}
export function snapTimeToFrame(t: number, fps: number): number {
  return frameToTime(timeToFrame(t, fps), fps);
}

/**
 * Linearly interpolate keyframed numeric properties at local clip time.
 * Falls back to the base value when there are no keyframes for the property.
 */
export function keyframeValue(
  clip: Clip,
  property: KeyframeProperty,
  localTime: number,
  base: number
): number {
  const frames = clip.keyframes
    .filter((k) => k.property === property)
    .sort((a, b) => a.time - b.time);
  if (frames.length === 0) return base;
  if (localTime <= frames[0].time) return frames[0].value;
  const last = frames[frames.length - 1];
  if (localTime >= last.time) return last.value;
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (localTime >= a.time && localTime <= b.time) {
      const span = b.time - a.time;
      let p = span <= 0 ? 1 : (localTime - a.time) / span;
      if (a.easing === "easeIn") p = p * p;
      else if (a.easing === "easeOut") p = 1 - (1 - p) * (1 - p);
      else if (a.easing === "easeInOut") p = p * p * (3 - 2 * p);
      return a.value + (b.value - a.value) * p;
    }
  }
  return base;
}

/** Convert stored effect values into a CSS filter string for the preview. */
export function clipCssFilter(clip: Clip): string {
  const v = (kind: EffectKind) => clip.effects.find((e) => e.kind === kind && e.enabled)?.value ?? 0;
  const parts: string[] = [];
  if (v("brightness")) parts.push(`brightness(${1 + v("brightness")})`);
  if (v("contrast")) parts.push(`contrast(${1 + v("contrast")})`);
  if (v("saturation")) parts.push(`saturate(${1 + v("saturation")})`);
  if (v("exposure")) parts.push(`brightness(${1 + v("exposure") * 0.5})`);
  if (v("gamma")) parts.push(`contrast(${1 - v("gamma") * 0.3})`);
  if (v("sharpness")) parts.push(`contrast(${1 + v("sharpness") * 0.2})`);
  const temperature = v("temperature");
  if (temperature) {
    parts.push(`sepia(${Math.abs(temperature) * 0.5})`);
    parts.push(`hue-rotate(${temperature > 0 ? -20 : 20}deg)`);
  }
  if (v("tint")) parts.push(`hue-rotate(${v("tint") * 30}deg)`);
  if (v("highlights") > 0) parts.push(`brightness(${1 + v("highlights") * 0.25})`);
  if (v("shadows") > 0) parts.push(`contrast(${1 - v("shadows") * 0.25}) brightness(${1 + v("shadows") * 0.1})`);
  if (v("blur") || v("gaussianBlur")) parts.push(`blur(${Math.max(v("blur"), v("gaussianBlur")) * 8}px)`);
  if (v("grayscale")) parts.push(`grayscale(${v("grayscale")})`);
  if (v("sepia")) parts.push(`sepia(${v("sepia")})`);
  return parts.join(" ");
}

/** Vignette is a composite overlay rather than a CSS filter primitive. */
export function clipVignette(clip: Clip): boolean {
  return clip.effects.some((e) => e.kind === "vignette" && e.enabled);
}
