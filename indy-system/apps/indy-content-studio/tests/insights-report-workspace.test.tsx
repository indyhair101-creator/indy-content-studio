import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { InsightsReportWorkspace } from "../features/reports/components/InsightsReportWorkspace";
import type { ContentItem } from "../features/domain/types";
import { emptyReportingState } from "../features/reports/report-types";
const fixture = vi.hoisted(() => ({ state: null as ReturnType<typeof createEmptyDashboardState> | null }));
vi.mock("../features/data/DashboardDataProvider", () => ({ useDashboardData: () => ({ state: fixture.state, status: "ready", error: null }) }));
describe("insight report workspace", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-09T00:00:00Z"));
    fixture.state = createEmptyDashboardState();
    fixture.state.contents = [{ id: "c", title: "วิดีโอทดสอบ", formatId: "format-video", objective: "awareness", owner: "owner", categoryId: "category-knowledge", deletedAt: null } as ContentItem];
    fixture.state.reporting = { ...emptyReportingState(), publications: [{ id: "p", contentId: "c", platform: "youtube", accountId: "channel", providerPostId: "real", url: "javascript:alert(1)", title: "วิดีโอทดสอบ", publishedAt: "2026-10-01T00:00:00Z", mediaKind: "video", durationSeconds: 60, thumbnailUrl: null }], observations: [{ id: "o", publicationId: "p", source: "import", sourceLabel: "Test verified export", fetchedAt: "2026-10-09T00:00:00Z", scope: "lifetime", period: null, traffic: "unknown", metrics: { views: 0, averageWatchSeconds: 12, averageWatchPercent: 20, completionRate: 5 }, averageWatchWeight: null, retention: null }] };
  });
  afterEach(() => vi.useRealTimers());
  it("opens content, preserves unavailable metrics, rejects unsafe links, and provides video details", () => {
    const open = vi.fn(); render(<InsightsReportWorkspace onOpenContent={open} />);
    fireEvent.click(screen.getByRole("button", { name: "วิเคราะห์วิดีโอ" }));
    expect(screen.getByLabelText("ความยาวต่ำสุด (วินาที)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("วิดีโอทดสอบ · awareness · 1 ช่องทาง/โพสต์"));
    fireEvent.click(screen.getByRole("button", { name: "เปิดคอนเทนต์" }));
    expect(open).toHaveBeenCalledWith("c");
    fireEvent.click(screen.getByText("รายละเอียด / หลักฐาน YouTube"));
    expect(screen.queryByRole("link", { name: /เปิดโพสต์จริง/ })).toBeNull();
    expect(screen.getByText(/ยังไม่มีข้อมูล retention/)).toBeInTheDocument();
    expect(screen.getByText("สัดส่วนดูเฉลี่ย (%)", { selector: "dt" })).toBeInTheDocument();
    expect(screen.getAllByText("ไม่มีข้อมูล").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("แหล่งยอด"), { target: { value: "organic" } });
    expect(screen.queryByText(/Test verified export/)).toBeNull();
  });
  it("only exposes analysis/saved tabs with connected renderers and passes active video filters", () => {
    const actions = vi.fn(() => <span>actions</span>);
    const { rerender } = render(<InsightsReportWorkspace renderActions={actions} />);
    expect(screen.queryByRole("button", { name: "AI วิเคราะห์" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "วิเคราะห์วิดีโอ" }));
    expect(actions).toHaveBeenLastCalledWith(expect.objectContaining({ videoOnly: true }));
    rerender(<InsightsReportWorkspace renderAnalysis={() => <p>วิเคราะห์จากหลักฐาน</p>} renderSaved={() => <p>รายงานย้อนหลัง</p>} />);
    fireEvent.click(screen.getByRole("button", { name: "AI วิเคราะห์" }));
    expect(screen.getByText("วิเคราะห์จากหลักฐาน")).toBeInTheDocument();
  });
});
