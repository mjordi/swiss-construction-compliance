import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchInsertMock = vi.fn();
const dispatchEvidenceInsertMock = vi.fn();
const { rpcMock, deriveCaseLegalMilestonesMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async () => ({ data: true, error: null })),
  deriveCaseLegalMilestonesMock: vi.fn<(...args: unknown[]) => Array<Record<string, unknown>>>(() => []),
}));
const replaceMock = vi.fn();
const routerMock = { replace: replaceMock };
const searchParamsMock = { get: () => null, toString: () => "" };
let authUserMock = { id: "user-1" };

let noticeDrafts: NoticeDraftRecord[] = [];
let noticeDispatches: NoticeDispatchRecord[] = [];
let dispatchEvidence: DispatchEvidenceRecord[] = [];
let caseEvidence: CaseEvidenceRecord[] = [];
let casesLoadError = false;
let noticeDispatchLoadError = false;
let noticeDispatchPageQueries = 0;
let dispatchEvidenceLoadError = false;
let caseEvidenceLoadError = false;
let dispatchEvidencePageQueries = 0;
let dispatchEvidenceOrFilters: string[] = [];
let caseEvidencePageQueries = 0;
let dispatchEvidenceLoadDeferred: { promise: Promise<{ data: DispatchEvidenceRecord[] | null; error: { message: string } | null }>; resolve: (value: { data: DispatchEvidenceRecord[] | null; error: { message: string } | null }) => void; reject: (reason?: unknown) => void } | null = null;
let caseEvidenceLoadDeferred: { promise: Promise<{ data: CaseEvidenceRecord[] | null; error: { message: string } | null }>; resolve: (value: { data: CaseEvidenceRecord[] | null; error: { message: string } | null }) => void; reject: (reason?: unknown) => void } | null = null;

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

type NoticeDispatchRecord = {
  id: string;
  user_id: string;
  case_id: string;
  notice_draft_id: string;
  dispatched_at: string;
  channel: "registered-mail" | "a-mail-plus" | "courier" | "hand-delivery";
  reference: string | null;
  created_at: string;
};

type DispatchEvidenceRecord = {
  id: string; user_id: string; case_id: string; dispatch_id: string; evidence_id: string; created_at: string;
};

type CaseEvidenceRecord = {
  id: string; user_id: string; case_id: string; original_name: string; storage_path: string;
  mime_type: "application/pdf"; size_bytes: number; created_at: string;
};

const caseRecord = {
  id: "case-1",
  user_id: "user-1",
  project_name: "Alpine Tower",
  canton: "ZH",
  contract_date: "2026-03-01T00:00:00.000Z",
  discovery_date: "2026-03-21T00:00:00.000Z",
  notice_recipient_name: "Alpine Build AG",
  notice_recipient_address: "Werkstrasse 4\n8000 Zürich",
  defect_statement: "Water ingress at the north facade.",
  checklist: null,
  created_at: "2026-03-21T00:00:00.000Z",
  updated_at: "2026-03-21T00:00:00.000Z",
  status: "active",
};

function draft(id: string, createdAt: string): NoticeDraftRecord {
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
    created_at: createdAt,
  };
}

function savedDispatch(payload: Record<string, unknown>): NoticeDispatchRecord {
  return {
    id: "dispatch-1",
    user_id: String(payload.user_id),
    case_id: String(payload.case_id),
    notice_draft_id: String(payload.notice_draft_id),
    dispatched_at: String(payload.dispatched_at),
    channel: payload.channel as NoticeDispatchRecord["channel"],
    reference: payload.reference === null ? null : String(payload.reference),
    created_at: "2026-08-15T09:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/cases",
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsMock,
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ lang: "en", t: (key: string) => key }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: authUserMock }),
}));

