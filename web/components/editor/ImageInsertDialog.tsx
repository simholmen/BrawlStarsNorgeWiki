"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { altFromFileName, WIKI_IMAGE_MAX_BYTES } from "@/lib/uploads";
import {
  buildFigure,
  centeredCrop,
  FULL_CROP,
  isFullCrop,
  moveCrop,
  resizeCrop,
  SIZES,
  type Corner,
  type Crop,
  type Placement,
  type Size,
} from "@/lib/imageLayout";
import { uploadImage } from "./uploadImage";

// Opens when an editor adds an image (toolbar button, paste or drop): crop (with aspect presets
// and a landscape/portrait switch), rotate, then choose size, placement, frame and caption. The
// crop/rotation is applied in the browser before uploading; an untouched image is uploaded as is
// (so GIFs keep their animation). Inserts the figure block from lib/imageLayout.ts.

type Ratio = "free" | "original" | "1:1" | "4:3" | "3:2" | "16:9";
type Orientation = "landscape" | "portrait";

const RATIOS: Array<[Ratio, string]> = [
  ["original", "Hele bildet"],
  ["free", "Fritt"],
  ["1:1", "1:1"],
  ["4:3", "4:3"],
  ["3:2", "3:2"],
  ["16:9", "16:9"],
];

const PLACEMENTS: Array<[Placement, string]> = [
  ["left", "Venstre"],
  ["center", "Midten"],
  ["right", "Høyre"],
];

/** Longest side of an edited image; bigger photos are scaled down (pages never show them larger). */
const MAX_SIDE = 2400;

function ratioValue(r: Ratio, o: Orientation): number | null {
  if (r === "free" || r === "original") return null;
  const [a, b] = r.split(":").map(Number);
  const wide = Math.max(a, b) / Math.min(a, b);
  return o === "landscape" ? wide : 1 / wide;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kunne ikke lese bildet."));
    img.src = src;
  });
}

/** The image turned `quarterTurns` × 90° clockwise, as a canvas. */
function rotated(img: HTMLImageElement, quarterTurns: number): HTMLCanvasElement {
  const turns = ((quarterTurns % 4) + 4) % 4;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = turns % 2 ? h : w;
  canvas.height = turns % 2 ? w : h;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Apply rotation + crop; returns the original file when nothing changed and it isn't too big. */
async function editedFile(file: File, img: HTMLImageElement, turns: number, crop: Crop): Promise<File> {
  if (turns % 4 === 0 && isFullCrop(crop) && file.size <= WIKI_IMAGE_MAX_BYTES) return file;
  const source = rotated(img, turns);
  const sx = Math.round(crop.x * source.width);
  const sy = Math.round(crop.y * source.height);
  const sw = Math.max(1, Math.round(crop.w * source.width));
  const sh = Math.max(1, Math.round(crop.h * source.height));
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const out = document.createElement("canvas");
  out.width = Math.round(sw * scale);
  out.height = Math.round(sh * scale);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);

  // PNG/WebP keep their type (transparency); everything else, and a PNG that ends up too big,
  // becomes JPEG.
  let type = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
  let blob = await toBlob(out, type, 0.9);
  if (blob && blob.size > WIKI_IMAGE_MAX_BYTES && type !== "image/jpeg") {
    type = "image/jpeg";
    blob = await toBlob(out, type, 0.88);
  }
  if (!blob) throw new Error("Kunne ikke lagre det redigerte bildet.");
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return new File([blob], file.name.replace(/\.[^.]*$/, "") + "." + ext, { type });
}

type Drag =
  | { kind: "move"; startX: number; startY: number; crop: Crop }
  | { kind: "resize"; corner: Corner };

