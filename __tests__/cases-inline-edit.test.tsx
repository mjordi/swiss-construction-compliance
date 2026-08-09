import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const replaceMock = vi.fn();
const updateEqMock = vi.fn();
const deleteEqMock = vi.fn();
const insertMock = vi.fn();
const noticeDraftInsertMock = vi.fn();
let casesSelectResponses: Array<
  | { data: CaseRecord[] | null; error: { message: string } | null }
  | Promise<{ data: CaseRecord[] | null; error: { message: string } | null }>
> = [];
let protocolsSelectResponses: Array<
  | { data: Array<{ case_id: string | null }> | null; error: { message: string } | null }
  | Promise<{ data: Array<{ case_id: string | null }> | null; error: { message: string } | null }>
> = [];
let noticeDraftSelectResponses: Array<
  | { data: NoticeDraftRecord[] | null; error: { message: string } | null }
  | Promise<{ data: NoticeDraftRecord[] | null; error: { message: string } | null }>
> = [];
let activitySelectResponses: Array<
  | { data: ActivityRecord[] | null; error: { message: string } | null }
  | Promise<{ data: ActivityRecord[] | null; error: { message: string } | null }>
> = [];

type CaseRecord = {
  id: string;
  user_id: string;
  project_name: string;
  canton: string;
  contract_date: string;
  discovery_date: string;
  notice_recipient_name: string | null;
  notice_recipient_address: string | null;
  defect_statement: string | null;
  checklist: Record<string, boolean> | null;
  created_at: string;
  updated_at: string;
  status: string;
};

type NoticeDraftRecord = {
  id: string;
  user_id: string;
  case_id: string;
  project_name: string;
  canton: string;
  notice_recipient_name: string;
  notice_recipient_address: string;
  defect_statement: string;
  contract_date: string;
  discovery_date: string;
  notice_deadline: string | null;
  regime: "old" | "new";
  created_at: string;
};

type ActivityRecord = {
  id: string;
  user_id: string;
  case_id: string;
  evidence_id: string;
  event_type: "evidence-uploaded";
  source_name: string;
  source_mime_type: string;
  source_size_bytes: number;
  occurred_at: string;
};

let casesData: CaseRecord[] = [];
let noticeDraftsData: NoticeDraftRecord[] = [];
let authUser: { id: string } | null = { id: "user-1" };
let oldLawCaseIds = new Set<string>();
let activeLanguage: "de" | "fr" | "it" | "en" = "de";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/cases",
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => "",
  }),
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: activeLanguage,
    t: (key: string) => key,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: authUser,
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

vi.mock("@/lib/case-timeline", () => ({
  applyComplianceCaseView: (cases: unknown[]) => cases,
  buildComplianceCaseTimeline: (
    inputs: Array<{ id: string; projectName: string; canton: string; contractDate: Date; discoveryDate: Date }>
  ) =>
    inputs.map((input) => {
      const isOldLawCase = oldLawCaseIds.has(input.id);
      return {
        id: input.id,
        projectName: input.projectName,
        canton: input.canton,
        status: "warning",
        statusLabel: "Warning",
        deadlineCountdownTone: "warning",
        deadlineCountdownLabel: "10 days left",
        regimeLabel: isOldLawCase ? "Old law" : "New law",
        regime: isOldLawCase ? "old" : "new",
        noticeApplies: !isOldLawCase,
        noticeDeadline: isOldLawCase ? null : new Date("2026-05-20T00:00:00.000Z"),
        noticeDeadlineLabel: isOldLawCase ? "No fixed 60-day deadline" : "2026-05-20",
        contractDateLabel: input.contractDate.toISOString().slice(0, 10),
        discoveryDateLabel: input.discoveryDate.toISOString().slice(0, 10),
        nextAction: "Draft notice",
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
      };
    }),
  buildCaseDeadlineReminderICS: () => "BEGIN:VCALENDAR\nEND:VCALENDAR",
  deriveCaseLegalMilestones: (
    item: { contractDateLabel: string; discoveryDateLabel: string; noticeDeadlineLabel: string },
    _protocols: unknown[],
    evidence: Array<{ id: string; sourceName: string; occurredAt: string }>
  ) => [
    { kind: "contract", date: new Date("2026-03-01"), dateLabel: item.contractDateLabel },
    { kind: "discovery", date: new Date("2026-03-21"), dateLabel: item.discoveryDateLabel },
    ...evidence.map((event) => ({
      id: event.id,
      kind: "evidence-uploaded",
      date: new Date(event.occurredAt),
      dateLabel: event.occurredAt.slice(0, 10),
      sourceName: event.sourceName,
    })),
    { kind: "notice-deadline", date: new Date("2026-05-20"), dateLabel: item.noticeDeadlineLabel },
  ],
  deriveChecklistProgress: (checklist: Record<string, boolean>) => ({
    completed: Object.values(checklist).filter(Boolean).length,
    total: Object.keys(checklist).length,
    label: "progress",
  }),
  isDeadlineReminderIcsExportEligible: () => false,
}));

