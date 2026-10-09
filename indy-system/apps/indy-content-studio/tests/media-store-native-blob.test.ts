// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { IndexedDbMediaBlobStore } from "../features/media/indexeddb-media-blob-store";

describe("native Blob storage", () => {
  it("persists a file without materializing all of its bytes in memory", async () => {
    const file = new Blob(["video"], { type: "video/mp4" });
    const read = vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("whole-file buffering is forbidden"));
    const store = new IndexedDbMediaBlobStore({ databaseName: "indy-native-media-test" });
    await store.put("large-video", file);
    const result = await store.get("large-video");
    expect(await result?.text()).toBe("video");
    expect(result?.type).toBe("video/mp4");
    expect(read).not.toHaveBeenCalled();
  });
});
