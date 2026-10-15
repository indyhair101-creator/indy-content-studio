import type { ReactElement } from "react";

export type GameIconName =
  | "overview" | "calendar" | "action-plan" | "production-board" | "corrections" | "media-library"
  | "references" | "caption-templates" | "make-delivery" | "team-report" | "content-report" | "settings"
  | "search" | "bell";

const ink = "#2a1a10";
const line = { stroke: ink, strokeWidth: 2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

const shapes: Record<GameIconName, ReactElement> = {
  overview: (
    <>
      <circle cx="15" cy="17" r="11" fill="#f3e3c8" {...line} />
      <circle cx="15" cy="17" r="7" fill="#d5523e" {...line} />
      <circle cx="15" cy="17" r="3" fill="#f3e3c8" {...line} />
      <path d="M15 17 26 6" {...line} fill="none" />
      <path d="M26 6V2.5l3 2.5-3 1Z" fill="#f1b42f" {...line} />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="6" width="24" height="22" rx="3" fill="#f3e3c8" {...line} />
      <path d="M4 9a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v4H4Z" fill="#d5523e" {...line} />
      <path d="M10 3.5v5M22 3.5v5" {...line} fill="none" />
      <rect x="9" y="17" width="5" height="4" rx="1" fill="#2a9d9a" {...line} />
      <path d="M18 19h5M9 24h14" {...line} fill="none" />
    </>
  ),
  "action-plan": (
    <>
      <path d="M8 4h17a3 3 0 0 1 3 3v1h-4v19a2 2 0 0 1-2 2H7" fill="#f3e3c8" {...line} />
      <path d="M8 4a3 3 0 0 0-3 3v19a3 3 0 0 0 3 3 2 2 0 0 0 2-2V7a3 3 0 0 0-2-3Z" fill="#d9bf98" {...line} />
      <path d="m13 13 2.5 2.5L20 11" stroke="#5f7d22" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M13 21h7" {...line} fill="none" />
    </>
  ),
  "production-board": (
    <>
      <rect x="4" y="13" width="24" height="15" rx="2" fill="#3b2a20" {...line} />
      <path d="m4 13 23-6 1.2 4.6L5 17.5Z" fill="#f3e3c8" {...line} />
      <path d="m9 11.7 2.8 4.4M15 10.1l2.8 4.4M21 8.6l2.8 4.4" {...line} fill="none" />
      <path d="M9 21h14" stroke="#f1b42f" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  corrections: (
    <>
      <path d="M21.5 4.5a6 6 0 0 0-6.8 7.9L5 22.1a2.6 2.6 0 0 0 3.7 3.7l9.7-9.7a6 6 0 0 0 7.9-6.8l-3.5 3.5-3.5-1-1-3.5Z" fill="#9aa1a8" {...line} />
      <circle cx="7.6" cy="24.2" r="1.2" fill={ink} />
    </>
  ),
  "media-library": (
    <>
      <path d="M4 14h24v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" fill="#a8693f" {...line} />
      <path d="M4 14v-3a7 7 0 0 1 7-7h10a7 7 0 0 1 7 7v3Z" fill="#c4834f" {...line} />
      <path d="M10 4.5V28M22 4.5V28" stroke="#f1b42f" strokeWidth="3" />
      <path d="M10 4.5V28M22 4.5V28" {...line} strokeWidth="1" fill="none" />
      <rect x="13" y="12" width="6" height="6" rx="1.2" fill="#f1b42f" {...line} />
    </>
  ),
  references: (
    <>
      <path d="M16 3a9 9 0 0 0-5.4 16.2c.9.7 1.4 1.6 1.4 2.8h8c0-1.2.5-2.1 1.4-2.8A9 9 0 0 0 16 3Z" fill="#f1b42f" {...line} />
      <path d="M12 22h8v3a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2Z" fill="#9aa1a8" {...line} />
      <path d="M12.5 9.5a4.5 4.5 0 0 1 3.5-2" stroke="#fff6dc" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  "caption-templates": (
    <>
      <path d="M27 4C17 5 10 12 8 22l3 1c4-7 9-12 16-19Z" fill="#f3e3c8" {...line} />
      <path d="M8 22 5 28" {...line} fill="none" />
      <path d="M13 15.5 18 17M17 10.5l4.5 1.5" {...line} fill="none" />
      <path d="M14 28h13" stroke="#2a9d9a" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  "make-delivery": (
    <>
      <path d="M28 4 3 14.5l9 3.5 3.5 9Z" fill="#f3e3c8" {...line} />
      <path d="m28 4-16 14v6.5" {...line} fill="none" />
      <path d="M12 18 28 4" stroke="#2a9d9a" strokeWidth="2" />
    </>
  ),
  "team-report": (
    <>
      <path d="M9 4h14v7a7 7 0 0 1-14 0Z" fill="#f1b42f" {...line} />
      <path d="M9 7H5v2a5 5 0 0 0 5 5M23 7h4v2a5 5 0 0 1-5 5" {...line} fill="none" />
      <path d="M16 18v4" {...line} />
      <path d="M10 28a6 6 0 0 1 12 0Z" fill="#a8693f" {...line} />
      <path d="M14 9.5h4" stroke="#fff6dc" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  "content-report": (
    <>
      <rect x="4" y="4" width="24" height="24" rx="3" fill="#f3e3c8" {...line} />
      <rect x="8" y="16" width="4" height="8" rx="1" fill="#2a9d9a" {...line} />
      <rect x="14" y="10" width="4" height="14" rx="1" fill="#d5523e" {...line} />
      <rect x="20" y="13" width="4" height="11" rx="1" fill="#f1b42f" {...line} />
    </>
  ),
  settings: (
    <>
      <path d="M13.6 3h4.8l.7 3.6 2.6 1.1 3-2.1 3.4 3.4-2.1 3 1.1 2.6 3.6.7v4.8l-3.6.7-1.1 2.6 2.1 3-3.4 3.4-3-2.1-2.6 1.1-.7 3.6h-4.8l-.7-3.6-2.6-1.1-3 2.1-3.4-3.4 2.1-3-1.1-2.6L2 18.4v-4.8l3.6-.7 1.1-2.6-2.1-3 3.4-3.4 3 2.1 2.6-1.1Z" fill="#9aa1a8" {...line} />
      <circle cx="16" cy="16" r="4.5" fill="#f3e3c8" {...line} />
    </>
  ),
  search: (
    <>
      <circle cx="13.5" cy="13.5" r="8.5" fill="#cfe9e6" {...line} />
      <path d="m20 20 7.5 7.5" stroke={ink} strokeWidth="4" strokeLinecap="round" />
      <path d="M9.5 11a4.5 4.5 0 0 1 3.5-2.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  bell: (
    <>
      <path d="M16 4a8 8 0 0 0-8 8v6l-3 4h22l-3-4v-6a8 8 0 0 0-8-8Z" fill="#f1b42f" {...line} />
      <path d="M12.5 25a3.5 3.5 0 0 0 7 0" fill="#a8693f" {...line} />
      <path d="M11.5 11a5 5 0 0 1 3-3.5" stroke="#fff6dc" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
};

export function GameIcon({ name, size = 26 }: { name: GameIconName; size?: number }) {
  return (
    <svg className="game-icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {shapes[name]}
    </svg>
  );
}
