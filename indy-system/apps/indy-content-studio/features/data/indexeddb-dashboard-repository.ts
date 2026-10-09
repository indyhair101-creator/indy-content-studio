import { createEmptyDashboardState } from "../domain/create-empty-state";
import type { DashboardState } from "../domain/types";
import {
  cloneDashboardState,
  type DashboardListener,
  type DashboardRepository,
} from "./dashboard-repository";

const STORE_NAME = "dashboard";
const SNAPSHOT_KEY = "current";
const DATABASE_VERSION = 2;
const MEDIA_BLOB_STORE_NAME = "media-blobs";

interface IndexedDbOptions {
  databaseName?: string;
}

function unavailableError(): Error {
  return new Error("IndexedDB is unavailable in this environment");
}

export class IndexedDbDashboardRepository implements DashboardRepository {
  private readonly databaseName: string;
  private readonly listeners = new Set<DashboardListener>();

  constructor({ databaseName = "indy-content-studio" }: IndexedDbOptions = {}) {
    this.databaseName = databaseName;
  }

  async read(): Promise<DashboardState> {
    const database = await this.open();
    try {
      const stored = await this.readSnapshot(database);
      if (stored) return cloneDashboardState(stored);

      const initial = createEmptyDashboardState();
      await this.writeSnapshot(database, initial);
      return cloneDashboardState(initial);
    } finally {
      database.close();
    }
  }

  async write(next: DashboardState): Promise<void> {
    const database = await this.open();
    const snapshot = cloneDashboardState(next);

    try {
      await this.writeSnapshot(database, snapshot);
    } finally {
      database.close();
    }

    const publishedSnapshot = cloneDashboardState(snapshot);
    this.listeners.forEach((listener) => listener(publishedSnapshot));
  }

  subscribe(listener: DashboardListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") return Promise.reject(unavailableError());

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
        if (!request.result.objectStoreNames.contains(MEDIA_BLOB_STORE_NAME)) {
          request.result.createObjectStore(MEDIA_BLOB_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("เปิดฐานข้อมูลไม่สำเร็จ"));
      request.onblocked = () => reject(new Error("ฐานข้อมูลถูกเปิดค้างโดยแท็บอื่น"));
    });
  }

  private readSnapshot(database: IDBDatabase): Promise<DashboardState | undefined> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      request.onsuccess = () => resolve(request.result as DashboardState | undefined);
      request.onerror = () => reject(request.error ?? new Error("อ่านข้อมูลไม่สำเร็จ"));
      transaction.onerror = () => reject(transaction.error ?? new Error("อ่านข้อมูลไม่สำเร็จ"));
    });
  }

  private writeSnapshot(database: IDBDatabase, snapshot: DashboardState): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(cloneDashboardState(snapshot), SNAPSHOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("บันทึกข้อมูลไม่สำเร็จ"));
      transaction.onabort = () => reject(transaction.error ?? new Error("บันทึกข้อมูลถูกยกเลิก"));
    });
  }
}
