"use client";

import { useRef, useState, type ReactNode } from "react";
import { WIKI_IMAGE_ACCEPT } from "@/lib/uploads";
import { uploadImage } from "./uploadImage";

// Upload controls for the editor's "Bilder" section (portrait and profile screenshots). Uploads go
// straight to the wiki-images bucket; the draft only gets the URL, which is saved with the page.

export function UploadButton({
  label,
  onUploaded,
  disabled,
}: {
  label: string;
  onUploaded: (url: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await uploadImage(file);
    setBusy(false);
    if (result.ok) onUploaded(result.url);
    else setError(result.message);
  }

  return (
    <>
      <button
        type="button"
        className="image-slot-button"
        onClick={() => input.current?.click()}
        disabled={busy || disabled}
      >
        {busy ? "Laster opp …" : label}
      </button>
      <input
        ref={input}
        type="file"
        accept={WIKI_IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = ""; // so picking the same file again still fires onChange
        }}
      />
      {error && (
        <span className="image-slot-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

/** One image with a thumbnail, "upload/replace" and (for uploads) "remove". */
export default function ImageSlot({
  label,
  src,
  uploaded,
  onUpload,
  onRemove,
  hint,
  children,
}: {
  label: string;
  src: string;
  uploaded: boolean;
  onUpload: (url: string) => void;
  onRemove: () => void;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  // Old files may not exist; remember which src failed so the thumbnail says so instead.
  const [broken, setBroken] = useState<string | null>(null);

  return (
    <div className="image-slot">
      <div className="image-slot-thumb">
        {broken === src ? (
          <span className="auth-small">Ingen bilde</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- editor thumbnail of an arbitrary upload
          <img src={src} alt={label} onError={() => setBroken(src)} />
        )}
      </div>
      <div className="image-slot-body">
        <strong>{label}</strong>
        <span className="auth-small">{uploaded ? "Opplastet bilde" : "Fra bildemappen på serveren"}</span>
        <div className="image-slot-actions">
          <UploadButton label={broken === src ? "Last opp" : "Bytt bilde"} onUploaded={onUpload} />
          {uploaded && (
            <button type="button" className="image-slot-button" onClick={onRemove}>
              Fjern opplastet
            </button>
          )}
          {children}
        </div>
        {hint && <div className="auth-small">{hint}</div>}
      </div>
    </div>
  );
}
