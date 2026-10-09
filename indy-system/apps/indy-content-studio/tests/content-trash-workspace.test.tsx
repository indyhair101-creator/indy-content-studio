import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContentTrashPanel } from "../features/content/components/ContentTrashPanel";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";

function content(): ContentItem { const now = "now"; return { id: "trash-ui", title: "งานถูกลบ", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: "later" }; }

describe("ContentTrashPanel", () => { it("restores deleted content", async () => { const repository = new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [content()] }); vi.stubGlobal("confirm", vi.fn(() => true)); render(<DashboardDataProvider repository={repository}><ContentTrashPanel /></DashboardDataProvider>); fireEvent.click(await screen.findByRole("button", { name: "กู้คืน" })); expect(await screen.findByText("ถังขยะว่าง")).toBeVisible(); }); });
