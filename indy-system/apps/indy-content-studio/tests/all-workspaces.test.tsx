import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePage } from "../app/home-page-view";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";

describe("all navigation workspaces", () => {
  it("reaches every workspace through its destination and sub-tab without placeholder copy", async () => {
    render(<HomePage repository={new MemoryDashboardRepository()} />);
    const workspaces = [
      ["วันนี้", null, "กำหนดการวันนี้"],
      ["Action Plan", null, "Action Plan"],
      ["ปฏิทิน", null, "ปฏิทินคอนเทนต์"],
      ["งานผลิต", "บอร์ดการผลิต", "บอร์ดการผลิต"],
      ["งานผลิต", "งานที่ต้องแก้", "งานที่ต้องแก้"],
      ["งานผลิต", "คิวส่ง Make", "ส่งโพสต์ผ่าน Make"],
      ["คลัง", "คลังสื่อ", "คลังสื่อ"],
      ["คลัง", "Reference และไอเดีย", "Reference และไอเดีย"],
      ["คลัง", "แม่แบบแคปชัน", "แม่แบบแคปชั่น"],
      ["รายงาน", "การทำงานของทีม", "การทำงานของทีม"],
      ["รายงาน", "ข้อมูลเชิงลึก", "Report ข้อมูลเชิงลึก"],
      ["ตั้งค่า", null, "ตั้งค่าและข้อมูล"],
    ] as const;
    for (const [destination, tab, heading] of workspaces) {
      fireEvent.click(screen.getByRole("button", { name: destination }));
      if (tab) fireEvent.click(screen.getByRole("button", { name: tab }));
      expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
      expect(screen.queryByText("กำลังจัดเตรียมพื้นที่งานนี้")).not.toBeInTheDocument();
      expect(screen.queryByText("จะแสดงข้อมูลเมื่อฟีเจอร์ส่วนนั้นพร้อมใช้งาน")).not.toBeInTheDocument();
    }
  });
});
