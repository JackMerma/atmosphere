import { openDB, type IDBPDatabase } from "idb";
import type { Animation } from "@/lib/animations";

const DB_NAME = "atmosphere";
const DB_VERSION = 2;
const MODEL_STORE = "model";
const MODEL_KEY = "current";
const ANIMATIONS_STORE = "animations";

interface StoredModel {
  fileBlob: Blob;
  fileName: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(MODEL_STORE)) {
          db.createObjectStore(MODEL_STORE);
        }
        if (!db.objectStoreNames.contains(ANIMATIONS_STORE)) {
          db.createObjectStore(ANIMATIONS_STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveModel(fileBlob: Blob, fileName: string): Promise<void> {
  const db = await getDB();
  await db.put(MODEL_STORE, { fileBlob, fileName } satisfies StoredModel, MODEL_KEY);
}

export async function loadModel(): Promise<StoredModel | undefined> {
  const db = await getDB();
  return db.get(MODEL_STORE, MODEL_KEY);
}

export async function saveAnimation(animation: Animation): Promise<void> {
  const db = await getDB();
  await db.put(ANIMATIONS_STORE, animation);
}

/** Newest first. */
export async function loadAnimations(): Promise<Animation[]> {
  const db = await getDB();
  const all: Animation[] = await db.getAll(ANIMATIONS_STORE);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function clearAnimations(): Promise<void> {
  const db = await getDB();
  await db.clear(ANIMATIONS_STORE);
}
