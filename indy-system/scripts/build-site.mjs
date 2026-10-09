import { spawn } from "node:child_process";
import { productionBuildInvocation } from "./build-site-config.mjs";

const { command, args, options } = productionBuildInvocation();
const child = spawn(command, args, options);

await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => code === 0
    ? resolve(undefined)
    : reject(new Error(`INDY Next.js build failed with exit code ${code ?? "unknown"}`)));
});
