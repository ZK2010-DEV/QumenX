import * as React from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useMediaStore } from "@/stores/mediaStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button } from "@/components/ui/button";
import { Collapsible, EmptyState, IconButton } from "@/components/ui/primitives";
import { Slider } from "@/components/ui/scrollarea";
import { Input, Separator, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/tabs";
import {
  Trash2, Scissors, Copy, Diamond, SkipBack, RotateCcw,
  VolumeX, Link2, Snowflake, FlipHorizontal, FlipVertical, SlidersHorizontal,
  PanelRight,
} from "lucide-react";
import {
  type AudioDsp, type Clip, type EffectKind, type KeyframeProperty,
  type TextAnimationKind, type TransitionKind, DEFAULT_TEXT,
} from "@/types/project";
import { AUDIO_DSP_PRESETS, audioDspIsActive, resolveAudioDsp } from "@/lib/audioDsp";
import { cn } from "@/lib/utils";

type Tab = "transform" | "color" | "audio" | "text" | "keyframes" | "actions";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "transform", label: "Transform" },
  { id: "color", label: "Color" },
  { id: "audio", label: "Audio" },
  { id: "text", label: "Text" },
  { id: "keyframes", label: "Keyframes" },
  { id: "actions", label: "Tools" },
];

const KEYFRAME_PROPERTIES: Array<{ value: KeyframeProperty; label: string }> = [
  { value: "positionX", label: "Position X" },
  { value: "positionY", label: "Position Y" },
  { value: "scale", label: "Scale" },
  { value: "rotation", label: "Rotation" },
  { value: "opacity", label: "Opacity" },
  { value: "volume", label: "Volume" },
  { value: "cropTop", label: "Crop top" },
  { value: "cropRight", label: "Crop right" },
  { value: "cropBottom", label: "Crop bottom" },
  { value: "cropLeft", label: "Crop left" },
];

const FONTS = ["Arial", "Verdana", "Tahoma", "Times New Roman", "Georgia", "Courier New", "Impact", "Comic Sans MS", "Segoe UI", "Consolas"];

