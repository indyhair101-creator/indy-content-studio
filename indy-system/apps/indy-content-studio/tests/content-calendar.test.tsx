import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { ContentCalendarWorkspace } from "../features/calendar/components/ContentCalendarWorkspace";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";

describe("calendar workspace", () => {
  const base: ContentItem = {
    id: "one", title: "งานหนึ่ง", categoryId: "category-knowledge", formatId: "format-video", owner: "colofill",
    objective: "awareness", priority: "normal", plannedWorkAt: "2026-09-24", lastWorkedAt: null, readyDate: null,
    productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [],
    referenceIds: [], notes: "", localApproval: "pending",
    lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
  };

  const multiSchedules: ContentItem["schedules"] = [
    { platform: "facebook", enabled: true, publishAt: "2026-09-24T09:00:00+07:00", latestAttemptId: null, manualEvidence: null },
    { platform: "instagram", enabled: true, publishAt: "2026-09-24T05:00:00Z", latestAttemptId: null, manualEvidence: null },
    { platform: "tiktok", enabled: true, publishAt: "2026-09-25T12:30", latestAttemptId: null, manualEvidence: null },
  ];

  it("shows one card per content per day with every channel and its time", async () => {
    const state = createEmptyDashboardState();
    state.contents = [{ ...base, plannedWorkAt: null, schedules: multiSchedules }, { ...base, id: "other", title: "คนละคอนเทนต์", plannedWorkAt: null, schedules: [multiSchedules[0]] }];
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    expect(screen.getAllByRole("button", { name: /งานหนึ่ง ·/ })).toHaveLength(2);
    expect(screen.getByText("FB 09:00 · IG 12:00")).toBeVisible();
    expect(screen.getByRole("button", { name: /คนละคอนเทนต์ · Facebook/ })).toBeVisible();
    fireEvent.change(screen.getByLabelText("กรองช่องทาง"), { target: { value: "instagram" } });
    expect(screen.getAllByRole("button", { name: /งานหนึ่ง ·/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /งานหนึ่ง · Instagram/ })).toBeVisible();
  });

  it.each(["all", "facebook"])("drags schedules according to the %s filter while preserving each channel time", async (filter) => {
    const state = createEmptyDashboardState();
    state.contents = [{ ...base, schedules: multiSchedules }];
    const repository = new MemoryDashboardRepository(state);
    render(<DashboardDataProvider repository={repository}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.change(screen.getByLabelText("กรองช่องทาง"), { target: { value: filter } });
    const data = new Map<string, string>();
    const dataTransfer = { types: ["text/plain"], setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) ?? "", effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(screen.getByRole("button", { name: /งานหนึ่ง · Facebook/ }), { dataTransfer });
    fireEvent.drop(screen.getByRole("gridcell", { name: "2026-09-28" }), { dataTransfer });
    await vi.waitFor(async () => {
      const saved = (await repository.read()).contents[0];
      expect(saved.schedules.map((schedule) => schedule.publishAt)).toEqual(filter === "all"
        ? ["2026-09-28T09:00:00+07:00", "2026-09-28T12:00:00+07:00", "2026-09-28T12:30"]
        : ["2026-09-28T09:00:00+07:00", "2026-09-24T05:00:00Z", "2026-09-25T12:30"]);
      expect(saved.productionStatus).toBe("waiting-shoot");
      expect(saved.plannedWorkAt).toBe(filter === "all" ? "2026-09-28" : "2026-09-24");
    });
  });

  it("filters planned and unscheduled work using configured and legacy owners", async () => {
    const state = createEmptyDashboardState();
    state.ownerOptions = ["colofill", "Big boss"];
    state.contents = [base, { ...base, id: "two", title: "งานคนอื่น", owner: "Misschilli", plannedWorkAt: null }];
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    const filter = screen.getByLabelText("กรองผู้รับผิดชอบ");
    expect(screen.getByRole("option", { name: "Big boss" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Misschilli" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "เลือก งานหนึ่ง" }));
    fireEvent.change(filter, { target: { value: "Misschilli" } });
    expect(screen.queryByText("งานหนึ่ง")).not.toBeInTheDocument();
    expect(screen.getByText("งานคนอื่น")).toBeVisible();
    expect(screen.queryByRole("region", { name: "การเลือกหลายรายการ" })).not.toBeInTheDocument();
  });

  it.each(["กำลังทำ", "ทำเสร็จแล้ว / ลงเองแล้ว"])("persists bulk %s without submitting publication attempts", async (label) => {
    const state = createEmptyDashboardState();
    state.contents = [base, { ...base, id: "two", title: "งานสอง", schedules: [{ platform: "facebook", enabled: true, publishAt: "2026-09-24T12:00:00+07:00", latestAttemptId: null, manualEvidence: null }] }, { ...base, id: "three", title: "ไม่เลือก" }];
    const repository = new MemoryDashboardRepository(state);
    render(<DashboardDataProvider repository={repository}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "เลือก งานหนึ่ง" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "เลือก งานสอง" }));
    fireEvent.click(screen.getByRole("button", { name: label }));
    await vi.waitFor(async () => {
      const saved = await repository.read();
      expect(saved.contents.slice(0, 2).map((item) => item.productionStatus)).toEqual(label === "กำลังทำ" ? ["editing", "editing"] : ["published", "published"]);
      expect(saved.contents[2].productionStatus).toBe("waiting-shoot");
      expect(saved.publicationAttempts).toEqual([]);
      expect(saved.contents[0].localApproval).toBe("pending");
    });
    expect(screen.getByRole("button", { name: /งานสอง · Facebook/ })).toHaveClass(label === "กำลังทำ" ? "calendar-item--in-progress" : "calendar-item--sent");
  });

  it("combines owner and platform filters for scheduled work", async () => {
    const state = createEmptyDashboardState();
    const schedules: ContentItem["schedules"] = [
      { platform: "facebook", enabled: true, publishAt: "2026-09-24T12:00:00+07:00", latestAttemptId: null, manualEvidence: null },
      { platform: "instagram", enabled: true, publishAt: "2026-09-24T12:00:00+07:00", latestAttemptId: null, manualEvidence: null },
    ];
    state.contents = [{ ...base, schedules }, { ...base, id: "two", title: "งานคนอื่น", owner: "Big boss", schedules }];
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.change(screen.getByLabelText("กรองผู้รับผิดชอบ"), { target: { value: "colofill" } });
    fireEvent.change(screen.getByLabelText("กรองช่องทาง"), { target: { value: "instagram" } });
    expect(screen.getByRole("button", { name: /งานหนึ่ง · Instagram/ })).toBeVisible();
    expect(screen.queryByText("งานคนอื่น")).not.toBeInTheDocument();
    expect(screen.queryByText("Facebook · 12:00")).not.toBeInTheDocument();
  });

  it("marks every selected content step done when the content is marked manually posted", async () => {
    const state = createEmptyDashboardState();
    state.contents = [
      { ...base, processSteps: [
        { id: "edit", name: "ตัดต่อ", scheduledDate: "2026-09-24", status: "todo", order: 0 },
        { id: "caption", name: "ตรวจแคปชัน", scheduledDate: null, status: "doing", order: 1 },
        { id: "review", name: "ตรวจงาน", scheduledDate: null, status: "done", order: 2 },
      ] },
      { ...base, id: "two", title: "งานสอง", processSteps: [{ id: "other-step", name: "ขั้นตอนอื่น", scheduledDate: null, status: "todo", order: 0 }] },
    ];
    const repository = new MemoryDashboardRepository(state);
    render(<DashboardDataProvider repository={repository}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "เลือก งานหนึ่ง" }));
    fireEvent.click(screen.getByRole("button", { name: "ทำเสร็จแล้ว / ลงเองแล้ว" }));

    await vi.waitFor(async () => {
      const saved = await repository.read();
      expect(saved.contents[0].productionStatus).toBe("published");
      expect(saved.contents[0].processSteps.map((step) => step.status)).toEqual(["done", "done", "done"]);
      expect(saved.contents[1].processSteps.map((step) => step.status)).toEqual(["todo"]);
    });
  });

  it("keeps failed bulk updates selected and leaves saved statuses unchanged", async () => {
    const state = createEmptyDashboardState();
    state.contents = [base];
    const repository = new MemoryDashboardRepository(state);
    vi.spyOn(repository, "write").mockRejectedValue(new Error("บันทึกไม่สำเร็จ"));
    render(<DashboardDataProvider repository={repository}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "เลือก งานหนึ่ง" }));
    fireEvent.click(screen.getByRole("button", { name: "ทำเสร็จแล้ว / ลงเองแล้ว" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกไม่สำเร็จ");
    expect(screen.getByRole("checkbox", { name: "เลือก งานหนึ่ง" })).toBeChecked();
    expect((await repository.read()).contents[0].productionStatus).toBe("waiting-shoot");
    expect(screen.getByRole("button", { name: "ทำเสร็จแล้ว / ลงเองแล้ว" })).toBeEnabled();
  });
  it("shows month grid and unscheduled area", async () => {
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    expect(await screen.findByLabelText("เดือนปฏิทิน")).toBeVisible();
    expect(screen.getByText("ยังไม่กำหนดวัน")).toBeVisible();
  });

  it("moves the visible calendar month across year boundaries", async () => {
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    const monthInput = await screen.findByLabelText("เดือนปฏิทิน");
    fireEvent.change(monthInput, { target: { value: "2027-01" } });
    fireEvent.click(screen.getByRole("button", { name: "เดือนก่อนหน้า" }));
    expect(monthInput).toHaveValue("2026-12");
    fireEvent.click(screen.getByRole("button", { name: "เดือนถัดไป" }));
    expect(monthInput).toHaveValue("2027-01");
  });

  it("delegates create-task clicks to the existing creation flow", async () => {
    const onCreateTask = vi.fn();
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><ContentCalendarWorkspace onCreateTask={onCreateTask} /></DashboardDataProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "สร้างชิ้นงานใหม่" }));

    expect(onCreateTask).toHaveBeenCalledOnce();
  });

  it("passes the clicked blank date into the create flow", async () => {
    const onCreateTask = vi.fn();
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><ContentCalendarWorkspace onCreateTask={onCreateTask} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(screen.getByRole("gridcell", { name: "2026-09-18" }));
    expect(onCreateTask).toHaveBeenCalledWith("2026-09-18");
  });

  it("shows the platform filter and scheduled time on calendar events", async () => {
    const state = createEmptyDashboardState();
    state.contents.push({
      id: "calendar-platform", title: "คลิปตามเวลา", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal",
      plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "ready", assetIds: [], processSteps: [], caption: "พร้อม", captionSource: null,
      schedules: [{ platform: "instagram", enabled: true, publishAt: "2026-09-18T12:15:00+07:00", latestAttemptId: null, manualEvidence: null }], referenceIds: [], notes: "", localApproval: "approved",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
    });
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    expect(screen.getByLabelText("กรองช่องทาง")).toBeVisible();
    expect(await screen.findByText("Instagram · 12:15")).toBeVisible();
  });

  it("opens the selected calendar card in the full content editor", async () => {
    const state = createEmptyDashboardState();
    const item: ContentItem = {
      id: "calendar-card", title: "แก้ผ่านปฏิทิน", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม",
      objective: "awareness", priority: "normal", plannedWorkAt: "2026-09-24", lastWorkedAt: null, readyDate: null,
      productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [],
      referenceIds: [], notes: "", localApproval: "pending",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
    };
    state.contents.push(item);
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(await screen.findByRole("button", { name: /แก้ผ่านปฏิทิน/ }));

    expect(await screen.findByRole("dialog", { name: "แก้ไขคอนเทนต์" })).toBeVisible();
    expect(screen.getByLabelText("วันที่ลงในปฏิทิน")).toHaveValue("2026-09-24");
  });

  it("colors unstarted, in-progress, and sent content red, yellow, and green", async () => {
    const state = createEmptyDashboardState();
    const base: ContentItem = {
      id: "", title: "", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal",
      plannedWorkAt: "2026-09-24", lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [],
      referenceIds: [], notes: "", localApproval: "pending",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
    };
    state.contents.push(
      { ...base, id: "red", title: "ยังไม่ได้ทำ" },
      { ...base, id: "yellow", title: "กำลังทำ", productionStatus: "editing" },
      { ...base, id: "green", title: "ส่งแล้ว", productionStatus: "published" },
    );
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });

    expect(await screen.findByRole("button", { name: /ยังไม่ได้ทำ/ })).toHaveClass("calendar-item--not-started");
    expect(screen.getByRole("button", { name: /กำลังทำ/ })).toHaveClass("calendar-item--in-progress");
    expect(screen.getByRole("button", { name: /ส่งแล้ว/ })).toHaveClass("calendar-item--sent");
    expect(screen.getByRole("button", { name: /ยังไม่ได้ทำ/ }).querySelector("button")).toBeNull();
  });

  it("selects multiple calendar content items and deletes them after confirmation", async () => {
    const state = createEmptyDashboardState();
    const base: ContentItem = {
      id: "", title: "", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal",
      plannedWorkAt: "2026-09-24", lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [],
      referenceIds: [], notes: "", localApproval: "pending",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
    };
    state.contents.push(
      { ...base, id: "select-one", title: "เลือกงานหนึ่ง" },
      { ...base, id: "select-two", title: "เลือกงานสอง" },
    );
    const repository = new MemoryDashboardRepository(state);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DashboardDataProvider repository={repository}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "เลือก เลือกงานหนึ่ง" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "เลือก เลือกงานสอง" }));

    expect(screen.getByText("เลือกแล้ว 2 รายการ")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ลบรายการที่เลือก" }));

    await vi.waitFor(async () => {
      const persisted = await repository.read();
      expect(persisted.contents.every((content) => content.deletedAt)).toBe(true);
    });
    expect(screen.queryByText("เลือกงานหนึ่ง")).not.toBeInTheDocument();
    expect(screen.queryByText("เลือกงานสอง")).not.toBeInTheDocument();
  });

  it("opens a separate copy dialog for one selected item and creates copies in the chosen date range", async () => {
    const state = createEmptyDashboardState();
    state.contents = [{ ...base, plannedWorkAt: "2026-09-24", schedules: multiSchedules }];
    const repository = new MemoryDashboardRepository(state);
    render(<DashboardDataProvider repository={repository}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click((await screen.findAllByRole("checkbox", { name: "เลือก งานหนึ่ง" }))[0]);
    expect(screen.getAllByRole("checkbox", { name: "เลือก งานหนึ่ง" }).every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "คัดลอกสำเนา" }));

    const dialog = await screen.findByRole("dialog", { name: "คัดลอกสำเนา" });
    expect(dialog).toHaveTextContent("งานหนึ่ง");
    fireEvent.change(screen.getByLabelText("วันที่เริ่มคัดลอก"), { target: { value: "2026-09-28" } });
    fireEvent.change(screen.getByLabelText("วันที่สิ้นสุด"), { target: { value: "2026-09-29" } });
    fireEvent.change(screen.getByLabelText("รูปแบบการทำซ้ำ"), { target: { value: "daily" } });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการคัดลอก" }));

    await vi.waitFor(async () => {
      const saved = await repository.read();
      expect(saved.contents).toHaveLength(3);
      expect(saved.contents[0]).toMatchObject({ id: base.id, plannedWorkAt: "2026-09-24" });
      expect(saved.contents.slice(1).map((content) => content.plannedWorkAt)).toEqual(["2026-09-28", "2026-09-29"]);
      expect(saved.contents[1].schedules.map((schedule) => schedule.publishAt)).toEqual(["2026-09-28T09:00:00+07:00", "2026-09-28T12:00:00+07:00", "2026-09-29T12:30:00+07:00"]);
    });
    expect(screen.queryByRole("dialog", { name: "คัดลอกสำเนา" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "การเลือกหลายรายการ" })).not.toBeInTheDocument();
  });

  it("only enables repeat-copy for exactly one selected content item", async () => {
    const state = createEmptyDashboardState();
    state.contents = [base, { ...base, id: "two", title: "งานสอง" }];
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "เลือก งานหนึ่ง" }));
    expect(screen.getByRole("button", { name: "คัดลอกสำเนา" })).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "เลือก งานสอง" }));
    expect(screen.getByRole("button", { name: "คัดลอกสำเนา" })).toBeDisabled();
  });

  it("keeps the editor action available when a calendar item is not selected", async () => {
    const state = createEmptyDashboardState();
    state.contents.push({
      id: "edit-after-select", title: "เปิดรายละเอียดได้", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม",
      objective: "awareness", priority: "normal", plannedWorkAt: "2026-09-24", lastWorkedAt: null, readyDate: null,
      productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
    });
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(await screen.findByRole("button", { name: /เปิดรายละเอียดได้/ }));

    expect(await screen.findByRole("dialog", { name: "แก้ไขคอนเทนต์" })).toBeVisible();
  });
});
