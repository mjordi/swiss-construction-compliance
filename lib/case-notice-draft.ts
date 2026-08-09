import type { Case } from "@/lib/database.types";
import type { ComplianceCaseViewModel } from "@/lib/case-timeline";

export type CaseNoticeDraftPayload = {
  project_name: string;
  canton: string;
  notice_recipient_name: string;
  notice_recipient_address: string;
  defect_statement: string;
  contract_date: string;
  discovery_date: string;
  notice_deadline: string | null;
  regime: "old" | "new";
};

function dateOnly(value: string | Date): string {
  return (typeof value === "string" ? value : value.toISOString()).slice(0, 10);
}

function boundedText(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

export function buildCaseNoticeDraftPayload(
  persistedCase: Case,
  context: ComplianceCaseViewModel
): CaseNoticeDraftPayload | null {
  const projectName = boundedText(persistedCase.project_name, 200);
  const canton = boundedText(persistedCase.canton, 2);
  const recipientName = boundedText(persistedCase.notice_recipient_name, 200);
  const recipientAddress = boundedText(persistedCase.notice_recipient_address, 1000);
  const defectStatement = boundedText(persistedCase.defect_statement, 4000);

  if (!projectName || !canton || !recipientName || !recipientAddress || !defectStatement) return null;

  return {
    project_name: projectName,
    canton,
    notice_recipient_name: recipientName,
    notice_recipient_address: recipientAddress,
    defect_statement: defectStatement,
    contract_date: dateOnly(persistedCase.contract_date),
    discovery_date: dateOnly(persistedCase.discovery_date),
    notice_deadline: context.noticeDeadline ? dateOnly(context.noticeDeadline) : null,
    regime: context.regime,
  };
}
