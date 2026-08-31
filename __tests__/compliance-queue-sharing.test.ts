import { describe, expect, it } from "vitest";
import {
  buildSharedOwnerLabel,
  parseOwnedComplianceQueueGrants,
  parseSharedComplianceQueueOwners,
  selectComplianceQueueTarget,
} from "@/lib/compliance-queue-sharing";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const COLLABORATOR_ID = "22222222-2222-4222-8222-222222222222";

describe("compliance queue sharing contracts", () => {
  it("parses only complete active owned grants", () => {
    expect(parseOwnedComplianceQueueGrants([
      {
        membership_id: "33333333-3333-4333-8333-333333333333",
        collaborator_id: COLLABORATOR_ID,
        collaborator_email: "member@example.ch",
        granted_at: "2026-08-31T08:00:00.000Z",
      },
      { membership_id: "bad", collaborator_id: COLLABORATOR_ID, collaborator_email: "x@example.ch", granted_at: "today" },
      { membership_id: "44444444-4444-4444-8444-444444444444", collaborator_id: OWNER_ID, collaborator_email: "not-an-email", granted_at: "2026-08-31T08:00:00Z" },
    ])).toEqual([{
      membershipId: "33333333-3333-4333-8333-333333333333",
      collaboratorId: COLLABORATOR_ID,
      collaboratorEmail: "member@example.ch",
      grantedAt: "2026-08-31T08:00:00.000Z",
    }]);
    expect(parseOwnedComplianceQueueGrants({ rows: [] })).toEqual([]);
  });

  it("parses safe shared owner display fields and rejects malformed rows", () => {
    expect(parseSharedComplianceQueueOwners([
      { owner_id: OWNER_ID, owner_name: "  Owner One ", owner_company: " Alpine AG ", granted_at: "2026-08-31T08:00:00Z" },
      { owner_id: "bad", owner_name: "Bad", owner_company: null, granted_at: "2026-08-31T08:00:00Z" },
      { owner_id: COLLABORATOR_ID, owner_name: 7, owner_company: null, granted_at: "2026-08-31T08:00:00Z" },
    ])).toEqual([{
      ownerId: OWNER_ID,
      ownerName: "Owner One",
      ownerCompany: "Alpine AG",
      grantedAt: "2026-08-31T08:00:00Z",
    }]);
  });

  it("builds deterministic labels without exposing account email", () => {
    expect(buildSharedOwnerLabel({ ownerId: OWNER_ID, ownerName: "Owner One", ownerCompany: "Alpine AG", grantedAt: "2026-08-31T08:00:00Z" })).toBe("Owner One · Alpine AG");
    expect(buildSharedOwnerLabel({ ownerId: OWNER_ID, ownerName: null, ownerCompany: "Alpine AG", grantedAt: "2026-08-31T08:00:00Z" })).toBe("Alpine AG");
    expect(buildSharedOwnerLabel({ ownerId: OWNER_ID, ownerName: null, ownerCompany: null, grantedAt: "2026-08-31T08:00:00Z" }, "Shared owner")).toBe("Shared owner · 11111111");
  });

  it("defaults to self and accepts only an explicitly listed shared owner", () => {
    const shared = [{ ownerId: OWNER_ID, ownerName: "Owner", ownerCompany: null, grantedAt: "2026-08-31T08:00:00Z" }];
    expect(selectComplianceQueueTarget(COLLABORATOR_ID, null, shared)).toBe(COLLABORATOR_ID);
    expect(selectComplianceQueueTarget(COLLABORATOR_ID, OWNER_ID, shared)).toBe(OWNER_ID);
    expect(selectComplianceQueueTarget(COLLABORATOR_ID, "99999999-9999-4999-8999-999999999999", shared)).toBe(COLLABORATOR_ID);
  });
});
