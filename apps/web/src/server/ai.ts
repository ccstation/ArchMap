import type { Snapshot } from "@archmap/graph-model";

async function chatComplete(apiKey: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a senior software architect. Summarize modules concisely in plain language. No markdown code fences.",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text ?? "";
}

/** Optional LLM layer; requires OPENAI_API_KEY. Never sends full file contents—only paths and stats. */
export async function enrichSnapshotWithAi(snapshot: Snapshot): Promise<Snapshot> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const moduleSummaries: Record<string, string> = {};
  const relationshipSummaries: Record<string, string> = {};

  const modulesToSummarize = snapshot.modules.slice(0, 15);

  for (const m of modulesToSummarize) {
    const files = snapshot.elements
      .filter((e) => e.moduleId === m.id)
      .map((e) => e.filePath)
      .slice(0, 20);
    const inbound = snapshot.moduleDependencies.filter((d) => d.targetModuleId === m.id).length;
    const outbound = snapshot.moduleDependencies.filter((d) => d.sourceModuleId === m.id).length;
    const prompt = `Module name: "${m.name}" (folder: ${m.folderPath}).
Source files (paths only): ${files.join(", ") || "(none)"}.
Approx inbound module edges: ${inbound}, outbound: ${outbound}.
Describe the likely responsibility of this module in one short paragraph.`;
    moduleSummaries[m.id] = await chatComplete(apiKey, prompt);
  }

  const topEdges = [...snapshot.moduleDependencies]
    .sort((a, b) => b.evidenceCount - a.evidenceCount)
    .slice(0, 12);

  for (const e of topEdges) {
    const from = snapshot.modules.find((x) => x.id === e.sourceModuleId)?.name ?? e.sourceModuleId;
    const to = snapshot.modules.find((x) => x.id === e.targetModuleId)?.name ?? e.targetModuleId;
    const key = `${e.sourceModuleId}->${e.targetModuleId}`;
    const prompt = `Two modules in a TypeScript codebase: "${from}" depends on "${to}" (${e.evidenceCount} file-level import references, seam type ${e.type}).
Explain in one sentence why this dependency might exist architecturally.`;
    relationshipSummaries[key] = await chatComplete(apiKey, prompt);
  }

  return {
    ...snapshot,
    ai: {
      moduleSummaries,
      relationshipSummaries,
      generatedAt: new Date().toISOString(),
    },
  };
}
