import { readFile } from "node:fs/promises";
import path from "node:path";

import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CaseNoticeDraftPDF } from "@/components/dashboard/CaseNoticeDraftPDF";
import type { CaseNoticeDraftReport } from "@/lib/case-notice-draft-report";

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return Children.toArray(node.props.children).map(collectText).join(" ");
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(buffer) });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }

    return pages.join("\n");
  } finally {
    await task.destroy();
  }
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
    const pageElement = isValidElement<{
      children?: ReactNode;
      size?: string;
      style?: { paddingTop?: number };
      wrap?: boolean;
    }>(page) ? page : null;
    const statusBox = isValidElement<{ children?: ReactNode }>(page)
      ? Children.toArray(page.props.children).find((child) => collectText(child).includes("Not approved"))
      : null;

    expect(pageElement?.props.size).toBe("A4");
    expect(pageElement?.props.wrap).not.toBe(false);
    expect(pageElement?.props.style?.paddingTop).toBe(120);
    expect(isValidElement<{
      fixed?: boolean;
      style?: { position?: string; top?: number };
    }>(statusBox) && statusBox.props).toMatchObject({
      fixed: true,
      style: { position: "absolute", top: 36 },
    });
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

  it("allows the persisted multiline recipient address row to continue across pages", () => {
    const document = CaseNoticeDraftPDF({ report });
    const page = Children.toArray(document.props.children)[0];
    const addressRow = isValidElement<{ children?: ReactNode }>(page)
      ? Children.toArray(page.props.children)
        .flatMap((child) => isValidElement<{ children?: ReactNode }>(child) ? Children.toArray(child.props.children) : [])
        .find((child) => collectText(child).includes("Recipient address"))
      : null;

    expect(isValidElement<{ wrap?: boolean }>(addressRow) && addressRow.props.wrap).toBe(true);
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

  it("preserves a non-CJK Devanagari source fact in extracted PDF text using a script fallback", async () => {
    const fontFiles = new Map(await Promise.all([
      "NotoSansSC-Variable.ttf",
      "NotoSansArabic-Variable.ttf",
      "NotoSansHebrew-Variable.ttf",
      "NotoSansDevanagari-Variable.ttf",
      "NotoSansSymbols2-Regular.ttf",
      "NotoEmoji-Variable.ttf",
    ].map(async (fileName) => [
      fileName,
      await readFile(path.join(process.cwd(), "public/fonts", fileName)),
    ] as const)));
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
      const font = fontFiles.get(url.split("/").at(-1) ?? "");
      if (font) return Promise.resolve(new Response(font));
      return originalFetch(input, init);
    });

    try {
      const unicodeReport = {
        ...report,
        projectName: "Αθήνα · Москва · 東京 · भारत",
        recipientName: "Saved Builder AG",
        defectStatement: "भारत में निर्माण दोष",
      };
      const buffer = await renderToBuffer(<CaseNoticeDraftPDF report={unicodeReport} />);
      const extractedText = await extractPdfText(buffer);

      expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
      expect(buffer.byteLength).toBeGreaterThan(1_000);
      expect(extractedText).toContain("भारत");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("preserves a common pictographic emoji in extracted PDF text using an emoji fallback", async () => {
    const fontFiles = new Map(await Promise.all([
      "NotoSansSC-Variable.ttf",
      "NotoSansArabic-Variable.ttf",
      "NotoSansHebrew-Variable.ttf",
      "NotoSansDevanagari-Variable.ttf",
      "NotoSansSymbols2-Regular.ttf",
      "NotoEmoji-Variable.ttf",
    ].map(async (fileName) => [
      fileName,
      await readFile(path.join(process.cwd(), "public/fonts", fileName)),
    ] as const)));
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
      const font = fontFiles.get(url.split("/").at(-1) ?? "");
      if (font) return Promise.resolve(new Response(font));
      return originalFetch(input, init);
    });

    try {
      const buffer = await renderToBuffer(
        <CaseNoticeDraftPDF report={{ ...report, defectStatement: "Saved face defect 😀" }} />,
      );
      const extractedText = await extractPdfText(buffer);

      expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
      expect(extractedText).toContain("😀");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
