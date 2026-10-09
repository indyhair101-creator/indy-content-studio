"use client";

import type { ReactNode } from "react";

export const navigationItems = [
  { id: "overview", label: "ภาพรวมและเป้าหมาย", icon: "⌂" },
  { id: "calendar", label: "ปฏิทินคอนเทนต์", icon: "◫" },
  { id: "action-plan", label: "Action Plan", icon: "✓" },
  { id: "production-board", label: "บอร์ดการผลิต", icon: "▦" },
  { id: "corrections", label: "งานที่ต้องแก้", icon: "↺" },
  { id: "media-library", label: "คลังสื่อ", icon: "▧" },
  { id: "references", label: "Reference และไอเดีย", icon: "✦" },
  { id: "caption-templates", label: "แม่แบบแคปชั่น", icon: "≡" },
  { id: "make-delivery", label: "ส่งโพสต์ผ่าน Make", icon: "↗" },
  { id: "settings", label: "ตั้งค่าและข้อมูล", icon: "⚙" },
] as const;

export type WorkspaceItem = (typeof navigationItems)[number]["id"];

export function AppShell({ children, activeItem = "overview", onNavigate }: { children: ReactNode; activeItem?: WorkspaceItem; onNavigate?: (item: WorkspaceItem) => void }) {
  return (
    <div className="app-shell">
      <nav className="dashboard-nav" aria-label="เมนูแดชบอร์ด">
        <div className="rail-brand" aria-label="INDY Content Studio">I</div>
        {navigationItems.map(({ id, label, icon }) => (
          <button key={id} type="button" className="rail-button" aria-label={label} aria-current={activeItem === id ? "page" : undefined} data-tooltip={label} onClick={() => onNavigate?.(id)}>
            <span aria-hidden="true">{icon}</span>
            <span className="rail-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="workspace-frame">
        <header className="command-capsule">
          <div className="profile-chip" aria-label="โปรไฟล์ INDY"><span aria-hidden="true">IN</span><span>INDY</span></div>
          <label className="workspace-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">ค้นหา</span>
            <input placeholder="ค้นหาไฟล์ งาน หรือไอเดีย" type="search" />
          </label>
          <button className="notification-button" type="button" aria-label="การแจ้งเตือน"><span aria-hidden="true">♧</span></button>
        </header>
        {children}
      </div>
    </div>
  );
}
