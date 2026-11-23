import { create } from "zustand";
import { ExportJob } from "@/types/project";

interface ExportState {
  jobs: ExportJob[];
  activeJobId: string | null;
  addJob: (job: ExportJob) => void;
  updateJob: (id: string, patch: Partial<ExportJob>) => void;
  removeJob: (id: string) => void;
  setActiveJob: (id: string | null) => void;
  cancelJob: (id: string) => void;
  clearCompleted: () => void;
}

export const useExportStore = create<ExportState>((set, get) => ({
  jobs: [],
  activeJobId: null,
  addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs], activeJobId: job.id })),
  updateJob: (id, patch) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    })),
  removeJob: (id) => set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) })),
  setActiveJob: (id) => set({ activeJobId: id }),
  cancelJob: (id) => {
    get().updateJob(id, { status: "cancelled" });
  },
  clearCompleted: () => set((state) => ({ jobs: state.jobs.filter((j) => j.status !== "completed") })),
}));
