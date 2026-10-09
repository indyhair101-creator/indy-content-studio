import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductionBoard } from "../features/content/components/ProductionBoard";

describe("ProductionBoard", () => {
  it("groups work by its production status", () => {
    render(
      <ProductionBoard
        items={[
          { id: "one", title: "พร้อมแล้ว", status: "พร้อมโพสต์" },
          { id: "two", title: "กำลังตัด", status: "ตัดต่อ" },
        ]}
      />,
    );

    expect(screen.getByText("พร้อมโพสต์")).toBeVisible();
    expect(screen.getByText("ตัดต่อ")).toBeVisible();
  });
});
