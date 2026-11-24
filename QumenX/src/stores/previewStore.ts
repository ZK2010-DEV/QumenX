import { create } from "zustand";
import { AspectRatio } from "@/types/project";

interface PreviewState {
  // Playback
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  // Preview settings
  aspectRatio: AspectRatio;
  fitToScreen: boolean;
  fullscreen: boolean;
  showSafeZones: boolean;
  // Actions
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (t: number) => void;
  /** Advance the master clock by a real-time delta; stops at the end. */
  advanceBy: (deltaSeconds: number, durationSeconds: number) => void;
  setDuration: (d: number) => void;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setPlaybackRate: (r: number) => void;
  setAspectRatio: (r: AspectRatio) => void;
  toggleFitToScreen: () => void;
  toggleFullscreen: () => void;
  toggleSafeZones: () => void;
  reset: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  playbackRate: 1,
  aspectRatio: "16:9",
  fitToScreen: true,
  fullscreen: false,
  showSafeZones: false,
  setPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
  advanceBy: (deltaSeconds, durationSeconds) =>
    set((state) => {
      if (!state.isPlaying) return state;
      const next = state.currentTime + deltaSeconds * state.playbackRate;
      if (next >= durationSeconds) {
        return { currentTime: durationSeconds, isPlaying: false };
      }
      return { currentTime: next };
    }),
  setDuration: (d) => set({ duration: d }),
  togglePlay: () => set((state) => {
    if (state.isPlaying) return { isPlaying: false };
    // Pressing Play at the end replays from the start instead of stopping again.
    const atEnd = state.duration > 0 && state.currentTime >= state.duration - 0.0001;
    return { isPlaying: true, ...(atEnd ? { currentTime: 0 } : {}) };
  }),
  setVolume: (v) => set({ volume: v, muted: v === 0 }),
  setMuted: (m) => set({ muted: m }),
  setPlaybackRate: (r) => set({ playbackRate: r }),
  setAspectRatio: (r) => set({ aspectRatio: r }),
  toggleFitToScreen: () => set((state) => ({ fitToScreen: !state.fitToScreen })),
  toggleFullscreen: () => set((state) => ({ fullscreen: !state.fullscreen })),
  toggleSafeZones: () => set((state) => ({ showSafeZones: !state.showSafeZones })),
  reset: () =>
    set({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      muted: false,
      playbackRate: 1,
    }),
}));
