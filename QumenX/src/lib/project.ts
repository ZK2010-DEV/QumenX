import { invoke } from "@tauri-apps/api/core";
import {
  Project,
  DEFAULT_SETTINGS,
  DEFAULT_CROP,
  DEFAULT_TEXT,
  newAsset,
} from "@/types/project";

export interface ProjectFileMeta {
  id: string;
  name: string;
  path: string;
  updatedAt: number;
}

export interface ProjectBackup {
  path: string;
  createdAt: number;
  size: number;
}

/** 2 = QumenX editing-engine model (keyframes, text, effects, transitions). */
export const PROJECT_VERSION = 2;

export function newProject(name = "Untitled Project"): Project {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: { ...DEFAULT_SETTINGS },
    assets: [],
    tracks: [],
    clips: [],
    markers: [],
    version: PROJECT_VERSION,
  };
}

export function serializeProject(project: Project): string {
  return JSON.stringify({ ...project, version: PROJECT_VERSION }, null, 2);
}

/** Restore defaults for fields introduced after version 1. */
export function deserializeProject(json: string): Project {
  const p = JSON.parse(json) as Partial<Project>;
  const fps = p.settings?.fps || DEFAULT_SETTINGS.fps;
  return {
    id: p.id ?? crypto.randomUUID(),
    name: p.name ?? "Untitled Project",
    path: p.path,
    createdAt: p.createdAt ?? Date.now(),
    updatedAt: p.updatedAt ?? Date.now(),
    settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    assets: (p.assets ?? []).map((a) => ({ ...newAsset(), ...a })),
    tracks: (p.tracks ?? []).map((t) => ({
      ...t,
      id: t.id ?? crypto.randomUUID(),
      name: t.name ?? "Track",
      type: t.type ?? "video",
      visible: t.visible ?? true,
      locked: t.locked ?? false,
      muted: t.muted ?? false,
      order: t.order ?? 0,
      height: t.height ?? 64,
    })),
    clips: (p.clips ?? []).map((c) => ({
      ...c,
      id: c.id ?? crypto.randomUUID(),
      trackId: c.trackId ?? "",
      assetId: c.assetId ?? "",
      name: c.name ?? "Clip",
      start: c.start ?? 0,
      duration: c.duration ?? 1 / fps,
      sourceOffset: c.sourceOffset ?? 0,
      speed: c.speed || 1,
      transform: {
        position: { x: c.transform?.position?.x ?? 0, y: c.transform?.position?.y ?? 0 },
        scale: c.transform?.scale ?? 1,
        rotation: c.transform?.rotation ?? 0,
        opacity: c.transform?.opacity ?? 1,
        width: c.transform?.width,
        height: c.transform?.height,
      },
      opacity: c.opacity ?? 1,
      keyframes: c.keyframes ?? [],
      effects: c.effects ?? [],
      muted: c.muted ?? false,
      volume: c.volume ?? 1,
      zIndex: c.zIndex ?? 0,
      crop: { ...DEFAULT_CROP, ...(c.crop ?? {}) },
      flipH: c.flipH ?? false,
      flipV: c.flipV ?? false,
      fadeIn: c.fadeIn ?? 0,
      fadeOut: c.fadeOut ?? 0,
      audioFadeIn: c.audioFadeIn ?? 0,
      audioFadeOut: c.audioFadeOut ?? 0,
      text: c.text ? { ...DEFAULT_TEXT, ...c.text } : undefined,
    })),
    markers: p.markers ?? [],
    version: p.version ?? PROJECT_VERSION,
  };
}

export async function saveProjectFile(project: Project, filePath: string): Promise<string> {
  return invoke<string>("project_save", {
    project_json: serializeProject(project),
    file_path: filePath,
  });
}

export interface OpenProjectResult {
  project: Project;
  recoveredFrom?: string;
}

export async function openProjectFile(filePath: string): Promise<OpenProjectResult> {
  const json = await invoke<string>("project_open", { file_path: filePath });
  let recoveredFrom: string | undefined;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (typeof raw.__recoveredFrom === "string") recoveredFrom = raw.__recoveredFrom;
  } catch {
    // deserializeProject below will surface a proper parse error.
  }
  return { project: deserializeProject(json), recoveredFrom };
}

export async function listBackups(filePath: string): Promise<ProjectBackup[]> {
  return invoke<ProjectBackup[]>("project_list_backups", { file_path: filePath });
}

export async function restoreBackup(backupPath: string, targetPath: string): Promise<string> {
  return invoke<string>("project_restore_backup", {
    backup_path: backupPath,
    target_path: targetPath,
  });
}

export async function getRecentProjects(): Promise<ProjectFileMeta[]> {
  const metas = await invoke<Array<{ id: string; name: string; path: string; updated_at: number }>>(
    "project_recent",
    {}
  );
  return metas.map((m) => ({ id: m.id, name: m.name, path: m.path, updatedAt: m.updated_at }));
}

export async function addRecentProject(meta: ProjectFileMeta): Promise<void> {
  return invoke("project_add_recent", {
    meta: {
      id: meta.id,
      name: meta.name,
      path: meta.path,
      updated_at: meta.updatedAt,
    },
  });
}

export async function showInFolder(path: string): Promise<void> {
  return invoke("open_path", { path });
}
