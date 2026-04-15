// FlightSchedule — flight photo upload (client component).
//
// Flow per architectural rule #6:
//   1. User selects up to 5 image files
//   2. For each file, POST /api/upload/presign → { key, url }
//   3. PUT the file directly to R2 using the signed URL (browser → R2)
//   4. Collect successful keys into a hidden input that the form submit
//      passes to the server action
//
// HEIC handling: we accept image/heic mime-type without conversion
// (per Phase 0 plan — defer heic2any until proven needed). On modern
// iPhones, the camera roll typically serves JPEG via the share sheet.

"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2, AlertCircle } from "lucide-react";

const MAX_PHOTOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/heic"];

type UploadedPhoto = {
  key: string;
  name: string;
  size: number;
};

export function PhotoUpload({ name }: { name: string }) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    if (photos.length + files.length > MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos par vol.`);
      return;
    }

    setUploading(true);
    try {
      const newPhotos: UploadedPhoto[] = [];
      for (const file of Array.from(files)) {
        if (!ALLOWED.includes(file.type)) {
          setError(`Type de fichier non supporté : ${file.type}`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(`Fichier trop volumineux (max 10 Mo) : ${file.name}`);
          continue;
        }

        // 1. Get presigned URL
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: file.type,
            contentLength: file.size,
          }),
        });
        if (!presignRes.ok) {
          const txt = await presignRes.text();
          throw new Error(`Signature refusée (${presignRes.status}): ${txt}`);
        }
        const { key, url } = (await presignRes.json()) as {
          key: string;
          url: string;
        };

        // 2. Upload directly to R2
        const putRes = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`Échec d'upload R2 (${putRes.status})`);
        }

        newPhotos.push({ key, name: file.name, size: file.size });
      }

      setPhotos((prev) => [...prev, ...newPhotos]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removePhoto(key: string) {
    setPhotos((prev) => prev.filter((p) => p.key !== key));
  }

  const slotsLeft = MAX_PHOTOS - photos.length;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <label
        className={`group relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface-soft px-6 py-6 text-center transition-colors hover:border-brand hover:bg-brand-soft/40 ${
          uploading || photos.length >= MAX_PHOTOS
            ? "pointer-events-none opacity-60"
            : ""
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic"
          multiple
          disabled={uploading || photos.length >= MAX_PHOTOS}
          onChange={(e) => handleFiles(e.target.files)}
          className="sr-only"
        />
        {uploading ? (
          <Loader2
            className="h-7 w-7 animate-spin text-brand"
            aria-hidden="true"
          />
        ) : (
          <Upload
            className="h-7 w-7 text-text-subtle transition-colors group-hover:text-brand"
            aria-hidden="true"
          />
        )}
        <p className="text-sm font-medium text-text">
          {uploading
            ? "Upload en cours…"
            : photos.length >= MAX_PHOTOS
              ? "Limite atteinte"
              : "Glissez vos photos ici ou cliquez pour parcourir"}
        </p>
        <p className="text-xs text-text-subtle">
          JPEG, PNG ou HEIC · Max 10 Mo par fichier · {slotsLeft} place
          {slotsLeft !== 1 ? "s" : ""} restante{slotsLeft !== 1 ? "s" : ""}
        </p>
      </label>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger-soft-border bg-danger-soft px-3 py-2 text-sm text-danger-soft-fg"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {photos.length > 0 && (
        <ul className="space-y-2">
          {photos.map((p) => (
            <li
              key={p.key}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-elevated px-3 py-2.5 text-sm shadow-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-text">{p.name}</p>
                <p className="text-xs tabular text-text-subtle">
                  {(p.size / 1024).toFixed(0)} Ko
                </p>
              </div>
              <button
                type="button"
                onClick={() => removePhoto(p.key)}
                aria-label={`Retirer ${p.name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs tabular text-text-subtle">
        {photos.length} / {MAX_PHOTOS}
      </p>

      {/* Hidden field — server reads `photoKeys` */}
      {photos.map((p) => (
        <input key={p.key} type="hidden" name={name} value={p.key} />
      ))}
    </div>
  );
}