export function InspectorPanel() {
  const project = useProjectStore((s) => s.project);
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const splitClip = useProjectStore((s) => s.splitClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const selectedClipId = useTimelineStore((s) => s.selectedClipId);
  const playhead = useTimelineStore((s) => s.playheadTime);
  const setPlayhead = useTimelineStore((s) => s.setPlayheadTime);
  const setCurrentTime = usePreviewStore((s) => s.setCurrentTime);
  const assets = useMediaStore((s) => s.assets);
  const [tab, setTab] = React.useState<Tab>("transform");
  const collapsed = useWorkspaceStore((s) => s.inspectorCollapsed);
  const rightWidth = useWorkspaceStore((s) => s.rightWidth);
  const setRightWidth = useWorkspaceStore((s) => s.setRightWidth);
  const toggleInspector = useWorkspaceStore((s) => s.toggleInspector);
  const [resizing, setResizing] = React.useState(false);

  const clip = project.clips.find((c) => c.id === selectedClipId) ?? null;
  const asset = clip ? assets.find((a) => a.id === clip.assetId) : undefined;
  const dsp = resolveAudioDsp(clip?.audioDsp);
  const setDsp = (patch: Partial<AudioDsp>) => {
    if (clip) updateClip(clip.id, { audioDsp: { ...dsp, ...patch } });
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = rightWidth;
    const move = (ev: MouseEvent) => setRightWidth(startWidth - (ev.clientX - startX));
    const up = () => {
      setResizing(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (collapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center border-l py-2"
        style={{ borderColor: "var(--qx-border)", background: "var(--qx-panel)" }}>
        <IconButton tooltip="Show inspector" onClick={toggleInspector} aria-label="Show inspector">
          <PanelRight className="h-4 w-4" />
        </IconButton>
      </aside>
    );
  }

  if (!clip) {
    return (
      <aside className="relative flex shrink-0 flex-col border-l"
        style={{ width: rightWidth, borderColor: "var(--qx-border)", background: "var(--qx-panel)" }}>
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: "var(--qx-border)" }}>
          <SlidersHorizontal className="h-3.5 w-3.5 text-editor-textMuted" />
          <span className="qx-section-label">Inspector</span>
          <div className="flex-1" />
          <IconButton tooltip="Hide inspector" onClick={toggleInspector} aria-label="Hide inspector">
            <PanelRight className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <EmptyState
            icon={<SlidersHorizontal className="h-5 w-5" />}
            title="Nothing selected"
            description="Select a clip on the timeline to edit its transform, color, audio, text and keyframes."
          />
        </div>
        <div className="qx-resizer-x left-[-3px] right-auto" data-dragging={resizing ? "true" : undefined}
          onMouseDown={startResize} title="Drag to resize inspector" />
      </aside>
    );
  }

  const goToStart = () => {
    setPlayhead(clip.start);
    setCurrentTime(clip.start);
  };

  const effectValue = (kind: EffectKind) =>
    Math.round((clip.effects.find((e) => e.kind === kind && e.enabled)?.value ?? 0) * 100);

  const setEffect = (kind: EffectKind, value: number) => {
    useProjectStore.getState().setEffect(clip.id, kind, value / 100, value !== 0);
  };

  const localTime = Math.max(0, Math.min(clip.duration, playhead - clip.start));

  return (
    <aside className="relative flex shrink-0 flex-col border-l"
      style={{ width: rightWidth, borderColor: "var(--qx-border)", background: "var(--qx-panel)" }}>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: "var(--qx-border)" }}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "var(--qx-accent-soft)", color: "var(--qx-accent)" }}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-editor-text" title={clip.name}>{clip.name || "Clip"}</div>
          <div className="mt-0.5 text-[10px] text-editor-textMuted">
            {asset?.type ?? (clip.text ? "text" : "clip")} · {formatTime(clip.duration)} · {Math.abs(clip.speed).toFixed(2)}×
          </div>
        </div>
        <IconButton tooltip="Go to clip start" onClick={goToStart} aria-label="Go to clip start">
          <SkipBack className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton tooltip="Hide inspector" onClick={toggleInspector} aria-label="Hide inspector">
          <PanelRight className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton tooltip="Delete clip" onClick={() => {
          removeClip(clip.id);
          useTimelineStore.getState().setSelectedClip(null);
        }} aria-label="Delete clip">
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="qx-scroll flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-2"
        style={{ borderColor: "var(--qx-border)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            data-testid={`inspector-tab-${t.id}`}
            data-active={tab === t.id}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
              tab === t.id
                ? "text-white"
                : "text-editor-textMuted hover:text-editor-text hover:bg-editor-surfaceHover"
            )}
            style={tab === t.id
              ? { borderColor: "rgba(124,92,255,.5)", background: "var(--qx-accent-soft)" }
              : { borderColor: "var(--qx-border)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="qx-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {tab === "transform" && (
          <>
            <Collapsible title="Position & size">
              <div className="space-y-2.5">
                <SliderRow label="Position X" value={clip.transform.position.x} min={-2000} max={2000} step={1}
                  onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, position: { ...clip.transform.position, x: v } } })} />
                <SliderRow label="Position Y" value={clip.transform.position.y} min={-2000} max={2000} step={1}
                  onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, position: { ...clip.transform.position, y: v } } })} />
                <SliderRow label="Scale (%)" value={Math.round(clip.transform.scale * 100)} min={1} max={500} step={1}
                  onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, scale: v / 100 } })} />
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Width (0 = auto)" value={clip.transform.width ?? 0} min={0} max={4000}
                    onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, width: v > 0 ? v : undefined } })} />
                  <NumberField label="Height (0 = auto)" value={clip.transform.height ?? 0} min={0} max={4000}
                    onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, height: v > 0 ? v : undefined } })} />
                </div>
                <SliderRow label="Rotation (°)" value={clip.transform.rotation} min={-180} max={180} step={1}
                  onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, rotation: v } })} />
                <SliderRow label="Opacity (%)" value={Math.round(clip.opacity * 100)} min={0} max={100} step={1}
                  onChange={(v) => updateClip(clip.id, { opacity: v / 100, transform: { ...clip.transform, opacity: v / 100 } })} />
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateClip(clip.id, {
                    transform: { ...clip.transform, position: { x: 0, y: 0 }, scale: 1, rotation: 0 }, opacity: 1,
                  })}><RotateCcw className="mr-1 h-3 w-3" /> Reset</Button>
                  <Select aria-label="Blend mode" value={clip.blendMode ?? "normal"}
                    onValueChange={(v) => updateClip(clip.id, { blendMode: v as Clip["blendMode"] })}>
                    <option value="normal">Normal</option>
                    <option value="screen">Screen</option>
                    <option value="multiply">Multiply</option>
                    <option value="overlay">Overlay</option>
                  </Select>
                </div>
              </div>
            </Collapsible>

            <Collapsible title="Crop & flip" defaultOpen={false}>
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  {(["top", "right", "bottom", "left"] as const).map((edge) => (
                    <NumberField key={edge} label={edge[0].toUpperCase() + edge.slice(1)}
                      value={clip.crop?.[edge] ?? 0} min={0} max={4000}
                      onChange={(v) => useProjectStore.getState().setCrop(clip.id, { [edge]: Math.max(0, v) })} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateClip(clip.id, { flipH: !clip.flipH })}>
                    <FlipHorizontal className="mr-1 h-3 w-3" /> Flip H
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateClip(clip.id, { flipV: !clip.flipV })}>
                    <FlipVertical className="mr-1 h-3 w-3" /> Flip V
                  </Button>
                </div>
              </div>
            </Collapsible>
          </>
        )}

        {tab === "color" && (
          <>
            <Collapsible title="Color adjustments">
              <div className="space-y-2.5">
                <SliderRow label="Brightness" value={effectValue("brightness")} min={-100} max={100} step={1} onChange={(v) => setEffect("brightness", v)} />
                <SliderRow label="Contrast" value={effectValue("contrast")} min={-100} max={100} step={1} onChange={(v) => setEffect("contrast", v)} />
                <SliderRow label="Saturation" value={effectValue("saturation")} min={-100} max={100} step={1} onChange={(v) => setEffect("saturation", v)} />
                <SliderRow label="Exposure" value={effectValue("exposure")} min={-100} max={100} step={1} onChange={(v) => setEffect("exposure", v)} />
                <SliderRow label="Temperature" value={effectValue("temperature")} min={-100} max={100} step={1} onChange={(v) => setEffect("temperature", v)} />
                <SliderRow label="Tint" value={effectValue("tint")} min={-100} max={100} step={1} onChange={(v) => setEffect("tint", v)} />
                <SliderRow label="Highlights" value={effectValue("highlights")} min={-100} max={100} step={1} onChange={(v) => setEffect("highlights", v)} />
                <SliderRow label="Shadows" value={effectValue("shadows")} min={-100} max={100} step={1} onChange={(v) => setEffect("shadows", v)} />
                <SliderRow label="Gamma" value={effectValue("gamma")} min={-100} max={100} step={1} onChange={(v) => setEffect("gamma", v)} />
                <SliderRow label="Sharpness" value={effectValue("sharpness")} min={-100} max={100} step={1} onChange={(v) => setEffect("sharpness", v)} />
              </div>
            </Collapsible>

            <Collapsible title="Styles" defaultOpen={false}>
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  {(["blur", "gaussianBlur", "vignette", "grayscale", "sepia"] as EffectKind[]).map((kind) => (
                    <Button key={kind} size="sm" variant={clip.effects.some((e) => e.kind === kind && e.enabled) ? "default" : "outline"}
                      onClick={() => setEffect(kind, clip.effects.some((e) => e.kind === kind && e.enabled) ? 0 : 1)}>
                      {kind === "gaussianBlur" ? "Gaussian blur" : kind[0].toUpperCase() + kind.slice(1)}
                    </Button>
                  ))}
                </div>
                {clip.effects.some((e) => e.kind === "blur" || e.kind === "gaussianBlur") && (
                  <SliderRow label="Blur amount" value={effectValue("blur") || effectValue("gaussianBlur")} min={0} max={100} step={1}
                    onChange={(v) => setEffect("gaussianBlur", v)} />
                )}
              </div>
            </Collapsible>

            <Collapsible title="Video fades" defaultOpen={false}>
              <div className="space-y-2.5">
                <SliderRow label="Fade in (s)" value={Math.round((clip.fadeIn ?? 0) * 10) / 10} min={0} max={10} step={0.1}
                  onChange={(v) => updateClip(clip.id, { fadeIn: v })} />
                <SliderRow label="Fade out (s)" value={Math.round((clip.fadeOut ?? 0) * 10) / 10} min={0} max={10} step={0.1}
                  onChange={(v) => updateClip(clip.id, { fadeOut: v })} />
              </div>
            </Collapsible>
          </>
        )}

        {tab === "audio" && (
          <>
            <Collapsible title="Audio levels">
              <div className="space-y-2.5">
                <SliderRow label="Volume (%)" value={Math.round(clip.volume * 100)} min={0} max={300} step={1}
                  onChange={(v) => updateClip(clip.id, { volume: v / 100 })} />
                <Button className="w-full" size="sm" variant={clip.muted ? "default" : "outline"}
                  onClick={() => updateClip(clip.id, { muted: !clip.muted })}>
                  <VolumeX className="mr-1 h-3 w-3" /> {clip.muted ? "Unmute" : "Mute"}
                </Button>
                <SliderRow label="Fade in (s)" value={Math.round((clip.audioFadeIn ?? 0) * 10) / 10} min={0} max={10} step={0.1}
                  onChange={(v) => updateClip(clip.id, { audioFadeIn: v })} />
                <SliderRow label="Fade out (s)" value={Math.round((clip.audioFadeOut ?? 0) * 10) / 10} min={0} max={10} step={0.1}
                  onChange={(v) => updateClip(clip.id, { audioFadeOut: v })} />
              </div>
            </Collapsible>

            <Collapsible title="Audio processing" defaultOpen={false}>
              <div className="space-y-2.5">
                <Button className="w-full" size="sm" variant={dsp.enabled ? "default" : "outline"}
                  onClick={() => setDsp({ enabled: !dsp.enabled })}>
                  <SlidersHorizontal className="mr-1 h-3 w-3" />
                  {dsp.enabled ? "Processing on" : "Processing off"}
                </Button>
                <div className="grid grid-cols-2 gap-1">
                  {AUDIO_DSP_PRESETS.map((preset) => (
                    <Button key={preset.id} size="sm" variant="outline" className="text-[10px]"
                      onClick={() => updateClip(clip!.id, { audioDsp: { ...preset.dsp } })}>
                      {preset.label}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" className="col-span-2 text-[10px]"
                    onClick={() => updateClip(clip!.id, { audioDsp: { ...resolveAudioDsp(null) } })}>
                    Reset DSP
                  </Button>
                </div>
                {audioDspIsActive(dsp) ? (
                  <>
                    <SliderRow label="High-pass (Hz)" value={dsp.highpassHz} min={0} max={2000} step={10}
                      onChange={(v) => setDsp({ highpassHz: v })} />
                    <SliderRow label="Low-pass (Hz)" value={dsp.lowpassHz} min={0} max={20000} step={100}
                      onChange={(v) => setDsp({ lowpassHz: v })} />
                    <SliderRow label="Low EQ (dB)" value={dsp.lowGainDb} min={-12} max={12} step={0.5}
                      onChange={(v) => setDsp({ lowGainDb: v })} />
                    <SliderRow label="Mid EQ (dB)" value={dsp.midGainDb} min={-12} max={12} step={0.5}
                      onChange={(v) => setDsp({ midGainDb: v })} />
                    <SliderRow label="High EQ (dB)" value={dsp.highGainDb} min={-12} max={12} step={0.5}
                      onChange={(v) => setDsp({ highGainDb: v })} />
                    <Button className="w-full" size="sm" variant={dsp.compressor ? "default" : "outline"}
                      onClick={() => setDsp({ compressor: !dsp.compressor })}>
                      {dsp.compressor ? "Compressor on" : "Compressor off"}
                    </Button>
                    {dsp.compressor ? (
                      <>
                        <SliderRow label="Threshold (dB)" value={dsp.thresholdDb} min={-60} max={0} step={1}
                          onChange={(v) => setDsp({ thresholdDb: v })} />
                        <SliderRow label="Ratio" value={dsp.ratio} min={1} max={20} step={0.5}
                          onChange={(v) => setDsp({ ratio: v })} />
                        <SliderRow label="Attack (ms)" value={dsp.attackMs} min={1} max={200} step={1}
                          onChange={(v) => setDsp({ attackMs: v })} />
                        <SliderRow label="Release (ms)" value={dsp.releaseMs} min={10} max={2000} step={10}
                          onChange={(v) => setDsp({ releaseMs: v })} />
                      </>
                    ) : null}
                  </>
                ) : (
                  <p className="text-[10px] leading-relaxed text-editor-textMuted">
                    Turn processing on or choose a preset to add local EQ, filters and dynamics.
                  </p>
                )}
                <p className="text-[9px] leading-relaxed text-editor-textMuted">
                  Processing is applied to this clip in preview and in exported audio. No uploads or paid services.
                </p>
              </div>
            </Collapsible>

            <Collapsible title="Speed & audio tools" defaultOpen={false}>
              <div className="space-y-2.5">
                <SliderRow label="Speed (%)" value={Math.round(Math.abs(clip.speed) * 100)} min={5} max={400} step={1}
                  onChange={(v) => updateClip(clip.id, { speed: clip.speed < 0 ? -v / 100 : v / 100 })} />
                <div className="grid grid-cols-4 gap-1">
                  {[0.25, 0.5, 1, 2].map((r) => (
                    <Button key={r} size="sm" variant="outline" onClick={() => updateClip(clip.id, { speed: r })}>{r}×</Button>
                  ))}
                </div>
                <Button className="w-full" size="sm" variant="outline" onClick={() => {
                  const id = useProjectStore.getState().detachAudio(clip.id);
                  if (id) useTimelineStore.getState().setSelectedClip(id);
                }}><Link2 className="mr-1 h-3 w-3" /> Detach audio</Button>
              </div>
            </Collapsible>
          </>
        )}

        {tab === "text" && (
          clip.text ? <TextEditor clip={clip} /> : (
            <div className="py-6 text-center text-xs text-editor-textMuted">
              This clip is not a text clip.
              <div className="mt-3">
                <Button size="sm" onClick={() => {
                  const id = useProjectStore.getState().addTextClip(playhead, 3, { text: "New text" });
                  useTimelineStore.getState().setSelectedClip(id);
                }}>Add text at playhead</Button>
              </div>
            </div>
          )
        )}

        {tab === "keyframes" && (
          <KeyframeEditor clip={clip} localTime={localTime} />
        )}

        {tab === "actions" && (
          <>
            <Collapsible title="Clip tools">
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => splitClip(clip.id, playhead)}><Scissors className="mr-1 h-3 w-3" /> Split</Button>
                  <Button size="sm" variant="outline" onClick={() => duplicateClip(clip.id)}><Copy className="mr-1 h-3 w-3" /> Duplicate</Button>
                  <Button size="sm" variant="outline" onClick={() => updateClip(clip.id, { speed: -(clip.speed || 1) })}>Reverse</Button>
                  <Button
                    size="sm"
                    variant={clip.freeze?.enabled ? "default" : "outline"}
                    onClick={() => updateClip(clip.id, {
                      freeze: clip.freeze?.enabled
                        ? { ...clip.freeze, enabled: false }
                        : {
                            enabled: true,
                            at: Math.max(0, Math.min(clip.duration - 1 / (project.settings.fps || 30), playhead - clip.start)),
                            duration: 1,
                          },
                    })}
                  ><Snowflake className="mr-1 h-3 w-3" /> {clip.freeze?.enabled ? "Unfreeze" : "Freeze"}</Button>
                </div>
                {clip.freeze?.enabled && (
                  <>
                    <SliderRow label="Freeze at (s, clip time)" value={Math.round(clip.freeze.at * 100) / 100} min={0} max={clip.duration} step={0.05}
                      onChange={(v) => updateClip(clip.id, {
                        freeze: { ...clip.freeze!, at: Math.max(0, Math.min(clip.duration - 0.05, v)) },
                      })} />
                    <SliderRow label="Freeze duration (s)" value={Math.round(clip.freeze.duration * 100) / 100} min={0.05} max={10} step={0.05}
                      onChange={(v) => updateClip(clip.id, {
                        freeze: { ...clip.freeze!, duration: Math.max(0.05, Math.min(clip.duration - clip.freeze!.at, v)) },
                      })} />
                  </>
                )}
              </div>
            </Collapsible>

            <Collapsible title="Transitions" defaultOpen={false}>
              <div className="space-y-2">
                <SectionTitle>Transition in</SectionTitle>
                <TransitionPicker value={clip.transitionIn} onChange={(v) => useProjectStore.getState().setTransition(clip.id, "in", v)} />
                <SectionTitle>Transition out</SectionTitle>
                <TransitionPicker value={clip.transitionOut} onChange={(v) => useProjectStore.getState().setTransition(clip.id, "out", v)} />
              </div>
            </Collapsible>

            <Collapsible title="Grouping" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  const ids = useTimelineStore.getState().selectedClipIds;
                  if (ids.length > 1) useProjectStore.getState().groupClips(ids);
                }}>Group selected</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const ids = useTimelineStore.getState().selectedClipIds;
                  if (ids.length) useProjectStore.getState().ungroupClips(ids);
                }}>Ungroup</Button>
              </div>
            </Collapsible>
          </>
        )}
      </div>

      <div className="qx-resizer-x left-[-3px] right-auto" data-dragging={resizing ? "true" : undefined}
        onMouseDown={startResize} title="Drag to resize inspector" />
    </aside>
  );
}

