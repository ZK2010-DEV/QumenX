import { create } from "zustand";
import {
  type Project, type Clip, type Track, type Asset, type ProjectSettings,
  type Keyframe, type KeyframeProperty, type TextStyle, type EffectKind,
  type TransitionKind, type Crop, DEFAULT_SETTINGS, DEFAULT_CROP, DEFAULT_TEXT,
  newClip, newTrack, snapTimeToFrame,
} from "@/types/project";

const EMPTY_PROJECT: Project = {
  id: crypto.randomUUID(),
  name: "Untitled Project",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  settings: { ...DEFAULT_SETTINGS },
  assets: [],
  tracks: [],
  clips: [],
  markers: [],
  version: 2,
};

/** Fill in fields added after version 1 so old projects reopen correctly. */
function normalizeProject(p: Project): Project {
  const fps = p.settings?.fps || 30;
  return {
    ...p,
    version: 2,
    settings: { ...DEFAULT_SETTINGS, ...p.settings },
    assets: (p.assets ?? []).map((a) => ({ ...a, waveform: a.waveform })),
    tracks: (p.tracks ?? []).map((t) => ({ ...t, groupId: t.groupId })),
    clips: (p.clips ?? []).map((c) => ({
      ...c,
      start: snapTimeToFrame(c.start ?? 0, fps),
      duration: Math.max(1 / fps, c.duration ?? 1),
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
      volume: c.volume ?? 1,
      keyframes: c.keyframes ?? [],
      effects: c.effects ?? [],
      muted: c.muted ?? false,
      zIndex: c.zIndex ?? 0,
      crop: { ...DEFAULT_CROP, ...(c.crop ?? {}) },
      flipH: c.flipH ?? false,
      flipV: c.flipV ?? false,
      fadeIn: c.fadeIn ?? 0,
      fadeOut: c.fadeOut ?? 0,
      audioFadeIn: c.audioFadeIn ?? 0,
      audioFadeOut: c.audioFadeOut ?? 0,
      text: c.text ? { ...DEFAULT_TEXT, ...c.text } : undefined,
      freeze: c.freeze,
    })),
    markers: p.markers ?? [],
  };
}

interface ProjectState {
  project: Project;
  history: { past: Project[]; future: Project[] };
  labels: string[];
  setProject: (project: Project) => void;
  updateProject: (patch: Partial<Project>) => void;
  addAsset: (asset: Asset) => void;
  removeAsset: (assetId: string) => void;
  addTrack: (track: Partial<Track> & Pick<Track, "name" | "type">) => void;
  updateTrack: (trackId: string, patch: Partial<Track>) => void;
  removeTrack: (trackId: string) => void;
  reorderTrack: (trackId: string, newOrder: number) => void;
  addClip: (clip: Partial<Clip> & Pick<Clip, "trackId" | "assetId">) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  /** Update without creating a history entry — used during drags/scrubs. */
  updateClipLive: (clipId: string, patch: Partial<Clip>) => void;
  /** Apply one live patch to several clips (group/multi-select drags). */
  updateClipsLive: (updates: Array<{ id: string; patch: Partial<Clip> }>) => void;
  /** Live track resize; callers push history once at drag start. */
  updateTrackLive: (trackId: string, patch: Partial<Track>) => void;
  /** Live keyframe retime; callers push history once at drag start. */
  updateKeyframeLive: (clipId: string, keyframeId: string, patch: Partial<Keyframe>) => void;
  /** Snapshot current state before a transient (drag) operation. */
  pushHistory: (label?: string) => void;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, newStart: number, newTrackId: string) => void;
  splitClip: (clipId: string, atTime: number) => void;
  duplicateClip: (clipId: string) => void;
  addTextClip: (start: number, duration: number, text?: Partial<TextStyle>, trackId?: string) => string;
  updateText: (clipId: string, patch: Partial<TextStyle>) => void;
  addKeyframe: (clipId: string, property: KeyframeProperty, time: number, value: number) => void;
  updateKeyframe: (clipId: string, keyframeId: string, patch: Partial<Keyframe>) => void;
  moveKeyframe: (clipId: string, keyframeId: string, time: number) => void;
  removeKeyframe: (clipId: string, keyframeId: string) => void;
  setEffect: (clipId: string, kind: EffectKind, value: number, enabled?: boolean) => void;
  setCrop: (clipId: string, patch: Partial<Crop>) => void;
  setTransition: (clipId: string, side: "in" | "out", transition: { kind: TransitionKind; duration: number } | null) => void;
  freezeFrame: (clipId: string, at?: number, duration?: number) => void;
  detachAudio: (clipId: string) => string | null;
  groupClips: (clipIds: string[], groupId?: string) => void;
  ungroupClips: (clipIds: string[]) => void;
  updateSettings: (settings: Partial<ProjectSettings>) => void;
  setName: (name: string) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
}

