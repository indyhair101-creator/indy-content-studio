import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { InsightsReportWorkspace } from "../features/reports/components/InsightsReportWorkspace";
import { emptyReportingState } from "../features/reports/report-types";
const fixture = vi.hoisted(() => ({ state: null as ReturnType<typeof createEmptyDashboardState> | null }));
vi.mock("../features/data/DashboardDataProvider", () => ({ useDashboardData: () => ({ state: fixture.state, status: "ready", error: null }) }));
describe("live report display", () => {
  it("renders unlinked API posts as platform KPIs and a real-value chart without edit actions", () => {
    const now = new Date().toISOString();
    fixture.state = createEmptyDashboardState();
    fixture.state.reporting = { ...emptyReportingState(), publications: ["facebook", "instagram"].map((platform, i) => ({ id: `p${i}`, contentId: null, platform: platform as "facebook" | "instagram", accountId: "account", providerPostId: `real${i}`, url: `https://example.com/${i}`, title: `Live post ${i}`, publishedAt: now, mediaKind: "video", durationSeconds: null, thumbnailUrl: null })), observations: [0, 1].map(i => ({ id: `o${i}`, publicationId: `p${i}`, source: "api", sourceLabel: "Meta API", fetchedAt: now, scope: "lifetime", period: null, traffic: "unknown", metrics: { views: i ? 300 : 1200, comments: 8 }, averageWatchWeight: null, retention: null })) };
    render(<InsightsReportWorkspace onOpenContent={vi.fn()} />);
    expect(screen.getByRole("region", { name: "สรุป Facebook" })).toHaveTextContent("1,200");
    expect(screen.getByRole("region", { name: "สรุป Instagram" })).toHaveTextContent("300");
    expect(screen.getAllByRole("img", { name: /กราฟผลโพสต์/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "เปิดคอนเทนต์", hidden: true })).toBeNull();
  });
});
