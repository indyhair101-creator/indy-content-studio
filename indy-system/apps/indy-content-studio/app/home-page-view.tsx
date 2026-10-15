"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, type WorkspaceItem } from "./AppShell";
import { TodayOverview, type TodayOverviewState } from "../features/dashboard/components/TodayOverview";
import { CreateContentModal, type CreateContentInput } from "../features/dashboard/components/CreateContentModal";
import { TaskDetailDrawer } from "../features/dashboard/components/TaskDetailDrawer";
import { LineSendConfirmation } from "../features/dashboard/components/LineSendConfirmation";
import { LineSendComposer, type LineSendDraft } from "../features/dashboard/components/LineSendComposer";
import { dashboardTaskFromContent, dashboardTaskToContent, dashboardTaskToMedia, selectTodayTasks, type DashboardTask } from "../features/dashboard/dashboard-model";
import { bangkokDate } from "../features/reports/report-dates";
import { moveContentToStatus } from "../features/production/production-board-model";
import { setProcessStepStatus } from "../features/action-plan/action-plan-commands";
import { useDashboardWorkspace } from "../features/dashboard/useDashboardWorkspace";
import { DashboardDataProvider, useDashboardData } from "../features/data/DashboardDataProvider";
import { upsertContent } from "../features/data/dashboard-commands";
import type { DashboardRepository } from "../features/data/dashboard-repository";
import { SettingsWorkspace } from "../features/settings/components/SettingsWorkspace";
import { MediaLibraryWorkspace } from "../features/media/components/MediaLibraryWorkspace";
import { ReferencesWorkspace } from "../features/references/components/ReferencesWorkspace";
import { CaptionTemplatesWorkspace } from "../features/captions/components/CaptionTemplatesWorkspace";
import { ContentEditorDialog } from "../features/content/components/ContentEditorDialog";
import { OverviewWorkspace } from "../features/overview/components/OverviewWorkspace";
import { ContentCalendarWorkspace } from "../features/calendar/components/ContentCalendarWorkspace";
import { ActionPlanWorkspace } from "../features/action-plan/components/ActionPlanWorkspace";
import { ProductionBoardWorkspace } from "../features/production/components/ProductionBoardWorkspace";
import { CorrectionsWorkspace } from "../features/line-oa/components/CorrectionsWorkspace";
import { MakeDeliveryWorkspace } from "../features/publication/components/MakeDeliveryWorkspace";
import { IndexedDbMediaBlobStore } from "../features/media/indexeddb-media-blob-store";
import type { MediaBlobStore } from "../features/media/media-blob-store";
import { uploadMediaToBlob } from "../features/media/blob-media-upload";
import { TeamReportWorkspace } from "../features/reports/components/TeamReportWorkspace";
import { InsightsReportWorkspace } from "../features/reports/components/InsightsReportWorkspace";
import { ReportActions, SavedReportsPanel } from "../features/reports/components/SavedReportsPanel";
import { ReportConnectionsPanel } from "../features/reports/components/ReportConnectionsPanel";
import { ReportImportPanel } from "../features/reports/components/ReportImportPanel";
import { ReportAnalysisPanel } from "../features/reports/components/ReportAnalysisPanel";
import { ReportRecoveryWorkspace } from "../features/reports/components/ReportRecoveryWorkspace";

type LineConnectionView = {
  view: "loading" | "authenticated" | "unauthenticated" | "error";
  status: string | null;
  maskedRecipient: string | null;
};

type StorageHealth = { status: "checking" | "ready" | "unavailable"; reason: string | null };

type LineDeliveryResult = {
  id: string;
  status: "sent" | "failed";
  errorCategory: string | null;
  sentAt: string | null;
};

