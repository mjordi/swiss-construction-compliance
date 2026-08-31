import type {
  ComplianceQueueOwnedGrant,
  ComplianceQueueSharedOwner,
} from "@/lib/database.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function optionalDisplayField(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function parseOwnedComplianceQueueGrants(value: unknown): ComplianceQueueOwnedGrant[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate): ComplianceQueueOwnedGrant[] => {
    if (!isRecord(candidate)) return [];
    const email = typeof candidate.collaborator_email === "string"
      ? candidate.collaborator_email.trim()
      : "";
    if (
      !isUuid(candidate.membership_id)
      || !isUuid(candidate.collaborator_id)
      || !EMAIL_PATTERN.test(email)
      || !isTimestamp(candidate.granted_at)
    ) return [];

    return [{
      membershipId: candidate.membership_id,
      collaboratorId: candidate.collaborator_id,
      collaboratorEmail: email,
      grantedAt: candidate.granted_at,
    }];
  });
}

export function parseSharedComplianceQueueOwners(value: unknown): ComplianceQueueSharedOwner[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate): ComplianceQueueSharedOwner[] => {
    if (!isRecord(candidate)) return [];
    const ownerName = optionalDisplayField(candidate.owner_name);
    const ownerCompany = optionalDisplayField(candidate.owner_company);
    if (
      !isUuid(candidate.owner_id)
      || ownerName === undefined
      || ownerCompany === undefined
      || !isTimestamp(candidate.granted_at)
    ) return [];

    return [{
      ownerId: candidate.owner_id,
      ownerName,
      ownerCompany,
      grantedAt: candidate.granted_at,
    }];
  });
}

export function buildSharedOwnerLabel(
  owner: ComplianceQueueSharedOwner,
  fallback = "Shared owner"
): string {
  const display = [owner.ownerName, owner.ownerCompany].filter(Boolean).join(" · ");
  return display || `${fallback} · ${owner.ownerId.slice(0, 8)}`;
}

export function selectComplianceQueueTarget(
  authenticatedOwnerId: string,
  requestedOwnerId: string | null,
  sharedOwners: readonly ComplianceQueueSharedOwner[]
): string {
  if (!requestedOwnerId || requestedOwnerId === authenticatedOwnerId) return authenticatedOwnerId;
  return sharedOwners.some((owner) => owner.ownerId === requestedOwnerId)
    ? requestedOwnerId
    : authenticatedOwnerId;
}
