import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildCaseAuditRegisterCsvMock,
  buildCaseLegalChronologyCsvMock,
  buildComplianceCaseTimelineMock,
  pdfToBlobMock,
  pdfMock,
} = vi.hoisted(() => ({
  buildCaseAuditRegisterCsvMock: vi.fn(() => '\ufeff"Case audit register"'),
  buildCaseLegalChronologyCsvMock: vi.fn(() => '\ufeff"Case chronology"'),
  buildComplianceCaseTimelineMock: vi.fn(),
  pdfToBlobMock: vi.fn(async () => new Blob(["pdf"], { type: "application/pdf" })),
  pdfMock: vi.fn(),
}));
const replaceMock = vi.fn();
const updateEqMock = vi.fn();
const createObjectURLMock = vi.fn<(blob: Blob) => string>(() => "blob:case-reminder");
const revokeObjectURLMock = vi.fn();
let statusQueryParam: string | null = null;
let timelineStatus: "warning" | "urgent" = "warning";
let updatePayloads: Array<{ checklist?: Record<string, boolean> }> = [];
let checklistRpcNames: string[] = [];
let caseChecklistData: Record<string, boolean> | null = {
  defectDocumented: false,
  evidenceAttached: false,
  noticeDrafted: false,
  calendarReminderExported: false,
};
let concurrentChecklistRpcData: Record<string, boolean> | null = null;
let protocolSelectColumns: string[] = [];
let protocolRows: Array<{
  id?: string;
  case_id: string;
  status?: "draft" | "awaiting-signature" | "finalized";
  finalized_at?: string;
  project_name?: string;
  contractor?: string;
  client?: string;
  defect_description?: string | null;
  signature_data?: string | null;
}> = [];
let activityRows: Array<{
  id: string;
  user_id: string;
  case_id: string;
  evidence_id: string;
  event_type: "evidence_uploaded";
  source_name: string;
  source_mime_type: "application/pdf" | "image/jpeg" | "image/png";
  source_size_bytes: number;
  occurred_at: string;
}> = [];
let activityQueryError = false;
let activityQueryPending = false;

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/cases",
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({
    get: (key: string) => (key === "status" ? statusQueryParam : null),
    toString: () => (statusQueryParam ? `status=${statusQueryParam}` : ""),
  }),
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("@/components/dashboard/PageHeader", () => ({
  default: ({ title, subtitle, marker }: { title: string; subtitle: string; marker: string }) => (
    <div>
      <div>{marker}</div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
}));

vi.mock("@/components/dashboard/AuditReportPDF", () => ({
  AuditReportPDF: (props: unknown) => <div data-testid="protocol-report-pdf" data-props={JSON.stringify(props)} />,
}));

vi.mock("@react-pdf/renderer", () => ({
  Font: { register: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  pdf: (document: unknown) => {
    pdfMock(document);
    return { toBlob: pdfToBlobMock };
  },
}));

vi.mock("@/lib/case-timeline", () => ({
  applyComplianceCaseView: (cases: unknown[]) => cases,
  buildComplianceCaseTimeline: (inputs: Array<{ id: string; projectName: string; canton: string }>) => {
    buildComplianceCaseTimelineMock(inputs);
    return inputs.map((input) => ({
      id: input.id,
      projectName: input.projectName,
      canton: input.canton,
      status: timelineStatus,
      deadlineCountdownTone: "warning",
      deadlineCountdownLabel: "10 days left",
      regimeLabel: "New law",
      regime: "new",
      noticeApplies: true,
      nextAction: "cases-next-action-warning",
      noticeDeadlineLabel: "2026-05-20",
      discoveredOnLabel: "2026-03-21",
      checklistDefaults: {
        defectDocumented: true,
        evidenceAttached: false,
        noticeDrafted: false,
        calendarReminderExported: false,
      },
      reminderReadiness: {
        calendarExportReady: false,
        emailReminderPlanned: false,
        evidenceComplete: false,
      },
    }));
  },
  buildCaseAuditRegisterCsv: buildCaseAuditRegisterCsvMock,
  buildCaseDeadlineReminderICS: () => "BEGIN:VCALENDAR\nEND:VCALENDAR",
  buildCaseLegalChronologyCsv: buildCaseLegalChronologyCsvMock,
  deriveCaseLegalMilestones: (
    _item: unknown,
    protocols: Array<{ id: string; status: string; createdAt: string }> = [],
    evidenceEvents: Array<{
      id: string;
      evidenceId: string;
      eventType: "evidence_uploaded";
      sourceName: string;
      occurredAt: string;
    }> = []
  ) => [
    { kind: "contract", date: new Date("2026-03-01"), dateLabel: "01.03.2026" },
    { kind: "discovery", date: new Date("2026-03-21"), dateLabel: "21.03.2026" },
    ...protocols
      .filter((protocol) => protocol.status === "finalized")
      .map((protocol) => ({
        id: `protocol-finalized-${protocol.id}`,
        kind: "protocol-finalized",
        date: new Date(protocol.createdAt),
        dateLabel: "25.03.2026",
      })),
    ...evidenceEvents.map((event) => ({
      id: `evidence-uploaded-${event.id}`,
      kind: "evidence-uploaded",
      date: new Date(event.occurredAt),
      dateLabel: "26.03.2026",
      sourceId: event.evidenceId,
      sourceName: event.sourceName,
    })),
    { kind: "notice-deadline", date: new Date("2026-05-20"), dateLabel: "20.05.2026" },
  ].sort((a, b) => a.date.getTime() - b.date.getTime()),
  deriveChecklistProgress: (checklist: Record<string, boolean>) => ({
    completed: Object.values(checklist).filter(Boolean).length,
    total: Object.keys(checklist).length,
    label: "progress",
  }),
  isDeadlineReminderIcsExportEligible: () => true,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: async (name: string, params: { target_case_id: string; target_key: string; target_value: boolean }) => {
      checklistRpcNames.push(name);
      updatePayloads.push({ checklist: { [params.target_key]: params.target_value } });
      const result = await updateEqMock(params.target_case_id);
      if (result?.error) return { data: null, error: result.error };
      caseChecklistData = {
        ...(caseChecklistData ?? {}),
        ...(concurrentChecklistRpcData ?? {}),
        [params.target_key]: params.target_value,
      };
      return { data: caseChecklistData, error: null };
    },
    from: (table: string) => {
      if (table === "cases") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "case-1",
                      user_id: "user-1",
                      project_name: "Alpine Tower",
                      canton: "ZH",
                      contract_date: "2026-03-01T00:00:00.000Z",
                      discovery_date: "2026-03-21T00:00:00.000Z",
                      checklist: caseChecklistData,
                      created_at: "2026-03-21T00:00:00.000Z",
                      updated_at: "2026-03-21T00:00:00.000Z",
                      status: "active",
                    },
                  ],
                  error: null,
                }),
            }),
          }),
          update: (payload: { checklist?: Record<string, boolean> }) => {
            updatePayloads.push(payload);
            return {
              eq: updateEqMock,
            };
          },
        };
      }

      if (table === "protocols") {
        return {
          select: (columns: string) => {
            protocolSelectColumns.push(columns);
            if (columns.includes("signature_data")) {
              let selectedId: string | undefined;
              const detailQuery = {
                eq: (column: string, value: string) => {
                  if (column === "id") selectedId = value;
                  return detailQuery;
                },
                single: () =>
                  Promise.resolve({
                    data: protocolRows.find((protocol) => protocol.id === selectedId) ?? null,
                    error: null,
                  }),
              };
              return detailQuery;
            }

            return {
              eq: () => ({
                not: () => Promise.resolve({ data: protocolRows, error: null }),
              }),
            };
          },
        };
      }

      if (table === "case_activity_events") {
        return {
          select: () => ({
            eq: () => ({
              order: () => activityQueryPending
                ? new Promise(() => undefined)
                : Promise.resolve({
                    data: activityQueryError ? null : activityRows,
                    error: activityQueryError ? { message: "activity unavailable" } : null,
                  }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import CasesPage from "@/app/dashboard/cases/page";

describe("cases checklist persistence", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    updateEqMock.mockReset().mockResolvedValue({ data: true, error: null });
    updatePayloads = [];
    checklistRpcNames = [];
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    buildCaseAuditRegisterCsvMock.mockClear();
    buildCaseLegalChronologyCsvMock.mockClear();
    buildComplianceCaseTimelineMock.mockClear();
    pdfMock.mockClear();
    pdfToBlobMock.mockReset();
    pdfToBlobMock.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });
    caseChecklistData = {
      defectDocumented: false,
      evidenceAttached: false,
      noticeDrafted: false,
      calendarReminderExported: false,
    };
    concurrentChecklistRpcData = null;
    protocolRows = [];
    activityRows = [];
    activityQueryError = false;
    activityQueryPending = false;
    protocolSelectColumns = [];
    statusQueryParam = null;
    timelineStatus = "warning";
  });

  it("keeps timeline-derived checklist defaults when persisted checklist data is partial", async () => {
    caseChecklistData = {
      evidenceAttached: false,
    };

    render(<CasesPage />);

    const defaultChecked = await screen.findByLabelText("cases-checklist-defect-documented");
    expect((defaultChecked as HTMLInputElement).checked).toBe(true);
  });

  it("surfaces calendar reminder readiness on the case card before details are opened", async () => {
    render(<CasesPage />);

    const heading = await screen.findByText("Alpine Tower");
    const article = heading.closest("article");
    const scanBadge = Array.from(article?.querySelectorAll("span") ?? []).find((node) =>
      node.textContent?.includes("cases-calendar-pending")
    );

    expect(scanBadge).toBeTruthy();
    expect(scanBadge?.className).toContain("border-amber-500/30");
  });

  it("explains that exported case reminders require calendar import", async () => {
    render(<CasesPage />);

    const caseHeading = await screen.findByText("Alpine Tower");
    const caseCard = caseHeading.closest("article");
    expect(caseCard).toBeTruthy();

    const detailsSummary = within(caseCard as HTMLElement).getByText("cases-detail-summary");
    fireEvent.click(detailsSummary);

    const details = detailsSummary.closest("details");
    expect(details?.open).toBe(true);
    const exportRegion = within(details as HTMLElement).getByRole("region", {
      name: "cases-export-ics",
    });
    expect(within(exportRegion).getByText("reminders-activation-guidance")).toBeTruthy();
    expect(within(exportRegion).getByRole("button", { name: "cases-export-ics" })).toBeTruthy();
  });

  it("includes linked protocol count in the scan-level action snapshot", async () => {
    protocolRows = [{ case_id: "case-1" }, { case_id: "case-1" }];

    render(<CasesPage />);

    const snapshot = await screen.findByTestId("cases-action-snapshot-case-1");
    expect(snapshot.textContent).toContain("cases-linked-protocols");
    expect(snapshot.textContent).toContain("2");
  });

  it("shows evidence readiness in the scan-level action snapshot", async () => {
    caseChecklistData = {
      defectDocumented: true,
      evidenceAttached: false,
      noticeDrafted: false,
      calendarReminderExported: false,
    };

    render(<CasesPage />);

    const snapshot = await screen.findByTestId("cases-action-snapshot-case-1");
    expect(snapshot.textContent).toContain("cases-evidence-readiness");
    expect(snapshot.textContent).toContain("cases-evidence-incomplete");
  });

  it("shows notice draft readiness in the scan-level action snapshot", async () => {
    caseChecklistData = {
      defectDocumented: true,
      evidenceAttached: true,
      noticeDrafted: false,
      calendarReminderExported: false,
    };

    render(<CasesPage />);

    const snapshot = await screen.findByTestId("cases-action-snapshot-case-1");
    expect(snapshot.textContent).toContain("cases-notice-readiness");
    expect(snapshot.textContent).toContain("cases-notice-pending");
  });

  it("summarizes audit readiness and missing package items in the scan-level action snapshot", async () => {
    caseChecklistData = {
      defectDocumented: true,
      evidenceAttached: true,
      noticeDrafted: false,
      calendarReminderExported: false,
    };
    protocolRows = [];

    render(<CasesPage />);

    const snapshot = await screen.findByTestId("cases-action-snapshot-case-1");
    expect(snapshot.textContent).toContain("cases-audit-readiness");
    expect(snapshot.textContent).toContain("2/5 cases-audit-ready");
    expect(snapshot.textContent).toContain("cases-audit-missing");
    expect(snapshot.textContent).toContain("cases-checklist-notice-drafted");
    expect(snapshot.textContent).toContain("cases-checklist-calendar-exported");
    expect(snapshot.textContent).toContain("cases-linked-protocols");
  });

  it("shows an ordered legal milestone timeline in expanded case details", async () => {
    render(<CasesPage />);

    const timeline = await screen.findByTestId("cases-legal-timeline-case-1");
    const milestones = Array.from(timeline.querySelectorAll("li")).map((item) => item.textContent);

    expect(milestones).toEqual([
      "cases-legal-milestone-contract01.03.2026",
      "cases-legal-milestone-discovery21.03.2026",
      "cases-legal-milestone-notice-deadline20.05.2026",
    ]);
  });

  it("shows finalized linked protocol events in the ordered legal timeline", async () => {
    protocolRows = [
      {
        id: "protocol-finalized-1",
        case_id: "case-1",
        status: "finalized",
        finalized_at: "2026-03-25T10:00:00.000Z",
      },
      {
        id: "protocol-draft-1",
        case_id: "case-1",
        status: "draft",
        finalized_at: "2026-03-24T10:00:00.000Z",
      },
    ];

    render(<CasesPage />);

    const timeline = await screen.findByTestId("cases-legal-timeline-case-1");
    const milestones = Array.from(timeline.querySelectorAll("li")).map((item) => item.textContent);

    expect(milestones).toEqual([
      "cases-legal-milestone-contract01.03.2026",
      "cases-legal-milestone-discovery21.03.2026",
      "cases-legal-milestone-protocol-finalized25.03.2026",
      "cases-legal-milestone-notice-deadline20.05.2026",
    ]);
  });

  it("shows source-bound evidence uploads in the ordered legal timeline", async () => {
    activityRows = [
      {
        id: "activity-1",
        user_id: "user-1",
        case_id: "case-1",
        evidence_id: "evidence-1",
        event_type: "evidence_uploaded",
        source_name: "balcony-crack.jpg",
        source_mime_type: "image/jpeg",
        source_size_bytes: 2048,
        occurred_at: "2026-03-25T23:30:00.000Z",
      },
    ];

    render(<CasesPage />);

    const timeline = await screen.findByTestId("cases-legal-timeline-case-1");
    expect(timeline.textContent).toContain("cases-legal-milestone-evidence-uploaded");
    expect(timeline.textContent).toContain("balcony-crack.jpg");
    const evidenceMilestone = Array.from(timeline.querySelectorAll("li")).find((item) =>
      item.textContent?.includes("balcony-crack.jpg")
    );
    expect(evidenceMilestone?.querySelector("time")?.getAttribute("datetime")).toBe("2026-03-26");
  });

  it("keeps case chronology available when evidence activity loading fails", async () => {
    activityQueryError = true;

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    const timeline = await screen.findByTestId("cases-legal-timeline-case-1");
    expect(timeline.textContent).toContain("cases-legal-milestone-contract");
    expect(timeline.textContent).not.toContain("cases-legal-milestone-evidence-uploaded");
  });

  it("does not block case chronology while evidence activity is still loading", async () => {
    activityQueryPending = true;

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    expect(await screen.findByTestId("cases-legal-timeline-case-1")).toBeTruthy();
  });

  it("lists only finalized linked protocols and regenerates their source-bound PDF", async () => {
    protocolRows = [
      {
        id: "protocol-finalized-1",
        case_id: "case-1",
        status: "finalized",
        finalized_at: "2026-03-25T10:00:00.000Z",
        project_name: "Alpine Tower handover",
        contractor: "Alpine Build AG",
        client: "Owner AG",
        defect_description: "Cracked balcony edge",
        signature_data: "data:image/png;base64,signature",
      },
      {
        id: "protocol-draft-1",
        case_id: "case-1",
        status: "draft",
        finalized_at: "2026-03-24T10:00:00.000Z",
        project_name: "Draft protocol",
        contractor: "Alpine Build AG",
        client: "Owner AG",
        defect_description: null,
        signature_data: null,
      },
    ];
    const anchorClickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
      render(<CasesPage />);

      const records = await screen.findByTestId("cases-finalized-protocols-case-1");
      expect(records.textContent).toContain("protocol-finalized-1");
      expect(records.textContent).not.toContain("protocol-draft-1");
      expect(protocolSelectColumns.length).toBeGreaterThan(0);
      expect(protocolSelectColumns.every((columns) => columns === "id, case_id, status, finalized_at")).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "cases-download-finalized-protocol" }));

      await screen.findByText("cases-finalized-protocol-download-success");
      expect(protocolSelectColumns).toContain(
        "id, case_id, status, finalized_at, project_name, contractor, client, defect_description, signature_data"
      );
      expect(pdfMock).toHaveBeenCalledTimes(1);
      const pdfDocument = pdfMock.mock.calls[0][0] as {
        props: {
          fileName: string;
          caseId: string;
          contractor: string;
          client: string;
          report: {
            defectEvidence: { kind: string; description?: string };
            signatureCaptured: boolean;
            linkedCaseId: string;
            finalizedAt: string;
          };
        };
      };
      expect(pdfDocument.props).toMatchObject({
        fileName: "Alpine Tower handover",
        caseId: "protocol-finalized-1",
        contractor: "Alpine Build AG",
        client: "Owner AG",
        report: {
          defectEvidence: { kind: "documented", description: "Cracked balcony edge" },
          signatureCaptured: true,
          linkedCaseId: "case-1",
          finalizedAt: "2026-03-25T10:00:00.000Z",
        },
      });
      expect(anchorClickMock).toHaveBeenCalledTimes(1);
      expect((anchorClickMock.mock.instances[0] as HTMLAnchorElement).download).toBe(
        "baucompliance-protocol-protocol-finalized-1.pdf"
      );
    } finally {
      anchorClickMock.mockRestore();
    }
  });

  it("locks same-case actions while a finalized protocol PDF is being prepared", async () => {
    protocolRows = [
      {
        id: "protocol-finalized-1",
        case_id: "case-1",
        status: "finalized",
        finalized_at: "2026-03-25T10:00:00.000Z",
        project_name: "Alpine Tower handover",
        contractor: "Alpine Build AG",
        client: "Owner AG",
        defect_description: "Cracked balcony edge",
        signature_data: "data:image/png;base64,signature",
      },
    ];
    pdfToBlobMock.mockImplementationOnce(() => new Promise<Blob>(() => undefined));

    render(<CasesPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "cases-download-finalized-protocol" })
    );

    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: "cases-finalized-protocol-generating" }) as HTMLButtonElement).disabled
      ).toBe(true);
      expect((screen.getByRole("button", { name: "cases-edit" }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByRole("link", { name: "cases-open-in-vault" })).toBeNull();
      expect((screen.getByLabelText("cases-checklist-defect-documented") as HTMLInputElement).disabled).toBe(true);
    });
  });

  it("downloads the case legal chronology CSV without persisting state", async () => {
    protocolRows = [
      {
        id: "protocol-finalized-1",
        case_id: "case-1",
        status: "finalized",
        finalized_at: "2026-03-25T10:00:00.000Z",
      },
    ];
    activityRows = [
      {
        id: "activity-1",
        user_id: "user-1",
        case_id: "case-1",
        evidence_id: "evidence-1",
        event_type: "evidence_uploaded",
        source_name: "balcony-crack.jpg",
        source_mime_type: "image/jpeg",
        source_size_bytes: 2048,
        occurred_at: "2026-03-25T23:30:00.000Z",
      },
    ];
    const anchorClickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
      render(<CasesPage />);

      fireEvent.click(
        await screen.findByRole("button", { name: "cases-export-chronology-csv" })
      );

      expect(buildCaseLegalChronologyCsvMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "case-1",
          projectName: "Alpine Tower",
          canton: "ZH",
        }),
        [
          {
            id: "protocol-finalized-1",
            status: "finalized",
            createdAt: "2026-03-25T10:00:00.000Z",
          },
        ],
        [
          {
            id: "activity-1",
            evidenceId: "evidence-1",
            eventType: "evidence_uploaded",
            sourceName: "balcony-crack.jpg",
            occurredAt: "2026-03-25T23:30:00.000Z",
          },
        ],
        {
          title: "cases-chronology-title",
          generatedAt: "cases-chronology-generated-at",
          caseId: "cases-chronology-case-id",
          projectName: "cases-chronology-project",
          canton: "cases-chronology-canton",
          date: "cases-chronology-date",
          milestone: "cases-chronology-milestone",
          sourceId: "cases-chronology-source-id",
          sourceName: "cases-chronology-source-name",
          milestones: {
            contract: "cases-legal-milestone-contract",
            discovery: "cases-legal-milestone-discovery",
            "evidence-uploaded": "cases-legal-milestone-evidence-uploaded",
            "protocol-finalized": "cases-legal-milestone-protocol-finalized",
            "notice-dispatched": "cases-legal-milestone-notice-dispatched",
            "notice-deadline": "cases-legal-milestone-notice-deadline",
          },
          dispatchChannels: {
            "registered-mail": "cases-notice-dispatch-channel-registered-mail",
            "a-mail-plus": "cases-notice-dispatch-channel-a-mail-plus",
            courier: "cases-notice-dispatch-channel-courier",
            "hand-delivery": "cases-notice-dispatch-channel-hand-delivery",
          },
        },
        expect.any(Date),
        []
      );
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      const blob = createObjectURLMock.mock.calls[0][0] as Blob;
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("text/csv;charset=utf-8");
      expect(anchorClickMock).toHaveBeenCalledTimes(1);
      const clickedAnchor = anchorClickMock.mock.instances[0] as HTMLAnchorElement;
      expect(clickedAnchor.download).toBe(
        "baucompliance-case-case-1-chronology.csv"
      );
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:case-reminder");
      expect(updateEqMock).not.toHaveBeenCalled();
    } finally {
      anchorClickMock.mockRestore();
    }
  });

  it("locks same-case actions while the audit dossier PDF is being prepared", async () => {
    pdfToBlobMock.mockImplementationOnce(() => new Promise<Blob>(() => undefined));

    render(<CasesPage />);

    const dossierButton = await screen.findByRole("button", { name: "cases-export-dossier-pdf" });
    fireEvent.click(dossierButton);

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "cases-dossier-title" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "cases-edit" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByTitle("cases-delete") as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByRole("link", { name: "cases-open-in-vault" })).toBeNull();
      expect(screen.queryByRole("link", { name: "cases-create-protocol" })).toBeNull();
      expect((screen.getByLabelText("cases-checklist-defect-documented") as HTMLInputElement).disabled).toBe(true);
    });
  });

  it("downloads a source-bound case audit dossier PDF", async () => {
    protocolRows = [
      {
        id: "protocol-finalized-1",
        case_id: "case-1",
        status: "finalized",
        finalized_at: "2026-03-25T10:00:00.000Z",
      },
    ];
    caseChecklistData = {
      defectDocumented: true,
      evidenceAttached: false,
      noticeDrafted: true,
      calendarReminderExported: false,
    };
    const anchorClickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
      render(<CasesPage />);

      fireEvent.click(
        await screen.findByRole("button", { name: "cases-export-dossier-pdf" })
      );

      await screen.findByText("cases-dossier-download-success");
      expect(pdfMock).toHaveBeenCalledTimes(1);
      const pdfDocument = pdfMock.mock.calls[0][0] as {
        props: { report: { caseId: string; projectName: string; readiness: { missing: string[] }; milestones: Array<{ sourceId: string | null }> } };
      };
      expect(pdfDocument.props.report).toMatchObject({
        caseId: "case-1",
        projectName: "Alpine Tower",
        readiness: {
          missing: ["cases-checklist-evidence-attached", "cases-checklist-calendar-exported"],
        },
      });
      expect(pdfDocument.props.report.milestones.some((milestone) => milestone.sourceId === "protocol-finalized-1")).toBe(true);
      expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob));
      expect(anchorClickMock).toHaveBeenCalledTimes(1);
      const clickedAnchor = anchorClickMock.mock.instances[0] as HTMLAnchorElement;
      expect(clickedAnchor.download).toBe("baucompliance-case-case-1-audit-dossier.pdf");
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:case-reminder");
      expect(updateEqMock).not.toHaveBeenCalled();
    } finally {
      anchorClickMock.mockRestore();
    }
  });

  it("downloads the filtered audit register from the visible case view", async () => {
    caseChecklistData = {
      defectDocumented: true,
      evidenceAttached: false,
      noticeDrafted: false,
      calendarReminderExported: true,
    };
    protocolRows = [{ case_id: "case-1" }, { case_id: "case-1" }];
    statusQueryParam = "warning";
    const anchorClickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
      render(<CasesPage />);

      const exportButton = await screen.findByRole("button", { name: "cases-export-audit-register" });
      const timelineBuildCount = buildComplianceCaseTimelineMock.mock.calls.length;

      fireEvent.click(exportButton);

      expect(buildComplianceCaseTimelineMock).toHaveBeenCalledTimes(timelineBuildCount + 1);
      expect(buildCaseAuditRegisterCsvMock).toHaveBeenCalledWith(
        [
          {
            item: expect.objectContaining({
              id: "case-1",
              projectName: "Alpine Tower",
              canton: "ZH",
            }),
            checklist: {
              defectDocumented: true,
              evidenceAttached: false,
              noticeDrafted: false,
              calendarReminderExported: true,
            },
            protocolCount: 2,
          },
        ],
        {
          title: "cases-audit-register-title",
          generatedAt: "cases-chronology-generated-at",
          caseId: "cases-chronology-case-id",
          projectName: "cases-chronology-project",
          canton: "cases-chronology-canton",
          regime: "cases-audit-register-regime",
          status: "cases-audit-register-status",
          noticeDeadline: "cases-notice-deadline",
          checklistProgress: "cases-audit-register-checklist",
          linkedProtocols: "cases-linked-protocols",
          auditReadiness: "cases-audit-readiness",
          regimes: {
            old: "cases-old-law",
            new: "cases-new-law",
          },
          statuses: {
            ok: "cases-status-on-track",
            warning: "cases-status-attention",
            urgent: "cases-status-urgent",
            expired: "cases-status-expired",
            "immediate-notice": "cases-status-immediate-notice",
          },
        },
        expect.any(Date)
      );
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(anchorClickMock).toHaveBeenCalledTimes(1);
      const clickedAnchor = anchorClickMock.mock.instances[0] as HTMLAnchorElement;
      expect(clickedAnchor.download).toBe("baucompliance-case-audit-register.csv");
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:case-reminder");
      expect(updateEqMock).not.toHaveBeenCalled();
    } finally {
      anchorClickMock.mockRestore();
    }
  });

  it("refreshes filtered export eligibility when the calendar day changes", async () => {
    statusQueryParam = "urgent";
    let refreshCalendarDay: (() => void) | undefined;
    const nativeSetTimeout = window.setTimeout.bind(window);
    const setTimeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation((handler, timeout, ...args) => {
      if (typeof handler === "function" && (timeout ?? 0) > 60_000) {
        refreshCalendarDay = handler;
        return nativeSetTimeout(() => {}, 0) as never;
      }
      return nativeSetTimeout(handler, timeout, ...args) as never;
    });

    try {
      render(<CasesPage />);

      const exportButton = await screen.findByRole("button", { name: "cases-export-audit-register" });
      await waitFor(() => {
        expect(buildComplianceCaseTimelineMock.mock.calls.length).toBeGreaterThan(1);
      });
      expect((exportButton as HTMLButtonElement).disabled).toBe(true);

      timelineStatus = "urgent";
      expect(refreshCalendarDay).toBeTypeOf("function");
      act(() => refreshCalendarDay?.());

      expect((exportButton as HTMLButtonElement).disabled).toBe(false);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("disables the audit register export while a visible checklist save is pending", async () => {
    let resolveUpdate!: (result: { data: true, error: null }) => void;
    updateEqMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );

    render(<CasesPage />);

    const checkbox = await screen.findByLabelText("cases-checklist-evidence-attached");
    const exportButton = screen.getByRole("button", { name: "cases-export-audit-register" });

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect((exportButton as HTMLButtonElement).disabled).toBe(true);
    });
    fireEvent.click(exportButton);
    expect(buildCaseAuditRegisterCsvMock).not.toHaveBeenCalled();

    resolveUpdate({ data: true, error: null });

    await waitFor(() => {
      expect((exportButton as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("applies the authoritative merged checklist returned by the per-key mutation", async () => {
    concurrentChecklistRpcData = { evidenceAttached: true };

    render(<CasesPage />);

    const evidenceCheckbox = await screen.findByLabelText("cases-checklist-evidence-attached");
    const noticeCheckbox = screen.getByLabelText("cases-checklist-notice-drafted");
    expect((evidenceCheckbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(noticeCheckbox);

    await waitFor(() => {
      expect((noticeCheckbox as HTMLInputElement).checked).toBe(true);
      expect((evidenceCheckbox as HTMLInputElement).checked).toBe(true);
    });
  });

  it("rolls back an optimistic checklist toggle and shows inline feedback when persistence fails", async () => {
    updateEqMock.mockResolvedValueOnce({ error: { message: "boom" } });

    render(<CasesPage />);

    const checkbox = await screen.findByLabelText("cases-checklist-evidence-attached");
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect((checkbox as HTMLInputElement).checked).toBe(false);
    });
    expect(screen.getByText("cases-checklist-save-error")).toBeTruthy();
  });

  it("rolls back and unlocks checklist inputs when persistence throws", async () => {
    updateEqMock.mockRejectedValueOnce(new Error("network"));

    render(<CasesPage />);

    const checkbox = await screen.findByLabelText("cases-checklist-evidence-attached");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect((checkbox as HTMLInputElement).disabled).toBe(false);
      expect((checkbox as HTMLInputElement).checked).toBe(false);
    });
    expect(screen.getByText("cases-checklist-save-error")).toBeTruthy();
  });

  it("disables reminder export while checklist persistence is in flight", async () => {
    let resolveUpdate: (value: { data: true, error: null }) => void = () => {};
    updateEqMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        })
    );

    render(<CasesPage />);

    const checkbox = await screen.findByLabelText("cases-checklist-evidence-attached");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect((screen.getByText("cases-export-ics").closest("button") as HTMLButtonElement).disabled).toBe(true);
    });

    resolveUpdate({ data: true, error: null });

    await waitFor(() => {
      expect((screen.getByText("cases-export-ics").closest("button") as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("keeps calendar reminder export complete when the reminder is downloaded again", async () => {
    updateEqMock.mockResolvedValueOnce({ data: true, error: null });
    caseChecklistData = {
      defectDocumented: true,
      evidenceAttached: true,
      noticeDrafted: true,
      calendarReminderExported: true,
    };

    render(<CasesPage />);

    const calendarCheckbox = await screen.findByLabelText("cases-checklist-calendar-exported");
    expect((calendarCheckbox as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "cases-export-ics" }));

    await waitFor(() => {
      expect(updateEqMock).toHaveBeenCalledWith("case-1");
      expect(checklistRpcNames).toEqual(["set_case_checklist_item"]);
    });
    expect(updatePayloads[0].checklist?.calendarReminderExported).toBe(true);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-checklist-calendar-exported") as HTMLInputElement).checked).toBe(true);
    });
    expect(screen.getByRole("status").textContent).toBe("cases-export-ics-ready");
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:case-reminder");
  });

  it("shows a localized error and does not mark complete when case reminder export preparation fails", async () => {
    createObjectURLMock.mockImplementationOnce(() => {
      throw new Error("blob blocked");
    });

    render(<CasesPage />);

    const calendarCheckbox = await screen.findByLabelText("cases-checklist-calendar-exported");
    expect((calendarCheckbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "cases-export-ics" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("cases-export-ics-error");
    });
    expect(updateEqMock).not.toHaveBeenCalled();
    expect((screen.getByLabelText("cases-checklist-calendar-exported") as HTMLInputElement).checked).toBe(false);
  });

  it("locks row edit, delete, and navigation actions while checklist persistence is in flight", async () => {
    let resolveUpdate: (value: { data: true, error: null }) => void = () => {};
    updateEqMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        })
    );

    render(<CasesPage />);

    expect(await screen.findByRole("link", { name: "cases-open-in-vault" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: "cases-create-protocol" })).toBeTruthy();

    const checkbox = await screen.findByLabelText("cases-checklist-evidence-attached");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "cases-edit" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByTitle("cases-delete") as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByRole("link", { name: "cases-open-in-vault" })).toBeNull();
      expect(screen.queryByRole("link", { name: "cases-create-protocol" })).toBeNull();
      expect(screen.getByText("cases-open-in-vault").getAttribute("aria-disabled")).toBe("true");
      expect(screen.getByText("cases-create-protocol").getAttribute("aria-disabled")).toBe("true");
    });

    resolveUpdate({ data: true, error: null });

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "cases-edit" }) as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByTitle("cases-delete") as HTMLButtonElement).disabled).toBe(false);
      expect(screen.getByRole("link", { name: "cases-open-in-vault" }).getAttribute("href")).toBe("/dashboard/vault?q=Alpine+Tower");
      expect(screen.getByRole("link", { name: "cases-create-protocol" }).getAttribute("href")).toBe("/dashboard?case=case-1");
    });
  });

  it("temporarily disables checklist inputs while a save is in flight and re-enables them after success", async () => {
    let resolveUpdate: (value: { data: true, error: null }) => void = () => {};
    updateEqMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        })
    );

    render(<CasesPage />);

    const checkbox = await screen.findByLabelText("cases-checklist-evidence-attached");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect((checkbox as HTMLInputElement).disabled).toBe(true);
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    });

    resolveUpdate({ data: true, error: null });

    await waitFor(() => {
      const refreshedCheckbox = screen.getByLabelText("cases-checklist-evidence-attached") as HTMLInputElement;
      expect(refreshedCheckbox.disabled).toBe(false);
    });
    expect(screen.queryByText("cases-checklist-save-error")).toBeNull();
  });
});
