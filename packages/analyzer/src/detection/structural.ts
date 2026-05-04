import fs from "node:fs";
import path from "node:path";

export interface StructuralBucket {
  key: string;
  absRoot: string;
  displayName: string;
}

const ROOT_SKIP = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  ".next",
  "packages",
]);

export function listStructuralBuckets(rootPath: string): StructuralBucket[] {
  const root = path.normalize(rootPath);
  const buckets: StructuralBucket[] = [];
  const packagesDir = path.join(root, "packages");
  if (fs.existsSync(packagesDir) && fs.statSync(packagesDir).isDirectory()) {
    for (const ent of fs.readdirSync(packagesDir, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      const pkgRoot = path.join(packagesDir, ent.name);
      const pkgJson = path.join(pkgRoot, "package.json");
      if (fs.existsSync(pkgJson)) {
        buckets.push({
          key: `packages/${ent.name}`,
          absRoot: pkgRoot,
          displayName: ent.name,
        });
      }
    }
  }
  if (buckets.length > 0) return buckets.sort((a, b) => a.key.localeCompare(b.key));
  const srcDir = path.join(root, "src");
  if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
    for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      buckets.push({
        key: ent.name,
        absRoot: path.join(srcDir, ent.name),
        displayName: ent.name,
      });
    }
    return buckets.sort((a, b) => a.key.localeCompare(b.key));
  }
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    if (ROOT_SKIP.has(ent.name)) continue;
    buckets.push({
      key: ent.name,
      absRoot: path.join(root, ent.name),
      displayName: ent.name,
    });
  }
  return buckets.sort((a, b) => a.key.localeCompare(b.key));
}

export function structuralKeyForFile(
  buckets: StructuralBucket[],
  fileAbs: string,
): string | null {
  const norm = path.normalize(fileAbs);
  let best: StructuralBucket | null = null;
  for (const b of buckets) {
    const prefix = b.absRoot + path.sep;
    if (norm === b.absRoot || norm.startsWith(prefix)) {
      if (!best || b.absRoot.length > best.absRoot.length) best = b;
    }
  }
  return best?.key ?? null;
}
