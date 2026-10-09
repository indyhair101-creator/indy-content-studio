import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewPage } from "../features/dashboard/components/OverviewPage";

describe("OverviewPage", () => {
  it("shows live-dashboard summary labels", () => {
    render(
      <OverviewPage
        overview={{
          plannedCount: 12,
          completedCount: 3,
          publishedCount: 0,
          totalCount: 12,
          imageCount: 4,
          videoCount: 8,
        }}
      />,
    );

    expect(screen.getByText("ในแผน")).toBeVisible();
    expect(screen.getByText("ผลิตเสร็จ")).toBeVisible();
    expect(screen.getByText("เผยแพร่จริงครบช่องทาง")).toBeVisible();
  });
});
