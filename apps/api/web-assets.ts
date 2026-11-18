import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const modules: Readonly<Record<string, string>> = {
  "app.js": "app.ts",
  "dom.js": "dom.ts",
  "report.js": "report.ts",
  "walkthrough.js": "walkthrough.ts",
  "export.js": "export.ts",
};

export async function webAsset(name: string) {
  const directory = resolve(process.cwd(), "apps/web");
  if (name === "style.css") {
    return { text: await readFile(resolve(directory, name), "utf8"), type: "text/css; charset=utf-8" };
  }
  if (!Object.hasOwn(modules, name)) return null;
  const output = await build({
    entryPoints: [resolve(directory, modules[name])],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  });
  return { text: output.outputFiles[0].text, type: "text/javascript; charset=utf-8" };
}
