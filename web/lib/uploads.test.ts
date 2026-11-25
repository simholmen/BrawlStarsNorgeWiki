import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";
import { altFromFileName, checkImageFile, isUploadedImage, newImageName, uploadedImagePrefix } from "./uploads";

const URL = "https://abc.supabase.co";
const PREFIX = "https://abc.supabase.co/storage/v1/object/public/wiki-images/";

describe("uploadedImagePrefix / isUploadedImage", () => {
  it("builds the public bucket prefix, ignoring a trailing slash", () => {
    expect(uploadedImagePrefix(URL)).toBe(PREFIX);
    expect(uploadedImagePrefix(URL + "/")).toBe(PREFIX);
  });

  it("accepts well-formed files in the bucket only", () => {
    const id = "3f2c1a9e-1b2c-4d3e-8f90-123456789abc";
    expect(isUploadedImage(`${PREFIX}2026-11/${id}.png`, URL)).toBe(true);
    expect(isUploadedImage(`${PREFIX}2026-11/${id}.svg`, URL)).toBe(false);
    expect(isUploadedImage(`${PREFIX}../other/${id}.png`, URL)).toBe(false);
    expect(isUploadedImage(`https://evil.example/storage/v1/object/public/wiki-images/2026-11/${id}.png`, URL)).toBe(false);
    expect(isUploadedImage(`https://abc.supabase.co/storage/v1/object/public/other/2026-11/${id}.png`, URL)).toBe(false);
    expect(isUploadedImage("/images/x.jpg", URL)).toBe(false);
  });
});

describe("newImageName", () => {
  it("uses the UTC month, a lowercase id and the type's extension", () => {
    const name = newImageName("image/jpeg", new Date("2026-01-31T23:30:00Z"), "ABCDEF12-0000");
    expect(name).toBe("2026-01/abcdef12-0000.jpg");
    expect(isUploadedImage(PREFIX + newImageName("image/webp"), URL)).toBe(true);
  });

  it("refuses other types", () => {
    expect(() => newImageName("image/svg+xml")).toThrow();
  });
});

describe("checkImageFile", () => {
  it("checks type and size", () => {
    expect(checkImageFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(checkImageFile({ type: "image/svg+xml", size: 1000 })).toMatch(/JPG/);
    expect(checkImageFile({ type: "image/png", size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });
});

describe("altFromFileName", () => {
  it("makes readable alt text", () => {
    expect(altFromFileName("mitt_bilde-2.png")).toBe("mitt bilde 2");
    expect(altFromFileName("image.png")).toBe("bilde");
    expect(altFromFileName("[x].jpg")).toBe("x");
  });
});

describe("rendering uploaded images", () => {
  it("keeps an uploaded image and drops a foreign one", () => {
    const ok = `${PREFIX}2026-11/3f2c1a9e-1b2c-4d3e-8f90-123456789abc.png`;
    const html = renderMarkdown(`![Laget](${ok})\n\n![x](https://evil.example/a.png)`, {
      keepImage: (src) => isUploadedImage(src, URL),
    });
    expect(html).toContain(`<img src="${ok}" alt="Laget">`);
    expect(html).not.toContain("evil.example");
  });
});
