import type { CSSProperties } from "react";
import { type ClipMask, DEFAULT_MASK } from "@/types/project";

/** Fill defaults for projects saved before masks existed. */
export function resolveMask(mask?: ClipMask | null): ClipMask {
  return { ...DEFAULT_MASK, ...(mask ?? {}) };
}

/** A mask is active only when it has a shape and a non-zero area. */
export function maskIsActive(mask?: ClipMask | null): boolean {
  const m = resolveMask(mask);
  return m.kind !== "none" && m.width > 0.001 && m.height > 0.001;
}

/**
 * Build a CSS mask that matches the FFmpeg alpha mask used at export time.
 * The SVG is rasterized by Chromium, so feathering and rotation stay local
 * and do not require a canvas or any network access.
 */
export function maskCss(mask: ClipMask, width: number, height: number): CSSProperties | undefined {
  if (!maskIsActive(mask)) return undefined;

  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const m = resolveMask(mask);
  const cx = m.x * w;
  const cy = m.y * h;
  const rw = Math.max(0.5, m.width * w);
  const rh = Math.max(0.5, m.height * h);
  const featherPx = Math.max(0, Math.min(0.5, m.feather)) * Math.min(w, h);
  const blur = featherPx > 0.25
    ? `<filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(featherPx / 2).toFixed(2)}"/></filter>`
    : "";
  const filter = blur ? ' filter="url(#f)"' : "";
  const rotate = m.rotation
    ? ` transform="rotate(${m.rotation.toFixed(3)} ${cx.toFixed(2)} ${cy.toFixed(2)})"`
    : "";
  // Normal masks show the shape; inverted masks cut the shape out.
  const background = m.invert ? "#fff" : "#000";
  const shapeColor = m.invert ? "#000" : "#fff";
  const shape = m.kind === "ellipse"
    ? `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${(rw / 2).toFixed(2)}" ry="${(rh / 2).toFixed(2)}" fill="${shapeColor}"${rotate}${filter}/>`
    : `<rect x="${(cx - rw / 2).toFixed(2)}" y="${(cy - rh / 2).toFixed(2)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}" fill="${shapeColor}"${rotate}${filter}/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<defs>${blur}<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">`
    + `<rect width="${w}" height="${h}" fill="${background}"/>${shape}</mask></defs>`
    + `<rect width="${w}" height="${h}" fill="#fff" mask="url(#m)"/></svg>`;
  const url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;

  return {
    maskImage: url,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskImage: url,
    WebkitMaskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
  };
}

/** Quick shapes exposed in the Inspector. */
export const MASK_PRESETS: Array<{ id: string; label: string; mask: ClipMask }> = [
  {
    id: "circle",
    label: "Circle",
    mask: { ...DEFAULT_MASK, kind: "ellipse", width: 0.5, height: 0.5 },
  },
  {
    id: "portrait",
    label: "Portrait",
    mask: { ...DEFAULT_MASK, kind: "ellipse", width: 0.42, height: 0.82 },
  },
  {
    id: "letterbox",
    label: "Letterbox",
    mask: { ...DEFAULT_MASK, kind: "rectangle", width: 1, height: 0.56 },
  },
  {
    id: "rounded",
    label: "Rounded",
    mask: { ...DEFAULT_MASK, kind: "rectangle", width: 0.72, height: 0.72, feather: 0.06 },
  },
];