function CropBox({
  src,
  width,
  height,
  crop,
  aspect,
  onChange,
}: {
  src: string;
  width: number;
  height: number;
  crop: Crop;
  aspect: number | null;
  onChange: (c: Crop) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  function point(e: ReactPointerEvent): [number, number] {
    const r = frame.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  function start(e: ReactPointerEvent, d: Drag) {
    e.preventDefault();
    e.stopPropagation();
    drag.current = d;
    frame.current?.setPointerCapture(e.pointerId);
  }

  function onMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const [px, py] = point(e);
    if (d.kind === "move") onChange(moveCrop(d.crop, px - d.startX, py - d.startY));
    else onChange(resizeCrop(crop, d.corner, px, py, aspect, width, height));
  }

  function end() {
    drag.current = null;
  }

  const pct = (v: number) => `${v * 100}%`;

  return (
    <div
      className="imgdlg-crop"
      ref={frame}
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL being edited */}
      <img src={src} alt="" draggable={false} />
      <div
        className="imgdlg-crop-rect"
        style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
        onPointerDown={(e) => {
          const [px, py] = point(e);
          start(e, { kind: "move", startX: px, startY: py, crop });
        }}
      >
        {(["nw", "ne", "sw", "se"] as Corner[]).map((c) => (
          <span
            key={c}
            className={`imgdlg-handle ${c}`}
            onPointerDown={(e) => start(e, { kind: "resize", corner: c })}
          />
        ))}
      </div>
    </div>
  );
}

/** A tiny sketch of the page: text lines with the image box where it will sit. */
function LayoutSketch({ placement, size, frame, portrait }: { placement: Placement; size: Size; frame: boolean; portrait: boolean }) {
  return (
    <div className="imgdlg-sketch" aria-hidden>
      <div
        className={`imgdlg-sketch-img ${placement}${frame ? " framed" : ""}`}
        style={{ width: `${size}%`, aspectRatio: portrait ? "3 / 4" : "4 / 3" }}
      />
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="imgdlg-sketch-line" />
      ))}
    </div>
  );
}

