import { create } from "zustand";
import type { Clip, KeyframeProperty } from "@/types/project";
import { snapTimeToFrame } from "@/types/project";

interface TimelineState {
  // View
  zoom: number;            // pixels per second
  scrollLeft: number;
  playheadTime: number;    // seconds
  snapToGrid: boolean;
  gridSize: number;        // seconds
  snapToClip: boolean;
  snapToPlayhead: boolean;
  snapToFrames: boolean;
  fps: number;
  showWaveforms: boolean;
  showKeyframes: boolean;
  keyframeFilter: KeyframeProperty | "all";
  trackScrollTop: number;
  // Selection
  selectedClipId: string | null;
  selectedClipIds: string[];
  hoveredClipId: string | null;
  // Drag state
  draggingClipId: string | null;
  draggingOffset: number;
  resizingClipId: string | null;
  resizeEdge: "left" | "right" | null;
  // Actions
  setZoom: (z: number) => void;
  setScrollLeft: (x: number) => void;
  setPlayheadTime: (t: number) => void;
  setSnapToGrid: (s: boolean) => void;
  toggleSnapToGrid: () => void;
  setGridSize: (g: number) => void;
  toggleSnapToClip: () => void;
  toggleSnapToPlayhead: () => void;
  toggleSnapToFrames: () => void;
  setFps: (fps: number) => void;
  toggleWaveforms: () => void;
  toggleKeyframes: () => void;
  setKeyframeFilter: (p: KeyframeProperty | "all") => void;
  setTrackScrollTop: (y: number) => void;
  setSelectedClip: (id: string | null) => void;
  setSelectedClips: (ids: string[]) => void;
  setHoveredClip: (id: string | null) => void;
  /** Snap a candidate time using all enabled snap sources. */
  snapTime: (time: number, excludeClipId: string | null, clips: Clip[]) => number;
  startDrag: (id: string, offset: number) => void;
  updateDrag: (offset: number) => void;
  endDrag: () => void;
  startResize: (id: string, edge: "left" | "right") => void;
  updateResize: (deltaPx: number) => void;
  endResize: () => void;
  reset: () => void;
}

const SNAP_PX = 8;

export const useTimelineStore = create<TimelineState>((set, get) => ({
  zoom: 100,
  scrollLeft: 0,
  playheadTime: 0,
  snapToGrid: false,
  gridSize: 1,
  snapToClip: true,
  snapToPlayhead: true,
  snapToFrames: true,
  fps: 30,
  showWaveforms: true,
  showKeyframes: true,
  keyframeFilter: "all",
  trackScrollTop: 0,
  selectedClipId: null,
  selectedClipIds: [],
  hoveredClipId: null,
  draggingClipId: null,
  draggingOffset: 0,
  resizingClipId: null,
  resizeEdge: null,

  setZoom: (z) => set({ zoom: Math.max(10, Math.min(800, z)) }),
  setScrollLeft: (x) => set({ scrollLeft: Math.max(0, x) }),
  setPlayheadTime: (t) => set({ playheadTime: Math.max(0, t) }),
  setSnapToGrid: (s) => set({ snapToGrid: s }),
  toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  setGridSize: (g) => set({ gridSize: Math.max(1 / 30, g) }),
  toggleSnapToClip: () => set((s) => ({ snapToClip: !s.snapToClip })),
  toggleSnapToPlayhead: () => set((s) => ({ snapToPlayhead: !s.snapToPlayhead })),
  toggleSnapToFrames: () => set((s) => ({ snapToFrames: !s.snapToFrames })),
  setFps: (fps) => set({ fps: Math.max(1, fps) }),
  toggleWaveforms: () => set((s) => ({ showWaveforms: !s.showWaveforms })),
  toggleKeyframes: () => set((s) => ({ showKeyframes: !s.showKeyframes })),
  setKeyframeFilter: (p) => set({ keyframeFilter: p }),
  setTrackScrollTop: (y) => set({ trackScrollTop: Math.max(0, y) }),
  setSelectedClip: (id) => set({ selectedClipId: id, selectedClipIds: id ? [id] : [] }),
  setSelectedClips: (ids) => set({ selectedClipIds: ids, selectedClipId: ids[0] ?? null }),
  setHoveredClip: (id) => set({ hoveredClipId: id }),

  snapTime: (time, excludeClipId, clips) => {
    const s = get();
    const tolerance = SNAP_PX / s.zoom;
    const candidates: number[] = [];
    if (s.snapToGrid) {
      candidates.push(Math.round(time / s.gridSize) * s.gridSize);
    }
    if (s.snapToPlayhead) {
      candidates.push(s.playheadTime);
    }
    if (s.snapToClip) {
      for (const c of clips) {
        if (c.id === excludeClipId) continue;
        candidates.push(c.start, c.start + c.duration);
      }
    }
    let best = time;
    let bestDist = tolerance;
    for (const c of candidates) {
      const d = Math.abs(c - time);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return s.snapToFrames ? snapTimeToFrame(best, s.fps) : Math.max(0, best);
  },

  startDrag: (id, offset) => set({ draggingClipId: id, draggingOffset: offset }),
  updateDrag: (offset) => set({ draggingOffset: offset }),
  endDrag: () => set({ draggingClipId: null, draggingOffset: 0 }),
  startResize: (id, edge) => set({ resizingClipId: id, resizeEdge: edge }),
  updateResize: (deltaPx) => set((state) => ({ draggingOffset: state.draggingOffset + deltaPx })),
  endResize: () => set({ resizingClipId: null, resizeEdge: null }),
  reset: () => set({
    zoom: 100, scrollLeft: 0, playheadTime: 0, selectedClipId: null,
    selectedClipIds: [], trackScrollTop: 0,
  }),
}));
