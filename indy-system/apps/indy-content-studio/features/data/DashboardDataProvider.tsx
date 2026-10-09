"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiDashboardRepository } from "./api-dashboard-repository";
import type { DashboardRepository } from "./dashboard-repository";
import { cloneDashboardState } from "./dashboard-repository";
import type { DashboardState } from "../domain/types";

export type DashboardLoadStatus = "loading" | "ready" | "error";
export type DashboardMutation = (current: DashboardState) => DashboardState;

export interface DashboardDataValue {
  state: DashboardState | null;
  status: DashboardLoadStatus;
  error: Error | null;
  mutate: (mutation: DashboardMutation) => Promise<void>;
  reload: () => Promise<void>;
}

const DashboardDataContext = createContext<DashboardDataValue | null>(null);

export function DashboardDataProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository?: DashboardRepository;
}) {
  const defaultRepository = useMemo(() => new ApiDashboardRepository(), []);
  const activeRepository = repository ?? defaultRepository;
  const [state, setState] = useState<DashboardState | null>(null);
  const [status, setStatus] = useState<DashboardLoadStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const stateRef = useRef<DashboardState | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  const applySnapshot = useCallback((next: DashboardState) => {
    const snapshot = cloneDashboardState(next);
    stateRef.current = snapshot;
    setState(snapshot);
    setStatus("ready");
    setError(null);
  }, []);

  const load = useCallback(async () => {
    // Background refresh must not reset an editor that keys its draft to load status.
    if (!stateRef.current) setStatus("loading");
    setError(null);

    try {
      applySnapshot(await activeRepository.read());
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error("โหลดข้อมูลไม่สำเร็จ");
      setError(nextError);
      if (!stateRef.current) setStatus("error");
      throw nextError;
    }
  }, [activeRepository, applySnapshot]);

  const loadAndTrack = useCallback(() => {
    if (loadPromiseRef.current) return loadPromiseRef.current;
    // Reads share the write queue so an older response cannot overwrite a save.
    const pending = queueRef.current.then(load, load);
    queueRef.current = pending.then(() => undefined, () => undefined);
    loadPromiseRef.current = pending;
    const clearPending = () => {
      if (loadPromiseRef.current === pending) loadPromiseRef.current = null;
    };
    void pending.then(clearPending, clearPending);
    return pending;
  }, [load]);

  useEffect(() => {
    const unsubscribe = activeRepository.subscribe(applySnapshot);
    void loadAndTrack().catch(() => undefined);
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "hidden") void loadAndTrack().catch(() => undefined);
    };
    const interval = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [activeRepository, applySnapshot, loadAndTrack]);

  const mutate = useCallback(async (mutation: DashboardMutation) => {
    const run = async () => {
      if (!stateRef.current) {
        try {
          applySnapshot(await activeRepository.read());
        } catch (caught) {
          const nextError = caught instanceof Error ? caught : new Error("โหลดข้อมูลไม่สำเร็จ");
          setError(nextError);
          setStatus("error");
          throw nextError;
        }
      }
      const current = stateRef.current;
      if (!current) throw new Error("ข้อมูลยังโหลดไม่เสร็จ");

      try {
        const next = mutation(cloneDashboardState(current));
        await activeRepository.write(next);
        applySnapshot(next);
      } catch (caught) {
        const nextError = caught instanceof Error ? caught : new Error("บันทึกข้อมูลไม่สำเร็จ");
        setError(nextError);
        if (!stateRef.current) setStatus("error");
        throw nextError;
      }
    };

    const next = queueRef.current.then(run, run);
    queueRef.current = next.then(() => undefined, () => undefined);
    await next;
  }, [activeRepository, applySnapshot]);

  const value = useMemo<DashboardDataValue>(() => ({
    state,
    status,
    error,
    mutate,
    reload: loadAndTrack,
  }), [error, loadAndTrack, mutate, state, status]);

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData(): DashboardDataValue {
  const value = useContext(DashboardDataContext);
  if (!value) throw new Error("useDashboardData ต้องอยู่ภายใน DashboardDataProvider");
  return value;
}