export default function ImageInsertDialog({
  file,
  remaining,
  onInsert,
  onCancel,
}: {
  file: File;
  /** How many more images wait after this one (pasted/dropped together). */
  remaining: number;
  onInsert: (markup: string) => void;
  onCancel: () => void;
}) {
  const isGif = file.type === "image/gif";
  const [original, setOriginal] = useState<HTMLImageElement | null>(null);
  // The rotated picture for the crop box (made in an effect, since it needs a blob URL).
  const [turnedView, setTurnedView] = useState<{ turns: number; src: string; w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [turns, setTurns] = useState(0);
  const [ratio, setRatio] = useState<Ratio>("original");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [crop, setCrop] = useState<Crop>(FULL_CROP);

  const [alt, setAlt] = useState(() => altFromFileName(file.name));
  const [caption, setCaption] = useState("");
  const [placement, setPlacement] = useState<Placement>("right");
  const [size, setSize] = useState<Size>(33);
  const [frame, setFrame] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the file once.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    let alive = true;
    loadImage(url)
      .then((img) => {
        if (!alive) return;
        setOriginal(img);
        setOrientation(img.naturalHeight > img.naturalWidth ? "portrait" : "landscape");
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const turned = turns % 4 !== 0;
  useEffect(() => {
    if (!original || !turned) return;
    const canvas = rotated(original, turns);
    let url: string | null = null;
    let alive = true;
    canvas.toBlob((b) => {
      if (!alive || !b) return;
      url = URL.createObjectURL(b);
      setTurnedView({ turns, src: url, w: canvas.width, h: canvas.height });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [original, turns, turned]);

  // The picture shown in the crop box: the original, or the turned copy once it's ready.
  const display = !original
    ? null
    : !turned
      ? { src: original.src, w: original.naturalWidth, h: original.naturalHeight }
      : turnedView?.turns === turns
        ? turnedView
        : null;

  const aspect = ratioValue(ratio, orientation);

  function applyRatio(r: Ratio, o: Orientation) {
    setRatio(r);
    setOrientation(o);
    if (!display) return;
    if (r === "original") setCrop(FULL_CROP);
    else if (r !== "free") setCrop(centeredCrop(ratioValue(r, o), display.w, display.h));
  }

  function rotate() {
    setTurns((t) => t + 1);
    setRatio("original");
    setCrop(FULL_CROP);
    if (display) setOrientation(display.w > display.h ? "portrait" : "landscape");
  }

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  async function insert() {
    if (!original) return;
    setBusy(true);
    setError(null);
    try {
      const upload = isGif ? file : await editedFile(file, original, turns, crop);
      const result = await uploadImage(upload);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onInsert(buildFigure({ src: result.url, alt: alt.trim() || "bilde", caption, placement, size, frame }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setBusy(false);
    }
  }

  // Shape of the result, for the layout sketch.
  const portrait = display ? crop.h * display.h > crop.w * display.w : orientation === "portrait";

  return (
    <div className="imgdlg-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="imgdlg" role="dialog" aria-modal="true" aria-labelledby="imgdlg-title">
        <div className="imgdlg-head">
          <h3 id="imgdlg-title">Sett inn bilde</h3>
          {remaining > 0 && <span className="auth-small">{remaining} til etter dette</span>}
        </div>

        <div className="imgdlg-body">
          <div className="imgdlg-left">
            {loadError ? (
              <p className="auth-error">{loadError}</p>
            ) : display ? (
              <CropBox
                src={display.src}
                width={display.w}
                height={display.h}
                crop={crop}
                aspect={aspect}
                onChange={(c) => {
                  setCrop(c);
                  if (ratio === "original") setRatio("free");
                }}
              />
            ) : (
              <p className="auth-small">Laster bildet …</p>
            )}

            {isGif ? (
              <p className="auth-small">GIF-er kan ikke beskjæres eller roteres (da forsvinner animasjonen).</p>
            ) : (
              <>
                <div className="imgdlg-row">
                  <span className="imgdlg-label">Beskjær</span>
                  <div className="imgdlg-seg">
                    {RATIOS.map(([r, label]) => (
                      <button
                        key={r}
                        type="button"
                        className={ratio === r ? "active" : ""}
                        onClick={() => applyRatio(r, orientation)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="imgdlg-row">
                  <span className="imgdlg-label">Retning</span>
                  <div className="imgdlg-seg">
                    {(
                      [
                        ["landscape", "▭ Liggende"],
                        ["portrait", "▯ Stående"],
                      ] as Array<[Orientation, string]>
                    ).map(([o, label]) => (
                      <button
                        key={o}
                        type="button"
                        className={orientation === o ? "active" : ""}
                        onClick={() => applyRatio(ratio === "original" || ratio === "free" ? "4:3" : ratio, o)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="imgdlg-plain" onClick={rotate} title="Roter 90° med klokka">
                    ↻ Roter
                  </button>
                </div>
                <p className="auth-small imgdlg-hint">Dra i rammen for å flytte utsnittet, og i hjørnene for å endre størrelsen.</p>
              </>
            )}
          </div>

          <div className="imgdlg-right">
            <div className="imgdlg-row">
              <span className="imgdlg-label">Plassering</span>
              <div className="imgdlg-seg">
                {PLACEMENTS.map(([p, label]) => (
                  <button key={p} type="button" className={placement === p ? "active" : ""} onClick={() => setPlacement(p)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="imgdlg-row">
              <span className="imgdlg-label">Størrelse</span>
              <div className="imgdlg-seg">
                {SIZES.map((s) => (
                  <button key={s} type="button" className={size === s ? "active" : ""} onClick={() => setSize(s)}>
                    {s}%
                  </button>
                ))}
              </div>
            </div>
            <label className="imgdlg-check">
              <input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} />
              Ramme rundt (grå boks, som bildene på Zimma-siden)
            </label>

            <LayoutSketch placement={placement} size={size} frame={frame} portrait={portrait} />

            <label className="imgdlg-field">
              Bildetekst <span className="auth-small">(valgfri, vises under bildet)</span>
              <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} />
            </label>
            <label className="imgdlg-field">
              Beskrivelse <span className="auth-small">(for skjermlesere og om bildet ikke lastes)</span>
              <input type="text" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200} />
            </label>
            <p className="auth-small">
              {placement === "center"
                ? "Bildet står alene på egen linje."
                : "Teksten flyter rundt bildet. Sett markøren foran avsnittet bildet skal stå ved siden av."}
            </p>
          </div>
        </div>

        {error && <p className="auth-error">{error}</p>}
        <div className="imgdlg-actions">
          <button type="button" className="auth-button secondary" onClick={onCancel} disabled={busy}>
            {remaining > 0 ? "Hopp over" : "Avbryt"}
          </button>
          <button type="button" className="auth-button" onClick={insert} disabled={busy || !original}>
            {busy ? "Laster opp …" : "Sett inn"}
          </button>
        </div>
      </div>
    </div>
  );
}
