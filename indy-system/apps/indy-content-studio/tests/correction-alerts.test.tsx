import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCorrectionAlerts } from "../features/notifications/useCorrectionAlerts";
import { CorrectionToasts } from "../features/notifications/components/CorrectionToasts";
import { playChime } from "../features/notifications/chime";

vi.mock("../features/notifications/chime", () => ({ playChime: vi.fn(() => true), unlockChime: vi.fn() }));

const correction = { id: "line-evt-1", contentId: "c1", contentTitle: "สอนไดร์ผมวอลลุ่ม", comment: "ขอเปลี่ยนเพลง", receivedAt: "2026-10-15T04:10:00.000Z" };

function Probe({ intervalMs = 1000 }: { intervalMs?: number }) {
  const alerts = useCorrectionAlerts({ intervalMs });
  return <>
    <output data-testid="count">{alerts.unseenCount}</output>
    <CorrectionToasts alerts={alerts.alerts} onOpen={() => alerts.markAllSeen()} onDismiss={alerts.dismiss} />
  </>;
}

beforeEach(() => { localStorage.clear(); document.title = "INDY Content Studio"; });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("correction alerts", () => {
  it("starts quietly on the first visit so old corrections do not ring", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<Probe />);
    await waitFor(() => expect(localStorage.getItem("indy:corrections-seen-at")).not.toBeNull());
    expect(fetcher).not.toHaveBeenCalled();
    expect(playChime).not.toHaveBeenCalled();
  });

  it("pops a toast, rings once, counts it in the tab title and only asks for newer items next time", async () => {
    localStorage.setItem("indy:corrections-seen-at", "2026-10-15T03:00:00.000Z");
    const fetcher = vi.fn(async (_url: string) => Response.json({ corrections: [correction] }));
    vi.stubGlobal("fetch", fetcher);

    render(<Probe />);

    expect(await screen.findByText("มีงานแก้ส่งมา!")).toBeVisible();
    expect(screen.getByText("สอนไดร์ผมวอลลุ่ม")).toBeVisible();
    expect(screen.getByText("“ขอเปลี่ยนเพลง”")).toBeVisible();
    expect(playChime).toHaveBeenCalledOnce();
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(document.title).toBe("(1) INDY Content Studio");
    expect(fetcher.mock.calls[0][0]).toBe("/api/corrections/recent?since=2026-10-15T03%3A00%3A00.000Z");
    expect(localStorage.getItem("indy:corrections-seen-at")).toBe(correction.receivedAt);

    fireEvent.click(screen.getByRole("button", { name: "ดูงานที่ต้องแก้" }));
    expect(screen.queryByText("มีงานแก้ส่งมา!")).not.toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("INDY Content Studio"));
  });

  it("checks again on the interval and stays silent when nothing is new or the server is down", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem("indy:corrections-seen-at", "2026-10-15T03:00:00.000Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ corrections: [] }))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ corrections: [correction] }));
    vi.stubGlobal("fetch", fetcher);

    render(<Probe intervalMs={1000} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(playChime).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await screen.findByText("มีงานแก้ส่งมา!")).toBeVisible();
    expect(playChime).toHaveBeenCalledOnce();
  });

  it("rings only once for a correction even if the server keeps returning it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem("indy:corrections-seen-at", "2026-10-15T03:00:00.000Z");
    const fetcher = vi.fn(async () => Response.json({ corrections: [correction] }));
    vi.stubGlobal("fetch", fetcher);

    render(<Probe intervalMs={1000} />);
    expect(await screen.findByText("มีงานแก้ส่งมา!")).toBeVisible();
    // Simulate a stale cursor so the time filter alone would let the row through again.
    localStorage.setItem("indy:corrections-seen-at", "2026-10-15T03:00:00.000Z");
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(playChime).toHaveBeenCalledOnce();
    expect(screen.getAllByText("มีงานแก้ส่งมา!")).toHaveLength(1);
  });

  it("raises a desktop notification when the tab is in the background and permission is granted", async () => {
    localStorage.setItem("indy:corrections-seen-at", "2026-10-15T03:00:00.000Z");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ corrections: [correction] })));
    const created: Array<{ title: string; options: NotificationOptions }> = [];
    class FakeNotification {
      static permission = "granted";
      onclick: (() => void) | null = null;
      constructor(title: string, options: NotificationOptions) { created.push({ title, options }); }
      close() {}
    }
    vi.stubGlobal("Notification", FakeNotification);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    render(<Probe />);

    await waitFor(() => expect(created).toEqual([{ title: "มีงานแก้ส่งมา", options: { body: "สอนไดร์ผมวอลลุ่ม — ขอเปลี่ยนเพลง", tag: "indy-corrections" } }]));
    visibility.mockRestore();
  });
});
