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
    <main className="login-screen">
      <form className="login-board" onSubmit={submit}>
        <div className="login-heading">
          <span className="login-seal" aria-hidden="true">INDY</span>
          <p className="login-kicker">INDY CONTENT STUDIO</p>
          <h1>เข้าสู่ระบบ</h1>
          <p>กรุณายืนยันตัวตนผู้ดูแลเพื่อดำเนินการต่อ</p>
        </div>
        <label className="login-field">
          รหัสผ่านผู้ดูแล
          <input
            autoComplete="current-password"
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" disabled={pending || !password} type="submit" aria-busy={pending}>
          {pending ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </main>
  );
}
