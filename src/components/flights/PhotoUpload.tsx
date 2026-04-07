// CAVOK — flight photo upload (client component).
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
import { Button } from "@/components/ui/Button";

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

  return (
    <div className="space-y-3">
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic"
          multiple
          disabled={uploading || photos.length >= MAX_PHOTOS}
          onChange={(e) => handleFiles(e.target.files)}
          className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-50"
        />
      </div>

      {uploading && <p className="text-sm text-zinc-500">Upload en cours…</p>}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {photos.length > 0 && (
        <ul className="space-y-1 text-sm">
          {photos.map((p) => (
            <li
              key={p.key}
              className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2"
            >
              <span className="truncate text-zinc-700">
                {p.name}{" "}
                <span className="text-xs text-zinc-500">
                  ({(p.size / 1024).toFixed(0)} Ko)
                </span>
              </span>
              <button
                type="button"
                onClick={() => removePhoto(p.key)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-zinc-500">
        {photos.length} / {MAX_PHOTOS} photo{photos.length > 1 ? "s" : ""}.
        JPEG, PNG ou HEIC. Max 10 Mo par fichier.
      </p>

      {/* Hidden field — server reads `photoKeys` */}
      {photos.map((p) => (
        <input key={p.key} type="hidden" name={name} value={p.key} />
      ))}
    </div>
  );
}
