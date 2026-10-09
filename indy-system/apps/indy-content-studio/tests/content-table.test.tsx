import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentTable } from "../features/content/components/ContentTable";

describe("ContentTable", () => {
  it("shows the content fields visible in the live dashboard", () => {
    render(
      <ContentTable
        items={[
          {
            id: "one",
            title: "หนึ่งวันในห้องเรียน INDY",
            category: "บรรยากาศ",
            format: "อัลบั้ม",
            readyDate: "2026-09-04",
            captionState: "ยังไม่เขียน",
            status: "พร้อมโพสต์",
          },
        ]}
      />,
    );

    expect(screen.getByText("หนึ่งวันในห้องเรียน INDY")).toBeVisible();
    expect(screen.getByText("พร้อมโพสต์")).toBeVisible();
  });
});
