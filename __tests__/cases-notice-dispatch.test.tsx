import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchInsertMock = vi.fn();
const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async () => ({ data: true, error: null })),
}));
const replaceMock = vi.fn();
const routerMock = { replace: replaceMock };
const searchParamsMock = { get: () => null, toString: () => "" };
let authUserMock = { id: "user-1" };

let noticeDrafts: NoticeDraftRecord[] = [];
let noticeDispatches: NoticeDispatchRecord[] = [];

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
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
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
  deriveCaseLegalMilestones: () => [],
  deriveChecklistProgress: () => ({ completed: 1, total: 4, label: "progress" }),
  isDeadlineReminderIcsExportEligible: () => false,
}));

vi.mock("@/lib/supabase", () => {
  const supabase = {
    rpc: rpcMock,
    from: (table: string) => {
      if (table === "cases") {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: [caseRecord], error: null }) }) }),
        };
      }
      if (table === "protocols") {
        return { select: () => ({ eq: () => ({ not: async () => ({ data: [], error: null }) }) }) };
      }
      if (table === "latest_case_notice_drafts") {
        return { select: () => ({ eq: async () => ({ data: noticeDrafts, error: null }) }) };
      }
      if (table === "case_notice_dispatches") {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: noticeDispatches, error: null }) }) }),
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({ single: () => dispatchInsertMock(payload) }),
          }),
        };
      }
      if (table === "case_activity_events") {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
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
    authUserMock = { id: "user-1" };
    rpcMock.mockClear();
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
});
