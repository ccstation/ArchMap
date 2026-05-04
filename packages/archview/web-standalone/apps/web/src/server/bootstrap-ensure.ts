let loader: (() => void) | undefined;

export function registerSnapshotLoader(fn: () => void): void {
  loader = fn;
}

export function ensureSnapshotLoaded(): void {
  loader?.();
}
