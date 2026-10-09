import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { MakeDeliveryWorkspace } from "../features/publication/components/MakeDeliveryWorkspace";

function content(): ContentItem { const now = "2026-09-18T10:00:00.000Z"; return { id: "make-content", title: "โพสต์ Make", categoryId: "cat", formatId: "format", owner: "ทีม", objective: "sales", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: "2026-09-18", productionStatus: "ready", assetIds: [], processSteps: [], caption: "พร้อม", captionSource: null, schedules: [{ platform: "facebook", enabled: true, publishAt: null, latestAttemptId: null, manualEvidence: null }], referenceIds: [], notes: "", localApproval: "approved", lineReview: { status: "approved", activeCycleId: "cycle", reviewCode: "R-ABC234", providerReceipts: [], lastEventAt: now, history: [] }, createdAt: now, updatedAt: now, deletedAt: null }; }

describe("MakeDeliveryWorkspace", () => {
  it("shows the queue created by the Final editor and its per-channel status", async () => {
    const base = createEmptyDashboardState();
    base.contents.push(content());
    base.publicationAttempts.push({ id: "attempt", idempotencyKey: "key", contentId: "make-content", platform: "facebook", publishAt: "2026-09-20T10:00+07:00", status: "queued", queueId: "queue", providerPublicationId: null, receiptUrl: null, errorCode: null, createdAt: "now", updatedAt: "now" });
    const repository = new MemoryDashboardRepository(base);
    render(<DashboardDataProvider repository={repository}><MakeDeliveryWorkspace /></DashboardDataProvider>);
    expect(await screen.findByText(/โพสต์ Make/)).toBeVisible();
    expect(screen.getByText(/Facebook · 2026-09-20T10:00\+07:00 · ตั้งเวลาแล้ว/)).toBeVisible();
    expect(screen.queryByText("วางแผนเผยแพร่")).not.toBeInTheDocument();
  });
});