function TextEditor({ clip }: { clip: Clip }) {
  const updateText = useProjectStore((s) => s.updateText);
  const t = clip.text ?? DEFAULT_TEXT;
  return (
    <>
      <SectionTitle>Content</SectionTitle>
      <Textarea rows={3} value={t.text} onChange={(e) => updateText(clip.id, { text: e.target.value })} aria-label="Text content" className="text-xs" />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] text-editor-textMuted">Font</span>
          <Select value={t.fontFamily} onValueChange={(v) => updateText(clip.id, { fontFamily: v })}>
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </label>
        <NumberField label="Size" value={t.fontSize} min={8} max={400} onChange={(v) => updateText(clip.id, { fontSize: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] text-editor-textMuted">Weight</span>
          <Select value={String(t.fontWeight)} onValueChange={(v) => updateText(clip.id, { fontWeight: Number(v) })}>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-editor-textMuted">Alignment</span>
          <Select value={t.align} onValueChange={(v) => updateText(clip.id, { align: v as typeof t.align })}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </Select>
        </label>
      </div>
      <ColorField label="Text color" value={t.color} onChange={(v) => updateText(clip.id, { color: v })} />
      <SliderRow label="Letter spacing" value={t.letterSpacing} min={-10} max={40} step={1} onChange={(v) => updateText(clip.id, { letterSpacing: v })} />
      <SliderRow label="Line spacing" value={Math.round(t.lineSpacing * 10) / 10} min={0.8} max={3} step={0.1} onChange={(v) => updateText(clip.id, { lineSpacing: v })} />
      <Separator className="my-1" />
      <SectionTitle>Outline &amp; shadow</SectionTitle>
      <SliderRow label="Outline width" value={t.outlineWidth} min={0} max={20} step={1} onChange={(v) => updateText(clip.id, { outlineWidth: v })} />
      <ColorField label="Outline color" value={t.outlineColor} onChange={(v) => updateText(clip.id, { outlineColor: v })} />
      <label className="flex items-center gap-2 text-[11px] text-editor-text">
        <input type="checkbox" checked={t.shadow} onChange={(e) => updateText(clip.id, { shadow: e.target.checked })} /> Shadow
      </label>
      {t.shadow && (
        <>
          <ColorField label="Shadow color" value={t.shadowColor} onChange={(v) => updateText(clip.id, { shadowColor: v })} />
          <SliderRow label="Shadow blur" value={t.shadowBlur} min={0} max={40} step={1}
            onChange={(v) => updateText(clip.id, { shadowBlur: v })} />
        </>
      )}
      <label className="flex items-center gap-2 text-[11px] text-editor-text">
        <input type="checkbox" checked={t.background} onChange={(e) => updateText(clip.id, { background: e.target.checked })} /> Background box
      </label>
      {t.background && (
        <>
          <ColorField label="Background color" value={t.backgroundColor} onChange={(v) => updateText(clip.id, { backgroundColor: v })} />
          <SliderRow label="Background padding" value={t.backgroundPadding} min={0} max={80} step={1}
            onChange={(v) => updateText(clip.id, { backgroundPadding: v })} />
        </>
      )}
      <Separator className="my-1" />
      <SectionTitle>Animation preset</SectionTitle>
      <Select value={t.animation} onValueChange={(v) => updateText(clip.id, { animation: v as TextAnimationKind })}>
        {([["none", "None"], ["fadeIn", "Fade in"], ["fadeOut", "Fade out"], ["slideIn", "Slide in"], ["slideOut", "Slide out"],
          ["zoomIn", "Zoom in"], ["zoomOut", "Zoom out"], ["typewriter", "Typewriter"]] as const).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
      <SliderRow label="Animation duration (s)" value={t.animationDuration} min={0.1} max={5} step={0.1}
        onChange={(v) => updateText(clip.id, { animationDuration: v })} />
    </>
  );
}

function keyframeBaseValue(property: KeyframeProperty, clip: Clip): number {
  switch (property) {
    case "positionX": return clip.transform.position.x;
    case "positionY": return clip.transform.position.y;
    case "scale": return clip.transform.scale;
    case "rotation": return clip.transform.rotation;
    case "opacity": return clip.opacity;
    case "volume": return clip.volume;
    case "cropTop": return clip.crop?.top ?? 0;
    case "cropRight": return clip.crop?.right ?? 0;
    case "cropBottom": return clip.crop?.bottom ?? 0;
    case "cropLeft": return clip.crop?.left ?? 0;
  }
}

function KeyframeEditor({ clip, localTime }: { clip: Clip; localTime: number }) {
  const [property, setProperty] = React.useState<KeyframeProperty>("positionX");
  const [value, setValue] = React.useState(() => keyframeBaseValue("positionX", clip));

  const frames = clip.keyframes.filter((k) => k.property === property).sort((a, b) => a.time - b.time);

  return (
    <>
      <SectionTitle>Add keyframe</SectionTitle>
      <Select value={property} onValueChange={(v) => {
        const next = v as KeyframeProperty;
        setProperty(next);
        setValue(keyframeBaseValue(next, clip));
      }}>
        {KEYFRAME_PROPERTIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </Select>
      <NumberField label="Value" value={value} min={-100000} max={100000} step={0.01} onChange={setValue} />
      <p className="text-[10px] text-editor-textMuted">Playhead is at {localTime.toFixed(2)}s in this clip.</p>
      <Button size="sm" className="w-full" onClick={() => useProjectStore.getState().addKeyframe(clip.id, property, localTime, value)}>
        <Diamond className="h-3 w-3 mr-1" /> Add keyframe at playhead
      </Button>
      <Separator className="my-1" />
      <SectionTitle>Keyframes ({frames.length})</SectionTitle>
      {frames.length === 0 && <p className="text-[10px] text-editor-textMuted">No keyframes for this property yet.</p>}
      <div className="space-y-2">
        {frames.map((k) => (
          <div key={k.id} className="rounded border border-editor-border bg-editor-surface/50 p-2 space-y-1.5">
            <div className="flex gap-2">
              <NumberField label="Time (s)" value={Math.round(k.time * 100) / 100} min={0} max={clip.duration} step={0.01}
                onChange={(v) => useProjectStore.getState().moveKeyframe(clip.id, k.id, v)} />
              <NumberField label="Value" value={k.value} min={-100000} max={100000} step={0.01}
                onChange={(v) => useProjectStore.getState().updateKeyframe(clip.id, k.id, { value: v })} />
            </div>
            <div className="flex items-center gap-2">
              <Select aria-label="Easing" value={k.easing} onValueChange={(v) => useProjectStore.getState().updateKeyframe(clip.id, k.id, { easing: v as typeof k.easing })} className="h-7 text-[10px]">
                <option value="linear">Linear</option><option value="easeIn">Ease in</option><option value="easeOut">Ease out</option><option value="easeInOut">Ease in-out</option>
              </Select>
              <Button size="sm" variant="destructive" className="ml-auto h-7 px-2" onClick={() => useProjectStore.getState().removeKeyframe(clip.id, k.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-editor-textMuted">Drag keyframe diamonds on the timeline to retime. Interpolation is linear between keyframes.</p>
    </>
  );
}

function TransitionPicker({ value, onChange }: {
  value?: { kind: TransitionKind; duration: number };
  onChange: (v: { kind: TransitionKind; duration: number } | null) => void;
}) {
  const kinds: TransitionKind[] = ["fade", "dissolve", "crossfade", "slide", "zoom", "wipe", "blur"];
  return (
    <div className="space-y-2 mb-2">
      <Select value={value?.kind ?? "none"} onValueChange={(v) =>
        onChange(v === "none" ? null : { kind: v as TransitionKind, duration: value?.duration ?? 0.5 })}>
        <option value="none">None</option>
        {kinds.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
      </Select>
      {value && <SliderRow label="Duration (s)" value={value.duration} min={0.1} max={3} step={0.1}
        onChange={(d) => onChange({ kind: value.kind, duration: d })} />}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold text-editor-textMuted uppercase tracking-wider pt-1">{children}</div>;
}

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-editor-textMuted">{label}</span>
        <span className="text-editor-text tabular-nums">{Math.round(value * 100) / 100}</span>
      </div>
      <Slider value={value} min={min} max={max} step={step} onValueChange={onChange} className="h-1.5" aria-label={label} />
    </div>
  );
}

function NumberField({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[10px] text-editor-textMuted">{label}</span>
      <Input type="number" value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} min={min} max={max} step={step}
        onChange={(e) => {
          const n = Number(e.currentTarget.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="h-7 text-[11px]" aria-label={label} />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] text-editor-textMuted">
      {label}
      <span className="flex items-center gap-1">
        <Input type="color" value={value} onChange={(e) => onChange(e.currentTarget.value)} className="h-6 w-8 p-0 border-0 bg-transparent" aria-label={label} />
        <span className="font-mono text-editor-text">{value}</span>
      </span>
    </label>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
