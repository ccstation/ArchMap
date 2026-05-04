import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { analyzeRequestSchema } from "@archmap/graph-model";
import { analyzeRepository } from "@archmap/analyzer";
import fs from "node:fs";
import path from "node:path";
import { jsonError } from "@/server/responses";
import { putAnalysis, setSnapshot } from "@/server/store";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body", 400);
  }

  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("INVALID_BODY", parsed.error.message, 400);
  }

  const { name, source } = parsed.data;
  if (source.type !== "local-path") {
    return jsonError("UNSUPPORTED_SOURCE", "Only local-path is supported", 400);
  }

  const resolvedPath = path.resolve(source.path);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    return jsonError("INVALID_SOURCE", "Repository source path does not exist", 400);
  }

  const analysisId = randomUUID();

  try {
    const snapshot = await analyzeRepository({
      repoPath: resolvedPath,
      name,
    });

    putAnalysis({
      id: analysisId,
      repositoryId: snapshot.repository.id,
      status: "completed",
      snapshotId: snapshot.meta.id,
    });

    setSnapshot(snapshot, resolvedPath);

    return NextResponse.json({
      repositoryId: snapshot.repository.id,
      analysisId,
      status: "completed" as const,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    putAnalysis({
      id: analysisId,
      repositoryId: "unknown",
      status: "failed",
      error: msg,
    });
    return jsonError("ANALYSIS_FAILED", msg, 500);
  }
}
