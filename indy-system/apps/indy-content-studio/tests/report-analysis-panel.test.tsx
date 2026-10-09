import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportAnalysisPanel } from "../features/reports/components/ReportAnalysisPanel";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { defaultReportFilters } from "../features/reports/report-dates";
import type { ContentItem } from "../features/domain/types";
afterEach(() => vi.unstubAllGlobals());
describe("explicit AI report actions", () => {
  it("does not generate on load; analyzes only on click and creates a reset draft only on the save button", async () => {
    const state = createEmptyDashboardState();
    const content: ContentItem = { id: "one", title: "ต้นฉบับ", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "published", assetIds: [], processSteps: [], caption: "เดิม", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "approved", lineReview: { status: "approved", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z", deletedAt: null };
    state.contents = [content];
    const repository = new MemoryDashboardRepository(state);
    const fetcher = vi.fn(async () => Response.json({ model: "test", generatedAt: "2026-10-09T00:00:00Z", warnings: ["ตัวอย่างน้อย"], evidence: [{ id: "observation:one", contentId: "one", entityId: "one", label: "หลักฐานต้นฉบับ", data: { views: 10 } }], analysis: { facts: [{ text: "มี 10 views", evidenceIds: ["observation:one"] }], hypotheses: [], experiments: [], assignments: [], limitations: [], suggestions: [{ id: "s1", sourceContentId: "one", title: "ร่างตอนต่อไป", hook: "เปิดเรื่อง", script: "สคริปต์", caption: "แคปชัน", notes: "ทดลอง", evidenceIds: ["observation:one"] }] } }));
    vi.stubGlobal("fetch", fetcher);
    render(<DashboardDataProvider repository={repository}><ReportAnalysisPanel kind="content" filters={defaultReportFilters()} /></DashboardDataProvider>);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "วิเคราะห์ด้วย AI" }));
    expect(await screen.findByText("มี 10 views")).toBeVisible();
    expect((await repository.read()).contents).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อเสนอเป็นงานร่าง" }));
    await waitFor(async () => expect((await repository.read()).contents).toHaveLength(2));
    expect((await repository.read()).contents[1]).toMatchObject({ title: "ร่างตอนต่อไป", caption: "แคปชัน", productionStatus: "waiting-shoot", localApproval: "pending" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("บันทึกเป็นงานร่างแล้ว");
  });
  it("shows configuration failure without inventing an AI result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "report_ai_not_configured" }, { status: 503 })));
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><ReportAnalysisPanel kind="team" filters={defaultReportFilters()} /></DashboardDataProvider>);
    fireEvent.click(screen.getByRole("button", { name: "วิเคราะห์ด้วย AI" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ยังไม่ได้ตั้งค่า");
    expect(screen.queryByRole("heading", { name: "ข้อเท็จจริงจากข้อมูล" })).not.toBeInTheDocument();
  });
});
