#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import { analyzeRepository, writeSnapshot } from "./analyze.js";

const program = new Command();

program
  .name("archmap-analyze")
  .argument("<repo-path>", "Absolute or relative path to repository root")
  .option("-o, --out <file>", "Write snapshot JSON to file")
  .option("-n, --name <name>", "Repository display name")
  .action(async (repoPath: string, opts: { out?: string; name?: string }) => {
    const abs = path.resolve(repoPath);
    const snapshot = await analyzeRepository({
      repoPath: abs,
      name: opts.name,
    });
    if (opts.out) {
      writeSnapshot(snapshot, path.resolve(opts.out));
      console.error(`Wrote snapshot to ${opts.out}`);
    }
    console.log(JSON.stringify(snapshot.meta, null, 2));
    console.error(
      `Modules: ${snapshot.modules.length}, edges: ${snapshot.moduleDependencies.length}, violations: ${snapshot.violations.length}`,
    );
  });

program.parse();
