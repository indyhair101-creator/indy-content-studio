import { describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { createUploadedMedia } from "../features/media/media-commands";
import { addReference, saveReferenceAlbum } from "../features/references/reference-commands";
import { prepareReferenceFile, validateReferenceFiles } from "../features/references/reference-upload";
import { exportDashboardState, validateDashboardBackup } from "../features/backup/export-dashboard";
import { applyDashboardImport } from "../features/backup/import-dashboard";

describe("Reference storage", () => {
  it("round trips albums and media attachments, including merging into older snapshots", () => {
    let state = saveReferenceAlbum(createEmptyDashboardState(), "album-1", "Poster", "now");
    state = createUploadedMedia(state, { id: "asset-1", name: "poster.png", mimeType: "image/png", size: 12, now: "now" });
    state = addReference(state, { id: "ref-1", title: "Poster", url: "", albumId: "album-1", assetIds: ["asset-1"], now: "now" });
    const backup = exportDashboardState(state, "now");
    expect(validateDashboardBackup(backup).data.references[0].assetIds).toEqual(["asset-1"]);
    const imported = applyDashboardImport(createEmptyDashboardState(), backup, { mode: "merge" });
    expect(imported.referenceAlbums).toEqual(state.referenceAlbums);
    expect(imported.references).toEqual(state.references);
    expect(validateDashboardBackup(exportDashboardState(imported, "now")).data.media).toHaveLength(1);
    backup.data.references[0].assetIds = ["missing"];
    expect(() => validateDashboardBackup(backup)).toThrow("อ้างอิงสื่อที่ไม่มี");
  });

  it("allows several link-free ideas and rejects duplicate album names or missing albums", () => {
    let state = addReference(createEmptyDashboardState(), { id: "ref-1", title: "หนึ่ง", url: "", now: "now" });
    state = addReference(state, { id: "ref-2", title: "สอง", url: "", now: "now" });
    expect(state.references).toHaveLength(2);
    state = saveReferenceAlbum(state, "album-1", "Poster", "now");
    expect(() => saveReferenceAlbum(state, "album-2", " poster ", "now")).toThrow("มีอยู่แล้ว");
    expect(() => addReference(state, { id: "ref-3", title: "สาม", url: "", albumId: "missing", now: "now" })).toThrow("ไม่พบอัลบั้ม");
  });

  it("keeps binary bytes outside dashboard metadata and records cloud readiness", async () => {
    const file = new File(["image"], "poster.png", { type: "image/png" });
    const blobStore = { put: vi.fn(async () => undefined), get: vi.fn(async () => null), remove: vi.fn(async () => undefined) };
    const uploader = vi.fn(async () => ({ remoteStatus: "ready" as const, providerFileId: "blob:original", previewProviderFileId: "blob:preview" }));
    const asset = await prepareReferenceFile(file, blobStore, uploader);
    expect(blobStore.put).toHaveBeenCalledWith(asset.id, file);
    expect(asset).toMatchObject({ remoteStatus: "ready", providerFileId: "blob:original", size: 5 });
    expect(JSON.stringify(asset)).not.toContain("data:image");
    expect(() => validateReferenceFiles([new File(["text"], "notes.txt", { type: "text/plain" })])).toThrow("เฉพาะภาพหรือวิดีโอ");
  });
});
