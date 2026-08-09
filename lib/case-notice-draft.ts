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

export function buildCaseNoticeDraftPayload(
  persistedCase: Case,
  context: ComplianceCaseViewModel
): CaseNoticeDraftPayload | null {
  const recipientName = persistedCase.notice_recipient_name?.trim();
  const recipientAddress = persistedCase.notice_recipient_address?.trim();
  const defectStatement = persistedCase.defect_statement?.trim();

  if (!recipientName || !recipientAddress || !defectStatement) return null;

  return {
    project_name: persistedCase.project_name.trim(),
    canton: persistedCase.canton.trim(),
    notice_recipient_name: recipientName,
    notice_recipient_address: recipientAddress,
    defect_statement: defectStatement,
    contract_date: dateOnly(persistedCase.contract_date),
    discovery_date: dateOnly(persistedCase.discovery_date),
    notice_deadline: context.noticeDeadline ? dateOnly(context.noticeDeadline) : null,
    regime: context.regime,
  };
}
