export interface MediaBlobStore {
  put(id: string, file: Blob): Promise<void>;
  get(id: string): Promise<Blob | null>;
  remove(id: string): Promise<void>;
}
