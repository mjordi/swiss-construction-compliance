export interface ComplianceRecordInput {
  projectName: string;
  contractor: string;
  client: string;
  inspectionDate: Date;
}

export interface ComplianceRecord {
  caseId: string;
  projectName: string;
  contractor: string;
  client: string;
  inspectionDate: Date;
  createdAt: Date;
  status: "draft" | "awaiting-signature" | "finalized";
  checklist: {
    projectData: boolean;
    defectLog: boolean;
    signature: boolean;
    exportReady: boolean;
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 16);
}

export function buildComplianceRecord(
  input: ComplianceRecordInput,
  step: number,
  hasSignature: boolean
): ComplianceRecord {
  const today = new Date(input.inspectionDate);
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
  const projectSlug = slugify(input.projectName || "untitled");

  return {
    caseId: `BC-${ymd}-${projectSlug || "case"}`,
    projectName: input.projectName,
    contractor: input.contractor,
    client: input.client,
    inspectionDate: input.inspectionDate,
    createdAt: new Date(),
    status: step >= 3 ? "finalized" : step >= 2 ? "awaiting-signature" : "draft",
    checklist: {
      projectData: Boolean(input.projectName && input.contractor && input.client),
      defectLog: step >= 2,
      signature: hasSignature,
      exportReady: step >= 3,
    },
  };
}
