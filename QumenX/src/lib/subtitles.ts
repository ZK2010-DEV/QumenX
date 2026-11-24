import { invoke } from "@tauri-apps/api/core";
import type { ProjectSettings, TextStyle } from "@/types/project";

/** A timing-only caption cue. Timeline clips own the final text style. */
export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

const RESOLUTION_HEIGHT: Record<NonNullable<ProjectSettings["resolution"]>, number> = {
  "480p": 480,
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
  "4K": 2160,
  custom: 1080,
};

/** Canvas height used by the real FFmpeg export graph and the preview stage. */
export function canvasHeight(settings: ProjectSettings): number {
  if (settings.resolution === "custom") {
    const raw = Math.max(2, Math.round(settings.customHeight || 1080));
    return raw - (raw % 2);
  }
  const raw = RESOLUTION_HEIGHT[settings.resolution] || 1080;
  return raw - (raw % 2);
}

/** Readable, bottom-anchored subtitle styling that works in preview and drawtext. */
export function captionTextStyle(height: number): Partial<TextStyle> {
  return {
    fontFamily: "Arial",
    fontSize: Math.max(22, Math.round(height * 0.05)),
    fontWeight: 600,
    color: "#ffffff",
    align: "center",
    outlineWidth: Math.max(1, Math.round(height / 400)),
    outlineColor: "#000000",
    shadow: true,
    shadowColor: "#000000",
    shadowBlur: Math.max(4, Math.round(height / 120)),
    background: true,
    backgroundColor: "#000000AA",
    backgroundPadding: Math.max(5, Math.round(height / 100)),
    letterSpacing: 0,
    lineSpacing: 1.15,
    animation: "none",
  };
}

/** Positive Y moves the anchored text down toward the bottom of the frame. */
export function captionOffsetY(height: number): number {
  return Math.round(height * 0.34);
}

function parseTimestamp(raw: string): number | null {
  const parts = raw.trim().split(":");
  let hours = 0;
  let minutes = 0;
  let secondsPart = "";
  if (parts.length === 3) {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
    secondsPart = parts[2];
  } else if (parts.length === 2) {
    minutes = Number(parts[0]);
    secondsPart = parts[1];
  } else if (parts.length === 1) {
    secondsPart = parts[0];
  } else {
    return null;
  }
  const match = secondsPart.match(/^(\d{1,2})[,.](\d{1,3})$/);
  if (!match || !Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const seconds = Number(match[1]);
  const fraction = Number(match[2]) / Math.pow(10, match[2].length);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function cleanCaptionText(raw: string): string {
  return raw
    // SRT/VTT inline tags are styling, not literal caption text.
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse SRT or WebVTT into timing-only cues. Cue identifiers, WEBVTT headers,
 * NOTE/STYLE blocks and timestamp cue settings are ignored; line breaks inside
 * a cue are preserved so drawtext and the preview render the same text.
 */
export function parseSubtitles(input: string): CaptionCue[] {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const cues: CaptionCue[] = [];
  let i = 0;

  const skipBlock = () => {
    while (i < lines.length && lines[i].trim() !== "") i++;
    if (i < lines.length) i++;
  };

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    if (/^WEBVTT\b/i.test(line) || /^(NOTE|STYLE|REGION)\b/i.test(line)) {
      skipBlock();
      continue;
    }

    // Cue identifiers are optional, so look ahead for the timestamp line.
    let timing: string | null = null;
    while (i < lines.length && timing === null) {
      const candidate = lines[i].trim();
      if (!candidate) {
        i++;
        continue;
      }
      if (candidate.includes("-->")) {
        timing = candidate;
        i++;
        break;
      }
      i++;
    }
    if (!timing) break;

    const arrow = timing.indexOf("-->");
    const start = parseTimestamp(timing.slice(0, arrow));
    // VTT cue settings follow the end timestamp (e.g. "align:start position:50%").
    const endRaw = timing.slice(arrow + 3).trim().split(/\s+/)[0] || "";
    const end = parseTimestamp(endRaw);
    if (start === null || end === null || end <= start) continue;

    const body: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      body.push(lines[i].trim());
      i++;
    }
    const caption = cleanCaptionText(body.join("\n"));
    if (caption) cues.push({ start, end, text: caption });
  }

  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

function pad(value: number, width: number): string {
  return Math.floor(value).toString().padStart(width, "0");
}

function srtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(total % 1000, 3)}`;
}

function vttTime(seconds: number): string {
  return srtTime(seconds).replace(",", ".");
}

export function serializeSrt(cues: CaptionCue[]): string {
  return [...cues]
    .sort((a, b) => a.start - b.start)
    .map((cue, index) =>
      `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`
    )
    .join("\n");
}

export function serializeVtt(cues: CaptionCue[]): string {
  return "WEBVTT\n\n" + [...cues]
    .sort((a, b) => a.start - b.start)
    .map((cue) => `${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${cue.text}\n`)
    .join("\n");
}

/** Native file IO keeps subtitle files fully local with no extra frontend plugin. */
export async function readSubtitleFile(path: string): Promise<string> {
  return invoke<string>("subtitles_read", { path });
}

export async function writeSubtitleFile(path: string, contents: string): Promise<void> {
  return invoke("subtitles_write", { path, contents });
}
