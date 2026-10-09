import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodayOverview } from "../features/dashboard/components/TodayOverview";

describe("dashboard state coverage", () => {
  it.each([
    ["loading", "กำลังเตรียมกำหนดการวันนี้"],
    ["empty", "ยังไม่มีงานสำหรับวันนี้"],
    ["error", "ลองใหม่"],
  ] as const)("keeps the overview useful when it is %s", (state, expectedText) => {
    render(<TodayOverview tasks={[]} state={state} onOpenTask={vi.fn()} onResumeLatest={vi.fn()} onRetry={vi.fn()} />);

    expect(screen.getByText(expectedText)).toBeVisible();
  });
});
