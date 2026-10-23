"use client";

import { useRef } from "react";
import { parseGltfBuffer } from "@/lib/gltfJoints";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

export default function ModelUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isLoading, error, fileName, setLoading, setModel, setError } =
    useAtmosphereStore();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading();
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseGltfBuffer(buffer);
      setModel(parsed.scene, parsed.joints, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex cursor-pointer items-center justify-center border border-black/90 px-4 py-2 text-sm font-medium hover:bg-black/5">
        {fileName ? "Replace model" : "Upload rigged model (.glb/.gltf)"}
        <input
          ref={inputRef}
          type="file"
          accept=".glb,.gltf"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>
      {isLoading && <p className="text-sm text-black/60">Parsing model…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {fileName && !error && (
        <p className="text-sm text-black/60">Loaded: {fileName}</p>
      )}
    </div>
  );
}
