import type { Protocol } from "@/lib/database.types";

export function selectFinalizedProtocolRecords(
  records: readonly Protocol[],
): Protocol[] {
  return [...records]
    .filter((record) => record.status === "finalized")
    .sort((left, right) => {
      const newestFirst = right.created_at.localeCompare(left.created_at);
      return newestFirst || left.id.localeCompare(right.id);
    });
}

export function protocolPdfFilename(protocolId: string): string {
  const safeId = protocolId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `baucompliance-protocol-${safeId || "record"}.pdf`;
}
