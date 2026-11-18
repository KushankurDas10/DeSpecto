import type { Root, RootContent, Definition, Image, Link } from "mdast";
import { posix } from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";

const shellLanguages = new Set(["", "bash", "sh", "shell", "console", "zsh", "shell-session", "powershell", "ps1", "cmd", "bat"]);
const scaffold = /^(?:npm\s+(?:init\s+[^-\s]|create\s+)|(?:pnpm|yarn|bun)\s+create\s+|npx\s+(?:(?:@[^/\s]+\/)?create-|\S+\s+(?:new|init)\b))/;

export function readmeReferences(contents: string) {
  const tree = fromMarkdown(contents);
  const links: Array<{ line: number; destination: string; column: number | null }> = [];
  const scripts: Array<{ line: number; name: string; manifest: string }> = [];
  const definitions = new Map<string, Definition>();
  const references = new Set<string>();
  let directory: string | null = ".";
  let headingDepth = 0;
  let scopeDepth = 0;

  function inspectCommand(raw: string, line: number) {
    for (const segment of raw.trim().replace(/^\$\s+/, "").split(/\s+&&\s+/)) {
      const move = /^cd\s+("[^"]+"|'[^']+'|[^\s;]+)$/.exec(segment.trim());
      if (move) {
        const folder = move[1].replace(/^["']|["']$/g, "");
        if (directory !== null && /^\.?[\w./-]*$/.test(folder) && !folder.startsWith("/")) {
          const destination: string = posix.join(directory, folder);
          directory = destination === ".." || destination.startsWith("../") ? null : destination;
        } else {
          directory = null;
        }
        scopeDepth = headingDepth;
        continue;
      }
      if (scaffold.test(segment)) {
        directory = null;
        scopeDepth = headingDepth;
        continue;
      }
      if (directory === null || /\s(?:--prefix|--dir|--workspace|-w)(?:\s|=)/.test(segment)) continue;
      const script = /^(?:npm|pnpm|yarn)\s+(?:run|run-script)\s+([\w:-]+)(?=\s|$)/.exec(segment)?.[1];
      if (script) scripts.push({ line, name: script, manifest: posix.join(directory, "package.json") });
    }
  }

  function visit(node: Root | RootContent) {
    if (!node.position) return;
    const line = node.position.start.line;
    if (node.type === "heading") {
      headingDepth = node.depth;
      if (headingDepth <= scopeDepth) directory = ".";
      return;
    }
    if (node.type === "code" && shellLanguages.has(node.lang?.toLowerCase() ?? "")) {
      const opener = contents.slice(node.position.start.offset, (node.position.start.offset ?? 0) + 3);
      const first = line + (opener === "```" || opener === "~~~" ? 1 : 0);
      for (const [offset, text] of node.value.split("\n").entries()) inspectCommand(text, first + offset);
    }
    if (node.type === "inlineCode") inspectCommand(node.value, line);
    if (node.type === "link" || node.type === "image") links.push(linkFrom(node));
    if (node.type === "definition" && !definitions.has(node.identifier)) definitions.set(node.identifier, node);
    if (node.type === "linkReference" || node.type === "imageReference") references.add(node.identifier);
    if ("children" in node) for (const child of node.children) visit(child);
  }

  visit(tree);
  for (const identifier of references) {
    const definition = definitions.get(identifier);
    if (definition) links.push(linkFrom(definition));
  }
  return { links, scripts };

  function linkFrom(node: Link | Image | Definition) {
    const { start, end } = node.position!;
    const raw = contents.slice(start.offset, end.offset);
    const opener = raw.lastIndexOf("](");
    const offset = start.line === end.line && opener >= 0 ? raw.indexOf(node.url, opener + 2) : -1;
    return {
      line: start.line,
      destination: node.url,
      // Only offer a patch when the exact source slice for the destination is known.
      column: offset < 0 ? null : start.column - 1 + offset,
    };
  }
}
