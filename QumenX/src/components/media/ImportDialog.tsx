import * as React from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { UploadCloud, Film, Music, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/primitives";
import { importMediaPaths } from "@/lib/mediaImport";
import { cn } from "@/lib/utils";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const [importing, setImporting] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [currentName, setCurrentName] = React.useState("");
  const [failed, setFailed] = React.useState<Array<{ name: string; error: string }>>([]);
  const [dragging, setDragging] = React.useState(false);

  const importPaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    setImporting(true);
    setProgress(0);
    setFailed([]);
    try {
      const result = await importMediaPaths(paths, (value, name) => {
        setProgress(value);
        setCurrentName(name);
      });
      setFailed(result.failed);
    } catch (err) {
      // A failure outside the per-file probe must not lock the dialog.
      setFailed([{
        name: paths.map((p) => p.split(/[/\\]/).pop() || p).join(", "),
        error: err instanceof Error ? err.message : String(err),
      }]);
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    const selected = await openFileDialog({
      multiple: true,
      directory: false,
      filters: [
        { name: "Media", extensions: ["mp4", "mov", "mkv", "webm", "avi", "mp3", "wav", "m4a", "aac", "flac", "jpg", "jpeg", "png", "webp", "gif"] },
      ],
    });
    if (!selected) return;
    await importPaths(Array.isArray(selected) ? selected : [selected]);
  };

  return (
    <Modal
      open={open}
      onClose={() => !importing && onOpenChange(false)}
      title="Import media"
      description="Videos, audio and images stay on your computer. QumenX never modifies the originals."
      width="max-w-xl"
      footer={
        <>
          <span className="mr-auto text-[10px] text-editor-textMuted">Supported: MP4, MOV, MKV, WebM, MP3, WAV, PNG, JPG</span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            {failed.length ? "Close" : "Done"}
          </Button>
        </>
      }
    >
      <div
        className={cn(
          "flex min-h-[210px] flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-editor-accent bg-editor-accentSoft" : "border-editor-border hover:border-editor-borderStrong"
        )}
        style={dragging ? { borderColor: "var(--qx-accent)", background: "var(--qx-accent-soft)" } : undefined}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files)
            .map((f) => (f as File & { path?: string }).path)
            .filter((p): p is string => Boolean(p));
          void importPaths(files);
        }}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "var(--qx-accent-soft)", color: "var(--qx-accent)" }}>
          <UploadCloud className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-editor-text">Drop files to add them to your library</p>
        <p className="mt-1 text-xs text-editor-textMuted">or choose them from your computer</p>
        <Button className="mt-5" onClick={() => void handleImport()} disabled={importing}>Browse files</Button>
        <div className="mt-6 flex items-center gap-5 text-[10px] text-editor-textMuted">
          <span className="flex items-center gap-1.5"><Film className="h-3.5 w-3.5" /> Video</span>
          <span className="flex items-center gap-1.5"><Music className="h-3.5 w-3.5" /> Audio</span>
          <span className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Image</span>
        </div>
      </div>

      {importing ? (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] text-editor-textMuted">
            <span className="truncate">{currentName || "Preparing files…"}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="qx-progress"><div className="qx-progress-fill" style={{ width: `${progress}%` }} /></div>
        </div>
      ) : null}

      {failed.length ? (
        <div className="mt-4 max-h-28 overflow-y-auto rounded border border-red-500/40 bg-red-500/10 p-2 text-[10px] text-red-300">
          <p className="mb-1 font-semibold">Some files could not be imported:</p>
          {failed.map((item) => <div key={`${item.name}-${item.error}`}>{item.name}: {item.error}</div>)}
        </div>
      ) : null}
    </Modal>
  );
}
