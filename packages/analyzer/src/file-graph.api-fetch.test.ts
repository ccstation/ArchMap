import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildFileGraph } from "./file-graph.js";

describe("buildFileGraph extended fetch → API routes", () => {
  let tmpRoot: string | undefined;

  afterEach(() => {
    if (tmpRoot && fs.existsSync(tmpRoot))
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it("links common Next.js fetch patterns to app router route files", () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "archmap-api-fetch-"));
    const root = tmpRoot;
    const apiHello = path.join(root, "app/api/hello/route.ts");
    const apiNest = path.join(root, "app/api/widgets/foo/route.tsx");
    const client = path.join(root, "app/dashboard/client.tsx");
    fs.mkdirSync(path.dirname(apiHello), { recursive: true });
    fs.mkdirSync(path.dirname(apiNest), { recursive: true });
    fs.mkdirSync(path.dirname(client), { recursive: true });

    fs.writeFileSync(apiHello, "export async function GET() { return new Response(); }\n");
    fs.writeFileSync(apiNest, "export async function POST() { return new Response(); }\n");
    fs.writeFileSync(
      client,
      `
      declare const x: string;
      declare const base: string;
      export async function demo() {
        fetch("/api/hello");
        fetch(\`/api/hello\`);
        fetch(\`/api/hello/\${x}\`);
        fetch("/api/hello?ref=1");
        fetch(new URL("/api/hello", window.location.origin));
        ((fetch as typeof fetch))(("/api/hello" as string));
        window.fetch("/api/hello");
        globalThis.fetch('/api/hello');
        self.fetch("/api/hello");
        fetch("/api" + "/hello");
        fetch("/api/widgets/foo/sub");
      }
    `,
    );

    const files = [apiHello, apiNest, client];
    const graph = buildFileGraph({ rootPath: root, files, hasTsconfig: false });

    const apiEdges = graph.internalEdges.filter((e) => e.type === "api");

    const fromClient = apiEdges.filter(
      (e) => path.normalize(e.sourceFilePath) === path.normalize(client),
    );
    const helloTargets = fromClient.filter(
      (e) => path.normalize(e.targetFilePath) === path.normalize(apiHello),
    );

    expect(helloTargets.length).toBeGreaterThanOrEqual(8);

    const widgetsEdge = fromClient.some(
      (e) =>
        path.normalize(e.targetFilePath) === path.normalize(apiNest) &&
        e.importSpecifier.includes("widgets"),
    );
    expect(widgetsEdge).toBe(true);

    expect(apiEdges.length).toBeGreaterThanOrEqual(9);
  });
});
