import { useCallback, useEffect, useRef, useState } from "react";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import {
  Film, FolderOpen, Keyboard, Layers3, MousePointer2, Plus, ShieldCheck,
  Sparkles, Upload, Wand2, X, Zap,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useMediaStore } from "@/stores/mediaStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { snapTimeToFrame, type Asset } from "@/types/project";
import { TopBar } from "@/components/layout/TopBar";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { PreviewPanel } from "@/components/layout/PreviewPanel";
import { TimelinePanel } from "@/components/layout/TimelinePanel";
import { InspectorPanel } from "@/components/layout/InspectorPanel";
import { BrandMark } from "@/components/layout/Brand";
import { ExportDialog } from "@/components/export/ExportDialog";
import { ImportDialog } from "@/components/media/ImportDialog";
import { Button } from "@/components/ui/button";
import { IconButton, Modal } from "@/components/ui/primitives";
import { newProject, openProjectFile, saveProjectFile, addRecentProject } from "@/lib/project";

interface SavedMeta {
  path?: string;
  updatedAt: number;
}

export function App() {
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [notice, setNotice] = useState("");
  const savedMeta = useRef<SavedMeta>({ updatedAt: 0 });
  const noticeTimer = useRef<number | null>(null);
  const resizeCleanup = useRef<(() => void) | null>(null);

  const project = useProjectStore((s) => s.project);
  const setName = useProjectStore((s) => s.setName);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const setProject = useProjectStore((s) => s.setProject);
  const clearHistory = useProjectStore((s) => s.clearHistory);
  const setAssets = useMediaStore((s) => s.setAssets);
  const assets = useMediaStore((s) => s.assets);
  const workspace = useWorkspaceStore();

  const hasContent = project.clips.length > 0 || project.assets.length > 0;
  const dirty = !project.path
    || project.path !== savedMeta.current.path
    || project.updatedAt !== savedMeta.current.updatedAt;

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      setNotice("");
      noticeTimer.current = null;
    }, 3200);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    resizeCleanup.current?.();
  }, []);

  const resetWorkspace = useCallback(() => {
    usePreviewStore.getState().reset();
    useTimelineStore.getState().reset();
    useTimelineStore.getState().setFps(useProjectStore.getState().project.settings.fps || 30);
  }, []);

  function handleNewProject() {
    const fresh = newProject("Untitled Project");
    setProject(fresh);
    setAssets([]);
    clearHistory();
    resetWorkspace();
    savedMeta.current = { updatedAt: fresh.updatedAt };
    flash("New project created — import media to get started");
  }

  async function openProjectPath(selected: string) {
    try {
      const { project: loaded, recoveredFrom } = await openProjectFile(selected);
      const withPath = { ...loaded, path: selected };
      setProject(withPath);
      setAssets(withPath.assets);
      clearHistory();
      resetWorkspace();
      savedMeta.current = { path: selected, updatedAt: withPath.updatedAt };
      void addRecentProject({
        id: withPath.id,
        name: withPath.name,
        path: selected,
        updatedAt: Date.now(),
      });
      flash(recoveredFrom
        ? `Recovered ${withPath.name} from a backup after the project file was damaged`
        : `Opened ${withPath.name}`);
    } catch (err) {
      flash(`Failed to open project: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleOpenProject() {
    const selected = await openFileDialog({
      multiple: false,
      filters: [{ name: "QumenX Project", extensions: ["json"] }],
    });
    if (typeof selected === "string") await openProjectPath(selected);
  }

  async function handleSaveProject() {
    try {
      let path = project.path;
      if (!path) {
        const picked = await saveFileDialog({
          defaultPath: `${project.name.replace(/[^\w-]+/g, "_") || "project"}.json`,
          filters: [{ name: "QumenX Project", extensions: ["json"] }],
        });
        if (typeof picked !== "string") return;
        path = picked;
      }
      // Read live state so unsaved edits are never lost.
      const current = useProjectStore.getState().project;
      const saved = await saveProjectFile({ ...current, path }, path);
      // Recording the saved path must not create an undo entry.
      useProjectStore.setState((state) => ({
        project: { ...state.project, path: saved },
      }));
      savedMeta.current = { path: saved, updatedAt: current.updatedAt };
      await addRecentProject({
        id: current.id,
        name: current.name,
        path: saved,
        updatedAt: Date.now(),
      });
      flash(`Saved to ${saved}`);
    } catch (err) {
      flash(`Failed to save project: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const handleAddAsset = useCallback((asset: Asset) => {
    const state = useProjectStore.getState();
    const tracks = state.project.tracks;
    const desiredType = asset.type === "image" ? "overlay" : asset.type;
    let track = tracks.find((t) => t.type === desiredType);
    if (!track) {
      const count = tracks.filter((t) => t.type === desiredType).length + 1;
      addTrack({
        name: `${desiredType === "overlay" ? "Overlay" : desiredType[0].toUpperCase() + desiredType.slice(1)} ${count}`,
        type: desiredType,
        height: desiredType === "audio" ? 48 : 64,
      });
      track = useProjectStore.getState().project.tracks.find((t) => t.type === desiredType);
    }
    if (!track) return;
    const start = usePreviewStore.getState().currentTime;
    const duration = asset.type === "image" ? 5 : Math.max(0.1, asset.duration || 5);
    addClip({
      trackId: track.id,
      assetId: asset.id,
      name: asset.name,
      start,
      duration,
      sourceOffset: 0,
      speed: 1,
      transform: { position: { x: 0, y: 0 }, scale: 1, rotation: 0, opacity: 1 },
      opacity: 1,
      keyframes: [],
      effects: [],
      muted: false,
      volume: 1,
      zIndex: useProjectStore.getState().project.clips.length,
    });
    const added = useProjectStore.getState().project.clips.slice(-1)[0];
    useTimelineStore.getState().setSelectedClip(added?.id ?? null);
    flash(`Added ${asset.name} to the timeline`);
  }, [addClip, addTrack, flash]);

  // Global keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      // A dialog owns its keyboard interaction. Escape is handled by Modal itself.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const meta = e.ctrlKey || e.metaKey;
      const store = useProjectStore.getState();
      const tl = useTimelineStore.getState();
      const preview = usePreviewStore.getState();
      const key = e.key.toLowerCase();

      // Let text fields own their native undo stack.
      if (typing && (key === "z" || key === "y")) return;

      if (meta && key === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo(); else store.undo();
        return;
      }
      if (meta && key === "y") {
        e.preventDefault();
        store.redo();
        return;
      }
      if (meta && key === "s") {
        e.preventDefault();
        void handleSaveProject();
        return;
      }
      if (meta && key === "o") {
        e.preventDefault();
        void handleOpenProject();
        return;
      }
      if (meta && key === "n") {
        e.preventDefault();
        handleNewProject();
        return;
      }
      if (meta && key === "i") {
        e.preventDefault();
        setShowImport(true);
        return;
      }
      if (key === "?" || (meta && key === "/")) {
        e.preventDefault();
        useWorkspaceStore.getState().setShortcutsOpen(true);
        return;
      }
      if (typing) return;
      if (e.code === "Space") {
        e.preventDefault();
        preview.togglePlay();
      } else if (e.shiftKey && e.key === "Delete" && tl.selectedClipId) {
        e.preventDefault();
        const ids = tl.selectedClipIds.length > 1 ? tl.selectedClipIds : [tl.selectedClipId];
        store.rippleDelete(ids);
        tl.setSelectedClip(null);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (tl.selectedClipId) {
          e.preventDefault();
          store.removeClip(tl.selectedClipId);
          tl.setSelectedClip(null);
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = (e.key === "ArrowLeft" ? -1 : 1) / (store.project.settings.fps || 30) * (e.shiftKey ? 10 : 1);
        const t = snapTimeToFrame(Math.max(0, preview.currentTime + step), store.project.settings.fps || 30);
        preview.setCurrentTime(t);
        tl.setPlayheadTime(t);
      } else if (meta && key === "g") {
        const ids = tl.selectedClipIds.length > 1 ? tl.selectedClipIds : tl.selectedClipId ? [tl.selectedClipId] : [];
        if (ids.length > 1) store.groupClips(ids);
      } else if (key === "s" && !meta) {
        const clip = store.project.clips.find((c) => c.id === tl.selectedClipId);
        if (clip) store.splitClip(clip.id, preview.currentTime);
      } else if (key === "d" && !meta) {
        if (tl.selectedClipId) store.duplicateClip(tl.selectedClipId);
      } else if (key === "m" && !meta) {
        store.addMarker(preview.currentTime);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Handlers read live store state; rebind only when identity might change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path, project.name]);

  const startTimelineResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = workspace.timelineHeight;
    const move = (ev: MouseEvent) => workspace.setTimelineHeight(startHeight - (ev.clientY - startY));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      resizeCleanup.current = null;
    };
    resizeCleanup.current?.();
    resizeCleanup.current = up;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div className="qx-app">
      <TopBar
        projectName={project.name}
        onSetName={setName}
        onNewProject={handleNewProject}
        onOpenProject={() => void handleOpenProject()}
        onOpenProjectPath={(filePath) => openProjectPath(filePath)}
        onSaveProject={() => void handleSaveProject()}
        onExport={() => setShowExport(true)}
        onImport={() => setShowImport(true)}
        onShowShortcuts={() => workspace.setShortcutsOpen(true)}
        dirty={dirty}
      />

      <div className="flex min-h-0 flex-1">
        <LeftSidebar
          showImport={() => setShowImport(true)}
          onAddAsset={handleAddAsset}
          assetCount={assets.length}
        />

        <main className="relative flex min-w-0 flex-1 flex-col" style={{ background: "var(--qx-bg)" }}>
          <div className="relative flex min-h-0 flex-1 flex-col">
            {hasContent ? (
              <PreviewPanel />
            ) : (
              <WelcomeScreen
                onImport={() => setShowImport(true)}
                onNew={handleNewProject}
                onOpen={() => void handleOpenProject()}
                onShortcuts={() => workspace.setShortcutsOpen(true)}
              />
            )}
          </div>

          {workspace.timelineCollapsed ? (
            <button
              type="button"
              onClick={workspace.toggleTimeline}
              className="flex h-9 shrink-0 items-center justify-center gap-2 border-t text-[11px] text-editor-textMuted transition-colors hover:text-editor-text"
              style={{ borderColor: "var(--qx-border)", background: "var(--qx-panel)" }}
            >
              <Layers3 className="h-3.5 w-3.5" /> Show timeline
            </button>
          ) : (
            <div className="relative shrink-0" style={{ height: workspace.timelineHeight }}>
              <TimelinePanel onAddAsset={handleAddAsset} />
              <div className="qx-resizer-y" onMouseDown={startTimelineResize} title="Drag to resize timeline" />
            </div>
          )}
        </main>

        <InspectorPanel />
      </div>

      {!workspace.onboardingDismissed ? (
        <div className="fixed bottom-4 right-5 z-[65] flex max-w-sm items-start gap-3 rounded-xl border p-3 shadow-2xl animate-qx-fade-in"
          style={{ borderColor: "var(--qx-border-strong)", background: "var(--qx-panel)" }}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--qx-accent-soft)", color: "var(--qx-accent)" }}>
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-editor-text">Quick tip</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-editor-textMuted">
              Double-click media to add it at the playhead. Drag clip edges to trim. Press <span className="qx-kbd">Space</span> to preview.
            </p>
          </div>
          <IconButton tooltip="Dismiss tip" onClick={workspace.dismissOnboarding} className="!h-6 !w-6" aria-label="Dismiss tip">
            <X className="h-3 w-3" />
          </IconButton>
        </div>
      ) : null}

      {notice ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-lg border px-4 py-2 text-xs text-editor-text shadow-2xl animate-qx-fade-in"
          style={{ borderColor: "var(--qx-border-strong)", background: "var(--qx-panel)" }}>
          {notice}
        </div>
      ) : null}

      <ImportDialog open={showImport} onOpenChange={setShowImport} />
      <ExportDialog open={showExport} onOpenChange={setShowExport} />
      <ShortcutsDialog open={workspace.shortcutsOpen} onOpenChange={workspace.setShortcutsOpen} />
    </div>
  );
}

