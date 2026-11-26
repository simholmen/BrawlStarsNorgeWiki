import { describe, expect, it } from "vitest";
import { buildFigure, centeredCrop, isFullCrop, moveCrop, resizeCrop, FULL_CROP } from "./imageLayout";
import { renderMarkdown } from "./markdown";

const SRC = "https://abc.supabase.co/storage/v1/object/public/wiki-images/2026-11/abcdef12.jpg";

describe("buildFigure", () => {
  it("writes a figure block with classes, alt and caption", () => {
    const html = buildFigure({ src: SRC, alt: "Zimma", caption: "Første rank 20", placement: "left", size: 50, frame: true });
    expect(html).toContain('<figure class="wimg wimg-left wimg-50 wimg-frame">');
    expect(html).toContain(`<img src="${SRC}" alt="Zimma">`);
    expect(html).toContain("<figcaption>Første rank 20</figcaption>");
    expect(html.startsWith("\n\n")).toBe(true);
  });

  it("leaves out the frame class and an empty caption", () => {
    const html = buildFigure({ src: SRC, alt: "a", caption: "  ", placement: "center", size: 100, frame: false });
    expect(html).toContain('class="wimg wimg-center wimg-100"');
    expect(html).not.toContain("figcaption");
  });

  it("escapes text and keeps it on one line", () => {
    const html = buildFigure({ src: SRC, alt: 'a "b"', caption: "x <script>\n\ny", placement: "right", size: 33, frame: true });
    expect(html).toContain('alt="a &quot;b&quot;"');
    expect(html).toContain("<figcaption>x &lt;script&gt; y</figcaption>");
  });

  it("survives the page renderer with its classes", () => {
    const md = `Tekst før.${buildFigure({ src: "/images/x.jpg", alt: "x", caption: "Hei", placement: "right", size: 33, frame: true })}Tekst etter.`;
    const out = renderMarkdown(md);
    expect(out).toContain('<figure class="wimg wimg-right wimg-33 wimg-frame">');
    expect(out).toContain('<img src="/images/x.jpg" alt="x">');
    expect(out).toContain("<figcaption>Hei</figcaption>");
    expect(out).toContain("<p>Tekst etter.</p>");
  });
});

describe("crop", () => {
  it("centres the largest crop for an aspect ratio", () => {
    // 1000×500 image, square crop -> half the width, full height.
    expect(centeredCrop(1, 1000, 500)).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
    // 1000×1000 image, 2:1 crop -> full width, half the height.
    expect(centeredCrop(2, 1000, 1000)).toEqual({ x: 0, y: 0.25, w: 1, h: 0.5 });
    expect(centeredCrop(null, 10, 10)).toEqual(FULL_CROP);
  });

  it("keeps a moved crop inside the image", () => {
    expect(moveCrop({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, 0.5, -1)).toEqual({ x: 0.6, y: 0, w: 0.4, h: 0.4 });
  });

  it("resizes from a corner with the opposite corner fixed", () => {
    const c = resizeCrop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, "se", 0.9, 0.6, null, 100, 100);
    expect(c.x).toBeCloseTo(0.2);
    expect(c.y).toBeCloseTo(0.2);
    expect(c.w).toBeCloseTo(0.7);
    expect(c.h).toBeCloseTo(0.4);
  });

  it("keeps the aspect ratio and stays inside the image", () => {
    // 200×100 image, square crop: h fraction = 2 × w fraction.
    const c = resizeCrop({ x: 0, y: 0, w: 0.25, h: 0.5 }, "se", 0.9, 0.9, 1, 200, 100);
    expect(c.h).toBeCloseTo(1);
    expect(c.w).toBeCloseTo(0.5);
    expect(c.w * 200).toBeCloseTo(c.h * 100);
  });

  it("knows the uncropped state", () => {
    expect(isFullCrop(FULL_CROP)).toBe(true);
    expect(isFullCrop({ x: 0.1, y: 0, w: 0.9, h: 1 })).toBe(false);
  });
});
