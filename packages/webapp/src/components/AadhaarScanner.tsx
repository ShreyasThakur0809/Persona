"use client";

import { useRef, useState } from "react";
import { parseAadhaarQR, type AadhaarData } from "@/lib/parsers/aadhaar";

interface Props {
  onParsed: (data: AadhaarData) => void;
}

export function AadhaarScanner({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("scanning");
    setMessage("Reading QR code…");

    try {
      // Load image into canvas, extract pixel data, feed to jsQR
      const jsQR = (await import("jsqr")).default;
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const code = jsQR(data, width, height);
      if (!code) {
        setStatus("error");
        setMessage("No QR code found in image. Try a clearer photo.");
        return;
      }

      setMessage("Parsing Aadhaar data…");
      const parsed = await parseAadhaarQR(code.data);

      if (!parsed) {
        setStatus("error");
        setMessage("Could not extract date of birth from this QR code.");
        return;
      }

      setStatus("ok");
      setMessage(
        `Detected: ${parsed.birthDay.padStart(2, "0")}/${parsed.birthMonth.padStart(2, "0")}/${parsed.birthYear}`
      );
      onParsed(parsed);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Scan failed");
    } finally {
      // Reset file input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Upload a photo or screenshot of your Aadhaar card QR code. Your data is
        processed entirely in the browser — nothing is uploaded.
      </p>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-800/50 px-4 py-8 transition hover:border-violet-600 hover:bg-violet-950/10">
        <svg className="mb-2 h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
        </svg>
        <span className="text-sm text-zinc-400">Upload Aadhaar QR image</span>
        <span className="mt-1 text-xs text-zinc-600">PNG, JPG, or PDF screenshot</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </label>

      {status !== "idle" && (
        <div
          className={`rounded-lg px-3 py-2 text-sm flex items-center gap-2 ${
            status === "ok"
              ? "bg-green-950/40 border border-green-800 text-green-400"
              : status === "error"
              ? "bg-red-950/30 border border-red-800 text-red-400"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {status === "scanning" && (
            <svg className="h-3.5 w-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          )}
          {status === "ok" && <span className="shrink-0">✓</span>}
          {status === "error" && <span className="shrink-0">✗</span>}
          {message}
        </div>
      )}
    </div>
  );
}
