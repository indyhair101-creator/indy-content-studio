import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { saveContentDraft } from "../features/content/content-commands";
import { contentToDraft, getAllowedPlatforms, validateContentDraft } from "../features/content/content-draft";
import { buildCalendarMonth } from "../features/calendar/calendar-selectors";
import { movePlatformSchedule } from "../features/calendar/calendar-commands";
import { selectActionPlanEntries } from "../features/action-plan/action-plan-selectors";
import { getPublicationEligibility } from "../features/publication/publication-eligibility";
import { createPublicationAttempt } from "../features/publication/publication-commands";
import { buildMakePublicationPayload } from "../features/publication/server/make-publication-handler";
import { CreateContentModal } from "../features/dashboard/components/CreateContentModal";
import { exportDashboardState, validateDashboardBackup } from "../features/backup/export-dashboard";

describe("Salon planning channel", () => {
  it("creates Salon schedules for image formats and preserves them in calendar, Action Plan and backup", () => {
    const state = createEmptyDashboardState();
    const format = state.formats.find(format => format.id === "format-image")!;
    expect(getAllowedPlatforms(format)).toContain("salon");
    const content = saveContentDraft(null, { title: "Salon poster", categoryId: state.categories[0].id, formatId: format.id, owner: "ทีม", objective: "branding", priority: "normal", plannedWorkAt: "2026-10-12", readyDate: "", productionStatus: "waiting-shoot", assetIds: [], caption: "", referenceIds: [], notes: "", localApproval: "pending", processSteps: [{ id: "step", name: "เตรียมโปสเตอร์", scheduledDate: "2026-10-12", status: "todo", order: 0 }], schedules: [{ platform: "salon", enabled: true, publishAt: "2026-10-12T09:00:00+07:00", latestAttemptId: null, manualEvidence: null }] }, "now");
    expect(validateContentDraft(contentToDraft(content), "now", format).valid).toBe(true);
    state.contents = [content];
    const day = buildCalendarMonth(state, { month: "2026-10", platform: "salon" }).cells.find(cell=>cell.date === "2026-10-12")!;
    expect(day.events[0].channelTimes[0]).toMatchObject({ platform: "salon", time: "09:00" });
    expect(selectActionPlanEntries(state)[0]).toMatchObject({ owner: "ทีม", publicationSchedules: [{ platform: "salon", publishAt: "2026-10-12T09:00:00+07:00" }] });
    const moved = movePlatformSchedule(state, content.id, "salon", "2026-10-14", "later");
    expect(buildCalendarMonth(moved, { month: "2026-10", platform: "salon" }).cells.find(cell=>cell.date === "2026-10-14")?.events).toHaveLength(1);
    expect(validateDashboardBackup(exportDashboardState(moved, "now")).data.contents[0].schedules[0].platform).toBe("salon");
    expect(getPublicationEligibility(state, content.id, "salon", "now").eligible).toBe(false);
    expect(() => createPublicationAttempt(state, { contentId: content.id, platform: "salon", publishAt: "2026-10-12T09:00:00+07:00" }, "now")).toThrow("Salon");
    expect(() => buildMakePublicationPayload({ state, content, platform: "salon", schedule: content.schedules[0], attemptId: "attempt", callbackUrl: "https://example.com/callback" })).toThrow("Salon");
  });

  it("offers Salon in the creation dialog even when the saved format only allows Facebook", () => {
    const create = vi.fn();
    render(<CreateContentModal open onClose={() => undefined} onCreate={create} categories={["โปสเตอร์"]} formats={["ภาพ"]} ownerOptions={["ทีม"]} initialDate="2026-10-12" allowedPlatformsByFormat={{ ภาพ: ["facebook"] }} />);
    expect(screen.getByLabelText("เปิด Salon")).toBeEnabled();
    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "Salon" } });
    fireEvent.change(screen.getByLabelText("ผู้รับผิดชอบ"), { target: { value: "ทีม" } });
    fireEvent.click(screen.getByLabelText("เปิด Salon"));
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ platformSchedules: expect.objectContaining({ salon: { enabled: true, date: "2026-10-12", time: "09:00" } }) }));
  });
});
