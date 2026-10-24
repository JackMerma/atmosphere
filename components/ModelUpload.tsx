"use client";

import { useRef } from "react";
import { parseModelPair } from "@/lib/gltfJoints";
import { saveModel, clearAnimations } from "@/lib/db";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { toast } from "@/store/useToasts";

export default function ModelUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isLoading, error, fileName, setLoading, setModel, setError, setAnimations } =
    useAtmosphereStore();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading();
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseModelPair(buffer, file.name);
      setModel(parsed.scene, parsed.finalScene, parsed.joints, file.name);
      await saveModel(file, file.name);
      // Saved animations are rotations for the previous model's bones.
      setAnimations([]);
      await clearAnimations();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read this file.";
      setError(message);
      toast.error(message);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="btn inline-flex items-center justify-center px-4 py-2 font-mono text-xs uppercase tracking-widest">
        {fileName ? "Replace model" : "Upload rigged model"}
        <input
          ref={inputRef}
          type="file"
          accept=".glb,.gltf,.fbx,.zip"
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
