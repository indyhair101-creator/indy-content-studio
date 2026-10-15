"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecentCorrection } from "../line-oa/server/correction-feed";
import { playChime, unlockChime } from "./chime";

export const CORRECTION_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const CURSOR_KEY = "indy:corrections-seen-at";
const SOUND_KEY = "indy:corrections-sound";

export type NotificationPermissionState = NotificationPermission | "unsupported";

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* alerts still work for this page */ }
}

function permissionState(): NotificationPermissionState {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

function describe(correction: RecentCorrection): string {
  const title = correction.contentTitle ?? "งานที่ไม่ได้ระบุชิ้นงาน";
  return correction.comment ? `${title} — ${correction.comment}` : title;
}

/**
 * Checks for new LINE "ไม่ผ่าน" replies every two minutes while the app is open.
 * New items pop a toast, play the chime, and raise a desktop notification when the tab is in the background.
 */
export function useCorrectionAlerts({ enabled = true, intervalMs = CORRECTION_CHECK_INTERVAL_MS, onArrived }: { enabled?: boolean; intervalMs?: number; onArrived?: (items: RecentCorrection[]) => void } = {}) {
  const [alerts, setAlerts] = useState<RecentCorrection[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [permission, setPermission] = useState<NotificationPermissionState>(permissionState);
  const [soundOn, setSoundOn] = useState(() => readStorage(SOUND_KEY) !== "off");
  const soundRef = useRef(soundOn);
  const onArrivedRef = useRef(onArrived);
  soundRef.current = soundOn;
  onArrivedRef.current = onArrived;

  const announce = useCallback((items: RecentCorrection[]) => {
    setAlerts((current) => [...items.filter((item) => !current.some((shown) => shown.id === item.id)), ...current].slice(0, 4));
    setUnseenCount((count) => count + items.length);
    if (soundRef.current) playChime();
    if (permissionState() === "granted" && document.visibilityState !== "visible") {
      const first = items[0];
      const notification = new Notification(items.length > 1 ? `มีงานแก้ส่งมา ${items.length} งาน` : "มีงานแก้ส่งมา", { body: describe(first), tag: "indy-corrections" });
      notification.onclick = () => { window.focus(); notification.close(); };
    }
    onArrivedRef.current?.(items);
  }, []);

  const check = useCallback(async () => {
    const since = readStorage(CURSOR_KEY);
    if (!since) { writeStorage(CURSOR_KEY, new Date().toISOString()); return; }
    let response: Response;
    try {
      response = await fetch(`/api/corrections/recent?since=${encodeURIComponent(since)}`, { cache: "no-store" });
    } catch { return; }
    if (!response.ok) return;
    const payload = await response.json().catch(() => ({})) as { corrections?: RecentCorrection[] };
    const fresh = (payload.corrections ?? []).filter((item) => item.receivedAt > since);
    if (!fresh.length) return;
    writeStorage(CURSOR_KEY, fresh.reduce((latest, item) => item.receivedAt > latest ? item.receivedAt : latest, since));
    announce(fresh);
  }, [announce]);

  useEffect(() => {
    if (!enabled) return;
    void check();
    const timer = window.setInterval(() => void check(), intervalMs);
    const unlock = () => unlockChime();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [enabled, intervalMs, check]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unseenCount > 0 ? `(${unseenCount}) ${base}` : base;
  }, [unseenCount]);

  const requestPermission = useCallback(async () => {
    if (permissionState() !== "default") return;
    setPermission(await Notification.requestPermission());
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((current) => {
      writeStorage(SOUND_KEY, current ? "off" : "on");
      if (!current) { unlockChime(); playChime(); }
      return !current;
    });
  }, []);

  return {
    alerts,
    unseenCount,
    permission,
    soundOn,
    dismiss: useCallback((id: string) => setAlerts((current) => current.filter((item) => item.id !== id)), []),
    markAllSeen: useCallback(() => { setAlerts([]); setUnseenCount(0); }, []),
    requestPermission,
    toggleSound,
    checkNow: check,
  };
}