function HomePageContent({ mediaBlobStore }: { mediaBlobStore: MediaBlobStore }) {
  const dashboard = useDashboardData();
  const [refreshing, setRefreshing] = useState(false);
  const [draftTasks, setDraftTasks] = useState<DashboardTask[]>([]);
  const persistedTasks = useMemo(() => {
    if (!dashboard.state) return [];
    return dashboard.state.contents
      .filter((content) => !content.deletedAt)
      .map((content) => dashboardTaskFromContent(content, dashboard.state!));
  }, [dashboard.state]);
  const todayTasks = useMemo(() => {
    const persistedIds = new Set(persistedTasks.map((task) => task.id));
    return [...persistedTasks, ...draftTasks.filter((task) => !persistedIds.has(task.id))];
  }, [draftTasks, persistedTasks]);
  const workspace = useDashboardWorkspace(todayTasks);
  const today = bangkokDate();
  const dueToday = useMemo(() => selectTodayTasks(todayTasks, today), [todayTasks, today]);
  const reviewCount = todayTasks.filter((task) => task.workflowStage === "รอตรวจ").length;
  const todayState: TodayOverviewState = dashboard.status === "loading" && !dashboard.state ? "loading" : dashboard.error && !dashboard.state ? "error" : "ready";
  const [lastOwner, setLastOwner] = useState(() => { try { return localStorage.getItem("indy:last-owner") ?? ""; } catch { return ""; } });
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceItem>("overview");
  const [createInitialDate, setCreateInitialDate] = useState("");
  const [continuationNotice, setContinuationNotice] = useState<string | null>(null);
  const [isLineConfirmationOpen, setLineConfirmationOpen] = useState(false);
  const [isLineComposerOpen, setLineComposerOpen] = useState(false);
  const [lineSendTask, setLineSendTask] = useState<DashboardTask | null>(null);
  const pendingLineTaskId = useRef<string | null>(null);
  const [isFullEditorOpen, setFullEditorOpen] = useState(false);
  const [lineConnection, setLineConnection] = useState<LineConnectionView>({ view: "loading", status: null, maskedRecipient: null });
  const [storageHealth, setStorageHealth] = useState<StorageHealth>({ status: "checking", reason: null });
  const selectedTask = todayTasks.find((task) => task.id === workspace.selectedTaskId);
  const lineConnected = lineConnection.view === "authenticated" && lineConnection.status === "connected";

  function openCreateContent(initialDate = "") {
    setCreateInitialDate(initialDate);
    workspace.setCreateOpen(true);
  }

  useEffect(() => {
    if (activeWorkspace !== "overview") return;
    let active = true;
    setLineConnection({ view: "loading", status: null, maskedRecipient: null });
    void fetch("/api/line/pairing", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          if (active) setLineConnection({ view: "unauthenticated", status: null, maskedRecipient: null });
          return;
        }
        if (!response.ok) throw new Error("LINE status unavailable");
        const result = await response.json() as { status?: unknown; maskedRecipient?: unknown };
        if (active) setLineConnection({
          view: "authenticated",
          status: typeof result.status === "string" ? result.status : "not_connected",
          maskedRecipient: typeof result.maskedRecipient === "string" ? result.maskedRecipient : null,
        });
      })
      .catch(() => {
        if (active) setLineConnection({ view: "error", status: null, maskedRecipient: null });
      });
    return () => { active = false; };
  }, [activeWorkspace]);

  useEffect(() => {
    if (!isLineComposerOpen) return;
    let active = true;
    setStorageHealth({ status: "checking", reason: null });
    void fetch("/api/integrations/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("storage-health-unavailable");
        const payload = await response.json() as { integrations?: Array<{ provider?: string; status?: string; category?: string }> };
        const drive = payload.integrations?.find((integration) => integration.provider === "blob");
        if (active) setStorageHealth(drive?.status === "connected"
          ? { status: "ready", reason: null }
          : { status: "unavailable", reason: drive?.category ?? "provider" });
      })
      .catch(() => { if (active) setStorageHealth({ status: "unavailable", reason: "provider" }); });
    return () => { active = false; };
  }, [isLineComposerOpen]);

  async function changeSelectedStatus(status: Parameters<typeof moveContentToStatus>[2]) {
    if (!selectedTask) return;
    await dashboard.mutate((state) => moveContentToStatus(state, selectedTask.id, status, new Date().toISOString()));
  }

  async function toggleSelectedStep(stepId: string, done: boolean) {
    if (!selectedTask) return;
    await dashboard.mutate((state) => setProcessStepStatus(state, selectedTask.id, stepId, done ? "done" : "todo", new Date().toISOString()));
  }

  function rememberOwner(owner: string) {
    setLastOwner(owner);
    try { localStorage.setItem("indy:last-owner", owner); } catch { /* the default owner is a convenience only */ }
  }

  function requestLineDelivery() {
    setContinuationNotice(null);
    setLineComposerOpen(true);
  }

  async function submitLineDraft(draft: LineSendDraft) {
    if (storageHealth.status !== "ready") throw new Error("media-storage-unavailable");
    const now = new Date().toISOString();
    const taskId = pendingLineTaskId.current ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingLineTaskId.current = taskId;
    const task: DashboardTask = {
      id: taskId,
      title: `ส่ง LINE · ${draft.plannedDate}`,
      category: dashboard.state?.categories.find((category) => category.id === draft.categoryId)?.name ?? "",
      format: dashboard.state?.formats.find((format) => format.id === draft.formatId)?.name ?? "",
      owner: "INDY ทีมคอนเทนต์",
      objective: "awareness",
      priority: "normal",
      workflowStage: "พร้อมโพสต์",
      lastWorkedAt: now,
      scheduledTime: draft.plannedDate,
      caption: draft.caption,
      assets: [{ name: draft.file.name, type: draft.file.type, size: draft.file.size }],
      processSteps: [],
    };
    const savedTask = await saveTask(task, [draft.file]);
    pendingLineTaskId.current = null;
    setLineSendTask(savedTask);
    setLineComposerOpen(false);
    setLineConfirmationOpen(true);
  }

  async function createTask(input: CreateContentInput) {
    const now = new Date().toISOString();
    const taskId = `task-${Date.now()}`;
    const task: DashboardTask = {
      id: taskId,
      title: input.title,
      category: input.category,
      format: input.format,
      owner: input.owner,
      objective: input.objective,
      notes: input.notes,
      priority: "normal",
      workflowStage: "วางแผน",
      lastWorkedAt: now,
      scheduledTime: input.plannedDate || "ยังไม่กำหนด",
      caption: input.caption,
      assets: [],
      processSteps: [{ id: `step-${taskId}-prepare`, name: "เตรียมงาน", scheduledDate: input.plannedDate || null, status: "todo", order: 0 }],
      platformSchedules: input.platformSchedules,
    };
    await saveTask(task);
    rememberOwner(input.owner);
    setDraftTasks((current) => [...current, task]);
    workspace.setCreateOpen(false);
    workspace.closeTask();
  }

  async function saveTask(task: DashboardTask, files: File[] = []): Promise<DashboardTask> {
    const now = new Date().toISOString();
    const taskMedia = dashboardTaskToMedia(task, now);
    const storedBlobIds: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        const asset = taskMedia[index];
        if (!asset) continue;
        await mediaBlobStore.put(asset.id, file);
        storedBlobIds.push(asset.id);
      }
      await dashboard.mutate((current) => {
        const mediaIds = new Set(taskMedia.map((asset) => asset.id));
        return upsertContent({
          ...current,
          media: [...current.media.filter((asset) => !mediaIds.has(asset.id)), ...taskMedia],
        }, dashboardTaskToContent(task, current, now));
      });
    } catch (error) {
      await Promise.all(storedBlobIds.map((id) => mediaBlobStore.remove(id).catch(() => undefined)));
      throw error;
    }

    for (const [index, file] of files.entries()) {
      const asset = taskMedia[index];
      if (!asset) continue;
      await dashboard.mutate((state) => ({
        ...state,
        media: state.media.map((item) => item.id === asset.id
          ? { ...item, remoteStatus: "uploading", providerFileId: null, previewProviderFileId: null, updatedAt: new Date().toISOString() }
          : item),
      }));
      try {
        const uploaded = await uploadMediaToBlob({ assetId: asset.id, name: asset.name, mimeType: asset.mimeType, blob: file });
        await dashboard.mutate((state) => ({
          ...state,
          media: state.media.map((item) => item.id === asset.id
            ? {
                ...item,
                remoteStatus: uploaded.remoteStatus,
                providerFileId: uploaded.remoteStatus === "ready" ? uploaded.providerFileId : null,
                previewProviderFileId: uploaded.remoteStatus === "ready" ? uploaded.previewProviderFileId : null,
                updatedAt: new Date().toISOString(),
              }
            : item),
        }));
        if (uploaded.remoteStatus !== "ready") throw new Error("media-storage-unavailable");
      } catch (error) {
        await dashboard.mutate((state) => ({
          ...state,
          media: state.media.map((item) => item.id === asset.id
            ? { ...item, remoteStatus: "failed", providerFileId: null, previewProviderFileId: null, updatedAt: new Date().toISOString() }
            : item),
        }));
        if (error instanceof Error && error.message === "media-storage-unavailable") throw error;
        throw new Error("provider-upload-failed");
      }
    }
    return {
      ...task,
      updatedAt: now,
      assets: (task.assets ?? []).map((asset) => ({ ...asset, remoteStatus: "ready", remoteReady: true, previewReady: true })),
    };
  }

  const refreshButton = <button type="button" className="header-refresh-button" disabled={refreshing || dashboard.status === "loading"} title="รับการแก้ไขล่าสุดจากคนอื่นในทีม" onClick={() => {
    setRefreshing(true);
    void dashboard.reload().catch(() => undefined).finally(() => setRefreshing(false));
  }}>{refreshing ? "กำลังโหลด…" : "โหลดข้อมูลงานล่าสุด"}</button>;

  return <AppShell activeItem={activeWorkspace} onNavigate={setActiveWorkspace} headerAside={refreshButton}>
    <main>
      {dashboard.error && <p className="app-alert" role="alert">โหลดฐานข้อมูลงานไม่สำเร็จ ข้อมูลเดิมไม่ได้ถูกลบ — ยังเปิด Report ข้อมูลเชิงลึกและกดดึงจากโซเชียลได้</p>}
      {activeWorkspace === "overview" && <>
        <TodayOverview
          tasks={dueToday}
          state={todayState}
          today={today}
          reviewCount={reviewCount}
          onOpenTask={(task) => { setContinuationNotice(null); workspace.openTask(task.id); }}
          onRetry={() => void dashboard.reload().catch(() => undefined)}
          actions={<>
            <button type="button" className="line-send-entry-button" onClick={requestLineDelivery}>ส่งงานใน LINE</button>
            <button type="button" className="create-task-button" onClick={() => openCreateContent()}>สร้างชิ้นงานใหม่</button>
          </>}
        />
        {continuationNotice && <p className="continuation-notice" role="status">{continuationNotice}</p>}
        <OverviewWorkspace />
        <ContentEditorDialog mode="edit" contentId={selectedTask?.id} open={isFullEditorOpen && Boolean(selectedTask)} onClose={() => setFullEditorOpen(false)} />
        <TaskDetailDrawer
          task={selectedTask ?? null}
          onClose={() => workspace.closeTask()}
          onEdit={() => setFullEditorOpen(true)}
          onChangeStatus={changeSelectedStatus}
          onToggleStep={toggleSelectedStep}
        />
        <LineSendComposer
          open={isLineComposerOpen}
          connectedRecipient={lineConnected}
          authenticatedAdmin={lineConnection.view === "authenticated"}
          recipientMasked={lineConnection.maskedRecipient}
          storageStatus={storageHealth.status}
          storageReason={storageHealth.reason}
          categories={dashboard.state?.categories ?? []}
          formats={dashboard.state?.formats ?? []}
          onCancel={() => { pendingLineTaskId.current = null; setLineComposerOpen(false); }}
          onSubmit={submitLineDraft}
        />
        <LineSendConfirmation
          task={lineSendTask}
          open={isLineConfirmationOpen}
          connectedRecipient={lineConnected}
          authenticatedAdmin={lineConnection.view === "authenticated"}
          recipientMasked={lineConnection.maskedRecipient}
          expectedUpdatedAt={lineSendTask?.updatedAt ?? null}
          onCancel={() => { setLineConfirmationOpen(false); setLineSendTask(null); }}
          onConfirm={async (): Promise<LineDeliveryResult> => {
            if (!lineSendTask?.updatedAt) return { id: "", status: "failed", errorCategory: "stale_content", sentAt: null };
            let response: Response;
            try {
              response = await fetch("/api/line/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contentId: lineSendTask.id, expectedUpdatedAt: lineSendTask.updatedAt }),
              });
            } catch {
              return { id: "", status: "failed", errorCategory: "provider", sentAt: null };
            }
            let payload: { delivery?: LineDeliveryResult; error?: string } = {};
            try { payload = await response.json() as typeof payload; } catch { /* keep the public error generic */ }
            if (!response.ok || !payload.delivery) {
              return { id: "", status: "failed", errorCategory: payload.error ?? "provider", sentAt: null };
            }
            if (payload.delivery.status === "sent" && lineSendTask) {
              try {
                await dashboard.reload();
              } catch {
                // LINE accepted the message; a refresh failure must not prompt a duplicate delivery.
                setContinuationNotice("ส่ง LINE แล้ว แต่รีเฟรชสถานะไม่สำเร็จ ระบบจะลองอัปเดตอีกครั้ง");
              }
            }
            return payload.delivery;
          }}
        />
      </>}
      {activeWorkspace === "production-board" && <ProductionBoardWorkspace />}
      {activeWorkspace === "settings" && <SettingsWorkspace />}
      {activeWorkspace === "media-library" && <MediaLibraryWorkspace />}
      {activeWorkspace === "references" && <ReferencesWorkspace blobStore={mediaBlobStore} />}
      {activeWorkspace === "caption-templates" && <CaptionTemplatesWorkspace />}
      {activeWorkspace === "calendar" && <ContentCalendarWorkspace onCreateTask={(date) => openCreateContent(date)} />}
      {activeWorkspace === "action-plan" && <ActionPlanWorkspace />}
      {activeWorkspace === "corrections" && <CorrectionsWorkspace onOpenContent={(contentId) => {
        workspace.openTask(contentId);
        setActiveWorkspace("overview");
        setFullEditorOpen(true);
      }} />}
      {activeWorkspace === "make-delivery" && <MakeDeliveryWorkspace />}
      {activeWorkspace === "team-report" && <TeamReportWorkspace
        onOpenContent={(id) => { workspace.openTask(id); setActiveWorkspace("overview"); setFullEditorOpen(true); }}
        onOpenActionPlan={() => setActiveWorkspace("action-plan")}
        renderActions={(filters) => <ReportActions kind="team" filters={filters} />}
        renderAnalysis={(filters) => <ReportAnalysisPanel kind="team" filters={filters} onOpenContent={(id) => { workspace.openTask(id); setActiveWorkspace("overview"); setFullEditorOpen(true); }} />}
        renderSaved={() => <SavedReportsPanel kind="team" />}
      />}
      {activeWorkspace === "content-report" && (!dashboard.state ? <ReportRecoveryWorkspace /> : <>
        <InsightsReportWorkspace
          onOpenContent={(id) => { workspace.openTask(id); setActiveWorkspace("overview"); setFullEditorOpen(true); }}
          renderActions={(filters) => <ReportActions kind="content" filters={filters} />}
          renderAnalysis={(filters) => <ReportAnalysisPanel kind="content" filters={filters} onOpenContent={(id) => { workspace.openTask(id); setActiveWorkspace("overview"); setFullEditorOpen(true); }} />}
          renderSaved={() => <SavedReportsPanel kind="content" />}
          renderSources={(filters) => <><ReportConnectionsPanel range={filters.range} /><details className="report-panel"><summary>นำเข้าและจับคู่กับปฏิทิน (ไม่จำเป็นสำหรับดูตัวเลข)</summary><ReportImportPanel /></details></>}
        />
      </>)}
      <CreateContentModal open={workspace.isCreateOpen} onClose={() => { workspace.setCreateOpen(false); setCreateInitialDate(""); }} onCreate={createTask} categories={dashboard.state?.categories.map((category) => category.name) ?? []} formats={dashboard.state?.formats.map((format) => format.name) ?? []} ownerOptions={dashboard.state?.ownerOptions ?? []} defaultOwner={lastOwner} initialDate={createInitialDate} allowedPlatformsByFormat={Object.fromEntries((dashboard.state?.formats ?? []).map((format) => [format.name, format.allowedPlatforms]))} />
    </main>
  </AppShell>;
}

export function HomePage({ repository, mediaBlobStore }: { repository?: DashboardRepository; mediaBlobStore?: MediaBlobStore } = {}) {
  const activeBlobStore = useMemo(() => mediaBlobStore ?? new IndexedDbMediaBlobStore(), [mediaBlobStore]);
  return <DashboardDataProvider repository={repository}><HomePageContent mediaBlobStore={activeBlobStore} /></DashboardDataProvider>;
}
