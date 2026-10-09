import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardPreview } from "../features/dashboard/components/DashboardPreview";

describe("DashboardPreview", () => {
  it("keeps the preview from exposing a nonfunctional send button", () => {
    render(<DashboardPreview />);

    expect(screen.getByRole("heading", { name: "ภาพรวมและเป้าหมาย" })).toBeVisible();
    expect(screen.getByRole("heading", { name: /ชิ้นงานในเดือนนี้/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "บอร์ดการผลิต" })).toBeVisible();
    expect(screen.getByText(/ส่งจริงทำจากรายละเอียดงาน/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "ส่งเข้า LINE OA" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "ยืนยันการส่งเข้า LINE OA" })).not.toBeInTheDocument();
  });
});
