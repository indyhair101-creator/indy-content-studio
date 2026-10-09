import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePage } from "../app/home-page-view";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";

describe("all navigation workspaces", () => {
  it("opens every rail item without placeholder copy", async () => {
    render(<HomePage repository={new MemoryDashboardRepository()} />);
    const workspaces = [
      ["ภาพรวมและเป้าหมาย", "กำหนดการวันนี้"],
      ["ปฏิทินคอนเทนต์", "ปฏิทินคอนเทนต์"],
      ["Action Plan", "Action Plan"],
      ["บอร์ดการผลิต", "บอร์ดการผลิต"],
      ["งานที่ต้องแก้", "งานที่ต้องแก้"],
      ["คลังสื่อ", "คลังสื่อ"],
      ["Reference และไอเดีย", "Reference และไอเดีย"],
      ["แม่แบบแคปชั่น", "แม่แบบแคปชั่น"],
      ["ส่งโพสต์ผ่าน Make", "ส่งโพสต์ผ่าน Make"],
      ["ตั้งค่าและข้อมูล", "ตั้งค่าและข้อมูล"],
    ] as const;
    for (const [label, heading] of workspaces) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
      expect(screen.queryByText("กำลังจัดเตรียมพื้นที่งานนี้")).not.toBeInTheDocument();
      expect(screen.queryByText("จะแสดงข้อมูลเมื่อฟีเจอร์ส่วนนั้นพร้อมใช้งาน")).not.toBeInTheDocument();
    }
  });
});