vi.mock("@/lib/supabase", () => {
  const supabaseMock = {
    rpc: async (
      name: string,
      params: { target_case_id: string; target_key?: string; target_value?: boolean }
    ) => {
      if (name === "delete_case_with_evidence") {
        const result = await deleteEqMock("id", params.target_case_id);
        return {
          data: result?.error ? null : { deleted: true, storage_paths: [] },
          error: result?.error ?? null,
        };
      }
      if (name === "complete_case_evidence_cleanup") {
        return { data: true, error: null };
      }
      expect(name).toBe("set_case_checklist_item");
      const current = casesData.find((item) => item.id === params.target_case_id);
      const checklist = {
        ...(current?.checklist ?? {}),
        [params.target_key as string]: params.target_value as boolean,
      };
      const result = await updateEqMock({ checklist }, "id", params.target_case_id);
      return { data: result?.error ? null : checklist, error: result?.error ?? null };
    },
    from: (table: string) => {
      if (table === "cases") {
        return {
          select: () => ({
            eq: () => ({
              order: () => {
                const nextResponse = casesSelectResponses.shift();
                return Promise.resolve(nextResponse ?? { data: casesData, error: null });
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (field: string, caseId: string) => updateEqMock(payload, field, caseId),
          }),
          delete: () => ({
            eq: (field: string, caseId: string) => deleteEqMock(field, caseId),
          }),
          insert: insertMock,
        };
      }

      if (table === "protocols") {
        return {
          select: () => ({
            eq: () => ({
              not: () => {
                const nextResponse = protocolsSelectResponses.shift();
                return Promise.resolve(nextResponse ?? { data: [], error: null });
              },
            }),
          }),
        };
      }

      if (table === "latest_case_notice_drafts") {
        return {
          select: () => ({
            eq: () => {
              const nextResponse = noticeDraftSelectResponses.shift();
              return Promise.resolve(nextResponse ?? { data: noticeDraftsData, error: null });
            },
          }),
        };
      }

      if (table === "case_notice_drafts") {
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: () => noticeDraftInsertMock(payload),
            }),
          }),
        };
      }

      if (table === "case_activity_events") {
        return {
          select: () => ({
            eq: () => ({
              order: () => {
                const nextResponse = activitySelectResponses.shift();
                return Promise.resolve(nextResponse ?? { data: [], error: null });
              },
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return {
    getSupabase: () => supabaseMock,
  };
});

vi.mock("@/lib/case-evidence-cleanup", () => ({
  listCaseEvidenceObjectPaths: vi.fn().mockResolvedValue([]),
  removeCaseEvidenceObjects: vi.fn().mockResolvedValue(undefined),
  scheduleCaseEvidenceCleanupRetry: vi.fn(() => () => undefined),
}));

import CasesPage from "@/app/dashboard/cases/page";

function buildCase(id: string, projectName: string): CaseRecord {
  return {
    id,
    user_id: "user-1",
    project_name: projectName,
    canton: "ZH",
    contract_date: "2026-03-01T00:00:00.000Z",
    discovery_date: "2026-03-21T00:00:00.000Z",
    notice_recipient_name: id === "case-1" ? "Alpine Build AG" : null,
    notice_recipient_address: id === "case-1" ? "Werkstrasse 4\n8000 Zürich" : null,
    defect_statement: id === "case-1" ? "Water ingress at the north facade." : null,
    checklist: null,
    created_at: "2026-03-21T00:00:00.000Z",
    updated_at: "2026-03-21T00:00:00.000Z",
    status: "active",
  };
}

function buildNoticeDraft(id: string, overrides: Partial<NoticeDraftRecord> = {}): NoticeDraftRecord {
  return {
    id,
    user_id: "user-1",
    case_id: "case-1",
    project_name: "Saved Alpine Tower",
    canton: "ZH",
    notice_recipient_name: "Saved Builder AG",
    notice_recipient_address: "Saved Road 1\n8000 Zürich",
    defect_statement: "Saved immutable defect.",
    contract_date: "2026-03-01",
    discovery_date: "2026-03-21",
    notice_deadline: "2026-05-20",
    regime: "new",
    created_at: "2026-08-09T08:30:00.000Z",
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("cases inline edit", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    updateEqMock.mockReset();
    deleteEqMock.mockReset();
    insertMock.mockReset().mockResolvedValue({ error: null });
    noticeDraftInsertMock.mockReset().mockImplementation(async (payload: Record<string, unknown>) => {
      const row = {
        ...payload,
        id: `draft-${noticeDraftsData.length + 1}`,
        created_at: "2026-08-09T08:30:00.000Z",
      } as NoticeDraftRecord;
      noticeDraftsData = [row, ...noticeDraftsData];
      return { data: row, error: null };
    });
    casesSelectResponses = [];
    protocolsSelectResponses = [];
    noticeDraftSelectResponses = [];
    activitySelectResponses = [];
    noticeDraftsData = [];
    casesData = [buildCase("case-1", "Alpine Tower"), buildCase("case-2", "Riverside Hall")];
    authUser = { id: "user-1" };
    oldLawCaseIds = new Set<string>();
    activeLanguage = "de";
  });

  it("reviews complete and incomplete notice source facts and persists normalized edits", async () => {
    updateEqMock.mockImplementationOnce(async (payload: Record<string, unknown>, field: string, caseId: string) => {
      expect(payload).toMatchObject({
        notice_recipient_name: "New Builder AG",
        notice_recipient_address: "Main Road 8\n3000 Bern",
        defect_statement: "Cracked waterproofing membrane.",
      });
      expect(field).toBe("id");
      expect(caseId).toBe("case-1");
      return { error: null };
    });

    render(<CasesPage />);

    const completeCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    const incompleteCard = screen.getByText("Riverside Hall").closest("article") as HTMLElement;
    expect(within(completeCard).getByText("cases-notice-source-complete")).toBeTruthy();
    expect(within(completeCard).getByText("Alpine Build AG")).toBeTruthy();
    const addressReview = within(completeCard).getByText("cases-notice-recipient-address").nextElementSibling;
    expect(addressReview?.textContent).toBe("Werkstrasse 4\n8000 Zürich");
    expect(addressReview?.classList.contains("whitespace-pre-wrap")).toBe(true);
    const defectReview = within(completeCard).getByText("Water ingress at the north facade.");
    expect(defectReview.classList.contains("whitespace-pre-wrap")).toBe(true);
    expect(within(incompleteCard).getByText("cases-notice-source-incomplete")).toBeTruthy();

    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-edit" }));
    fireEvent.change(within(completeCard).getByLabelText("cases-notice-recipient-name"), {
      target: { value: "  New Builder AG  " },
    });
    fireEvent.change(within(completeCard).getByLabelText("cases-notice-recipient-address"), {
      target: { value: "  Main Road 8\n3000 Bern  " },
    });
    fireEvent.change(within(completeCard).getByLabelText("cases-defect-statement"), {
      target: { value: "  Cracked waterproofing membrane.  " },
    });
    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-save" }));

    await waitFor(() => expect(updateEqMock).toHaveBeenCalledTimes(1));
  });

  it("reveals a per-case notice preview only from complete persisted source facts", async () => {
    render(<CasesPage />);

    const completeCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    await waitFor(() => {
      expect(casesSelectResponses).toHaveLength(0);
      expect(protocolsSelectResponses).toHaveLength(0);
      expect(screen.queryByText("cases-loading")).toBeNull();
    });
    const incompleteCard = screen.getByText("Riverside Hall").closest("article") as HTMLElement;
    const completeButton = within(completeCard).getByRole("button", { name: "cases-notice-preview-show" });
    const incompleteButton = within(incompleteCard).getByRole("button", { name: "cases-notice-preview-show" });

    expect((incompleteButton as HTMLButtonElement).disabled).toBe(true);
    const unavailableExplanation = within(incompleteCard).getByText("cases-notice-preview-unavailable");
    expect(incompleteButton.getAttribute("aria-describedby")).toBe(unavailableExplanation.id);
    expect(within(completeCard).queryByTestId("cases-notice-preview-case-1")).toBeNull();
    expect(within(incompleteCard).queryByTestId("cases-notice-preview-case-2")).toBeNull();

    fireEvent.click(completeButton);

    expect(completeButton.getAttribute("aria-expanded")).toBe("true");
    const preview = within(completeCard).getByTestId("cases-notice-preview-case-1");
    expect(within(preview).getByText("cases-notice-preview-title")).toBeTruthy();
    expect(within(preview).getByText("cases-notice-preview-status")).toBeTruthy();
    expect(within(preview).getByText("Alpine Build AG")).toBeTruthy();
    const previewAddress = within(preview).getByText("cases-notice-recipient-address").nextElementSibling as HTMLElement;
    expect(previewAddress.textContent).toBe("Werkstrasse 4\n8000 Zürich");
    expect(previewAddress.classList.contains("whitespace-pre-wrap")).toBe(true);
    expect(within(preview).getByText("Water ingress at the north facade.")).toBeTruthy();
    expect(within(preview).getByText("Alpine Tower")).toBeTruthy();
    expect(within(preview).getByText("ZH")).toBeTruthy();
    expect(within(preview).getByText("2026-03-01")).toBeTruthy();
    expect(within(preview).getByText("2026-03-21")).toBeTruthy();
    expect(within(preview).getByText("2026-05-20")).toBeTruthy();
    expect(within(preview).getByText("cases-notice-preview-safety")).toBeTruthy();
    expect(within(incompleteCard).queryByTestId("cases-notice-preview-case-2")).toBeNull();

    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-notice-preview-hide" }));

    await waitFor(() => {
      expect(completeButton.getAttribute("aria-expanded")).toBe("false");
      expect(within(completeCard).queryByTestId("cases-notice-preview-case-1")).toBeNull();
    });
  });

  it("localizes the no-fixed-deadline value in old-law notice previews", async () => {
    oldLawCaseIds.add("case-1");

    render(<CasesPage />);

    const completeCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-notice-preview-show" }));

    const preview = within(completeCard).getByTestId("cases-notice-preview-case-1");
    expect(within(preview).getByText("cases-not-fixed")).toBeTruthy();
    expect(within(preview).queryByText("No fixed 60-day deadline")).toBeNull();
  });

  it("closes and resets an open preview when a persisted edit makes its source incomplete", async () => {
    updateEqMock.mockImplementation(async (payload: Record<string, unknown>, _field: string, caseId: string) => {
      casesData = casesData.map((item) => item.id === caseId
        ? {
            ...item,
            defect_statement:
              typeof payload.defect_statement === "string" || payload.defect_statement === null
                ? payload.defect_statement
                : item.defect_statement,
          }
        : item);
      return { error: null };
    });

    render(<CasesPage />);

    const completeCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    await waitFor(() => {
      expect(casesSelectResponses).toHaveLength(0);
      expect(protocolsSelectResponses).toHaveLength(0);
      expect(screen.queryByText("cases-loading")).toBeNull();
    });
    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-notice-preview-show" }));
    expect(within(completeCard).getByTestId("cases-notice-preview-case-1")).toBeTruthy();

    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-edit" }));
    fireEvent.change(within(completeCard).getByLabelText("cases-defect-statement"), {
      target: { value: "   " },
    });
    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-save" }));

    await waitFor(() => {
      const disabledPreviewButton = within(completeCard).getByRole("button", { name: "cases-notice-preview-show" }) as HTMLButtonElement;
      expect(updateEqMock).toHaveBeenCalledTimes(1);
      expect(within(completeCard).queryByLabelText("cases-defect-statement")).toBeNull();
      expect(disabledPreviewButton.disabled).toBe(true);
      expect(disabledPreviewButton.getAttribute("aria-expanded")).toBe("false");
      expect(within(completeCard).queryByTestId("cases-notice-preview-case-1")).toBeNull();
    });

    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-edit" }));
    fireEvent.change(within(completeCard).getByLabelText("cases-defect-statement"), {
      target: { value: "Repaired membrane still leaks." },
    });
    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-save" }));

    await waitFor(() => {
      const reenabledPreviewButton = within(completeCard).getByRole("button", { name: "cases-notice-preview-show" }) as HTMLButtonElement;
      expect(updateEqMock).toHaveBeenCalledTimes(2);
      expect(within(completeCard).queryByLabelText("cases-defect-statement")).toBeNull();
      expect(reenabledPreviewButton.disabled).toBe(false);
      expect(reenabledPreviewButton.getAttribute("aria-expanded")).toBe("false");
      expect(within(completeCard).queryByTestId("cases-notice-preview-case-1")).toBeNull();
    });
  });

  it("forgets an open preview after a successful delete even if refreshed data reintroduces the case", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const refreshCasesDeferred = createDeferred<{ data: CaseRecord[] | null; error: { message: string } | null }>();
    const deletedCase = casesData[0];
    deleteEqMock.mockImplementationOnce(async (_field: string, caseId: string) => {
      casesData = casesData.filter((item) => item.id !== caseId);
      casesSelectResponses.push(refreshCasesDeferred.promise);
      protocolsSelectResponses.push(Promise.resolve({ data: [], error: null }));
      return { error: null };
    });

    render(<CasesPage />);

    const completeCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-notice-preview-show" }));
    expect(within(completeCard).getByTestId("cases-notice-preview-case-1")).toBeTruthy();

    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-delete" }));
    await waitFor(() => expect(screen.queryByText("Alpine Tower")).toBeNull());

    casesData = [deletedCase, ...casesData];
    await act(async () => {
      refreshCasesDeferred.resolve({ data: casesData, error: null });
    });

    const restoredCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    expect(within(restoredCard).getByRole("button", { name: "cases-notice-preview-show" }).getAttribute("aria-expanded")).toBe("false");
    expect(within(restoredCard).queryByTestId("cases-notice-preview-case-1")).toBeNull();

    confirmSpy.mockRestore();
  });

  it("forgets open previews across logout and an actual user change", async () => {
    const { rerender } = render(<CasesPage />);

    const completeCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-notice-preview-show" }));
    expect(within(completeCard).getByTestId("cases-notice-preview-case-1")).toBeTruthy();

    authUser = null;
    rerender(<CasesPage />);
    await waitFor(() => expect(screen.queryByText("Alpine Tower")).toBeNull());

    authUser = { id: "user-2" };
    casesData = [{ ...buildCase("case-1", "Alpine Tower"), user_id: "user-2" }];
    rerender(<CasesPage />);

    const returnedCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    expect(within(returnedCard).getByRole("button", { name: "cases-notice-preview-show" }).getAttribute("aria-expanded")).toBe("false");
    expect(within(returnedCard).queryByTestId("cases-notice-preview-case-1")).toBeNull();
  });

  it("persists normalized notice source facts when creating a case", async () => {
    render(<CasesPage />);
    await screen.findByText("Alpine Tower");

    fireEvent.click(screen.getByRole("button", { name: "cases-add-case" }));
    fireEvent.change(screen.getByLabelText("cases-project-name"), { target: { value: "New Site" } });
    fireEvent.change(screen.getByLabelText("cases-contract-date-input"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("cases-discovery-date-input"), { target: { value: "2026-04-02" } });
    fireEvent.change(screen.getByLabelText("cases-notice-recipient-name"), { target: { value: "  Builder AG  " } });
    fireEvent.change(screen.getByLabelText("cases-notice-recipient-address"), { target: { value: "  Road 1\n8000 Zürich  " } });
    fireEvent.change(screen.getByLabelText("cases-defect-statement"), { target: { value: "  Missing seal.  " } });
    fireEvent.click(screen.getByRole("button", { name: "cases-save" }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      project_name: "New Site",
      notice_recipient_name: "Builder AG",
      notice_recipient_address: "Road 1\n8000 Zürich",
      defect_statement: "Missing seal.",
    })));
  });

  it("keeps inline edit values on failure, clears stale feedback on input change, and shows updated values after a successful retry", async () => {
    updateEqMock
      .mockResolvedValueOnce({ error: { message: "update failed" } })
      .mockImplementationOnce(async (payload: Record<string, unknown>, field: string, caseId: string) => {
        expect(payload).toMatchObject({
          project_name: "Retention House Updated",
          canton: "BE",
          contract_date: "2026-04-01",
          discovery_date: "2026-04-20",
        });
        expect(field).toBe("id");
        expect(caseId).toBe("case-1");
        casesData = casesData.map((item) =>
          item.id === caseId
            ? {
                ...item,
                project_name: "Retention House Updated",
                canton: "BE",
                contract_date: "2026-04-01",
                discovery_date: "2026-04-20",
              }
            : item
        );
        return { error: null };
      });

    render(<CasesPage />);

    const article = (await screen.findByText("Alpine Tower")).closest("article");
    expect(article).toBeTruthy();
    const caseCard = article as HTMLElement;

    fireEvent.click(within(caseCard).getByRole("button", { name: "cases-edit" }));

    fireEvent.change(within(caseCard).getByLabelText("cases-project-name"), {
      target: { value: "Retention House" },
    });
    fireEvent.change(within(caseCard).getByLabelText("cases-canton-label"), {
      target: { value: "BE" },
    });
    fireEvent.change(within(caseCard).getByLabelText("cases-contract-date-input"), {
      target: { value: "2026-04-01" },
    });
    fireEvent.change(within(caseCard).getByLabelText("cases-discovery-date-input"), {
      target: { value: "2026-04-20" },
    });

    fireEvent.click(within(caseCard).getByRole("button", { name: "cases-save" }));

    expect(await within(caseCard).findByText("cases-update-error")).toBeTruthy();
    expect((within(caseCard).getByLabelText("cases-project-name") as HTMLInputElement).value).toBe("Retention House");
    expect((within(caseCard).getByLabelText("cases-canton-label") as HTMLSelectElement).value).toBe("BE");
    expect((within(caseCard).getByLabelText("cases-contract-date-input") as HTMLInputElement).value).toBe("2026-04-01");
    expect((within(caseCard).getByLabelText("cases-discovery-date-input") as HTMLInputElement).value).toBe("2026-04-20");

    fireEvent.change(within(caseCard).getByLabelText("cases-project-name"), {
      target: { value: "Retention House Updated" },
    });

    await waitFor(() => {
      expect(within(caseCard).queryByText("cases-update-error")).toBeNull();
    });

    fireEvent.click(within(caseCard).getByRole("button", { name: "cases-save" }));

    await waitFor(() => {
      expect(within(caseCard).queryByLabelText("cases-project-name")).toBeNull();
    });

    expect(await within(caseCard).findByText("Retention House Updated")).toBeTruthy();
    expect(within(caseCard).getByText("cases-update-success")).toBeTruthy();

    fireEvent.click(within(caseCard).getByRole("button", { name: "cases-edit" }));

    await waitFor(() => {
      expect(within(caseCard).queryByText("cases-update-success")).toBeNull();
    });
  });

  it("locks the inline edit session while a save is pending so values survive a failed request", async () => {
    const deferred = createDeferred<{ error: { message: string } | null }>();
    updateEqMock.mockReturnValueOnce(deferred.promise);

    render(<CasesPage />);

    const firstCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    const secondCard = (await screen.findByText("Riverside Hall")).closest("article") as HTMLElement;

    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-edit" }));
    fireEvent.change(within(firstCard).getByLabelText("cases-project-name"), {
      target: { value: "Alpine Tower Revised" },
    });

    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-save" }));

    await waitFor(() => {
      expect(updateEqMock).toHaveBeenCalledTimes(1);
    });

    const projectNameInput = within(firstCard).getByLabelText("cases-project-name") as HTMLInputElement;
    const cancelButton = within(firstCard).getByRole("button", { name: "cases-cancel" }) as HTMLButtonElement;
    const deleteButton = within(firstCard).getByRole("button", { name: "cases-delete" }) as HTMLButtonElement;
    const secondEditButton = within(secondCard).getByRole("button", { name: "cases-edit" }) as HTMLButtonElement;

    expect(projectNameInput.disabled).toBe(true);
    expect(cancelButton.disabled).toBe(true);
    expect(deleteButton.disabled).toBe(true);
    expect(secondEditButton.disabled).toBe(true);

    fireEvent.click(cancelButton);
    fireEvent.click(deleteButton);
    fireEvent.click(secondEditButton);

    expect((within(firstCard).getByLabelText("cases-project-name") as HTMLInputElement).value).toBe("Alpine Tower Revised");
    expect(within(secondCard).queryByLabelText("cases-project-name")).toBeNull();

    deferred.resolve({ error: { message: "still failed" } });

    expect(await within(firstCard).findByText("cases-update-error")).toBeTruthy();
    expect((within(firstCard).getByLabelText("cases-project-name") as HTMLInputElement).value).toBe("Alpine Tower Revised");
    expect(within(secondCard).queryByLabelText("cases-project-name")).toBeNull();
  });

  it("prevents submitting an inline save while a delete for the same case is pending", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const deferred = createDeferred<{ error: { message: string } | null }>();
    deleteEqMock.mockReturnValueOnce(deferred.promise);

    render(<CasesPage />);

    const firstCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;

    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-edit" }));
    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-delete" }));

    await waitFor(() => {
      expect(deleteEqMock).toHaveBeenCalledWith("id", "case-1");
    });

    const saveButton = within(firstCard).getByRole("button", { name: "cases-save" }) as HTMLButtonElement;
    const cancelButton = within(firstCard).getByRole("button", { name: "cases-cancel" }) as HTMLButtonElement;
    const secondEditButton = within(screen.getByText("Riverside Hall").closest("article") as HTMLElement).getByRole("button", {
      name: "cases-edit",
    }) as HTMLButtonElement;

    expect(saveButton.disabled).toBe(true);
    expect(cancelButton.disabled).toBe(true);
    expect(secondEditButton.disabled).toBe(true);

    fireEvent.click(saveButton);
    fireEvent.click(secondEditButton);
    expect(updateEqMock).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Riverside Hall")).toBeNull();

    deferred.resolve({ error: { message: "delete failed" } });

    await waitFor(() => {
      expect(saveButton.disabled).toBe(false);
    });

    confirmSpy.mockRestore();
  });

  it("prevents submitting an inline save while another case delete is pending", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const deferred = createDeferred<{ error: { message: string } | null }>();
    deleteEqMock.mockReturnValueOnce(deferred.promise);

    render(<CasesPage />);

    const firstCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    const secondCard = (await screen.findByText("Riverside Hall")).closest("article") as HTMLElement;

    fireEvent.click(within(secondCard).getByRole("button", { name: "cases-edit" }));

    const secondSaveButton = within(secondCard).getByRole("button", { name: "cases-save" }) as HTMLButtonElement;
    const secondCancelButton = within(secondCard).getByRole("button", { name: "cases-cancel" }) as HTMLButtonElement;
    const secondProjectNameInput = within(secondCard).getByLabelText("cases-project-name") as HTMLInputElement;

    fireEvent.change(secondProjectNameInput, {
      target: { value: "Riverside Hall Revised" },
    });

    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-delete" }));

    await waitFor(() => {
      expect(deleteEqMock).toHaveBeenCalledWith("id", "case-1");
    });

    expect(secondSaveButton.disabled).toBe(true);
    expect(secondCancelButton.disabled).toBe(true);
    expect(secondProjectNameInput.disabled).toBe(true);

    fireEvent.click(secondSaveButton);
    expect(updateEqMock).not.toHaveBeenCalled();

    deferred.resolve({ error: { message: "delete failed" } });

    await waitFor(() => {
      expect(secondSaveButton.disabled).toBe(false);
    });
    expect(secondProjectNameInput.value).toBe("Riverside Hall Revised");

    confirmSpy.mockRestore();
  });

  it("removes a case from the local list immediately after a successful delete", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteEqMock.mockImplementationOnce(async (field: string, caseId: string) => {
      expect(field).toBe("id");
      expect(caseId).toBe("case-1");
      casesData = casesData.filter((item) => item.id !== caseId);
      return { error: null };
    });

    render(<CasesPage />);

    const firstCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Alpine Tower")).toBeNull();
    });
    expect(screen.getByText("Riverside Hall")).toBeTruthy();

    confirmSpy.mockRestore();
  });

  it("keeps a successfully edited case visible when the follow-up refresh fails", async () => {
    const refreshCasesDeferred = createDeferred<{ data: CaseRecord[] | null; error: { message: string } | null }>();
    updateEqMock.mockImplementationOnce(async (_payload: Record<string, unknown>, _field: string, caseId: string) => {
      casesData = casesData.map((item) =>
        item.id === caseId
          ? {
              ...item,
              project_name: "Alpine Tower Revised",
              canton: "BE",
              contract_date: "2026-04-01",
              discovery_date: "2026-04-20",
            }
          : item
      );
      casesSelectResponses.push(refreshCasesDeferred.promise);
      protocolsSelectResponses.push(Promise.resolve({ data: [], error: null }));
      return { error: null };
    });

    render(<CasesPage />);

    const firstCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-edit" }));

    fireEvent.change(within(firstCard).getByLabelText("cases-project-name"), {
      target: { value: "Alpine Tower Revised" },
    });
    fireEvent.change(within(firstCard).getByLabelText("cases-canton-label"), {
      target: { value: "BE" },
    });
    fireEvent.change(within(firstCard).getByLabelText("cases-contract-date-input"), {
      target: { value: "2026-04-01" },
    });
    fireEvent.change(within(firstCard).getByLabelText("cases-discovery-date-input"), {
      target: { value: "2026-04-20" },
    });

    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-save" }));

    await waitFor(() => {
      expect(updateEqMock).toHaveBeenCalledWith(
        expect.objectContaining({
          project_name: "Alpine Tower Revised",
          canton: "BE",
          contract_date: "2026-04-01",
          discovery_date: "2026-04-20",
        }),
        "id",
        "case-1"
      );
    });

    refreshCasesDeferred.resolve({ data: null, error: { message: "refresh failed" } });

    await waitFor(() => {
      expect(casesSelectResponses).toHaveLength(0);
      expect(protocolsSelectResponses).toHaveLength(0);
    });

    await waitFor(() => {
      expect(screen.queryByText("Alpine Tower")).toBeNull();
    });
    expect(screen.getByText("Alpine Tower Revised")).toBeTruthy();
    expect(screen.getByText("Riverside Hall")).toBeTruthy();
    expect(screen.queryByText("cases-load-error")).toBeNull();
  });

  it("keeps a successfully saved checklist toggle after an edit refresh fallback", async () => {
    const refreshCasesDeferred = createDeferred<{ data: CaseRecord[] | null; error: { message: string } | null }>();

    updateEqMock
      .mockImplementationOnce(async (payload: Record<string, unknown>, _field: string, caseId: string) => {
        const checklist = payload.checklist as Record<string, boolean>;
        expect(checklist.evidenceAttached).toBe(true);
        casesData = casesData.map((item) => (item.id === caseId ? { ...item, checklist } : item));
        return { error: null };
      })
      .mockImplementationOnce(async (_payload: Record<string, unknown>, _field: string, caseId: string) => {
        casesData = casesData.map((item) =>
          item.id === caseId
            ? {
                ...item,
                project_name: "Alpine Tower Revised",
                canton: "BE",
                contract_date: "2026-04-01",
                discovery_date: "2026-04-20",
              }
            : item
        );
        casesSelectResponses.push(refreshCasesDeferred.promise);
        protocolsSelectResponses.push(Promise.resolve({ data: [], error: null }));
        return { error: null };
      });

    render(<CasesPage />);

    const firstCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    const evidenceCheckbox = within(firstCard).getByLabelText("cases-checklist-evidence-attached") as HTMLInputElement;
    expect(evidenceCheckbox.checked).toBe(false);

    fireEvent.click(evidenceCheckbox);

    await waitFor(() => {
      expect(evidenceCheckbox.checked).toBe(true);
      expect(evidenceCheckbox.disabled).toBe(false);
    });

    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-edit" }));
    fireEvent.change(within(firstCard).getByLabelText("cases-project-name"), {
      target: { value: "Alpine Tower Revised" },
    });
    fireEvent.change(within(firstCard).getByLabelText("cases-canton-label"), {
      target: { value: "BE" },
    });
    fireEvent.change(within(firstCard).getByLabelText("cases-contract-date-input"), {
      target: { value: "2026-04-01" },
    });
    fireEvent.change(within(firstCard).getByLabelText("cases-discovery-date-input"), {
      target: { value: "2026-04-20" },
    });

    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-save" }));

    await waitFor(() => {
      expect(updateEqMock).toHaveBeenCalledTimes(2);
    });

    refreshCasesDeferred.resolve({ data: null, error: { message: "refresh failed" } });

    await waitFor(() => {
      expect(screen.queryByText("Alpine Tower")).toBeNull();
    });

    const refreshedCard = screen.getByText("Alpine Tower Revised").closest("article") as HTMLElement;
    expect((within(refreshedCard).getByLabelText("cases-checklist-evidence-attached") as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText("cases-load-error")).toBeNull();
  });

  it("restores a pending checklist save when another case edit refresh falls back first", async () => {
    const checklistDeferred = createDeferred<{ error: { message: string } | null }>();
    const refreshCasesDeferred = createDeferred<{ data: CaseRecord[] | null; error: { message: string } | null }>();

    updateEqMock
      .mockImplementationOnce((payload: Record<string, unknown>, _field: string, caseId: string) => {
        const checklist = payload.checklist as Record<string, boolean>;
        expect(caseId).toBe("case-2");
        expect(checklist.evidenceAttached).toBe(true);
        casesData = casesData.map((item) => (item.id === caseId ? { ...item, checklist } : item));
        return checklistDeferred.promise;
      })
      .mockImplementationOnce(async (_payload: Record<string, unknown>, _field: string, caseId: string) => {
        expect(caseId).toBe("case-1");
        casesData = casesData.map((item) =>
          item.id === caseId
            ? {
                ...item,
                project_name: "Alpine Tower Revised",
                canton: "BE",
                contract_date: "2026-04-01",
                discovery_date: "2026-04-20",
              }
            : item
        );
        casesSelectResponses.push(refreshCasesDeferred.promise);
        protocolsSelectResponses.push(Promise.resolve({ data: [], error: null }));
        return { error: null };
      });

    render(<CasesPage />);

    const firstCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    const secondCard = (await screen.findByText("Riverside Hall")).closest("article") as HTMLElement;
    const secondEvidenceCheckbox = within(secondCard).getByLabelText(
      "cases-checklist-evidence-attached"
    ) as HTMLInputElement;

    fireEvent.click(secondEvidenceCheckbox);

    await waitFor(() => {
      expect(secondEvidenceCheckbox.checked).toBe(true);
      expect(secondEvidenceCheckbox.disabled).toBe(true);
    });

    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-edit" }));
    fireEvent.change(within(firstCard).getByLabelText("cases-project-name"), {
      target: { value: "Alpine Tower Revised" },
    });
    fireEvent.change(within(firstCard).getByLabelText("cases-canton-label"), {
      target: { value: "BE" },
    });
    fireEvent.change(within(firstCard).getByLabelText("cases-contract-date-input"), {
      target: { value: "2026-04-01" },
    });
    fireEvent.change(within(firstCard).getByLabelText("cases-discovery-date-input"), {
      target: { value: "2026-04-20" },
    });

    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-save" }));

    await waitFor(() => {
      expect(updateEqMock).toHaveBeenCalledTimes(2);
    });

    refreshCasesDeferred.resolve({ data: null, error: { message: "refresh failed" } });

    await waitFor(() => {
      expect(casesSelectResponses).toHaveLength(0);
      expect(protocolsSelectResponses).toHaveLength(0);
    });
    expect(screen.getByText("Alpine Tower Revised")).toBeTruthy();

    checklistDeferred.resolve({ error: null });

    await waitFor(() => {
      const restoredSecondCard = screen.getByText("Riverside Hall").closest("article") as HTMLElement;
      expect((within(restoredSecondCard).getByLabelText("cases-checklist-evidence-attached") as HTMLInputElement).checked).toBe(true);
    });
  });

  it("keeps a successfully deleted case hidden when the follow-up refresh fails", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const refreshCasesDeferred = createDeferred<{ data: CaseRecord[] | null; error: { message: string } | null }>();
    deleteEqMock.mockImplementationOnce(async (field: string, caseId: string) => {
      expect(field).toBe("id");
      expect(caseId).toBe("case-1");
      casesData = casesData.filter((item) => item.id !== caseId);
      casesSelectResponses.push(refreshCasesDeferred.promise);
      protocolsSelectResponses.push(Promise.resolve({ data: [], error: null }));
      return { error: null };
    });

    render(<CasesPage />);

    const firstCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    fireEvent.click(within(firstCard).getByRole("button", { name: "cases-delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Alpine Tower")).toBeNull();
    });

    refreshCasesDeferred.resolve({ data: null, error: { message: "refresh failed" } });

    await waitFor(() => {
      expect(casesSelectResponses).toHaveLength(0);
    });

    await waitFor(() => {
      expect(screen.queryByText("Alpine Tower")).toBeNull();
    });
    expect(screen.getByText("Riverside Hall")).toBeTruthy();
    expect(screen.queryByText("cases-load-error")).toBeNull();

    confirmSpy.mockRestore();
  });

  it("loads notice revisions additively, groups the newest by case, and does not wait to show core cases", async () => {
    const draftsDeferred = createDeferred<{ data: NoticeDraftRecord[] | null; error: { message: string } | null }>();
    const activityDeferred = createDeferred<{ data: ActivityRecord[] | null; error: { message: string } | null }>();
    noticeDraftSelectResponses.push(draftsDeferred.promise);
    activitySelectResponses.push(activityDeferred.promise);

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    expect(screen.queryByTestId("cases-notice-draft-case-1")).toBeNull();

    draftsDeferred.resolve({
      data: [
        buildNoticeDraft("draft-new", { created_at: "2026-08-09T09:00:00.000Z", defect_statement: "Newest saved defect." }),
        buildNoticeDraft("draft-old", { created_at: "2026-08-08T09:00:00.000Z", defect_statement: "Older saved defect." }),
      ],
      error: null,
    });

    const saved = await screen.findByTestId("cases-notice-draft-case-1");
    expect(within(saved).getByText("Newest saved defect.")).toBeTruthy();
    expect(within(saved).queryByText("Older saved defect.")).toBeNull();
    expect(within(saved).getByText("cases-notice-draft-status")).toBeTruthy();
    expect(within(saved).getByText("cases-notice-draft-created-at")).toBeTruthy();
  });

  it("applies activity independently while notice revisions remain pending", async () => {
    const draftsDeferred = createDeferred<{ data: NoticeDraftRecord[] | null; error: { message: string } | null }>();
    const activityDeferred = createDeferred<{ data: ActivityRecord[] | null; error: { message: string } | null }>();
    noticeDraftSelectResponses.push(draftsDeferred.promise);
    activitySelectResponses.push(activityDeferred.promise);

    render(<CasesPage />);
    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    activityDeferred.resolve({
      data: [{
        id: "activity-1",
        user_id: "user-1",
        case_id: "case-1",
        evidence_id: "evidence-1",
        event_type: "evidence-uploaded",
        source_name: "facade-photo.jpg",
        source_mime_type: "image/jpeg",
        source_size_bytes: 1200,
        occurred_at: "2026-08-09T08:00:00.000Z",
      }],
      error: null,
    });

    expect(await screen.findByText("facade-photo.jpg")).toBeTruthy();
    expect(screen.queryByTestId("cases-notice-draft-case-1")).toBeNull();
  });

  it("creates one immutable revision from persisted facts, locks duplicate clicks, and preserves it after live edits", async () => {
    const insertDeferred = createDeferred<{ data: NoticeDraftRecord | null; error: { message: string } | null }>();
    noticeDraftInsertMock.mockReturnValueOnce(insertDeferred.promise);

    render(<CasesPage />);

    const completeCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    const incompleteCard = screen.getByText("Riverside Hall").closest("article") as HTMLElement;
    const createButton = within(completeCard).getByRole("button", { name: "cases-notice-draft-create" }) as HTMLButtonElement;
    expect((within(incompleteCard).getByRole("button", { name: "cases-notice-draft-create" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(createButton);
    fireEvent.click(createButton);

    await waitFor(() => expect(noticeDraftInsertMock).toHaveBeenCalledTimes(1));
    expect(createButton.disabled).toBe(true);
    const editButton = within(completeCard).getByRole("button", { name: "cases-edit" }) as HTMLButtonElement;
    const deleteButton = within(completeCard).getByRole("button", { name: "cases-delete" }) as HTMLButtonElement;
    expect(editButton.disabled).toBe(true);
    expect(deleteButton.disabled).toBe(true);
    expect(within(completeCard).getByText("cases-notice-draft-creating")).toBeTruthy();
    expect(noticeDraftInsertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      case_id: "case-1",
      project_name: "Alpine Tower",
      canton: "ZH",
      notice_recipient_name: "Alpine Build AG",
      notice_recipient_address: "Werkstrasse 4\n8000 Zürich",
      defect_statement: "Water ingress at the north facade.",
      contract_date: "2026-03-01",
      discovery_date: "2026-03-21",
      notice_deadline: "2026-05-20",
      regime: "new",
    });

    const savedRow = buildNoticeDraft("draft-created", {
      project_name: "Alpine Tower",
      notice_recipient_name: "Alpine Build AG",
      notice_recipient_address: "Werkstrasse 4\n8000 Zürich",
      defect_statement: "Water ingress at the north facade.",
    });
    insertDeferred.resolve({ data: savedRow, error: null });

    const saved = await within(completeCard).findByTestId("cases-notice-draft-case-1");
    await waitFor(() => {
      expect(createButton.disabled).toBe(false);
      expect(editButton.disabled).toBe(false);
      expect(deleteButton.disabled).toBe(false);
    });
    expect(within(saved).getByText("Water ingress at the north facade.")).toBeTruthy();

    updateEqMock.mockImplementationOnce(async (payload: Record<string, unknown>, _field: string, caseId: string) => {
      casesData = casesData.map((item) => item.id === caseId ? { ...item, ...payload } as CaseRecord : item);
      return { error: null };
    });
    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-edit" }));
    fireEvent.change(within(completeCard).getByLabelText("cases-defect-statement"), { target: { value: "Edited live defect." } });
    fireEvent.click(within(completeCard).getByRole("button", { name: "cases-save" }));

    await within(completeCard).findByText("Edited live defect.");
    expect(within(saved).getByText("Water ingress at the north facade.")).toBeTruthy();
    expect(within(saved).queryByText("Edited live defect.")).toBeNull();
  });

  it("disables notice revision creation while a Case is being edited", async () => {
    render(<CasesPage />);
    const card = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    const createButton = within(card).getByRole("button", { name: "cases-notice-draft-create" }) as HTMLButtonElement;

    fireEvent.click(within(card).getByRole("button", { name: "cases-edit" }));
    expect(createButton.disabled).toBe(true);
    fireEvent.click(createButton);
    expect(noticeDraftInsertMock).not.toHaveBeenCalled();

    fireEvent.click(within(card).getByRole("button", { name: "cases-cancel" }));
    await waitFor(() => expect(createButton.disabled).toBe(false));
  });

  it("formats saved server timestamps with the active Swiss locale", async () => {
    activeLanguage = "fr";
    noticeDraftsData = [buildNoticeDraft("draft-fr")];
    render(<CasesPage />);

    const saved = await screen.findByTestId("cases-notice-draft-case-1");
    const expected = new Intl.DateTimeFormat("fr-CH", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date("2026-08-09T08:30:00.000Z"));
    expect(within(saved).getByText(expected)).toBeTruthy();
  });

  it("handles returned and thrown draft insert errors and allows retry", async () => {
    noticeDraftInsertMock
      .mockResolvedValueOnce({ data: null, error: { message: "insert failed" } })
      .mockRejectedValueOnce(new Error("network failed"));

    render(<CasesPage />);
    const card = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    const button = within(card).getByRole("button", { name: "cases-notice-draft-create" }) as HTMLButtonElement;

    fireEvent.click(button);
    expect(await within(card).findByText("cases-notice-draft-create-error")).toBeTruthy();
    await waitFor(() => expect(button.disabled).toBe(false));

    fireEvent.click(button);
    await waitFor(() => expect(noticeDraftInsertMock).toHaveBeenCalledTimes(2));
    expect(await within(card).findByText("cases-notice-draft-create-error")).toBeTruthy();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("ignores a draft insert result after the authenticated user changes", async () => {
    const insertDeferred = createDeferred<{ data: NoticeDraftRecord | null; error: { message: string } | null }>();
    noticeDraftInsertMock.mockReturnValueOnce(insertDeferred.promise);
    const { rerender } = render(<CasesPage />);

    const card = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "cases-notice-draft-create" }));
    await waitFor(() => expect(noticeDraftInsertMock).toHaveBeenCalledTimes(1));

    authUser = { id: "user-2" };
    casesData = [{ ...buildCase("case-1", "Other User Case"), user_id: "user-2" }];
    rerender(<CasesPage />);
    await screen.findByText("Other User Case");

    insertDeferred.resolve({ data: buildNoticeDraft("stale-draft"), error: null });
    await act(async () => Promise.resolve());

    expect(screen.queryByTestId("cases-notice-draft-case-1")).toBeNull();
  });
});