function WelcomeScreen({
  onImport, onNew, onOpen, onShortcuts,
}: {
  onImport: () => void;
  onNew: () => void;
  onOpen: () => void;
  onShortcuts: () => void;
}) {
  const actions = [
    { title: "Import media", body: "Bring in videos, audio or images from your computer.", icon: Upload, onClick: onImport, primary: true },
    { title: "Open a project", body: "Continue editing a saved QumenX project.", icon: FolderOpen, onClick: onOpen },
    { title: "Blank project", body: "Start from an empty timeline and set your canvas later.", icon: Plus, onClick: onNew },
  ];
  return (
    <div className="qx-stage-grid relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-10">
      <div className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 35%, rgba(124,92,255,0.12), transparent 55%)" }} />
      <div className="relative w-full max-w-3xl text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border shadow-panel"
          style={{ borderColor: "var(--qx-border-strong)", background: "var(--qx-panel)" }}>
          <BrandMark className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-editor-text">Welcome to QumenX</h1>
        <p className="mt-2 text-sm font-medium uppercase tracking-[0.22em]" style={{ color: "var(--qx-accent)" }}>
          Create Without Limits
        </p>
        <p className="mx-auto mt-4 max-w-lg text-balance text-xs leading-relaxed text-editor-textMuted">
          A free, fully local video editor. Build multi-track timelines, fine-tune every clip, and export with real FFmpeg — no uploads, no watermarks, no subscriptions.
        </p>

        <div className="mt-9 grid gap-3 text-left sm:grid-cols-3">
          {actions.map(({ title, body, icon: Icon, onClick, primary }) => (
            <button
              key={title}
              type="button"
              onClick={onClick}
              className="qx-card qx-card-hover group p-4 text-left"
              style={primary ? { borderColor: "rgba(124,92,255,.45)", background: "var(--qx-accent-soft)" } : undefined}
            >
              <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: primary ? "var(--qx-accent)" : "var(--qx-panel-hover)", color: primary ? "#fff" : "var(--qx-muted)" }}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="block text-xs font-semibold text-editor-text">{title}</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-editor-textMuted">{body}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-[10px] text-editor-textMuted">
          <span className="qx-chip"><ShieldCheck className="h-3 w-3" style={{ color: "var(--qx-success)" }} /> 100% local</span>
          <span className="qx-chip"><Wand2 className="h-3 w-3 text-editor-accent" /> Real FFmpeg export</span>
          <span className="qx-chip"><Zap className="h-3 w-3 text-amber-400" /> No watermarks</span>
          <span className="qx-chip"><Film className="h-3 w-3 text-sky-400" /> Multi-track timeline</span>
        </div>

        <button type="button" onClick={onShortcuts}
          className="mx-auto mt-7 flex items-center gap-1.5 text-[10px] text-editor-textMuted transition-colors hover:text-editor-text">
          <Keyboard className="h-3.5 w-3.5" /> Learn the keyboard shortcuts
        </button>
      </div>
    </div>
  );
}

function ShortcutsDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const groups = [
    { title: "Project", items: [["New project", "Ctrl+N"], ["Open project", "Ctrl+O"], ["Save project", "Ctrl+S"], ["Import media", "Ctrl+I"]] },
    { title: "Editing", items: [["Undo", "Ctrl+Z"], ["Redo", "Ctrl+Y"], ["Split at playhead", "S"], ["Duplicate clip", "D"], ["Delete clip", "Del"], ["Ripple delete", "Shift+Del"], ["Add marker", "M"], ["Group selected", "Ctrl+G"]] },
    { title: "Preview", items: [["Play / pause", "Space"], ["Step one frame", "← / →"], ["Step ten frames", "Shift+← / →"]] },
  ];
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Keyboard shortcuts"
      description="Work faster without leaving the keyboard."
      width="max-w-2xl"
      footer={<Button onClick={() => onOpenChange(false)}>Got it</Button>}
    >
      <div className="grid gap-5 sm:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="qx-section-label mb-2">{group.title}</h3>
            <div className="space-y-1.5">
              {group.items.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
                  style={{ background: "rgba(255,255,255,.025)" }}>
                  <span className="text-[11px] text-editor-textMuted">{label}</span>
                  <span className="qx-kbd whitespace-nowrap">{keys}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-5 flex items-center gap-2 text-[10px] text-editor-textMuted">
        <MousePointer2 className="h-3 w-3" /> Tip: right-click a timeline clip for split, duplicate and group actions.
      </p>
    </Modal>
  );
}
