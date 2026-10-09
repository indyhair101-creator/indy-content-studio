const nextBuildArguments = ["--dir", "apps/indy-content-studio", "build"];

export function productionBuildInvocation(
  platform = process.platform,
  commandInterpreter = process.env.ComSpec ?? "cmd.exe",
) {
  if (platform === "win32") {
    return {
      command: commandInterpreter,
      args: ["/d", "/s", "/c", `pnpm.cmd ${nextBuildArguments.join(" ")}`],
      options: { stdio: "inherit" },
    };
  }

  return {
    command: "pnpm",
    args: nextBuildArguments,
    options: { stdio: "inherit" },
  };
}
