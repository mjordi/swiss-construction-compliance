export interface VaultAuditExportRow {
  caseId: string;
  project: string;
  lifecycleStatus: string;
  legalStatus: string | null;
  legalRegime: string | null;
  deadlineContext: string | null;
  checklistCompleted: number;
  checklistTotal: number;
  missingAuditItems: string[];
  linkedProtocols: number;
  sourceUpdatedAt: string;
}

export interface VaultAuditCsvLabels {
  generatedAt: string;
  scope: string;
  scopeValue: string;
  caseId: string;
  project: string;
  lifecycleStatus: string;
  legalStatus: string;
  legalRegime: string;
  deadlineContext: string;
  checklistCompleted: string;
  checklistTotal: string;
  missingAuditItems: string;
  linkedProtocols: string;
  sourceUpdatedAt: string;
  noMissingItems: string;
  unavailable: string;
}

export interface VaultAuditPageResult<T> {
  data: T[] | null;
  error: unknown;
}

export async function loadAllVaultAuditPages<T extends { id: string }>(
  loadPage: (afterId: string | null, pageSize: number) => PromiseLike<VaultAuditPageResult<T>>,
  requestIsCurrent: () => boolean,
  pageSize = 500,
): Promise<T[] | null> {
  const loaded: T[] = [];
  let afterId: string | null = null;

  for (;;) {
    if (!requestIsCurrent()) return null;
    const result = await loadPage(afterId, pageSize);
    if (!requestIsCurrent()) return null;
    if (result.error) throw result.error;
    const page = result.data ?? [];
    loaded.push(...page);
    if (page.length < pageSize) return loaded;
    afterId = page[page.length - 1].id;
  }
}

const SPREADSHEET_FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

function csvCell(value: string | number): string {
  const text = String(value);
  const safeText = SPREADSHEET_FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function csvLine(values: Array<string | number>): string {
  return values.map(csvCell).join(",");
}

export function buildVaultAuditCsv(
  rows: readonly VaultAuditExportRow[],
  labels: VaultAuditCsvLabels,
  generatedAt: Date = new Date(),
): string {
  const orderedRows = [...rows].sort((left, right) => left.caseId.localeCompare(right.caseId));
  const lines = [
    csvLine([labels.generatedAt, generatedAt.toISOString()]),
    csvLine([labels.scope, labels.scopeValue]),
    "",
    csvLine([
      labels.caseId,
      labels.project,
      labels.lifecycleStatus,
      labels.legalStatus,
      labels.legalRegime,
      labels.deadlineContext,
      labels.checklistCompleted,
      labels.checklistTotal,
      labels.missingAuditItems,
      labels.linkedProtocols,
      labels.sourceUpdatedAt,
    ]),
    ...orderedRows.map((row) =>
      csvLine([
        row.caseId,
        row.project,
        row.lifecycleStatus,
        row.legalStatus ?? labels.unavailable,
        row.legalRegime ?? labels.unavailable,
        row.deadlineContext ?? labels.unavailable,
        row.checklistCompleted,
        row.checklistTotal,
        row.missingAuditItems.length > 0 ? row.missingAuditItems.join("; ") : labels.noMissingItems,
        row.linkedProtocols,
        row.sourceUpdatedAt,
      ]),
    ),
  ];

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function vaultAuditCsvFilename(generatedAt: Date = new Date()): string {
  return `baucompliance-vault-audit-${generatedAt.toISOString().slice(0, 10)}.csv`;
}
