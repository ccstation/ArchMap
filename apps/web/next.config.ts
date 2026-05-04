import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  /** Trace workspace packages from the monorepo root. */
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@archmap/graph-model", "@archmap/analyzer"],
};

export default nextConfig;