vi.mock("@/components/dashboard/PageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@react-pdf/renderer", () => ({
  Document: ({ children }: { children: unknown }) => <>{children}</>,
  Page: ({ children }: { children: unknown }) => <>{children}</>,
  Text: ({ children }: { children: unknown }) => <>{children}</>,
  View: ({ children }: { children: unknown }) => <>{children}</>,
  Font: { register: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  pdf: () => ({ toBlob: async () => new Blob(["pdf"]) }),
}));

vi.mock("@/lib/case-timeline", () => ({
  applyComplianceCaseView: (items: unknown[]) => items,
  buildComplianceCaseTimeline: (inputs: Array<{ id: string; projectName: string; canton: string; contractDate: Date; discoveryDate: Date }>) =>
    inputs.map((input) => ({
      id: input.id,
      projectName: input.projectName,
      canton: input.canton,
      status: "warning",
      statusLabel: "Warning",
      deadlineCountdownTone: "warning",
      deadlineCountdownLabel: "10 days left",
      regimeLabel: "New law",
      regime: "new",
      noticeApplies: true,
      noticeDeadline: new Date("2026-05-20T00:00:00.000Z"),
      noticeDeadlineLabel: "2026-05-20",
      contractDateLabel: "2026-03-01",
      discoveryDateLabel: "2026-03-21",
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
    })),
  buildCaseDeadlineReminderICS: () => "BEGIN:VCALENDAR\nEND:VCALENDAR",
  deriveCaseLegalMilestones: deriveCaseLegalMilestonesMock,
  deriveChecklistProgress: () => ({ completed: 1, total: 4, label: "progress" }),
  isDeadlineReminderIcsExportEligible: () => false,
}));

vi.mock("@/lib/supabase", () => {
  const supabase = {
    rpc: rpcMock,
    from: (table: string) => {
      if (table === "cases") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => casesLoadError
                ? { data: null, error: { message: "cases refresh failed" } }
                : { data: [caseRecord], error: null },
            }),
          }),
        };
      }
      if (table === "protocols") {
        return { select: () => ({ eq: () => ({ not: async () => ({ data: [], error: null }) }) }) };
      }
      if (table === "latest_case_notice_drafts") {
        return { select: () => ({ eq: async () => ({ data: noticeDrafts, error: null }) }) };
      }
      if (table === "case_notice_dispatches") {
        let dispatchPageSize = 1000;
        const dispatchQuery = {
          select: () => dispatchQuery,
          eq: () => dispatchQuery,
          order: () => dispatchQuery,
          or: () => dispatchQuery,
          limit: (pageSize: number) => {
            dispatchPageSize = pageSize;
            return dispatchQuery;
          },
          then: (resolve: (value: { data: NoticeDispatchRecord[] | null; error: { message: string } | null }) => unknown) => {
            const page = noticeDispatchPageQueries++;
            const result = noticeDispatchLoadError
              ? { data: null, error: { message: "dispatch load failed" } }
              : {
                  data: noticeDispatches.slice(page * dispatchPageSize, (page + 1) * dispatchPageSize),
                  error: null,
                };
            return Promise.resolve(result).then(resolve);
          },
        };
        return {
          select: dispatchQuery.select,
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({ single: () => dispatchInsertMock(payload) }),
          }),
        };
      }
      if (table === "case_activity_events") {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
      }
      if (table === "case_notice_dispatch_evidence") {
        let pageSize = 1000;
        const filters: Record<string, string> = {};
        const query = {
          eq: (column: string, value: string) => { filters[column] = value; return query; },
          order: () => query,
          or: (filter: string) => { dispatchEvidenceOrFilters.push(filter); return query; },
          limit: (size: number) => { pageSize = size; return query; },
          maybeSingle: async () => ({
            data: dispatchEvidence.find((record) => Object.entries(filters).every(
              ([column, value]) => record[column as keyof DispatchEvidenceRecord] === value
            )) ?? null,
            error: null,
          }),
          then: (resolve: (value: { data: DispatchEvidenceRecord[] | null; error: { message: string } | null }) => unknown) => {
            const page = dispatchEvidencePageQueries++;
            const result = dispatchEvidenceLoadDeferred?.promise ?? Promise.resolve(
              dispatchEvidenceLoadError
                ? { data: null, error: { message: "association load failed" } }
                : { data: dispatchEvidence.slice(page * pageSize, (page + 1) * pageSize), error: null }
            );
            return result.then(resolve);
          },
        };
        return {
          select: () => query,
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({ single: () => dispatchEvidenceInsertMock(payload) }),
          }),
        };
      }
      if (table === "case_evidence") {
        let pageSize = 1000;
        const filters: Record<string, string> = {};
        const query = {
          eq: (column: string, value: string) => { filters[column] = value; return query; },
          order: () => query,
          or: () => query,
          limit: (size: number) => { pageSize = size; return query; },
          maybeSingle: async () => ({
            data: caseEvidence.find((record) => Object.entries(filters).every(
              ([column, value]) => record[column as keyof CaseEvidenceRecord] === value
            )) ?? null,
            error: null,
          }),
          then: (resolve: (value: { data: CaseEvidenceRecord[] | null; error: { message: string } | null }) => unknown) => {
            const page = caseEvidencePageQueries++;
            const result = caseEvidenceLoadDeferred?.promise ?? Promise.resolve(
              caseEvidenceLoadError
                ? { data: null, error: { message: "evidence load failed" } }
                : { data: caseEvidence.slice(page * pageSize, (page + 1) * pageSize), error: null }
            );
            return result.then(resolve);
          },
        };
        return { select: () => query };
      }
      if (table === "case_notice_drafts") {
        return { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  return { getSupabase: () => supabase };
});

