import { create } from "zustand";

export type NavSection =
  | "media" | "audio" | "text" | "stickers" | "effects" | "transitions"
  | "filters" | "speed" | "templates" | "elements" | "settings";

type MediaView = "grid" | "list";
type MediaFilter = "all" | "video" | "audio" | "image";

interface WorkspaceState {
  activeSection: NavSection;
  leftWidth: number;
  rightWidth: number;
  timelineHeight: number;
  inspectorCollapsed: boolean;
  libraryCollapsed: boolean;
  timelineCollapsed: boolean;
  mediaView: MediaView;
  mediaFilter: MediaFilter;
  onboardingDismissed: boolean;
  shortcutsOpen: boolean;
  setActiveSection: (section: NavSection) => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  setTimelineHeight: (height: number) => void;
  toggleInspector: () => void;
  toggleLibrary: () => void;
  toggleTimeline: () => void;
  setMediaView: (view: MediaView) => void;
  setMediaFilter: (filter: MediaFilter) => void;
  dismissOnboarding: () => void;
  setShortcutsOpen: (open: boolean) => void;
}

const STORAGE_KEY = "qumenx.workspace.v1";

function load(): Partial<WorkspaceState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const persisted = load();

function save(state: WorkspaceState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeSection: state.activeSection,
      leftWidth: state.leftWidth,
      rightWidth: state.rightWidth,
      timelineHeight: state.timelineHeight,
      inspectorCollapsed: state.inspectorCollapsed,
      libraryCollapsed: state.libraryCollapsed,
      timelineCollapsed: state.timelineCollapsed,
      mediaView: state.mediaView,
      mediaFilter: state.mediaFilter,
      onboardingDismissed: state.onboardingDismissed,
    }));
  } catch {
    // Workspace preferences are an enhancement; never block editing if storage is unavailable.
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const useWorkspaceStore = create<WorkspaceState>((set) => {
  const update = (patch: Partial<WorkspaceState>) => set((state) => {
    const next = { ...state, ...patch };
    save(next);
    return patch;
  });

  return {
    activeSection: persisted.activeSection ?? "media",
    leftWidth: clamp(persisted.leftWidth ?? 292, 232, 460),
    rightWidth: clamp(persisted.rightWidth ?? 320, 268, 460),
    timelineHeight: clamp(persisted.timelineHeight ?? 340, 220, 620),
    inspectorCollapsed: persisted.inspectorCollapsed ?? false,
    libraryCollapsed: persisted.libraryCollapsed ?? false,
    timelineCollapsed: persisted.timelineCollapsed ?? false,
    mediaView: persisted.mediaView ?? "grid",
    mediaFilter: persisted.mediaFilter ?? "all",
    onboardingDismissed: persisted.onboardingDismissed ?? false,
    shortcutsOpen: false,
    setActiveSection: (activeSection) => update({ activeSection }),
    setLeftWidth: (width) => update({ leftWidth: clamp(width, 232, 460) }),
    setRightWidth: (width) => update({ rightWidth: clamp(width, 268, 460) }),
    setTimelineHeight: (height) => update({ timelineHeight: clamp(height, 220, 620) }),
    toggleInspector: () => set((state) => {
      const next = { ...state, inspectorCollapsed: !state.inspectorCollapsed };
      save(next);
      return { inspectorCollapsed: next.inspectorCollapsed };
    }),
    toggleLibrary: () => set((state) => {
      const next = { ...state, libraryCollapsed: !state.libraryCollapsed };
      save(next);
      return { libraryCollapsed: next.libraryCollapsed };
    }),
    toggleTimeline: () => set((state) => {
      const next = { ...state, timelineCollapsed: !state.timelineCollapsed };
      save(next);
      return { timelineCollapsed: next.timelineCollapsed };
    }),
    setMediaView: (mediaView) => update({ mediaView }),
    setMediaFilter: (mediaFilter) => update({ mediaFilter }),
    dismissOnboarding: () => update({ onboardingDismissed: true }),
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  };
});
