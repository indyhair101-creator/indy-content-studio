import { describe, expect, it } from "vitest";
import { productionBuildInvocation } from "../../../scripts/build-site-config.mjs";

describe("production deployment contract", () => {
  it("exposes a Next.js readiness endpoint", async () => {
    const route = await import("../app/api/ready/route").catch(() => null);

    expect(route).not.toBeNull();
    const response = await route!.GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("uses a Windows-safe command to build the Next.js app", () => {
    expect(productionBuildInvocation("win32", "C:\\Windows\\System32\\cmd.exe")).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd --dir apps/indy-content-studio build"],
      options: { stdio: "inherit" },
    });
  });
});
