import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./game-theme.css";

export const metadata: Metadata = {
  title: "INDY Content Studio",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
