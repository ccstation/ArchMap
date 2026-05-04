let defaultRepositoryId: string | null = null;

export function setBootstrappedRepositoryId(id: string | null): void {
  defaultRepositoryId = id;
}

export function getDefaultRepositoryIdFromBootstrap(): string | null {
  return defaultRepositoryId;
}
