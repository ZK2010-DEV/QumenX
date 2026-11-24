import { invoke } from "@tauri-apps/api/core";
import {
  type Clip, type Marker, type Project, type ProjectSettings, type TextAnimationKind,
  DEFAULT_TEXT, DEFAULT_TRANSFORM, newClip, newTrack,
} from "@/types/project";

export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  builtin?: boolean;
  createdAt?: number;
  project: Project;
}

export type TemplateInfo = ProjectTemplate;

interface TemplateSpec {
  id: string;
  name: string;
  description: string;
  settings: Partial<ProjectSettings>;
  markers: Array<{ time: number; label: string; color?: string }>;
  textClips: Array<{
    id: string;
    start: number;
    duration: number;
    text: string;
    fontSize: number;
    y: number;
    animation?: TextAnimationKind;
    align?: "left" | "center" | "right";
    background?: boolean;
  }>;
}

function textClip(spec: TemplateSpec["textClips"][number]): Clip {
  return newClip({
    id: spec.id,
    trackId: "tpl-text",
    assetId: "",
    name: spec.text.slice(0, 24) || "Title",
    start: spec.start,
    duration: spec.duration,
    zIndex: 100,
    text: {
      ...DEFAULT_TEXT,
      text: spec.text,
      fontSize: spec.fontSize,
      fontWeight: 700,
      align: spec.align ?? "center",
      animation: spec.animation ?? "fadeIn",
      animationDuration: 0.6,
      background: spec.background ?? false,
      backgroundColor: "#000000AA",
      backgroundPadding: 10,
      outlineWidth: 2,
      outlineColor: "#000000",
    },
    transform: {
      ...DEFAULT_TRANSFORM,
      position: { x: 0, y: spec.y },
    },
  });
}

function buildTemplate(spec: TemplateSpec): ProjectTemplate {
  const settings: ProjectSettings = {
    id: "settings",
    aspectRatio: "16:9",
    fps: 30,
    resolution: "1080p",
    codec: "h264",
    audioBitrate: 128,
    crf: 23,
    proxyEnabled: true,
    previewQuality: "medium",
    ...spec.settings,
  };
  const markers: Marker[] = spec.markers.map((m, index) => ({
    id: `${spec.id}-marker-${index + 1}`,
    time: m.time,
    label: m.label,
    color: m.color ?? "#f59e0b",
  }));
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    builtin: true,
    project: {
      id: `template-${spec.id}`,
      name: spec.name,
      createdAt: 1,
      updatedAt: 1,
      settings,
      assets: [],
      tracks: [
        newTrack({ id: "tpl-video", name: "Video 1", type: "video", order: 0, height: 70 }),
        newTrack({ id: "tpl-audio", name: "Audio 1", type: "audio", order: 1, height: 48 }),
        newTrack({ id: "tpl-text", name: "Text 1", type: "text", order: 2, height: 56 }),
      ],
      clips: spec.textClips.map(textClip),
      markers,
      version: 2,
    },
  };
}

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  buildTemplate({
    id: "widescreen-intro",
    name: "Widescreen intro",
    description: "16:9 opener with title, subtitle and chapter markers.",
    settings: { aspectRatio: "16:9", resolution: "1080p", fps: 30 },
    markers: [
      { time: 0, label: "Opening title", color: "#38bdf8" },
      { time: 2, label: "Content starts", color: "#10b981" },
    ],
    textClips: [
      { id: "tpl-intro-title", start: 0, duration: 2, text: "Your Story", fontSize: 96, y: -40, animation: "zoomIn" },
      { id: "tpl-intro-sub", start: 2, duration: 2, text: "Add your video here", fontSize: 48, y: 290, animation: "fadeIn" },
    ],
  }),
  buildTemplate({
    id: "vertical-shorts",
    name: "Vertical shorts",
    description: "9:16 layout with hook and call-to-action text.",
    settings: { aspectRatio: "9:16", resolution: "1080p", fps: 30 },
    markers: [
      { time: 0, label: "Hook", color: "#f472b6" },
      { time: 1.5, label: "Payoff", color: "#a855f7" },
    ],
    textClips: [
      { id: "tpl-shorts-hook", start: 0, duration: 1.5, text: "WAIT FOR IT", fontSize: 84, y: -220, animation: "zoomIn" },
      { id: "tpl-shorts-cta", start: 1.5, duration: 2, text: "Follow for more", fontSize: 64, y: 520, background: true, animation: "fadeIn" },
    ],
  }),
  buildTemplate({
    id: "podcast-interview",
    name: "Podcast interview",
    description: "Lower-thirds and section markers for a talking-head edit.",
    settings: { aspectRatio: "16:9", resolution: "1080p", fps: 30 },
    markers: [
      { time: 0, label: "Intro", color: "#f59e0b" },
      { time: 3, label: "Guest", color: "#22d3ee" },
      { time: 6, label: "Outro", color: "#10b981" },
    ],
    textClips: [
      { id: "tpl-podcast-name", start: 0.5, duration: 3, text: "HOST · Guest Name", fontSize: 46, y: 330, align: "left", background: true, animation: "slideIn" },
      { id: "tpl-podcast-outro", start: 6, duration: 2, text: "Subscribe & listen anywhere", fontSize: 56, y: 0, animation: "fadeIn" },
    ],
  }),
  buildTemplate({
    id: "clean-slideshow",
    name: "Clean slideshow",
    description: "Three evenly spaced title cards on an empty video track.",
    settings: { aspectRatio: "16:9", resolution: "1080p", fps: 30 },
    markers: [
      { time: 0, label: "Slide 1", color: "#60a5fa" },
      { time: 3, label: "Slide 2", color: "#60a5fa" },
      { time: 6, label: "Slide 3", color: "#60a5fa" },
    ],
    textClips: [
      { id: "tpl-slide-1", start: 0, duration: 3, text: "01 · Opening", fontSize: 78, y: -30, animation: "fadeIn" },
      { id: "tpl-slide-2", start: 3, duration: 3, text: "02 · Details", fontSize: 78, y: -30, animation: "fadeIn" },
      { id: "tpl-slide-3", start: 6, duration: 3, text: "03 · Closing", fontSize: 78, y: -30, animation: "fadeIn" },
    ],
  }),
];

export async function listTemplates(): Promise<TemplateInfo[]> {
  return invoke<TemplateInfo[]>("template_list", {});
}

export async function saveTemplate(template: ProjectTemplate): Promise<TemplateInfo> {
  return invoke<TemplateInfo>("template_save", { template_json: JSON.stringify(template) });
}

export async function deleteTemplate(id: string): Promise<void> {
  return invoke("template_delete", { id });
}
