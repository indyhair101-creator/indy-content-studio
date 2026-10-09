"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? "รหัสผ่านไม่ถูกต้อง" : "ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน");
        return;
      }
      const requestedPath = new URLSearchParams(window.location.search).get("next");
      const nextPath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//") && !requestedPath.includes("\\")
        ? requestedPath
        : "/";
      window.location.assign(nextPath);
    } catch {
      setError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setPending(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f5f2" }}>
      <form onSubmit={submit} style={{ width: "min(100%, 400px)", display: "grid", gap: 16, padding: 32, borderRadius: 20, background: "white", boxShadow: "0 18px 55px #18201812" }}>
        <div>
          <p style={{ margin: 0, color: "#58745c", fontSize: 13, fontWeight: 700, letterSpacing: ".08em" }}>INDY CONTENT STUDIO</p>
          <h1 style={{ margin: "10px 0 6px", fontSize: 26 }}>เข้าสู่ระบบ</h1>
          <p style={{ margin: 0, color: "#68716a" }}>กรุณายืนยันตัวตนผู้ดูแลเพื่อดำเนินการต่อ</p>
        </div>
        <label style={{ display: "grid", gap: 8, fontWeight: 600 }}>
          รหัสผ่านผู้ดูแล
          <input
            autoComplete="current-password"
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={{ padding: "12px 14px", border: "1px solid #d8ddd7", borderRadius: 10, font: "inherit" }}
          />
        </label>
        {error && <p role="alert" style={{ margin: 0, color: "#a12f2f" }}>{error}</p>}
        <button disabled={pending || !password} type="submit" style={{ padding: "12px 16px", border: 0, borderRadius: 10, background: "#315b3a", color: "white", font: "inherit", fontWeight: 700, cursor: pending ? "wait" : "pointer" }}>
          {pending ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </main>
  );
}
