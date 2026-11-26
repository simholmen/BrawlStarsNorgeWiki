// Layout and crop math for images inserted from the Markdown editor's image dialog
// (components/editor/ImageInsertDialog.tsx). Pure functions, so they're tested on their own.
//
// An image is stored in the page text as a small HTML block the Markdown renderer already allows
// (figure/img/figcaption with classes, see lib/markdown.ts):
//
//   <figure class="wimg wimg-right wimg-33 wimg-frame">
//   <img src="…" alt="…">
//   <figcaption>…</figcaption>
//   </figure>
//
// The classes are styled in app/content.css. "wimg-frame" is the same grey box with a border as
// the old figure-container images (e.g. on Zimma's page).

export type Placement = "left" | "center" | "right";
export const SIZES = [25, 33, 50, 75, 100] as const;
export type Size = (typeof SIZES)[number];

export type FigureOptions = {
  src: string;
  alt: string;
  caption: string;
  placement: Placement;
  size: Size;
  frame: boolean;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** One line of text: newlines would end the HTML block early in Markdown. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function figureClasses(o: Pick<FigureOptions, "placement" | "size" | "frame">): string {
  return ["wimg", `wimg-${o.placement}`, `wimg-${o.size}`, o.frame ? "wimg-frame" : ""].filter(Boolean).join(" ");
}

/** The HTML block for the page text, with a blank line before and after so Markdown keeps it whole. */
export function buildFigure(o: FigureOptions): string {
  const caption = oneLine(o.caption);
  const lines = [
    `<figure class="${figureClasses(o)}">`,
    `<img src="${escapeHtml(o.src)}" alt="${escapeHtml(oneLine(o.alt))}">`,
    ...(caption ? [`<figcaption>${escapeHtml(caption)}</figcaption>`] : []),
    `</figure>`,
  ];
  return `\n\n${lines.join("\n")}\n\n`;
}

/** A crop rectangle as fractions (0–1) of the image's width and height. */
export type Crop = { x: number; y: number; w: number; h: number };

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 };

export function isFullCrop(c: Crop): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.002;
  return near(c.x, 0) && near(c.y, 0) && near(c.w, 1) && near(c.h, 1);
}

/**
 * The largest centred crop with the given aspect ratio (width / height in pixels) on an image of
 * imgW × imgH pixels. Null aspect means the whole image.
 */
export function centeredCrop(aspect: number | null, imgW: number, imgH: number): Crop {
  if (!aspect || imgW <= 0 || imgH <= 0) return FULL_CROP;
  const imgAspect = imgW / imgH;
  if (aspect >= imgAspect) {
    const h = imgAspect / aspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = aspect / imgAspect;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

const MIN = 0.05;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Move a crop by (dx, dy) fractions, keeping it inside the image. */
export function moveCrop(c: Crop, dx: number, dy: number): Crop {
  return { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) };
}

export type Corner = "nw" | "ne" | "sw" | "se";

/**
 * Drag one corner to (px, py) (fractions of the image); the opposite corner stays put. With an
 * aspect ratio (pixels) the height follows the width. Always stays inside the image.
 */
export function resizeCrop(
  c: Crop,
  corner: Corner,
  px: number,
  py: number,
  aspect: number | null,
  imgW: number,
  imgH: number,
): Crop {
  const west = corner === "nw" || corner === "sw";
  const north = corner === "nw" || corner === "ne";
  // The fixed (opposite) corner.
  const fx = west ? c.x + c.w : c.x;
  const fy = north ? c.y + c.h : c.y;
  // Room available from the fixed corner towards the dragged one.
  const maxW = west ? fx : 1 - fx;
  const maxH = north ? fy : 1 - fy;

  let w = clamp(west ? fx - px : px - fx, MIN, maxW);
  let h = clamp(north ? fy - py : py - fy, MIN, maxH);

  if (aspect) {
    // Height (as a fraction) that matches the width for this aspect ratio.
    const ratio = (imgW / imgH) / aspect; // h = w * ratio
    h = w * ratio;
    if (h > maxH) {
      h = maxH;
      w = h / ratio;
    }
    if (w < MIN) {
      w = MIN;
      h = w * ratio;
    }
  }

  return { x: west ? fx - w : fx, y: north ? fy - h : fy, w, h };
}
