import type { MediaBlobStore } from "./media-blob-store";

const BLOB_STORE = "media-blobs";
const DASHBOARD_STORE = "dashboard";
const DB_VERSION = 2;
type StoredBlob = { blob: Blob } | { bytes: ArrayBuffer; type: string };

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("อ่านไฟล์สื่อไม่สำเร็จ"));
    reader.readAsArrayBuffer(blob);
  });
}

export class IndexedDbMediaBlobStore implements MediaBlobStore {
  private readonly databaseName: string;
  constructor({ databaseName = "indy-content-studio" }: { databaseName?: string } = {}) { this.databaseName = databaseName; }

  async put(id: string, file: Blob): Promise<void> {
    const database = await this.open();
    try {
      // Modern browsers structured-clone Blob references without buffering the entire video.
      // Keep the byte representation for older Blob implementations and existing records.
      const stored: StoredBlob = typeof file.arrayBuffer === "function"
        ? { blob: file } : { bytes: await readBlob(file), type: file.type };
      await this.run(database, "readwrite", (store) => store.put(stored, id));
    } finally {
      database.close();
    }
  }

  async get(id: string): Promise<Blob | null> {
    const database = await this.open();
    const result = await new Promise<Blob | undefined>((resolve, reject) => {
      const request = database.transaction(BLOB_STORE, "readonly").objectStore(BLOB_STORE).get(id);
      request.onsuccess = () => {
        const stored = request.result as StoredBlob | undefined;
        if (!stored) { resolve(undefined); return; }
        if ("blob" in stored) { resolve(stored.blob); return; }
        const blob = new Blob([stored.bytes], { type: stored.type }) as Blob & { text?: () => Promise<string> };
        if (!blob.text) blob.text = async () => new TextDecoder().decode(stored.bytes);
        resolve(blob);
      };
      request.onerror = () => reject(request.error ?? new Error("อ่านไฟล์สื่อไม่สำเร็จ"));
    });
    database.close();
    return result ?? null;
  }

  async remove(id: string): Promise<void> {
    const database = await this.open();
    await this.run(database, "readwrite", (store) => store.delete(id));
    database.close();
  }

  private run(database: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(BLOB_STORE, mode);
      action(transaction.objectStore(BLOB_STORE));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("บันทึกไฟล์สื่อไม่สำเร็จ"));
      transaction.onabort = () => reject(transaction.error ?? new Error("บันทึกไฟล์สื่อถูกยกเลิก"));
    });
  }

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB ไม่พร้อมใช้งาน"));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DASHBOARD_STORE)) request.result.createObjectStore(DASHBOARD_STORE);
        if (!request.result.objectStoreNames.contains(BLOB_STORE)) request.result.createObjectStore(BLOB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("เปิดฐานข้อมูลสื่อไม่สำเร็จ"));
      request.onblocked = () => reject(new Error("ฐานข้อมูลสื่อถูกเปิดค้างโดยแท็บอื่น"));
    });
  }
}
