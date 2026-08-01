import { CASE_EVIDENCE_BUCKET } from "@/lib/case-evidence";

const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;

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

export async function removeCaseEvidenceObjects(
  storage: CaseEvidenceStorageClient,
  userId: string,
  caseId: string
): Promise<void> {
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

  for (let offset = 0; offset < paths.length; offset += REMOVE_BATCH_SIZE) {
    const { error } = await bucket.remove(paths.slice(offset, offset + REMOVE_BATCH_SIZE));
    if (error) throw error;
  }
}