vi.mock("@/lib/case-evidence-cleanup", () => ({
  removeCaseEvidenceObjects: vi.fn().mockResolvedValue(undefined),
  scheduleCaseEvidenceCleanupRetry: vi.fn(() => () => undefined),
}));

import CasesPage from "@/app/dashboard/cases/page";

async function dispatchForm() {
  const form = await screen.findByTestId("cases-notice-dispatch-form-case-1");
  fireEvent.change(within(form).getByLabelText(/cases-notice-dispatch-at/), {
    target: { value: "2026-08-01T10:30" },
  });
  fireEvent.change(within(form).getByLabelText("cases-notice-dispatch-channel"), {
    target: { value: "courier" },
  });
  fireEvent.change(within(form).getByLabelText("cases-notice-dispatch-reference"), {
    target: { value: "  TRACK-123  " },
  });
  return form;
}

describe("Cases notice dispatch recording", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    dispatchInsertMock.mockReset().mockImplementation(async (payload: Record<string, unknown>) => ({
      data: savedDispatch(payload),
      error: null,
    }));
    noticeDrafts = [draft("draft-latest", "2026-08-10T10:00:00.000Z")];
    noticeDispatches = [];
    dispatchEvidence = [];
    caseEvidence = [];
    casesLoadError = false;
    dispatchEvidenceInsertMock.mockReset().mockImplementation(async (payload: Record<string, unknown>) => ({
      data: { id: "association-1", ...payload, created_at: "2026-08-17T08:00:00.000Z" },
      error: null,
    }));
    noticeDispatchLoadError = false;
    noticeDispatchPageQueries = 0;
    dispatchEvidenceLoadError = false;
    caseEvidenceLoadError = false;
    dispatchEvidencePageQueries = 0;
    dispatchEvidenceOrFilters = [];
    caseEvidencePageQueries = 0;
    dispatchEvidenceLoadDeferred = null;
    caseEvidenceLoadDeferred = null;
    authUserMock = { id: "user-1" };
    rpcMock.mockClear();
    deriveCaseLegalMilestonesMock.mockReset().mockReturnValue([]);
  });

  it("inserts a dispatch bound to the exact latest saved draft", async () => {
    noticeDrafts = [
      draft("draft-older", "2026-08-09T10:00:00.000Z"),
      draft("draft-latest", "2026-08-10T10:00:00.000Z"),
    ];
    render(<CasesPage />);
    const form = await dispatchForm();

    fireEvent.submit(form);

    await waitFor(() => expect(dispatchInsertMock).toHaveBeenCalledTimes(1));
    expect(dispatchInsertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      case_id: "case-1",
      notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-01T08:30:00.000Z",
      channel: "courier",
      reference: "TRACK-123",
    });
  });

  it("captures second precision so a same-minute dispatch can follow its saved draft", async () => {
    noticeDrafts = [draft("draft-latest", "2026-08-10T08:00:30.000Z")];
    render(<CasesPage />);
    const form = await screen.findByTestId("cases-notice-dispatch-form-case-1");
    const dispatchedAt = within(form).getByLabelText(/cases-notice-dispatch-at/) as HTMLInputElement;
    expect(dispatchedAt.step).toBe("1");
    fireEvent.change(dispatchedAt, { target: { value: "2026-08-10T10:00:45" } });
    fireEvent.submit(form);

    await waitFor(() => expect(dispatchInsertMock).toHaveBeenCalledTimes(1));
    const submittedAt = String(dispatchInsertMock.mock.calls[0]?.[0]?.dispatched_at);
    expect(new Date(submittedAt).getUTCSeconds()).toBe(45);
    expect(Date.parse(submittedAt)).toBeGreaterThanOrEqual(Date.parse(noticeDrafts[0].created_at));
  });

  it("paginates the complete append-only dispatch history", async () => {
    noticeDispatches = Array.from({ length: 1001 }, (_, index) => ({
      id: `dispatch-${index}`,
      user_id: "user-1",
      case_id: "case-1",
      notice_draft_id: "draft-latest",
      dispatched_at: new Date(Date.UTC(2026, 7, 15, 9, 0, 0) - index * 1000).toISOString(),
      channel: "courier" as const,
      reference: null,
      created_at: "2026-08-15T09:00:00.000Z",
    }));
    render(<CasesPage />);

    await waitFor(() => expect(noticeDispatchPageQueries).toBe(2));
    expect(await screen.findByTestId("cases-notice-dispatch-case-1")).toBeTruthy();
    expect((screen.getByRole("button", { name: "cases-export-chronology-csv" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("marks dispatch history unavailable and blocks legal exports when loading fails", async () => {
    noticeDispatchLoadError = true;
    render(<CasesPage />);

    expect(await screen.findByText("cases-notice-dispatch-history-unavailable")).toBeTruthy();
    expect((screen.getByRole("button", { name: "cases-export-chronology-csv" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "cases-export-dossier-pdf" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the cached legal timeline visible when a same-user Cases refresh fails", async () => {
    const { rerender } = render(<CasesPage />);

    const timelineHeading = await screen.findByText("cases-legal-timeline-title");
    await waitFor(() => expect(timelineHeading.parentElement?.querySelector("ol")).toBeTruthy());

    casesLoadError = true;
    authUserMock = { id: "user-1" };
    rerender(<CasesPage />);

    await waitFor(() => expect(screen.queryByText("cases-evidence-history-loading")).toBeNull());
    expect(screen.getByText("cases-legal-timeline-title").parentElement?.querySelector("ol")).toBeTruthy();
  });

  it("blocks evidence-dependent actions until both evidence-bearing sources settle", async () => {
    dispatchEvidenceLoadDeferred = deferred();
    caseEvidenceLoadDeferred = deferred();
    render(<CasesPage />);

    expect(await screen.findByText("cases-evidence-history-loading")).toBeTruthy();
    expect((screen.getByRole("button", { name: "cases-export-chronology-csv" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "cases-export-dossier-pdf" }) as HTMLButtonElement).disabled).toBe(true);

    dispatchEvidenceLoadDeferred.resolve({ data: [], error: null });
    await act(async () => undefined);
    expect((screen.getByRole("button", { name: "cases-export-chronology-csv" }) as HTMLButtonElement).disabled).toBe(true);

    caseEvidenceLoadDeferred.resolve({ data: [], error: null });
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "cases-export-chronology-csv" }) as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByRole("button", { name: "cases-export-dossier-pdf" }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it.each([
    ["association", true, false],
    ["evidence metadata", false, true],
  ])("keeps evidence history unavailable when the %s load fails", async (_source: string, associationFails: boolean, evidenceFails: boolean) => {
    noticeDispatches = [savedDispatch({
      user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
    })];
    dispatchEvidence = [{
      id: "association-1", user_id: "user-1", case_id: "case-1", dispatch_id: "dispatch-1",
      evidence_id: "evidence-1", created_at: "2026-08-17T08:00:00.000Z",
    }];
    caseEvidence = [{
      id: "evidence-1", user_id: "user-1", case_id: "case-1", original_name: "posting-receipt.pdf",
      storage_path: "user-1/case-1/posting-receipt.pdf", mime_type: "application/pdf", size_bytes: 123,
      created_at: "2026-08-14T09:00:00.000Z",
    }];
    dispatchEvidenceLoadError = associationFails;
    caseEvidenceLoadError = evidenceFails;
    render(<CasesPage />);

    expect(await screen.findByText("cases-evidence-history-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("cases-notice-dispatch-evidence-form-case-1")).toBeNull();
    expect(screen.queryByText("cases-notice-dispatch-evidence-empty")).toBeNull();
    expect((screen.getByRole("button", { name: "cases-export-chronology-csv" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "cases-export-dossier-pdf" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("paginates and preserves evidence associations and metadata beyond the first page", async () => {
    noticeDispatches = [savedDispatch({
      user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
    })];
    dispatchEvidence = Array.from({ length: 1001 }, (_, index) => ({
      id: `association-${index}`, user_id: "user-1", case_id: "case-1",
      dispatch_id: index === 1000 ? "dispatch-1" : `other-dispatch-${index}`,
      evidence_id: index === 1000 ? "evidence-target" : `other-evidence-${index}`,
      created_at: index === 999
        ? "2026-08-17T07:43:21.123456+00:00"
        : new Date(Date.UTC(2026, 7, 17, 8, 0, 0) - index * 1000).toISOString(),
    }));
    caseEvidence = Array.from({ length: 1001 }, (_, index) => ({
      id: index === 1000 ? "evidence-target" : `other-evidence-${index}`,
      user_id: "user-1", case_id: "case-1",
      original_name: index === 1000 ? "target-receipt.pdf" : `other-${index}.pdf`,
      storage_path: `user-1/case-1/${index}.pdf`, mime_type: "application/pdf" as const, size_bytes: 123,
      created_at: new Date(Date.UTC(2026, 7, 14, 9, 0, 0) - index * 1000).toISOString(),
    }));
    render(<CasesPage />);

    const linked = await screen.findByTestId("cases-notice-dispatch-evidence-case-1");
    expect(dispatchEvidencePageQueries).toBe(2);
    expect(dispatchEvidenceOrFilters).toContain(
      "created_at.lt.2026-08-17T07:43:21.123456+00:00,and(created_at.eq.2026-08-17T07:43:21.123456+00:00,id.gt.association-999)"
    );
    expect(caseEvidencePageQueries).toBe(2);
    expect(linked.textContent).toContain("target-receipt.pdf");
    expect(linked.textContent).toContain("association-1000");
  });

  it("does not render a dispatch form without a saved draft", async () => {
    noticeDrafts = [];
    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("cases-notice-dispatch-form-case-1")).toBeNull());
  });

  it("shows only factual saved dispatch details after success", async () => {
    render(<CasesPage />);
    const form = await dispatchForm();
    fireEvent.submit(form);

    expect((await within(form).findByRole("status")).textContent).toContain("cases-notice-dispatch-recorded");
    expect(within(form).getByText("cases-notice-dispatch-semantics")).toBeTruthy();
    const saved = await screen.findByTestId("cases-notice-dispatch-case-1");
    expect(saved.textContent).toContain("draft-latest");
    expect(saved.textContent).toContain("cases-notice-dispatch-channel-courier");
    expect(saved.textContent).toContain("TRACK-123");
    expect(saved.textContent).not.toMatch(/delivered|received/i);
    expect(screen.getByTestId("cases-action-snapshot-case-1").textContent).toContain(
      "cases-notice-dispatch-recorded"
    );
  });

  it.each([
    ["returned", () => Promise.resolve({ data: null, error: { message: "denied" } })],
    ["thrown", () => Promise.reject(new Error("network"))],
  ])("shows localized feedback for a %s insert error", async (_kind, implementation) => {
    dispatchInsertMock.mockImplementationOnce(implementation);
    render(<CasesPage />);
    const form = await dispatchForm();
    fireEvent.submit(form);

    expect((await within(form).findByRole("status")).textContent).toContain("cases-notice-dispatch-error");
    expect(within(form).queryByTestId("cases-notice-dispatch-case-1")).toBeNull();
  });

  it("locks rapid duplicate submits while the insert is pending", async () => {
    const pending = deferred<{ data: NoticeDispatchRecord; error: null }>();
    dispatchInsertMock.mockImplementationOnce((payload: Record<string, unknown>) =>
      pending.promise.then(() => ({ data: savedDispatch(payload), error: null }))
    );
    render(<CasesPage />);
    const form = await dispatchForm();

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(dispatchInsertMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect((within(form).getByRole("button", { name: "cases-notice-dispatch-recording" }) as HTMLButtonElement).disabled).toBe(true));
    pending.resolve({ data: savedDispatch({
      user_id: "user-1",
      case_id: "case-1",
      notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-01T10:30:00.000Z",
      channel: "courier",
      reference: "TRACK-123",
    }), error: null });
    await within(form).findByRole("status");
  });

  it("blocks and disables representative sibling actions while dispatch is pending", async () => {
    const pending = deferred<void>();
    dispatchInsertMock.mockImplementationOnce((payload: Record<string, unknown>) =>
      pending.promise.then(() => ({ data: savedDispatch(payload), error: null }))
    );
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CasesPage />);
    const form = await dispatchForm();
    const checklist = screen.getByLabelText("cases-checklist-evidence-attached") as HTMLInputElement;

    fireEvent.submit(form);
    // Exercise the handler guard before relying on React's disabled-state rerender.
    fireEvent.click(checklist);

    expect(dispatchInsertMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalledWith("set_case_checklist_item", expect.anything());
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "cases-edit" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "cases-delete" }) as HTMLButtonElement).disabled).toBe(true);
      expect(checklist.disabled).toBe(true);
      expect((screen.getByRole("button", { name: "cases-notice-draft-create" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "cases-notice-draft-download" }) as HTMLButtonElement).disabled).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "cases-delete" }));
    expect(confirmMock).not.toHaveBeenCalled();

    pending.resolve();
    await within(form).findByRole("status");
    confirmMock.mockRestore();
  });

  it("ignores a dispatch completion after the authenticated account changes", async () => {
    const pending = deferred<void>();
    dispatchInsertMock.mockImplementationOnce((payload: Record<string, unknown>) =>
      pending.promise.then(() => ({ data: savedDispatch(payload), error: null }))
    );
    const { rerender } = render(<CasesPage />);
    const form = await dispatchForm();
    fireEvent.submit(form);
    expect(dispatchInsertMock).toHaveBeenCalledTimes(1);

    authUserMock = { id: "user-2" };
    rerender(<CasesPage />);
    pending.resolve();

    await waitFor(() => {
      expect(screen.queryByTestId("cases-notice-dispatch-case-1")).toBeNull();
      expect(screen.queryByText("cases-notice-dispatch-recorded")).toBeNull();
    });
  });

  it("links one existing same-Case file to only the latest dispatch and shows stable IDs", async () => {
    noticeDispatches = [savedDispatch({
      user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
    })];
    caseEvidence = [{
      id: "evidence-1", user_id: "user-1", case_id: "case-1", original_name: "posting-receipt.pdf",
      storage_path: "user-1/case-1/posting-receipt.pdf", mime_type: "application/pdf", size_bytes: 123,
      created_at: "2026-08-14T09:00:00.000Z",
    }];
    render(<CasesPage />);

    const form = await screen.findByTestId("cases-notice-dispatch-evidence-form-case-1");
    expect(within(form).getAllByRole("option")).toHaveLength(1);
    fireEvent.submit(form);
    await waitFor(() => expect(dispatchEvidenceInsertMock).toHaveBeenCalledTimes(1));
    expect(dispatchEvidenceInsertMock).toHaveBeenCalledWith({
      user_id: "user-1", case_id: "case-1", dispatch_id: "dispatch-1", evidence_id: "evidence-1",
    });
    const linked = await screen.findByTestId("cases-notice-dispatch-evidence-case-1");
    expect(linked.textContent).toContain("posting-receipt.pdf");
    expect(linked.textContent).toContain("evidence-1");
    expect(linked.textContent).toContain("association-1");
    fireEvent.submit(form);
    expect(dispatchEvidenceInsertMock).toHaveBeenCalledTimes(1);
  });

  it("shows the immutable association ID for an older linked dispatch in the legal timeline", async () => {
    deriveCaseLegalMilestonesMock.mockReturnValue([{
      id: "notice-dispatched-dispatch-1",
      kind: "notice-dispatched",
      date: new Date("2026-08-15T09:00:00.000Z"),
      dateLabel: "15.08.2026",
      supportingEvidenceName: "older-receipt.pdf",
      supportingEvidenceId: "evidence-older",
      supportingEvidenceAssociationId: "association-older",
    }]);
    noticeDispatches = [
      savedDispatch({
        user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
        dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
      }),
      {
        ...savedDispatch({
          user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
          dispatched_at: "2026-08-16T09:00:00.000Z", channel: "courier", reference: null,
        }),
        id: "dispatch-latest",
      },
    ];
    dispatchEvidence = [{
      id: "association-older", user_id: "user-1", case_id: "case-1", dispatch_id: "dispatch-1",
      evidence_id: "evidence-older", created_at: "2026-08-15T10:00:00.000Z",
    }];
    caseEvidence = [{
      id: "evidence-older", user_id: "user-1", case_id: "case-1", original_name: "older-receipt.pdf",
      storage_path: "user-1/case-1/older-receipt.pdf", mime_type: "application/pdf", size_bytes: 123,
      created_at: "2026-08-15T08:00:00.000Z",
    }];
    render(<CasesPage />);

    const timeline = await screen.findByTestId("cases-legal-timeline-case-1");
    await waitFor(() => {
      expect(timeline.textContent)
        .toContain("cases-notice-dispatch-evidence-association-id: association-older");
    });
    expect(screen.getByTestId("cases-notice-dispatch-evidence-form-case-1")).toBeTruthy();
  });

  it("reconciles a committed evidence link when the insert response is lost", async () => {
    noticeDispatches = [savedDispatch({
      user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
    })];
    caseEvidence = [{
      id: "evidence-1", user_id: "user-1", case_id: "case-1", original_name: "posting-receipt.pdf",
      storage_path: "user-1/case-1/posting-receipt.pdf", mime_type: "application/pdf", size_bytes: 123,
      created_at: "2026-08-14T09:00:00.000Z",
    }];
    dispatchEvidenceInsertMock.mockImplementationOnce(async (payload: Record<string, unknown>) => {
      dispatchEvidence = [{ id: "association-committed", ...payload, created_at: "2026-08-17T08:00:00.000Z" } as DispatchEvidenceRecord];
      throw new Error("response lost after commit");
    });
    render(<CasesPage />);

    fireEvent.submit(await screen.findByTestId("cases-notice-dispatch-evidence-form-case-1"));

    const linked = await screen.findByTestId("cases-notice-dispatch-evidence-case-1");
    expect(linked.textContent).toContain("association-committed");
    expect(screen.getByText("cases-notice-dispatch-evidence-linked")).toBeTruthy();
    expect(screen.queryByText("cases-notice-dispatch-evidence-error")).toBeNull();
  });

  it("shows the authoritative evidence link when another client wins the dispatch race", async () => {
    noticeDispatches = [savedDispatch({
      user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
    })];
    caseEvidence = [{
      id: "evidence-1", user_id: "user-1", case_id: "case-1", original_name: "selected-receipt.pdf",
      storage_path: "user-1/case-1/selected-receipt.pdf", mime_type: "application/pdf", size_bytes: 123,
      created_at: "2026-08-14T09:00:00.000Z",
    }];
    dispatchEvidenceInsertMock.mockImplementationOnce(async (payload: Record<string, unknown>) => {
      caseEvidence.push({
        id: "evidence-2", user_id: "user-1", case_id: "case-1", original_name: "winning-receipt.pdf",
        storage_path: "user-1/case-1/winning-receipt.pdf", mime_type: "application/pdf", size_bytes: 456,
        created_at: "2026-08-14T10:00:00.000Z",
      });
      dispatchEvidence = [{
        id: "association-winning",
        ...payload,
        evidence_id: "evidence-2",
        created_at: "2026-08-17T08:00:00.000Z",
      } as DispatchEvidenceRecord];
      return { data: null, error: { message: "dispatch already linked" } };
    });
    render(<CasesPage />);

    fireEvent.submit(await screen.findByTestId("cases-notice-dispatch-evidence-form-case-1"));

    const linked = await screen.findByTestId("cases-notice-dispatch-evidence-case-1");
    expect(linked.textContent).toContain("winning-receipt.pdf");
    expect(linked.textContent).toContain("evidence-2");
    expect(linked.textContent).toContain("association-winning");
    expect(screen.getByText("cases-notice-dispatch-evidence-existing")).toBeTruthy();
    expect(screen.queryByText("cases-notice-dispatch-evidence-error")).toBeNull();
  });

  it("does not show evidence-link feedback for a newer latest dispatch", async () => {
    noticeDispatches = [savedDispatch({
      user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
    })];
    caseEvidence = [{
      id: "evidence-1", user_id: "user-1", case_id: "case-1", original_name: "posting-receipt.pdf",
      storage_path: "user-1/case-1/posting-receipt.pdf", mime_type: "application/pdf", size_bytes: 123,
      created_at: "2026-08-14T09:00:00.000Z",
    }];
    render(<CasesPage />);

    fireEvent.submit(await screen.findByTestId("cases-notice-dispatch-evidence-form-case-1"));
    expect(await screen.findByText("cases-notice-dispatch-evidence-linked")).toBeTruthy();

    dispatchInsertMock.mockImplementationOnce(async (payload: Record<string, unknown>) => ({
      data: { ...savedDispatch(payload), id: "dispatch-2" },
      error: null,
    }));
    const newerDispatchForm = await dispatchForm();
    fireEvent.change(within(newerDispatchForm).getByLabelText(/cases-notice-dispatch-at/), {
      target: { value: "2026-08-16T10:30" },
    });
    fireEvent.submit(newerDispatchForm);

    await waitFor(() => expect(screen.queryByText("cases-notice-dispatch-evidence-linked")).toBeNull());
    expect(await screen.findByTestId("cases-notice-dispatch-evidence-form-case-1")).toBeTruthy();
  });

  it("blocks every rendered same-row navigation link in the submission tick and restores native links after failure", async () => {
    noticeDispatches = [savedDispatch({
      user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
    })];
    caseEvidence = [{
      id: "evidence-1", user_id: "user-1", case_id: "case-1", original_name: "posting-receipt.pdf",
      storage_path: "user-1/case-1/posting-receipt.pdf", mime_type: "application/pdf", size_bytes: 123,
      created_at: "2026-08-14T09:00:00.000Z",
    }];
    const pending = deferred<{ data: null; error: { message: string } }>();
    dispatchEvidenceInsertMock.mockImplementationOnce(() => pending.promise);
    render(<CasesPage />);
    const form = await screen.findByTestId("cases-notice-dispatch-evidence-form-case-1");
    const vaultLink = screen.getByText("cases-open-in-vault").closest("a") as HTMLAnchorElement;
    const protocolLink = screen.getByText("cases-create-protocol").closest("a") as HTMLAnchorElement;

    const submit = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);

    for (const link of [vaultLink, protocolLink]) {
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      expect(link.dispatchEvent(click)).toBe(false);
      expect(click.defaultPrevented).toBe(true);
    }

    pending.resolve({ data: null, error: { message: "denied" } });
    await screen.findByText("cases-notice-dispatch-evidence-error");
    await waitFor(() => {
      expect(screen.getByText("cases-open-in-vault").closest("a")?.getAttribute("href")).toContain("/dashboard/vault");
      expect(screen.getByText("cases-create-protocol").closest("a")?.getAttribute("href")).toContain("/dashboard");
    });
  });

  it.each(["returned", "thrown"] as const)(
    "locks sibling Case actions synchronously and unlocks after a %s evidence insert error",
    async (failureKind: "returned" | "thrown") => {
      noticeDispatches = [savedDispatch({
        user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
        dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
      })];
      caseEvidence = [{
        id: "evidence-1", user_id: "user-1", case_id: "case-1", original_name: "posting-receipt.pdf",
        storage_path: "user-1/case-1/posting-receipt.pdf", mime_type: "application/pdf", size_bytes: 123,
        created_at: "2026-08-14T09:00:00.000Z",
      }];
      const pending = deferred<{ data: null; error: { message: string } }>();
      dispatchEvidenceInsertMock.mockImplementationOnce(() => pending.promise);
      const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);
      render(<CasesPage />);
      const form = await screen.findByTestId("cases-notice-dispatch-evidence-form-case-1");
      const recordingForm = await dispatchForm();
      const checklist = screen.getByLabelText("cases-checklist-evidence-attached") as HTMLInputElement;

      fireEvent.submit(form);
      // Exercise sibling handler guards before React can rerender disabled state.
      fireEvent.click(checklist);
      fireEvent.submit(recordingForm);
      fireEvent.click(screen.getByRole("button", { name: "cases-delete" }));

      expect(dispatchEvidenceInsertMock).toHaveBeenCalledTimes(1);
      expect(dispatchInsertMock).not.toHaveBeenCalled();
      expect(rpcMock).not.toHaveBeenCalledWith("set_case_checklist_item", expect.anything());
      expect(confirmMock).not.toHaveBeenCalled();
      await waitFor(() => {
        expect((screen.getByRole("button", { name: "cases-edit" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "cases-delete" }) as HTMLButtonElement).disabled).toBe(true);
        expect(checklist.disabled).toBe(true);
        expect((screen.getByRole("button", { name: "cases-notice-draft-create" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "cases-notice-draft-download" }) as HTMLButtonElement).disabled).toBe(true);
        expect((within(recordingForm).getByRole("button", { name: "cases-notice-dispatch-submit" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "cases-export-chronology-csv" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "cases-export-dossier-pdf" }) as HTMLButtonElement).disabled).toBe(true);
      });

      if (failureKind === "returned") pending.resolve({ data: null, error: { message: "denied" } });
      else pending.reject(new Error("network"));

      expect((await screen.findByRole("status")).textContent).toContain("cases-notice-dispatch-evidence-error");
      await waitFor(() => {
        expect((screen.getByRole("button", { name: "cases-edit" }) as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByRole("button", { name: "cases-delete" }) as HTMLButtonElement).disabled).toBe(false);
        expect(checklist.disabled).toBe(false);
        expect((screen.getByRole("button", { name: "cases-notice-draft-create" }) as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByRole("button", { name: "cases-notice-draft-download" }) as HTMLButtonElement).disabled).toBe(false);
        expect((within(recordingForm).getByRole("button", { name: "cases-notice-dispatch-submit" }) as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByRole("button", { name: "cases-export-chronology-csv" }) as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByRole("button", { name: "cases-export-dossier-pdf" }) as HTMLButtonElement).disabled).toBe(false);
      });
      confirmMock.mockRestore();
    }
  );

  it("invalidates delayed evidence completion across an A-to-B-to-A identity transition", async () => {
    noticeDispatches = [savedDispatch({
      user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
    })];
    caseEvidence = [{
      id: "evidence-1", user_id: "user-1", case_id: "case-1", original_name: "posting-receipt.pdf",
      storage_path: "user-1/case-1/posting-receipt.pdf", mime_type: "application/pdf", size_bytes: 123,
      created_at: "2026-08-14T09:00:00.000Z",
    }];
    const pending = deferred<void>();
    dispatchEvidenceInsertMock.mockImplementationOnce((payload: Record<string, unknown>) =>
      pending.promise.then(() => ({
        data: { id: "association-stale", ...payload, created_at: "2026-08-17T08:00:00.000Z" },
        error: null,
      }))
    );
    const { rerender } = render(<CasesPage />);
    const form = await screen.findByTestId("cases-notice-dispatch-evidence-form-case-1");
    fireEvent.submit(form);
    expect(dispatchEvidenceInsertMock).toHaveBeenCalledTimes(1);

    await act(async () => { authUserMock = { id: "user-2" }; rerender(<CasesPage />); });
    await act(async () => { authUserMock = { id: "user-1" }; rerender(<CasesPage />); });
    pending.resolve();

    await waitFor(() => {
      expect(screen.queryByTestId("cases-notice-dispatch-evidence-case-1")).toBeNull();
      expect(screen.queryByText("cases-notice-dispatch-evidence-linked")).toBeNull();
    });
  });

  it("points to the existing Vault when the Case has no evidence file", async () => {
    noticeDispatches = [savedDispatch({
      user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-latest",
      dispatched_at: "2026-08-15T09:00:00.000Z", channel: "courier", reference: null,
    })];
    render(<CasesPage />);
    expect(await screen.findByText("cases-notice-dispatch-evidence-empty")).toBeTruthy();
    expect(screen.getByText("cases-notice-dispatch-evidence-open-vault").closest("a")?.getAttribute("href")).toContain("/dashboard/vault");
  });
});
