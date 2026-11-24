import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { useProjectStore } from "@/stores/projectStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useMediaStore } from "@/stores/mediaStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import {
  parseSubtitles, serializeSrt, serializeVtt, readSubtitleFile, writeSubtitleFile,
} from "@/lib/subtitles";
import { BUILTIN_TEMPLATES } from "@/lib/templates";
import "./index.css";

// Dev-only inspection hook used by the CDP end-to-end suite. Stripped from
// production builds by Vite's import.meta.env.DEV replacement.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__QUMENX_STORES__ = {
    project: useProjectStore,
    timeline: useTimelineStore,
    preview: usePreviewStore,
    media: useMediaStore,
    workspace: useWorkspaceStore,
    subtitles: {
      parseSubtitles,
      serializeSrt,
      serializeVtt,
      readSubtitleFile,
      writeSubtitleFile,
    },
    templates: { builtin: BUILTIN_TEMPLATES },
  };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
