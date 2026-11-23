import * as React from "react";
import {
  Undo2, Redo2, Save, FolderOpen, Plus, Upload, Share2, Settings2,
  Keyboard, CircleHelp, ChevronDown, History, Scissors, Copy, Trash2,
  PanelRight, PanelLeft, PanelBottom, Loader2, RotateCcw,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useExportStore } from "@/stores/exportStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button } from "@/components/ui/button";
import { Input, Separator } from "@/components/ui/input";
import { Select } from "@/components/ui/tabs";
import { Field, IconButton, Modal } from "@/components/ui/primitives";
import { BrandLockup } from "@/components/layout/Brand";
import { RESOLUTIONS, FRAME_RATES, type ProjectSettings } from "@/types/project";
import {
  getRecentProjects, listBackups, restoreBackup,
  type ProjectBackup, type ProjectFileMeta,
} from "@/lib/project";

interface TopBarProps {
  projectName: string;
  onSetName: (name: string) => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onOpenProjectPath: (filePath: string) => Promise<void> | void;
  onSaveProject: () => void;
  onExport: () => void;
  onImport: () => void;
  onShowShortcuts: () => void;
  dirty: boolean;
}

type MenuId = "file" | "edit" | "view" | "help" | null;

export function TopBar({
  projectName,
  onSetName,
  onNewProject,
  onOpenProject,
  onOpenProjectPath,
  onSaveProject,
  onExport,
  onImport,
  onShowShortcuts,
  dirty,
}: TopBarProps) {
  const [menu, setMenu] = React.useState<MenuId>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [recoveryOpen, setRecoveryOpen] = React.useState(false);
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [backups, setBackups] = React.useState<ProjectBackup[]>([]);
  const [recent, setRecent] = React.useState<ProjectFileMeta[]>([]);
  const [recoveryError, setRecoveryError] = React.useState("");

  const project = useProjectStore((s) => s.project);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.history.past.length > 0);
  const canRedo = useProjectStore((s) => s.history.future.length > 0);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const selectedClipId = useTimelineStore((s) => s.selectedClipId);
  const isExporting = useExportStore((s) =>
    s.jobs.some((j) => j.status === "queued" || j.status === "encoding")
  );
  const workspace = useWorkspaceStore();

  const closeMenu = () => setMenu(null);
  const run = (fn: () => void) => () => { closeMenu(); fn(); };

  const openRecovery = async () => {
    closeMenu();
    setRecoveryError("");
    setRecoveryOpen(true);
    try {
      const [recentProjects, projectBackups] = await Promise.all([
        getRecentProjects(),
        project.path ? listBackups(project.path) : Promise.resolve([]),
      ]);
      setRecent(recentProjects);
      setBackups(projectBackups);
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : String(err));
    }
  };

  const splitSelected = () => {
    if (!selectedClipId) return;
    useProjectStore.getState().splitClip(selectedClipId, usePreviewStore.getState().currentTime);
  };

  const duplicateSelected = () => {
    if (selectedClipId) useProjectStore.getState().duplicateClip(selectedClipId);
  };

  const deleteSelected = () => {
    if (!selectedClipId) return;
    useProjectStore.getState().removeClip(selectedClipId);
    useTimelineStore.getState().setSelectedClip(null);
  };

  const saveLabel = !project.path ? "Not saved yet" : dirty ? "Unsaved changes" : "All changes saved";

  return (
    <>
      <header className="relative z-50 flex h-14 shrink-0 items-center gap-1 border-b px-3" style={{ borderColor: "var(--qx-border)", background: "rgba(12,14,20,.92)" }}>
        <div className="mr-2"><BrandLockup /></div>

        <MenuButton id="file" label="File" menu={menu} setMenu={setMenu}>
          <MenuItem icon={<Plus />} shortcut="Ctrl+N" onSelect={run(onNewProject)}>New project</MenuItem>
          <MenuItem icon={<FolderOpen />} shortcut="Ctrl+O" onSelect={run(onOpenProject)}>Open project…</MenuItem>
          <MenuItem icon={<Save />} shortcut="Ctrl+S" onSelect={run(onSaveProject)}>Save project</MenuItem>
          <MenuItem icon={<Upload />} shortcut="Ctrl+I" onSelect={run(onImport)}>Import media…</MenuItem>
          <Separator className="my-1" />
          <MenuItem icon={<History />} onSelect={() => void openRecovery()}>Backups & recent…</MenuItem>
          <MenuItem icon={<Share2 />} onSelect={run(onExport)} disabled={isExporting}>Export video…</MenuItem>
        </MenuButton>

        <MenuButton id="edit" label="Edit" menu={menu} setMenu={setMenu}>
          <MenuItem icon={<Undo2 />} shortcut="Ctrl+Z" onSelect={run(undo)} disabled={!canUndo}>Undo</MenuItem>
          <MenuItem icon={<Redo2 />} shortcut="Ctrl+Y" onSelect={run(redo)} disabled={!canRedo}>Redo</MenuItem>
          <Separator className="my-1" />
          <MenuItem icon={<Scissors />} shortcut="S" onSelect={run(splitSelected)} disabled={!selectedClipId}>Split at playhead</MenuItem>
          <MenuItem icon={<Copy />} shortcut="D" onSelect={run(duplicateSelected)} disabled={!selectedClipId}>Duplicate clip</MenuItem>
          <MenuItem icon={<Trash2 />} shortcut="Del" onSelect={run(deleteSelected)} disabled={!selectedClipId}>Delete clip</MenuItem>
        </MenuButton>

        <MenuButton id="view" label="View" menu={menu} setMenu={setMenu}>
          <MenuItem icon={<PanelLeft />} onSelect={run(workspace.toggleLibrary)}>
            {workspace.libraryCollapsed ? "Show" : "Hide"} media library
          </MenuItem>
          <MenuItem icon={<PanelRight />} onSelect={run(workspace.toggleInspector)}>
            {workspace.inspectorCollapsed ? "Show" : "Hide"} inspector
          </MenuItem>
          <MenuItem icon={<PanelBottom />} onSelect={run(workspace.toggleTimeline)}>
            {workspace.timelineCollapsed ? "Show" : "Hide"} timeline
          </MenuItem>
          <Separator className="my-1" />
          <MenuItem icon={<Settings2 />} onSelect={run(() => setSettingsOpen(true))}>Project settings…</MenuItem>
        </MenuButton>

        <MenuButton id="help" label="Help" menu={menu} setMenu={setMenu}>
          <MenuItem icon={<Keyboard />} onSelect={run(onShowShortcuts)}>Keyboard shortcuts</MenuItem>
          <MenuItem icon={<CircleHelp />} onSelect={run(() => setAboutOpen(true))}>About QumenX</MenuItem>
        </MenuButton>

        {menu ? <button aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={closeMenu} /> : null}

        <div className="mx-2 h-5 w-px" style={{ background: "var(--qx-border)" }} />

        <div className="flex items-center gap-0.5">
          <IconButton tooltip="Undo" shortcut="Ctrl+Z" onClick={undo} disabled={!canUndo} aria-label="Undo">
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton tooltip="Redo" shortcut="Ctrl+Y" onClick={redo} disabled={!canRedo} aria-label="Redo">
            <Redo2 className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="mx-1 h-5 w-px" style={{ background: "var(--qx-border)" }} />

        <div className="group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-editor-surfaceHover">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dirty ? "var(--qx-warning)" : "var(--qx-success)" }} />
          <input
            className="w-40 min-w-0 bg-transparent text-xs font-medium text-editor-text outline-none placeholder:text-editor-textMuted"
            value={projectName}
            onChange={(e) => onSetName(e.target.value)}
            title="Project name"
            aria-label="Project name"
            placeholder="Untitled Project"
          />
          <span className="hidden text-[10px] text-editor-textMuted xl:inline">{saveLabel}</span>
        </div>

        <div className="flex-1" />

        <Button size="sm" variant="ghost" onClick={onImport} title="Import media" className="hidden sm:inline-flex">
          <Upload className="h-3.5 w-3.5" />
          <span>Import</span>
        </Button>
        <Button size="sm" onClick={onExport} disabled={isExporting} title="Export video" className="ml-1 px-4">
          {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
          <span>{isExporting ? "Exporting…" : "Export"}</span>
        </Button>
        <IconButton tooltip="Project settings" onClick={() => setSettingsOpen(true)} className="ml-1" aria-label="Project settings">
          <Settings2 className="h-4 w-4" />
        </IconButton>
      </header>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Project settings"
        description="These settings define the canvas and default export format."
        width="max-w-xl"
        footer={<Button onClick={() => setSettingsOpen(false)}>Done</Button>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Resolution">
            <Select
              value={project.settings.resolution}
              onValueChange={(v) => updateSettings({ resolution: v as ProjectSettings["resolution"] })}
            >
              {RESOLUTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
          <Field label="Frame rate">
            <Select value={String(project.settings.fps)} onValueChange={(v) => updateSettings({ fps: Number(v) })}>
              {FRAME_RATES.map((f) => <option key={f} value={String(f)}>{f} FPS</option>)}
            </Select>
          </Field>
          <Field label="Video codec">
            <Select value={project.settings.codec} onValueChange={(v) => updateSettings({ codec: v as ProjectSettings["codec"] })}>
              <option value="h264">H.264 — widest compatibility</option>
              <option value="h265">H.265 / HEVC</option>
              <option value="vp9">VP9</option>
              <option value="av1">AV1</option>
            </Select>
          </Field>
          <Field label="Audio bitrate" hint="kbps">
            <Input type="number" min={32} max={320} value={project.settings.audioBitrate}
              onChange={(e) => updateSettings({ audioBitrate: Number(e.currentTarget.value) })} />
          </Field>
          <Field label="Preview quality">
            <Select value={project.settings.previewQuality ?? "medium"}
              onValueChange={(v) => updateSettings({ previewQuality: v as "low" | "medium" | "high" })}>
              <option value="low">Low — fastest</option>
              <option value="medium">Medium — balanced</option>
              <option value="high">High — original media</option>
            </Select>
          </Field>
          <Field label="Output quality" hint={`CRF ${project.settings.crf ?? 23}`}>
            <input type="range" min={0} max={51} step={1} value={project.settings.crf ?? 23}
              onChange={(e) => updateSettings({ crf: Number(e.currentTarget.value) })}
              aria-label="Output quality CRF" className="mt-2 w-full" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        title="Backups & recent projects"
        description="Recover a project if its main file was damaged, or jump back into recent work."
        width="max-w-2xl"
      >
        {recoveryError ? (
          <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">{recoveryError}</p>
        ) : null}
        <div className="space-y-5">
          <section>
            <h3 className="qx-section-label mb-2">Backups for current project</h3>
            {!project.path ? (
              <p className="qx-empty">Save this project once to enable rotating backups.</p>
            ) : backups.length === 0 ? (
              <p className="qx-empty">No backups yet. QumenX keeps up to 12 previous saves.</p>
            ) : (
              <div className="space-y-1.5">
                {backups.map((backup) => (
                  <div key={backup.path} className="qx-card flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-editor-text">{backup.path.split(/[/\\]/).pop()}</p>
                      <p className="text-[10px] text-editor-textMuted">
                        {new Date(backup.createdAt).toLocaleString()} · {(backup.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        await restoreBackup(backup.path, project.path!);
                        await onOpenProjectPath(project.path!);
                        setRecoveryOpen(false);
                      } catch (err) {
                        setRecoveryError(err instanceof Error ? err.message : String(err));
                      }
                    }}><RotateCcw className="mr-1 h-3 w-3" /> Restore</Button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section>
            <h3 className="qx-section-label mb-2">Recent projects</h3>
            {recent.length === 0 ? (
              <p className="qx-empty">No recent projects yet.</p>
            ) : (
              <div className="space-y-1.5">
                {recent.map((item) => (
                  <div key={item.path} className="qx-card flex items-center gap-3 px-3 py-2">
                    <FolderOpen className="h-4 w-4 shrink-0 text-editor-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-editor-text">{item.name}</p>
                      <p className="truncate text-[10px] text-editor-textMuted">{item.path}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={async () => {
                      await onOpenProjectPath(item.path);
                      setRecoveryOpen(false);
                    }}>Open</Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </Modal>

      <Modal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="About QumenX"
        width="max-w-sm"
        footer={<Button onClick={() => setAboutOpen(false)}>Close</Button>}
      >
        <div className="flex flex-col items-center py-4 text-center">
          <div className="mb-3 text-3xl font-semibold tracking-tight text-editor-text">QumenX</div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-editor-accent">Create Without Limits</p>
          <p className="mt-4 text-xs leading-relaxed text-editor-textMuted">
            A free, fully local desktop video editor. QumenX uses your existing FFmpeg installation for real exports and never uploads your media.
          </p>
          <p className="mt-3 text-[10px] text-editor-textMuted">Version 1.0.0 · Windows x64</p>
        </div>
      </Modal>
    </>
  );
}

function MenuButton({
  id, label, menu, setMenu, children,
}: {
  id: Exclude<MenuId, null>;
  label: string;
  menu: MenuId;
  setMenu: (menu: MenuId) => void;
  children: React.ReactNode;
}) {
  const open = menu === id;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenu(open ? null : id)}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-editor-textMuted transition-colors hover:bg-editor-surfaceHover hover:text-editor-text"
        style={open ? { background: "var(--qx-accent-soft)", color: "var(--qx-text)" } : undefined}
        aria-expanded={open}
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open ? <div className="qx-menu absolute left-0 top-full z-50 mt-1 animate-qx-scale-in">{children}</div> : null}
    </div>
  );
}

function MenuItem({
  icon, shortcut, children, onSelect, disabled,
}: {
  icon: React.ReactNode;
  shortcut?: string;
  children: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className="qx-menu-item"
    >
      <span className="flex h-4 w-4 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span className="flex-1">{children}</span>
      {shortcut ? <span className="qx-kbd">{shortcut}</span> : null}
    </button>
  );
}
