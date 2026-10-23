import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "atmosphere";
const DB_VERSION = 1;
const MODEL_STORE = "model";
const MODEL_KEY = "current";

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
