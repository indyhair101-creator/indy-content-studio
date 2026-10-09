import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardDataProvider, useDashboardData, type DashboardDataValue } from "../features/data/DashboardDataProvider";
import { upsertContent } from "../features/data/dashboard-commands";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import type { ContentItem } from "../features/domain/types";
import { ContentEditorDialog } from "../features/content/components/ContentEditorDialog";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const contentFixture = (id: string): ContentItem => ({
  id,
  title: `งาน ${id}`,
  categoryId: "category-knowledge",
  formatId: "format-video",
  owner: "ทีมคอนเทนต์",
  objective: "awareness",
  priority: "normal",
  plannedWorkAt: null,
  lastWorkedAt: null,
  readyDate: null,
  productionStatus: "waiting-shoot",
  assetIds: [],
  processSteps: [],
  caption: "",
  captionSource: null,
  schedules: [],
  referenceIds: [],
  notes: "",
  localApproval: "pending",
  lineReview: {
    status: "not-sent",
    activeCycleId: null,
    reviewCode: null,
    providerReceipts: [],
    lastEventAt: null,
    history: [],
  },
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
  deletedAt: null,
});

function Probe() {
  const { error, mutate, reload, state, status } = useDashboardData();

  if (status === "loading") return <p>กำลังโหลดข้อมูล</p>;
  if (status === "error") {
    return <><p role="alert">โหลดข้อมูลไม่สำเร็จ</p><button onClick={() => void reload()}>ลองใหม่</button></>;
  }

  return (
    <>
      <p>พร้อมใช้งาน</p>
      <p>{state?.contents.map((item) => item.id).join(",")}</p>
      {error && <p role="alert">{error.message}</p>}
      <button onClick={() => void mutate((current) => upsertContent(current, contentFixture("one")))}>เพิ่มชิ้นงาน</button>
      <button onClick={() => {
        void mutate((current) => upsertContent(current, contentFixture("two")));
        void mutate((current) => upsertContent(current, contentFixture("three")));
      }}>เพิ่มสองชิ้นงาน</button>
    </>
  );
}

describe("DashboardDataProvider", () => {
  it("serializes refresh with writes and coalesces overlapping refresh requests", async () => {
    const repository = new MemoryDashboardRepository();
    const originalWrite = repository.write.bind(repository);
    let releaseWrite!: () => void;
    const gate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    repository.write = async (state) => { await gate; await originalWrite(state); };
    const read = vi.spyOn(repository, "read");
    let data!: DashboardDataValue;
    function Capture() { data = useDashboardData(); return null; }
    render(<DashboardDataProvider repository={repository}><Capture /></DashboardDataProvider>);
    await waitFor(() => expect(data.status).toBe("ready"));

    let write!: Promise<void>;
    let firstRefresh!: Promise<void>;
    let secondRefresh!: Promise<void>;
    await act(async () => {
      write = data.mutate((state) => upsertContent(state, contentFixture("saved")));
      firstRefresh = data.reload();
      secondRefresh = data.reload();
      await Promise.resolve();
    });
    expect(firstRefresh).toBe(secondRefresh);
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { releaseWrite(); await Promise.all([write, firstRefresh, secondRefresh]); });
    // One authoritative read after save, then the coalesced requested refresh.
    expect(read).toHaveBeenCalledTimes(3);
    expect(data.state?.contents.map((content) => content.id)).toEqual(["saved"]);
  });

  it("keeps unsaved editor input and ready status across successful and failed background refreshes", async () => {
    const content = contentFixture("editor");
    const repository = new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [content] });
    let data!: DashboardDataValue;
    function Capture() { data = useDashboardData(); return null; }
    render(<DashboardDataProvider repository={repository}><Capture /><ContentEditorDialog mode="edit" contentId={content.id} open onClose={() => undefined} /></DashboardDataProvider>);
    const title = await screen.findByLabelText("ชื่อคอนเทนต์");
    fireEvent.change(title, { target: { value: "ยังไม่ได้บันทึก" } });
    await act(async () => { await data.reload(); });
    expect(title).toHaveValue("ยังไม่ได้บันทึก");
    expect(data.status).toBe("ready");
    repository.read = async () => { throw new Error("offline"); };
    await act(async () => { await expect(data.reload()).rejects.toThrow("offline"); });
    expect(data.status).toBe("ready");
    expect(title).toHaveValue("ยังไม่ได้บันทึก");
  });

  it("refreshes every 15 seconds only while visible and on focus", async () => {
    vi.useFakeTimers();
    const repository = new MemoryDashboardRepository();
    const read = vi.spyOn(repository, "read");
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const view = render(<DashboardDataProvider repository={repository}><span>workspace</span></DashboardDataProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(read).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("hidden");
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(read).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("visible");
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(read).toHaveBeenCalledTimes(3);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("loads, persists a mutation, and serializes rapid mutations", async () => {
    const repository = new MemoryDashboardRepository();
    render(<DashboardDataProvider repository={repository}><Probe /></DashboardDataProvider>);

    expect(await screen.findByText("พร้อมใช้งาน")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มชิ้นงาน" }));
    expect(await screen.findByText("one")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มสองชิ้นงาน" }));

    await waitFor(async () => {
      expect((await repository.read()).contents.map((item) => item.id)).toEqual(["one", "two", "three"]);
    });
  });

  it("exposes a retryable error when the repository cannot load", async () => {
    const repository = new MemoryDashboardRepository();
    repository.read = async () => { throw new Error("โหลดไม่ได้"); };

    render(<DashboardDataProvider repository={repository}><Probe /></DashboardDataProvider>);

    expect(await screen.findByRole("alert")).toHaveTextContent("โหลดข้อมูลไม่สำเร็จ");
  });
});
