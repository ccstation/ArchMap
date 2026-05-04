import fs from "node:fs";
import path from "node:path";

export interface FrameworkInfo {
  frameworks: string[];
  packageManager: string | null;
  hasAppRouter: boolean;
  hasPagesRouter: boolean;
}

export function detectFrameworkInfo(repoRoot: string): FrameworkInfo {
  const frameworks: string[] = [];
  const pkgPath = path.join(repoRoot, "package.json");
  let packageManager: string | null = null;
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const all = { ...pkg.dependencies, ...pkg.devDependencies };
      if (all?.next) frameworks.push("Next.js");
      if (all?.react) frameworks.push("React");
      if (all?.vue) frameworks.push("Vue");
      if (all?.["@angular/core"]) frameworks.push("Angular");
      if (fs.existsSync(path.join(repoRoot, "pnpm-lock.yaml"))) packageManager = "pnpm";
      else if (fs.existsSync(path.join(repoRoot, "yarn.lock"))) packageManager = "yarn";
      else if (fs.existsSync(path.join(repoRoot, "package-lock.json"))) packageManager = "npm";
    } catch {
      /* ignore */
    }
  }
  const appDir = path.join(repoRoot, "src", "app");
  const appRoot = path.join(repoRoot, "app");
  const pagesDir = path.join(repoRoot, "src", "pages");
  const pagesRoot = path.join(repoRoot, "pages");
  const hasAppRouter =
    (fs.existsSync(appDir) && fs.statSync(appDir).isDirectory()) ||
    (fs.existsSync(appRoot) && fs.statSync(appRoot).isDirectory());
  const hasPagesRouter =
    (fs.existsSync(pagesDir) && fs.statSync(pagesDir).isDirectory()) ||
    (fs.existsSync(pagesRoot) && fs.statSync(pagesRoot).isDirectory());
  return { frameworks, packageManager, hasAppRouter, hasPagesRouter };
}
