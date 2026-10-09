import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { ContentEditorDialog } from "../features/content/components/ContentEditorDialog";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { saveContentDraft } from "../features/content/content-commands";

async function fixture() {
  const state = createEmptyDashboardState();
  const item = saveContentDraft(null, { title: "ชื่อเดิม", categoryId: "category-review", formatId: "format-video",
    owner: "ทีม", objective: "branding", priority: "normal", plannedWorkAt: "", readyDate: "",
    productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", referenceIds: [],
    notes: "", localApproval: "pending", schedules: [
      { platform: "facebook", enabled: true, publishAt: "2026-10-08T09:30", latestAttemptId: null, manualEvidence: null },
    ] }, "2026-10-05T01:00:00Z");
  state.contents.push(item);
  const repo = new MemoryDashboardRepository(state);
  render(<DashboardDataProvider repository={repo}><ContentEditorDialog mode="edit" contentId={item.id} open onClose={() => undefined} /></DashboardDataProvider>);
  await screen.findByLabelText("ชื่อคอนเทนต์");
  return { repo, item };
}

describe("editing while MCP updates the dashboard", () => {
  it("preserves an MCP schedule change when the open editor saves an unrelated title edit", async () => {
    const { repo } = await fixture();
    fireEvent.change(screen.getByLabelText("ชื่อคอนเทนต์"), { target: { value: "ชื่อจากผู้ใช้" } });
    await act(async () => {
      const state = await repo.read(); state.contents[0].schedules[0].publishAt = "2026-11-10T18:00";
      state.contents[0].schedules.push({ platform: "instagram", enabled: true, publishAt: "2026-11-10T19:00",
        latestAttemptId: null, manualEvidence: null });
      state.contents[0].updatedAt = "2026-10-05T02:00:00Z"; await repo.write(state);
    });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกคอนเทนต์" }));
    await waitFor(async () => expect((await repo.read()).contents[0].title).toBe("ชื่อจากผู้ใช้"));
    expect((await repo.read()).contents[0].schedules[0].publishAt).toBe("2026-11-10T18:00");
    expect((await repo.read()).contents[0].schedules.find((s) => s.platform === "instagram")?.publishAt).toBe("2026-11-10T19:00");
  });

  it("reports a conflict and keeps the draft when both editor and MCP change the same field", async () => {
    const { repo } = await fixture();
    fireEvent.change(screen.getByLabelText("ชื่อคอนเทนต์"), { target: { value: "ชื่อจากผู้ใช้" } });
    await act(async () => {
      const state = await repo.read(); state.contents[0].title = "ชื่อจาก MCP"; await repo.write(state);
    });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกคอนเทนต์" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("แก้ไข");
    expect((await repo.read()).contents[0].title).toBe("ชื่อจาก MCP");
    expect(screen.getByLabelText("ชื่อคอนเทนต์")).toHaveValue("ชื่อจากผู้ใช้");
  });
});
