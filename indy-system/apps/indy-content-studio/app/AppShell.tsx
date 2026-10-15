"use client";

import type { ReactNode } from "react";
import { GameIcon, type GameIconName } from "./GameIcon";

export const navigationItems = [
  { id: "overview", label: "ภาพรวม", fullLabel: "ภาพรวมและเป้าหมาย" },
  { id: "action-plan", label: "Action Plan", fullLabel: "Action Plan" },
  { id: "calendar", label: "ปฏิทินคอนเทนต์", fullLabel: "ปฏิทินคอนเทนต์" },
  { id: "production-board", label: "บอร์ดการผลิต", fullLabel: "บอร์ดการผลิต" },
  { id: "corrections", label: "งานที่ต้องแก้", fullLabel: "งานที่ต้องแก้" },
  { id: "make-delivery", label: "คิวส่ง Make", fullLabel: "ส่งโพสต์ผ่าน Make" },
  { id: "media-library", label: "คลังสื่อ", fullLabel: "คลังสื่อ" },
  { id: "references", label: "Reference และไอเดีย", fullLabel: "Reference และไอเดีย" },
  { id: "caption-templates", label: "แม่แบบแคปชัน", fullLabel: "แม่แบบแคปชั่น" },
  { id: "team-report", label: "การทำงานของทีม", fullLabel: "Report การทำงานของทีม" },
  { id: "content-report", label: "ข้อมูลเชิงลึก", fullLabel: "Report ข้อมูลเชิงลึก" },
  { id: "settings", label: "ตั้งค่าและข้อมูล", fullLabel: "ตั้งค่าและข้อมูล" },
] as const;

export type WorkspaceItem = (typeof navigationItems)[number]["id"];

/** Six destinations; related workspaces sit behind sub-tabs in the header. */
export const navigationGroups: ReadonlyArray<{ id: string; label: string; icon: GameIconName; items: readonly WorkspaceItem[] }> = [
  { id: "today", label: "วันนี้", icon: "overview", items: ["overview", "action-plan"] },
  { id: "calendar", label: "ปฏิทิน", icon: "calendar", items: ["calendar"] },
  { id: "production", label: "งานผลิต", icon: "production-board", items: ["production-board", "corrections", "make-delivery"] },
  { id: "library", label: "คลัง", icon: "media-library", items: ["media-library", "references", "caption-templates"] },
  { id: "reports", label: "รายงาน", icon: "content-report", items: ["team-report", "content-report"] },
  { id: "settings", label: "ตั้งค่า", icon: "settings", items: ["settings"] },
];

export function groupOf(item: WorkspaceItem) {
  return navigationGroups.find((group) => group.items.includes(item)) ?? navigationGroups[0];
}

export function AppShell({ children, activeItem = "overview", onNavigate, headerAside }: { children: ReactNode; activeItem?: WorkspaceItem; onNavigate?: (item: WorkspaceItem) => void; headerAside?: ReactNode }) {
  const activeGroup = groupOf(activeItem);
  const subItems = activeGroup.items.map((id) => navigationItems.find((item) => item.id === id)!);

  return (
    <div className="app-shell">
      <nav className="dashboard-nav" aria-label="เมนูแดชบอร์ด">
        <div className="rail-brand" aria-label="INDY Content Studio">
          <span className="rail-brand-seal" aria-hidden="true">INDY</span>
          <span className="rail-brand-name" aria-hidden="true">Content Studio</span>
        </div>
        {navigationGroups.map((group) => (
          <button key={group.id} type="button" className="rail-button" aria-label={group.label} aria-current={group.id === activeGroup.id ? "page" : undefined} data-tooltip={group.label} onClick={() => onNavigate?.(group.items[0])}>
            <span className="rail-icon" aria-hidden="true"><GameIcon name={group.icon} /></span>
            <span className="rail-label">{group.label}</span>
          </button>
        ))}
      </nav>
      <div className="workspace-frame">
        <header className="command-capsule">
          {subItems.length > 1
            ? <nav className="workspace-tabs" aria-label={`หน้าย่อยใน ${activeGroup.label}`}>
              {subItems.map((item) => <button key={item.id} type="button" className="workspace-tab" aria-current={item.id === activeItem ? "page" : undefined} onClick={() => onNavigate?.(item.id)}>{item.label}</button>)}
            </nav>
            : <span className="workspace-tabs-spacer" />}
          {headerAside && <div className="command-aside">{headerAside}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}
