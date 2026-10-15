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
  const needsConfirmedReadRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  const applySnapshot = useCallback((next: DashboardState) => {
    const snapshot = cloneDashboardState(next);
    stateRef.current = snapshot;
    needsConfirmedReadRef.current = false;
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
    // Initial load and explicit reload only. Saves still publish their confirmed snapshot.
    return unsubscribe;
  }, [activeRepository, applySnapshot, loadAndTrack]);

  const mutate = useCallback(async (mutation: DashboardMutation) => {
    const run = async () => {
      if (!stateRef.current || needsConfirmedReadRef.current) {
        try {
          applySnapshot(await activeRepository.read());
        } catch (caught) {
          const nextError = caught instanceof Error ? caught : new Error("โหลดข้อมูลไม่สำเร็จ");
          setError(nextError);
          if (!stateRef.current) setStatus("error");
          throw nextError;
        }
      }
      const current = stateRef.current;
      if (!current) throw new Error("ข้อมูลยังโหลดไม่เสร็จ");

      try {
        const next = mutation(cloneDashboardState(current));
        const persisted = await activeRepository.write(next);
        if (persisted) applySnapshot(persisted);
        else {
          // The commit succeeded. A failed follow-up read must not invite a duplicate save.
          try { applySnapshot(await activeRepository.read()); }
          catch {
            needsConfirmedReadRef.current = true;
            setError(new Error("บันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณาโหลดใหม่ก่อนแก้ไขต่อ"));
          }
        }
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
