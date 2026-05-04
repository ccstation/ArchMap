import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/.next/**",
  "**/coverage/**",
  "**/*.min.js",
];

export interface IngestResult {
  rootPath: string;
  files: string[];
  packageName: string | null;
  hasTsconfig: boolean;
}

function readGitignoreLines(repoRoot: string): string[] {
  const p = path.join(repoRoot, ".gitignore");
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export async function ingestRepository(repoRoot: string): Promise<IngestResult> {
  const abs = path.resolve(repoRoot);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`Not a directory: ${abs}`);
  }

  const pkgPath = path.join(abs, "package.json");
  let packageName: string | null = null;
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        name?: string;
      };
      packageName = pkg.name ?? null;
    } catch {
      packageName = null;
    }
  }

  const tsconfigPath = path.join(abs, "tsconfig.json");
  const hasTsconfig = fs.existsSync(tsconfigPath);

  const gitignorePatterns = readGitignoreLines(abs).map((line) => {
    if (line.endsWith("/")) return `**/${line}**`;
    return line.includes("*") ? line : `**/${line}/**`;
  });

  const patterns = [
    "**/*.{ts,tsx,js,jsx,mjs,cjs}",
    ...DEFAULT_IGNORE.map((p) => `!${p}`),
    ...gitignorePatterns.map((p) => `!${p}`),
  ];

  const cwd = abs.replace(/\\/g, "/");
  const files = await fg(patterns, {
    cwd,
    absolute: true,
    dot: false,
    followSymbolicLinks: false,
    ignore: ["**/node_modules/**"],
  });

  const normalized = files
    .filter((f) => fs.statSync(f).isFile())
    .map((f) => path.normalize(f))
    .sort();

  return {
    rootPath: abs,
    files: normalized,
    packageName,
    hasTsconfig,
  };
}
