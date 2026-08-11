import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { CaseNoticeDraftPDF } from "@/components/dashboard/CaseNoticeDraftPDF";
import type { CaseNoticeDraftReport } from "@/lib/case-notice-draft-report";

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return Children.toArray(node.props.children).map(collectText).join(" ");
}

const report: CaseNoticeDraftReport = {
  labels: {
    title: "Saved notice draft",
    saved: "Saved",
    notApproved: "Not approved",
    notSent: "Not sent",
    reviewDisclaimer: "Review every source fact before deciding whether to use this draft.",
    legalDisclaimer: "This draft is not legal advice and may be legally incomplete.",
    draftId: "Revision ID",
    createdAt: "Saved at",
    projectName: "Project",
    canton: "Canton",
    recipientName: "Recipient",
    recipientAddress: "Recipient address",
    defectStatement: "Defect statement",
    contractDate: "Contract date",
    discoveryDate: "Discovery date",
    noticeDeadline: "Stored notice deadline",
    noticeDeadlineNotFixed: "Not stored",
    regime: "Legal regime",
    regimes: { old: "Old law", new: "New law" },
  },
  draftId: "draft-7",
  createdAt: "2026-08-09T08:30:00.123Z",
  projectName: "Alpine Tower — saved",
  canton: "ZH",
  recipientName: "Saved Builder AG",
  recipientAddress: "Saved Road 1\n8000 Zürich",
  defectStatement: "Saved immutable defect.\n" + "A long source-bound paragraph. ".repeat(120),
  contractDate: "2026-03-01",
  discoveryDate: "2026-03-21",
  noticeDeadline: "2026-05-20",
  regime: "new",
};

describe("CaseNoticeDraftPDF", () => {
  it("renders A4 wrapping source-bound content with prominent saved, unapproved, and unsent disclosures", () => {
    const document = CaseNoticeDraftPDF({ report });
    const text = collectText(document);
    const page = Children.toArray(document.props.children)[0];

    expect(isValidElement(page) && page.props.size).toBe("A4");
    expect(isValidElement(page) && page.props.wrap).not.toBe(false);
    expect(text).toContain("Saved notice draft");
    expect(text).toContain("Saved");
    expect(text).toContain("Not approved");
    expect(text).toContain("Not sent");
    expect(text).toContain("draft-7");
    expect(text).toContain("2026-08-09T08:30:00.123Z");
    expect(text).toContain("Alpine Tower — saved");
    expect(text).toContain("Saved Road 1\n8000 Zürich");
    expect(text).toContain("2026-05-20");
    expect(text).toContain("New law");
    expect(text).toContain("Review every source fact");
    expect(text).toContain("not legal advice");
  });

  it("does not add positive approval, signature, finality, completeness, delivery, certification, or sending-proof claims", () => {
    const text = collectText(CaseNoticeDraftPDF({ report })).toLowerCase();

    for (const claim of [
      "approved notice",
      "signed",
      "final notice",
      "legally complete",
      "delivered",
      "certified",
      "proof of sending",
    ]) {
      expect(text).not.toContain(claim);
    }
  });

  it("renders the explicit null-deadline label without calculating a date", () => {
    const text = collectText(CaseNoticeDraftPDF({ report: { ...report, noticeDeadline: null } }));
    expect(text).toContain("Not stored");
  });
});
