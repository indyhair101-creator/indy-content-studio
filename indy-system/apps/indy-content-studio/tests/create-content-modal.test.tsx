import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateContentModal } from "../features/dashboard/components/CreateContentModal";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";

const taxonomy = createEmptyDashboardState();
const taxonomyProps = { categories: taxonomy.categories.map(({ name }) => name), formats: taxonomy.formats.map(({ name }) => name), ownerOptions: taxonomy.ownerOptions };

describe("CreateContentModal", () => {
  it("requires a title before creating a task", () => {
    const create = vi.fn();

    render(<CreateContentModal open onClose={vi.fn()} onCreate={create} {...taxonomyProps} />);
    expect(screen.getByRole("dialog", { name: "สร้างคอนเทนต์" })).toHaveClass("motion-material-surface", "motion-modal");
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    expect(screen.getByText("กรุณาระบุชื่อชิ้นงาน")).toBeVisible();
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a full piece of content, caption included, from one form", () => {
    const create = vi.fn();

    render(<CreateContentModal open onClose={vi.fn()} onCreate={create} {...taxonomyProps} />);
    expect(screen.queryByLabelText("ไฟล์แนบ")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "รีวิวสินค้า" } });
    fireEvent.change(screen.getByLabelText("ประเภทคอนเทนต์"), { target: { value: "รีวิว" } });
    fireEvent.change(screen.getByLabelText("รูปแบบการนำเสนอ"), { target: { value: "วิดีโอ" } });
    fireEvent.change(screen.getByLabelText("ผู้รับผิดชอบ"), { target: { value: "Misschilli" } });
    fireEvent.change(screen.getByLabelText("เป้าหมาย"), { target: { value: "sales" } });
    const date = screen.getByLabelText("วันที่ลงในปฏิทิน");
    expect(date).toHaveAttribute("type", "date");
    fireEvent.change(date, { target: { value: "2026-09-18" } });
    fireEvent.change(screen.getByLabelText("แคปชัน"), { target: { value: "  เรียนตัดผมกับ INDY  " } });
    fireEvent.change(screen.getByLabelText("โน้ต"), { target: { value: "ใช้ฉบับที่อนุมัติแล้ว" } });
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    expect(create).toHaveBeenCalledWith({
      title: "รีวิวสินค้า",
      category: "รีวิว",
      format: "วิดีโอ",
      owner: "Misschilli",
      objective: "sales",
      plannedDate: "2026-09-18",
      notes: "ใช้ฉบับที่อนุมัติแล้ว",
      caption: "เรียนตัดผมกับ INDY",
      platformSchedules: {
        facebook: { enabled: false, date: "", time: "09:00" },
        instagram: { enabled: false, date: "", time: "09:00" },
        tiktok: { enabled: false, date: "", time: "09:00" },
        salon: { enabled: false, date: "", time: "09:00" },
      },
    });
  });

  it("keeps rarely changed fields folded away and shows time only after a channel is chosen", () => {
    render(<CreateContentModal open onClose={vi.fn()} onCreate={vi.fn()} {...taxonomyProps} />);

    expect(screen.getByText("รายละเอียดเพิ่มเติม").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByLabelText("เวลาโพสต์")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("วันลง Facebook")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("เปิด Facebook"));
    expect(screen.getByLabelText("เวลาโพสต์")).toBeVisible();
  });

  it("applies one date and time to every chosen channel", () => {
    const create = vi.fn();
    render(<CreateContentModal open onClose={vi.fn()} onCreate={create} {...taxonomyProps} defaultOwner="colofill" initialDate="2026-10-20" />);
    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "สอนไดร์ผม" } });
    expect(screen.getByLabelText("ผู้รับผิดชอบ")).toHaveDisplayValue("colofill");
    fireEvent.click(screen.getByLabelText("เปิด Instagram"));
    fireEvent.click(screen.getByLabelText("เปิด TikTok"));
    fireEvent.change(screen.getByLabelText("เวลาโพสต์"), { target: { value: "19:00" } });
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      owner: "colofill",
      plannedDate: "2026-10-20",
      platformSchedules: expect.objectContaining({
        instagram: { enabled: true, date: "2026-10-20", time: "19:00" },
        tiktok: { enabled: true, date: "2026-10-20", time: "19:00" },
        facebook: { enabled: false, date: "2026-10-20", time: "09:00" },
      }),
    }));
  });

  it("captures independent dates and times when the user splits channels", () => {
    const create = vi.fn();
    render(<CreateContentModal open onClose={vi.fn()} onCreate={create} {...taxonomyProps} initialDate="2026-09-18" />);
    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "คลิปหลายช่องทาง" } });
    fireEvent.change(screen.getByLabelText("ผู้รับผิดชอบ"), { target: { value: "colofill" } });
    fireEvent.click(screen.getByLabelText("เปิด Facebook"));
    fireEvent.click(screen.getByLabelText("เปิด Instagram"));
    fireEvent.click(screen.getByLabelText("ตั้งวันเวลาโพสต์แยกรายช่องทาง"));
    fireEvent.change(screen.getByLabelText("วันลง Facebook"), { target: { value: "2026-09-19" } });
    fireEvent.change(screen.getByLabelText("เวลาลง Facebook"), { target: { value: "09:30" } });
    fireEvent.change(screen.getByLabelText("วันลง Instagram"), { target: { value: "2026-09-20" } });
    fireEvent.change(screen.getByLabelText("เวลาลง Instagram"), { target: { value: "12:15" } });
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      plannedDate: "2026-09-18",
      platformSchedules: expect.objectContaining({
        facebook: { enabled: true, date: "2026-09-19", time: "09:30" },
        instagram: { enabled: true, date: "2026-09-20", time: "12:15" },
      }),
    }));
  });

  it("does not render when closed", () => {
    render(<CreateContentModal open={false} onClose={vi.fn()} onCreate={vi.fn()} {...taxonomyProps} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const close = vi.fn();
    render(<CreateContentModal open onClose={close} onCreate={vi.fn()} {...taxonomyProps} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("shows save progress and a recoverable error when saving fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("บันทึกไม่สำเร็จ"));
    render(<CreateContentModal open onClose={vi.fn()} onCreate={create} {...taxonomyProps} />);
    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "งานที่บันทึกไม่สำเร็จ" } });
    fireEvent.change(screen.getByLabelText("ผู้รับผิดชอบ"), { target: { value: "colofill" } });
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกงานไม่สำเร็จ");
    expect(screen.getByRole("button", { name: "สร้างงาน" })).toBeEnabled();
  });

  it("uses the configurable content categories and presentation formats", () => {
    render(<CreateContentModal open onClose={vi.fn()} onCreate={vi.fn()} categories={["ความรู้", "เบื้องหลัง"]} formats={["คลิปแนวตั้ง", "ภาพชุด"]} />);

    expect(screen.getByLabelText("ประเภทคอนเทนต์")).toHaveDisplayValue("ความรู้");
    expect(screen.getByLabelText("ประเภทคอนเทนต์")).toContainHTML("เบื้องหลัง");
    expect(screen.getByLabelText("รูปแบบการนำเสนอ")).toHaveDisplayValue("คลิปแนวตั้ง");
    expect(screen.getByLabelText("รูปแบบการนำเสนอ")).toContainHTML("ภาพชุด");
  });
});

describe("CreateContentModal owner default", () => {
  it("fills the remembered owner when the team list arrives late without wiping what was typed", () => {
    const props = { open: true, onClose: vi.fn(), onCreate: vi.fn(), categories: ["ความรู้"], formats: ["วิดีโอ"], defaultOwner: "colofill" };
    const { rerender } = render(<CreateContentModal {...props} ownerOptions={[]} />);
    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "พิมพ์ไว้ก่อน" } });
    rerender(<CreateContentModal {...props} ownerOptions={["colofill", "Big boss"]} />);
    expect(screen.getByLabelText("ชื่อชิ้นงาน")).toHaveValue("พิมพ์ไว้ก่อน");
    expect(screen.getByLabelText("ผู้รับผิดชอบ")).toHaveDisplayValue("colofill");
  });
});
