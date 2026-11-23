import { create } from "zustand";
import { Asset } from "@/types/project";

interface MediaState {
  assets: Asset[];
  query: string;
  filterType: "all" | "video" | "audio" | "image";
  sort: "name" | "date" | "duration" | "size";
  setAssets: (assets: Asset[]) => void;
  addAsset: (asset: Asset) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  removeAsset: (id: string) => void;
  setQuery: (q: string) => void;
  setFilterType: (t: MediaState["filterType"]) => void;
  setSort: (s: MediaState["sort"]) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  assets: [],
  query: "",
  filterType: "all",
  sort: "date",
  setAssets: (assets) => set({ assets }),
  addAsset: (asset) => set((state) => ({ assets: [...state.assets, asset] })),
  updateAsset: (id, patch) =>
    set((state) => ({
      assets: state.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),
  removeAsset: (id) => set((state) => ({ assets: state.assets.filter((a) => a.id !== id) })),
  setQuery: (q) => set({ query: q }),
  setFilterType: (t) => set({ filterType: t }),
  setSort: (s) => set({ sort: s }),
}));
