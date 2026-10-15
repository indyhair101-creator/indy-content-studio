import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../app/AppShell";

describe("AppShell", () => {
  it("shows seven labelled destinations, Action Plan among them, without a collapsed-only mode", () => {
    render(
      <AppShell>
        <main>content</main>
      </AppShell>,
    );

    const navigation = screen.getByRole("navigation", { name: "เมนูแดชบอร์ด" });
    expect(navigation).toHaveClass("dashboard-nav");
    expect(navigation).not.toHaveAttribute("data-collapsible");
    expect(within(navigation).getAllByRole("button").map((button) => button.textContent)).toEqual(["วันนี้", "ปฏิทิน", "Action Plan", "งานผลิต", "คลัง", "รายงาน", "ตั้งค่า"]);
    expect(screen.getByRole("button", { name: "วันนี้" })).toHaveAttribute("data-tooltip", "วันนี้");
  });

  it("does not render header controls that do nothing", () => {
    render(<AppShell><main>content</main></AppShell>);

    expect(screen.queryByPlaceholderText("ค้นหาไฟล์ งาน หรือไอเดีย")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "การแจ้งเตือน" })).not.toBeInTheDocument();
  });

  it("marks the selected destination, shows its sub-tabs and notifies the page", () => {
    const selected: string[] = [];

    render(
      <AppShell activeItem="references" onNavigate={(item) => selected.push(item)} headerAside={<button type="button">โหลดข้อมูลงานล่าสุด</button>}>
        <main>content</main>
      </AppShell>,
    );

    expect(screen.getByRole("button", { name: "คลัง" })).toHaveAttribute("aria-current", "page");
    const tabs = screen.getByRole("navigation", { name: "หน้าย่อยใน คลัง" });
    expect(within(tabs).getByRole("button", { name: "Reference และไอเดีย" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "โหลดข้อมูลงานล่าสุด" })).toBeVisible();

    fireEvent.click(within(tabs).getByRole("button", { name: "คลังสื่อ" }));
    fireEvent.click(screen.getByRole("button", { name: "งานผลิต" }));

    expect(selected).toEqual(["media-library", "production-board"]);
  });

  it("hides the sub-tab bar for single-page destinations", () => {
    render(<AppShell activeItem="calendar"><main>content</main></AppShell>);
    expect(screen.queryByRole("navigation", { name: /หน้าย่อยใน/ })).not.toBeInTheDocument();
  });
});
