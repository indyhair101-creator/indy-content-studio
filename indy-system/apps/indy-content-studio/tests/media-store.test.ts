import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbMediaBlobStore } from "../features/media/indexeddb-media-blob-store";

describe("IndexedDbMediaBlobStore", () => {
  it("round-trips blobs and removes them", async () => {
    const store = new IndexedDbMediaBlobStore({ databaseName: "indy-media-store-test" });
    await store.put("asset-1", new Blob(["video"], { type: "video/mp4" }));
    expect(await (await store.get("asset-1"))?.text()).toBe("video");
    await store.remove("asset-1");
    expect(await store.get("asset-1")).toBeNull();
  });
});