function commit(state: ProjectState, project: Project, label = "Edit") {
  // Locked-track guards return the same project object. Never record a no-op
  // as an undoable edit.
  if (project === state.project) return state;
  return {
    project,
    history: {
      past: [...state.history.past.slice(-79), state.project],
      future: [],
    },
    labels: [...state.labels.slice(-79), label],
  };
}

function isClipLocked(project: Project, clipId: string): boolean {
  const clip = project.clips.find((c) => c.id === clipId);
  return !!clip && project.tracks.some((t) => t.id === clip.trackId && t.locked);
}

function withClip(project: Project, clipId: string, fn: (c: Clip) => Clip): Project {
  // A locked track protects its clips from every editor action, including
  // Inspector edits and keyboard shortcuts.
  if (isClipLocked(project, clipId)) return project;
  return { ...project, clips: project.clips.map((c) => (c.id === clipId ? fn(c) : c)), updatedAt: Date.now() };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: EMPTY_PROJECT,
  history: { past: [], future: [] },
  labels: [],

  setProject: (project) => set((state) => commit(state, normalizeProject(project), "Open project")),

  updateProject: (patch) =>
    set((state) => commit(state, { ...state.project, ...patch, updatedAt: Date.now() }, "Project update")),

  addAsset: (asset) =>
    set((state) => commit(state, {
      ...state.project,
      assets: [...state.project.assets, asset],
      updatedAt: Date.now(),
    }, "Import media")),

  removeAsset: (assetId) =>
    set((state) => commit(state, {
      ...state.project,
      assets: state.project.assets.filter((a) => a.id !== assetId),
      clips: state.project.clips.filter((c) => c.assetId !== assetId),
      updatedAt: Date.now(),
    }, "Remove media")),

  addTrack: (track) =>
    set((state) => {
      const newTrack = newTrackSelf({
        ...track,
        order: track.order ?? state.project.tracks.length,
      });
      return commit(state, {
        ...state.project,
        tracks: [...state.project.tracks, newTrack],
        updatedAt: Date.now(),
      }, "Add track");
    }),

  updateTrack: (trackId, patch) =>
    set((state) => commit(state, {
      ...state.project,
      tracks: state.project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
      updatedAt: Date.now(),
    }, "Track settings")),

  removeTrack: (trackId) =>
    set((state) => commit(state, {
      ...state.project,
      tracks: state.project.tracks
        .filter((t) => t.id !== trackId)
        .map((t, i) => ({ ...t, order: i })),
      clips: state.project.clips.filter((c) => c.trackId !== trackId),
      updatedAt: Date.now(),
    }, "Remove track")),

  reorderTrack: (trackId, newOrder) =>
    set((state) => {
      const sorted = [...state.project.tracks].sort((a, b) => a.order - b.order);
      const from = sorted.findIndex((t) => t.id === trackId);
      if (from < 0) return state;
      const to = Math.max(0, Math.min(sorted.length - 1, newOrder));
      const [moved] = sorted.splice(from, 1);
      sorted.splice(to, 0, moved);
      const reordered = sorted.map((t, i) => ({ ...t, order: i }));
      return commit(state, { ...state.project, tracks: reordered, updatedAt: Date.now() }, "Reorder track");
    }),

  addClip: (clip) =>
    set((state) => {
      if (state.project.tracks.some((t) => t.id === clip.trackId && t.locked)) return state;
      const fps = state.project.settings.fps || 30;
      const built = newClip({
        ...clip,
        start: snapTimeToFrame(clip.start ?? 0, fps),
        transform: {
          position: { x: 0, y: 0 }, scale: 1, rotation: 0, opacity: 1,
          ...(clip.transform ?? {}),
        },
        crop: { ...DEFAULT_CROP, ...(clip.crop ?? {}) },
      });
      return commit(state, {
        ...state.project,
        clips: [...state.project.clips, built],
        updatedAt: Date.now(),
      }, "Add clip");
    }),

  updateClip: (clipId, patch) =>
    set((state) => commit(state, withClip(state.project, clipId, (c) => ({ ...c, ...patch })), "Edit clip")),

  updateClipLive: (clipId, patch) =>
    set((state) => ({ project: withClip(state.project, clipId, (c) => ({ ...c, ...patch })) })),

  updateClipsLive: (updates) =>
    set((state) => ({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        clips: state.project.clips.map((c) => {
          const patch = updates.find((u) => u.id === c.id)?.patch;
          const targetLocked = !!patch?.trackId && state.project.tracks.some(
            (t) => t.id === patch.trackId && t.locked
          );
          return patch && !isClipLocked(state.project, c.id) && !targetLocked
            ? { ...c, ...patch }
            : c;
        }),
      },
    })),

  updateTrackLive: (trackId, patch) =>
    set((state) => ({
      project: {
        ...state.project,
        tracks: state.project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
      },
    })),

  updateKeyframeLive: (clipId, keyframeId, patch) =>
    set((state) => ({
      project: withClip(state.project, clipId, (c) => ({
        ...c,
        keyframes: c.keyframes
          .map((k) => (k.id === keyframeId ? { ...k, ...patch } : k))
          .sort((a, b) => a.time - b.time),
      })),
    })),

  pushHistory: (label = "Edit") =>
    set((state) => ({
      history: { past: [...state.history.past.slice(-79), state.project], future: [] },
      labels: [...state.labels.slice(-79), label],
    })),

  removeClip: (clipId) =>
    set((state) => isClipLocked(state.project, clipId) ? state : commit(state, {
      ...state.project,
      clips: state.project.clips.filter((c) => c.id !== clipId),
      updatedAt: Date.now(),
    }, "Delete clip")),

  moveClip: (clipId, newStart, newTrackId) =>
    set((state) => {
      if (state.project.tracks.some((t) => t.id === newTrackId && t.locked)) return state;
      const fps = state.project.settings.fps || 30;
      return commit(state, withClip(state.project, clipId, (c) => ({
        ...c,
        start: snapTimeToFrame(Math.max(0, newStart), fps),
        trackId: newTrackId,
      })), "Move clip");
    }),

  splitClip: (clipId, atTime) =>
    set((state) => {
      const clip = state.project.clips.find((c) => c.id === clipId);
      if (!clip || isClipLocked(state.project, clipId)) return state;
      const fps = state.project.settings.fps || 30;
      const splitAt = snapTimeToFrame(atTime, fps);
      const leftDuration = splitAt - clip.start;
      if (leftDuration <= 1 / fps || leftDuration >= clip.duration - 1 / fps) return state;
      const speedAbs = Math.abs(clip.speed || 1);
      const rightId = crypto.randomUUID();
      const right: Clip = {
        ...clip,
        id: rightId,
        start: splitAt,
        duration: clip.duration - leftDuration,
        sourceOffset: clip.sourceOffset + leftDuration * speedAbs,
        keyframes: clip.keyframes
          .filter((k) => k.time >= leftDuration)
          .map((k) => ({ ...k, id: crypto.randomUUID(), time: k.time - leftDuration })),
        effects: clip.effects.map((e) => ({ ...e, id: `${rightId}-${e.kind}` })),
        freeze: undefined,
      };
      return commit(state, {
        ...state.project,
        clips: [
          ...state.project.clips.map((c) => c.id === clipId ? {
            ...c,
            duration: leftDuration,
            keyframes: c.keyframes.filter((k) => k.time < leftDuration),
          } : c),
          right,
        ],
        updatedAt: Date.now(),
      }, "Split clip");
    }),

  duplicateClip: (clipId) =>
    set((state) => {
      const clip = state.project.clips.find((c) => c.id === clipId);
      if (!clip || isClipLocked(state.project, clipId)) return state;
      const id = crypto.randomUUID();
      return commit(state, {
        ...state.project,
        clips: [...state.project.clips, {
          ...clip,
          id,
          start: clip.start + clip.duration,
          keyframes: clip.keyframes.map((k) => ({ ...k, id: crypto.randomUUID() })),
          effects: clip.effects.map((e) => ({ ...e, id: `${id}-${e.kind}` })),
          groupId: undefined,
        }],
        updatedAt: Date.now(),
      }, "Duplicate clip");
    }),

  addTextClip: (start, duration, patch, trackId) => {
    const state = get();
    let targetTrack = trackId
      ? state.project.tracks.find((t) => t.id === trackId)
      : state.project.tracks.find((t) => t.type === "text");
    let tracks = state.project.tracks;
    if (!targetTrack) {
      targetTrack = newTrack({ name: "Text 1", type: "text", height: 56, order: tracks.length });
      tracks = [...tracks, targetTrack];
    }
    if (targetTrack?.locked) return "";
    const id = crypto.randomUUID();
    const fps = state.project.settings.fps || 30;
    const clip = newClip({
      id,
      trackId: targetTrack.id,
      assetId: "",
      name: patch?.text?.slice(0, 24) || "Text",
      start: snapTimeToFrame(Math.max(0, start), fps),
      duration: Math.max(1 / fps, duration),
      zIndex: 100 + state.project.clips.length,
      text: { ...DEFAULT_TEXT, ...(patch ?? {}) },
    });
    set((s) => commit(s, {
      ...s.project,
      tracks,
      clips: [...s.project.clips, clip],
      updatedAt: Date.now(),
    }, "Add text"));
    return id;
  },

  updateText: (clipId, patch) =>
    set((state) => commit(state, withClip(state.project, clipId, (c) => ({
      ...c,
      text: { ...DEFAULT_TEXT, ...(c.text ?? {}), ...patch },
      name: patch.text !== undefined ? patch.text.slice(0, 24) || "Text" : c.name,
    })), "Edit text")),

  addKeyframe: (clipId, property, time, value) =>
    set((state) => commit(state, withClip(state.project, clipId, (c) => {
      const exists = c.keyframes.some((k) => k.property === property && Math.abs(k.time - time) < 1 / (state.project.settings.fps || 30) / 2);
      if (exists) return c;
      return {
        ...c,
        keyframes: [...c.keyframes, {
          id: crypto.randomUUID(),
          property,
          time: Math.max(0, time),
          value,
          easing: "linear" as const,
        }].sort((a, b) => a.time - b.time),
      };
    }), "Add keyframe")),

  updateKeyframe: (clipId, keyframeId, patch) =>
    set((state) => commit(state, withClip(state.project, clipId, (c) => ({
      ...c,
      keyframes: c.keyframes.map((k) => k.id === keyframeId ? { ...k, ...patch } : k),
    })), "Edit keyframe")),

  moveKeyframe: (clipId, keyframeId, time) =>
    set((state) => {
      const fps = state.project.settings.fps || 30;
      return commit(state, withClip(state.project, clipId, (c) => ({
        ...c,
        keyframes: c.keyframes
          .map((k) => k.id === keyframeId ? { ...k, time: Math.max(0, snapTimeToFrame(time, fps)) } : k)
          .sort((a, b) => a.time - b.time),
      })), "Move keyframe");
    }),

  removeKeyframe: (clipId, keyframeId) =>
    set((state) => commit(state, withClip(state.project, clipId, (c) => ({
      ...c,
      keyframes: c.keyframes.filter((k) => k.id !== keyframeId),
    })), "Remove keyframe")),

  setEffect: (clipId, kind, value, enabled = value !== 0) =>
    set((state) => commit(state, withClip(state.project, clipId, (c) => {
      const others = c.effects.filter((e) => e.kind !== kind);
      return {
        ...c,
        effects: enabled ? [...others, { id: `${clipId}-${kind}`, kind, value, enabled }] : others,
      };
    }), "Adjust effect")),

  setCrop: (clipId, patch) =>
    set((state) => commit(state, withClip(state.project, clipId, (c) => ({
      ...c,
      crop: { ...DEFAULT_CROP, ...(c.crop ?? {}), ...patch },
    })), "Crop")),

  setTransition: (clipId, side, transition) =>
    set((state) => commit(state, withClip(state.project, clipId, (c) => ({
      ...c,
      [side === "in" ? "transitionIn" : "transitionOut"]: transition ?? undefined,
    })), "Transition")),

  freezeFrame: (clipId, at, duration = 1) =>
    set((state) => commit(state, withClip(state.project, clipId, (c) => {
      const local = Math.max(0, Math.min(c.duration - 1 / (state.project.settings.fps || 30), at ?? c.duration / 2));
      return { ...c, freeze: { enabled: true, at: local, duration: Math.max(1 / 30, duration) } };
    }), "Freeze frame")),

  detachAudio: (clipId) => {
    const state = get();
    const source = state.project.clips.find((c) => c.id === clipId);
    if (!source || isClipLocked(state.project, clipId)) return null;
    const audioTracks = state.project.tracks.filter((t) => t.type === "audio");
    let targetTrack = audioTracks[0];
    let tracks = state.project.tracks;
    if (!targetTrack) {
      targetTrack = newTrack({ name: "Audio 1", type: "audio", height: 48, order: tracks.length });
      tracks = [...tracks, targetTrack];
    }
    const audioId = crypto.randomUUID();
    const detached = newClip({
      id: audioId,
      trackId: targetTrack.id,
      assetId: source.assetId,
      name: `${source.name} (audio)`,
      start: source.start,
      duration: source.duration,
      sourceOffset: source.sourceOffset,
      speed: source.speed,
      volume: source.volume,
      detachOf: source.id,
    });
    set((s) => commit(s, {
      ...s.project,
      tracks,
      clips: [...s.project.clips.map((c) => c.id === clipId ? { ...c, muted: true } : c), detached],
      updatedAt: Date.now(),
    }, "Detach audio"));
    return audioId;
  },

  groupClips: (clipIds, groupId = crypto.randomUUID()) =>
    set((state) => commit(state, {
      ...state.project,
      clips: state.project.clips.map((c) => clipIds.includes(c.id) && !isClipLocked(state.project, c.id) ? { ...c, groupId } : c),
      updatedAt: Date.now(),
    }, "Group clips")),

  ungroupClips: (clipIds) =>
    set((state) => commit(state, {
      ...state.project,
      clips: state.project.clips.map((c) => clipIds.includes(c.id) && !isClipLocked(state.project, c.id) ? { ...c, groupId: undefined } : c),
      updatedAt: Date.now(),
    }, "Ungroup clips")),

  updateSettings: (settings) =>
    set((state) => commit(state, {
      ...state.project,
      settings: { ...state.project.settings, ...settings },
      updatedAt: Date.now(),
    }, "Project settings")),

  setName: (name) =>
    set((state) => commit(state, { ...state.project, name, updatedAt: Date.now() }, "Rename project")),

  undo: () =>
    set((state) => {
      const { past, future } = state.history;
      if (past.length === 0) return state;
      return {
        project: past[past.length - 1],
        history: { past: past.slice(0, -1), future: [state.project, ...future] },
        labels: state.labels.slice(0, -1),
      };
    }),

  redo: () =>
    set((state) => {
      const { future, past } = state.history;
      if (future.length === 0) return state;
      return {
        project: future[0],
        history: { past: [...past, state.project], future: future.slice(1) },
        labels: [...state.labels, "Redo"],
      };
    }),

  clearHistory: () => set({ history: { past: [], future: [] }, labels: [] }),
}));

function newTrackSelf(track: Partial<Track> & Pick<Track, "name" | "type">): Track {
  return newTrack({
    ...track,
    order: track.order ?? 0,
  });
}
