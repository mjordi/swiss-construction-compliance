import { CASE_EVIDENCE_BUCKET } from "@/lib/case-evidence";

const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;
export const CASE_EVIDENCE_CLEANUP_RETRY_MS = 30_000;

interface CleanupRetryScheduler {
  setInterval(callback: () => void, delay: number): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
}

export function scheduleCaseEvidenceCleanupRetry(
  retry: () => void,
  scheduler: CleanupRetryScheduler = window
): () => void {
  const timer = scheduler.setInterval(retry, CASE_EVIDENCE_CLEANUP_RETRY_MS);
  return () => scheduler.clearInterval(timer);
}

type StorageObject = { name: string };
type StorageResult<T> = { data: T | null; error: unknown };

interface CaseEvidenceBucket {
  list(
    path: string,
    options: { limit: number; offset: number }
  ): PromiseLike<StorageResult<StorageObject[]>>;
  remove(paths: string[]): PromiseLike<StorageResult<unknown>>;
}

export interface CaseEvidenceStorageClient {
  from(bucket: string): CaseEvidenceBucket;
}

export async function listCaseEvidenceObjectPaths(
  storage: CaseEvidenceStorageClient,
  userId: string,
  caseId: string
): Promise<string[]> {
  const bucket = storage.from(CASE_EVIDENCE_BUCKET);
  const folder = `${userId}/${caseId}`;
  const paths: string[] = [];

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await bucket.list(folder, {
      limit: LIST_PAGE_SIZE,
      offset,
    });
    if (error) throw error;

    const objects = data ?? [];
    paths.push(...objects.map(({ name }) => `${folder}/${name}`));
    if (objects.length < LIST_PAGE_SIZE) break;
  }

  return paths;
}

export async function removeCaseEvidenceObjects(
  storage: CaseEvidenceStorageClient,
  paths: string[]
): Promise<void> {
  const bucket = storage.from(CASE_EVIDENCE_BUCKET);

  for (let offset = 0; offset < paths.length; offset += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(offset, offset + REMOVE_BATCH_SIZE);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { error } = await bucket.remove(batch);
        if (!error) {
          lastError = null;
          break;
        }
        lastError = error;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
  }
}
