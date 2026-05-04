import { createHash } from "node:crypto";

let seq = 0;

export function resetIdSequence(): void {
  seq = 0;
}

export function shortId(prefix: string, parts: string[]): string {
  const h = createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 12);
  return `${prefix}_${h}`;
}

export function nextSeq(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}
