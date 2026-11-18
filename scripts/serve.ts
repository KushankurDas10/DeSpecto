import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const command = process.argv.includes("--production") ? "start" : "dev";
const child = spawn(process.execPath, [
  next, command, "--hostname", process.env.HOST ?? "127.0.0.1",
  "--port", process.env.PORT ?? "3000",
], { stdio: "inherit" });
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
