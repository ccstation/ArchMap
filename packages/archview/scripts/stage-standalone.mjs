import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(pkgRoot, "../..");
const webNext = path.join(repoRoot, "apps/web/.next");
const standaloneSrc = path.join(webNext, "standalone");
const dest = path.join(pkgRoot, "web-standalone");

if (!fs.existsSync(standaloneSrc)) {
  console.error(
    "[archview] Missing Next standalone output. Run: pnpm --filter @archmap/web build",
  );
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(standaloneSrc, dest, { recursive: true });

const staticSrc = path.join(webNext, "static");
const staticDest = path.join(dest, "apps/web/.next/static");
if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(path.dirname(staticDest), { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true });
}

const publicSrc = path.join(repoRoot, "apps/web/public");
const publicDest = path.join(dest, "apps/web/public");
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true });
}

console.log("[archview] Staged web standalone → packages/archview/web-standalone");
