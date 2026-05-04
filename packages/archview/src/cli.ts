#!/usr/bin/env node
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { analyzeRepository, writeSnapshot } from "@archmap/analyzer";
import type { Snapshot } from "@archmap/graph-model";
import { Command } from "commander";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function checkPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, host, () => {
      s.close(() => resolve(true));
    });
  });
}

async function allocatePort(preferred: number, host: string): Promise<number> {
  if (await checkPortAvailable(preferred, host)) return preferred;
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, host, () => {
      const addr = s.address();
      const p = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(p));
    });
  });
}

function standalonePaths(): { standaloneRoot: string; serverJs: string } {
  const standaloneRoot = path.resolve(__dirname, "../web-standalone");
  const serverJs = path.join(standaloneRoot, "apps/web/server.js");
  return { standaloneRoot, serverJs };
}

function openBrowser(url: string): void {
  try {
    if (process.platform === "darwin") execFileSync("open", [url], { stdio: "ignore" });
    else execFileSync("xdg-open", [url], { stdio: "ignore" });
  } catch {
    // ignore
  }
}

interface RunAnalyzeOptions {
  outPath?: string;
}

async function resolveSnapshotPath(opts: RunAnalyzeOptions): Promise<{
  absPath: string;
  /** Directory to remove on cleanup when using internal temp dir */
  tempDir: string | null;
}> {
  if (opts.outPath) {
    const abs = path.resolve(opts.outPath);
    return { absPath: abs, tempDir: null };
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "archview-"));
  const absPath = path.join(dir, "snapshot.json");
  return { absPath, tempDir: dir };
}

function exitCodeForViolations(
  snapshot: Snapshot,
  failOnViolations: boolean,
): number {
  if (!failOnViolations) return 0;
  return snapshot.violations.length > 0 ? 1 : 0;
}

/** pnpm/npm sometimes forward a literal `--` before script args; Commander treats it as “operands only”. */
function userArgsFromArgv(argv: string[]): string[] {
  const rest = argv.slice(2);
  let i = 0;
  while (rest[i] === "--") i += 1;
  return rest.slice(i);
}

async function run(): Promise<void> {
  const program = new Command();

  program
    .name("archview")
    .description("Analyze a repository and explore its architecture in the browser")
    .option("--src <path>", "Repository root to analyze", process.cwd())
    .option("-o, --out <file>", "Write snapshot JSON to this path")
    .option("--analyze-only", "Analyze and exit (do not start the web UI)")
    .option(
      "--json",
      "Print snapshot JSON to stdout after analysis (with web UI, prints before the server starts)",
    )
    .option(
      "--skip-fail-on-violations",
      "Do not exit with status 1 when violations are present (analyze-only)",
    )
    .option("--strict", "If violations are present, exit before starting the server")
    .option("--port <n>", "Port to bind (default 3000, or next free port)", "3000")
    .option("--host <address>", "Host to bind (default 127.0.0.1)", "127.0.0.1")
    .option("--no-open", "Do not open the browser")
    .parse(userArgsFromArgv(process.argv), { from: "user" });

  const raw = program.opts<{
    src: string;
    out?: string;
    analyzeOnly?: boolean;
    json?: boolean;
    skipFailOnViolations?: boolean;
    strict?: boolean;
    port: string;
    host: string;
    /** false when --no-open */
    open?: boolean;
  }>();

  const srcAbs = path.resolve(raw.src);
  if (!fsSync.existsSync(srcAbs)) {
    console.error(`[archview] Source path does not exist: ${srcAbs}`);
    process.exitCode = 1;
    return;
  }

  const analyzeOnly = Boolean(raw.analyzeOnly);
  const failOnViolations = raw.skipFailOnViolations !== true;
  const portPreferred = Number.parseInt(raw.port, 10);
  if (Number.isNaN(portPreferred) || portPreferred < 1 || portPreferred > 65535) {
    console.error(`[archview] Invalid --port: ${raw.port}`);
    process.exitCode = 1;
    return;
  }

  console.error("[archview] Analyzing…");
  const snapshot = await analyzeRepository({
    repoPath: srcAbs,
    name: path.basename(srcAbs),
  });

  const { absPath: snapshotPath, tempDir } = await resolveSnapshotPath({
    outPath: raw.out,
  });

  writeSnapshot(snapshot, snapshotPath);
  console.error(`[archview] Wrote snapshot (${snapshot.modules.length} modules, ${snapshot.moduleDependencies.length} edges, ${snapshot.violations.length} violations)`);
  console.error(`[archview] Snapshot file: ${snapshotPath}`);

  if (analyzeOnly) {
    const code = exitCodeForViolations(snapshot, failOnViolations);
    if (raw.json) {
      console.log(JSON.stringify(snapshot, null, 2));
    } else {
      console.log(snapshotPath);
    }
    process.exit(code);
    return;
  }

  if (raw.json) {
    console.log(JSON.stringify(snapshot, null, 2));
  }

  if (raw.strict && snapshot.violations.length > 0) {
    console.error("[archview] Violations present and --strict is set; not starting server.");
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    process.exitCode = 1;
    return;
  }

  const { standaloneRoot, serverJs } = standalonePaths();
  if (!fsSync.existsSync(serverJs)) {
    console.error(
      `[archview] Missing bundled web app at ${serverJs}. Build the archview package (pnpm --filter archview build).`,
    );
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    process.exitCode = 1;
    return;
  }

  const host = raw.host;
  const port = await allocatePort(portPreferred, host);
  if (port !== portPreferred) {
    console.error(`[archview] Port ${portPreferred} busy; using ${port}.`);
  }

  const displayHost = host.includes(":") ? `[${host}]` : host;
  const url = `http://${displayHost}:${port}`;

  const childEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: host,
    ARCHVIEW_SNAPSHOT_PATH: snapshotPath,
  };

  const child: ChildProcess = spawn(process.execPath, [serverJs], {
    cwd: standaloneRoot,
    env: childEnv,
    stdio: "inherit",
  });

  let cleaned = false;
  function cleanupSync(): void {
    if (cleaned) return;
    cleaned = true;
    child.kill("SIGTERM");
    if (tempDir) {
      try {
        fsSync.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  process.on("SIGINT", () => {
    cleanupSync();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanupSync();
    process.exit(0);
  });

  child.on("error", (err) => {
    console.error("[archview] Failed to start server:", err);
    cleanupSync();
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      cleanupSync();
      process.exitCode = code ?? 1;
    }
  });

  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 800);
    child.once("exit", () => clearTimeout(t));
  });

  console.error(`[archview] Server running at ${url}`);

  const shouldOpen = process.stdout.isTTY && raw.open !== false;
  if (shouldOpen) openBrowser(url);
}

run().catch((e: unknown) => {
  console.error("[archview]", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
