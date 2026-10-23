"use client";

import { useRef } from "react";
import { parseGltfBuffer } from "@/lib/gltfJoints";
import { saveModel } from "@/lib/db";
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
      await saveModel(file, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex cursor-pointer items-center justify-center border border-hairline px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:border-accent hover:text-accent">
        {fileName ? "Replace model" : "Upload rigged model (.glb / .gltf)"}
        <input
          ref={inputRef}
          type="file"
          accept=".glb,.gltf"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>
      {isLoading && (
        <p className="font-mono text-xs uppercase tracking-widest text-foreground/50">
          Parsing model…
        </p>
      )}
      {error && (
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{error}</p>
      )}
      {fileName && !error && (
        <p className="truncate font-mono text-xs uppercase tracking-widest text-foreground/50">
          {fileName}
        </p>
      )}
    </div>
  );
}
