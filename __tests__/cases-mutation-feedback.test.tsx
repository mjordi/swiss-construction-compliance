import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const replaceMock = vi.fn();
const insertMock = vi.fn();
const deleteCaseWithEvidenceMock = vi.fn();
const completeCaseEvidenceCleanupMock = vi.fn();
const confirmMock = vi.fn(() => true);
const removeCaseEvidenceObjectsMock = vi.hoisted(() => vi.fn());
const storageMock = {};

type CaseRecord = {
  id: string;
  user_id: string;
  project_name: string;
  canton: string;
  contract_date: string;
  discovery_date: string;
  checklist: Record<string, boolean> | null;
  created_at: string;
  updated_at: string;
  status: string;
};

let casesData: CaseRecord[] = [];
let cleanupJobsData: Array<{ case_id: string; storage_paths: string[]; pending_upload_paths?: string[] }> = [];

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

vi.mock("@/lib/case-timeline", () => ({
  applyComplianceCaseView: (cases: unknown[]) => cases,
  buildComplianceCaseTimeline: (
    inputs: Array<{ id: string; projectName: string; canton: string; contractDate: Date; discoveryDate: Date }>
  ) =>
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
    })),
  buildCaseDeadlineReminderICS: () => "BEGIN:VCALENDAR\nEND:VCALENDAR",
  deriveCaseLegalMilestones: (item: { contractDateLabel: string; discoveryDateLabel: string; noticeDeadlineLabel: string }) => [
    { kind: "contract", date: new Date("2026-03-01"), dateLabel: item.contractDateLabel },
    { kind: "discovery", date: new Date("2026-03-21"), dateLabel: item.discoveryDateLabel },
    { kind: "notice-deadline", date: new Date("2026-05-20"), dateLabel: item.noticeDeadlineLabel },
  ],
  deriveChecklistProgress: (checklist: Record<string, boolean>) => ({
    completed: Object.values(checklist).filter(Boolean).length,
    total: Object.keys(checklist).length,
    label: "progress",
  }),
  isDeadlineReminderIcsExportEligible: () => false,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: storageMock,
    from: (table: string) => {
      if (table === "cases") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: casesData, error: null }),
            }),
          }),
          insert: insertMock,
        };
      }

      if (table === "protocols") {
        return {
          select: () => ({
            eq: () => ({
              not: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }

      if (table === "case_evidence_cleanup_jobs") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: cleanupJobsData, error: null }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
    rpc: (name: string, args: { target_case_id: string }) => {
      if (name === "delete_case_with_evidence") return deleteCaseWithEvidenceMock(args);
      if (name === "complete_case_evidence_cleanup") return completeCaseEvidenceCleanupMock(args);
      throw new Error(`Unexpected RPC ${name}`);
    },
  }),
}));

vi.mock("@/lib/case-evidence-cleanup", () => ({
  removeCaseEvidenceObjects: removeCaseEvidenceObjectsMock,
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
    checklist: null,
    created_at: "2026-03-21T00:00:00.000Z",
    updated_at: "2026-03-21T00:00:00.000Z",
    status: "active",
  };
}

function openCreateForm() {
  fireEvent.click(screen.getByRole("button", { name: /cases-add-case/i }));
}

function fillCreateForm(projectName = "New Case") {
  fireEvent.change(screen.getByLabelText("cases-project-name"), { target: { value: projectName } });
  fireEvent.change(screen.getByLabelText("cases-contract-date-input"), { target: { value: "2026-04-01" } });
  fireEvent.change(screen.getByLabelText("cases-discovery-date-input"), { target: { value: "2026-04-20" } });
}

describe("cases mutation feedback", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    insertMock.mockReset();
    deleteCaseWithEvidenceMock.mockReset().mockResolvedValue({
      data: { deleted: true, storage_paths: ["user-1/case-1/report.pdf"] },
      error: null,
    });
    completeCaseEvidenceCleanupMock.mockReset().mockResolvedValue({ data: true, error: null });
    removeCaseEvidenceObjectsMock.mockReset().mockResolvedValue(undefined);
    confirmMock.mockClear();
    casesData = [buildCase("case-1", "Alpine Tower")];
    cleanupJobsData = [];
    window.confirm = confirmMock;
  });

  it("retries durable evidence cleanup jobs when the Cases page opens", async () => {
    cleanupJobsData = [{
      case_id: "deleted-case",
      storage_paths: ["user-1/deleted-case/report.pdf"],
    }];

    render(<CasesPage />);

    await waitFor(() => expect(removeCaseEvidenceObjectsMock).toHaveBeenCalledWith(
      storageMock,
      ["user-1/deleted-case/report.pdf"]
    ));
    expect(completeCaseEvidenceCleanupMock).toHaveBeenCalledWith({ target_case_id: "deleted-case" });
  });

  it("does not retire a cleanup job while a captured upload may still be in flight", async () => {
    cleanupJobsData = [{
      case_id: "deleted-case",
      storage_paths: ["user-1/deleted-case/report.pdf"],
      pending_upload_paths: ["user-1/deleted-case/report.pdf"],
    }];

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    expect(removeCaseEvidenceObjectsMock).not.toHaveBeenCalled();
    expect(completeCaseEvidenceCleanupMock).not.toHaveBeenCalled();
  });

  it("keeps the form open, preserves entered values, and shows localized feedback when create returns an error", async () => {
    insertMock.mockResolvedValueOnce({ error: { message: "insert failed" } });

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    openCreateForm();
    fillCreateForm("Retention House");

    fireEvent.click(screen.getByRole("button", { name: "cases-save" }));

    expect(await screen.findByText("cases-create-error")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "cases-add-title" })).toBeTruthy();
    expect((screen.getByLabelText("cases-project-name") as HTMLInputElement).value).toBe("Retention House");
    expect((screen.getByLabelText("cases-contract-date-input") as HTMLInputElement).value).toBe("2026-04-01");
    expect((screen.getByLabelText("cases-discovery-date-input") as HTMLInputElement).value).toBe("2026-04-20");
  });

  it("clears stale create feedback on input change and after a successful retry closes the form", async () => {
    insertMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockImplementationOnce(async (payload: Omit<CaseRecord, "id" | "checklist" | "created_at" | "updated_at" | "status">) => {
        casesData = [
          buildCase("case-2", payload.project_name),
          ...casesData,
        ];
        return { error: null };
      });

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    openCreateForm();
    fillCreateForm("Retry Residence");

    fireEvent.click(screen.getByRole("button", { name: "cases-save" }));

    expect(await screen.findByText("cases-create-error")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("cases-project-name"), { target: { value: "Retry Residence Updated" } });
    await waitFor(() => {
      expect(screen.queryByText("cases-create-error")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "cases-save" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "cases-add-title" })).toBeNull();
    });
    expect(screen.queryByText("cases-create-error")).toBeNull();
    expect(await screen.findByText("Retry Residence Updated")).toBeTruthy();
  });

  it("locks the create form and ignores duplicate submits while a save is in flight", async () => {
    let resolveInsert: ((value: { error: null }) => void) | null = null;
    insertMock.mockImplementationOnce(
      () =>
        new Promise<{ error: null }>((resolve) => {
          resolveInsert = resolve;
        })
    );

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    openCreateForm();
    fillCreateForm("Pending Residence");

    const saveButton = screen.getByRole("button", { name: "cases-save" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledTimes(1);
      expect((screen.getByLabelText("cases-project-name") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText("cases-canton-label") as HTMLSelectElement).disabled).toBe(true);
      expect((screen.getByLabelText("cases-contract-date-input") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText("cases-discovery-date-input") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: /cases-add-case/i }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "cases-cancel" }) as HTMLButtonElement).disabled).toBe(true);
    });

    resolveInsert?.({ error: null });

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "cases-add-title" })).toBeNull();
    });
  });

  it("keeps the case visible and preserves evidence when delete returns an error", async () => {
    deleteCaseWithEvidenceMock.mockResolvedValueOnce({ data: null, error: { message: "delete failed" } });

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    fireEvent.click(screen.getByTitle("cases-delete"));

    expect(await screen.findByText("cases-delete-error")).toBeTruthy();
    expect(deleteCaseWithEvidenceMock).toHaveBeenCalledWith({ target_case_id: "case-1" });
    expect(removeCaseEvidenceObjectsMock).not.toHaveBeenCalled();
    expect(screen.getByText("Alpine Tower")).toBeTruthy();
  });

  it("does not remove a case when atomic deletion is not confirmed", async () => {
    deleteCaseWithEvidenceMock.mockResolvedValueOnce({ data: { deleted: false, storage_paths: [] }, error: null });

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    fireEvent.click(screen.getByTitle("cases-delete"));

    expect(await screen.findByText("cases-delete-error")).toBeTruthy();
    expect(removeCaseEvidenceObjectsMock).not.toHaveBeenCalled();
    expect(deleteCaseWithEvidenceMock).toHaveBeenCalledWith({ target_case_id: "case-1" });
    expect(screen.getByText("Alpine Tower")).toBeTruthy();
  });

  it("removes atomically captured evidence only after case deletion succeeds and reports cleanup separately", async () => {
    deleteCaseWithEvidenceMock.mockImplementationOnce(async ({ target_case_id: caseId }: { target_case_id: string }) => {
      casesData = casesData.filter((item) => item.id !== caseId);
      return { data: { deleted: true, storage_paths: ["user-1/case-1/report.pdf"] }, error: null };
    });
    removeCaseEvidenceObjectsMock.mockRejectedValueOnce(new Error("storage cleanup failed"));

    render(<CasesPage />);
    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    fireEvent.click(screen.getByTitle("cases-delete"));

    expect(await screen.findByText("cases-delete-evidence-cleanup-error")).toBeTruthy();
    expect(removeCaseEvidenceObjectsMock).toHaveBeenCalledWith(storageMock, ["user-1/case-1/report.pdf"]);
    expect(completeCaseEvidenceCleanupMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Alpine Tower")).toBeNull();
  });

  it("acknowledges the durable cleanup job only after Storage removal succeeds", async () => {
    deleteCaseWithEvidenceMock.mockImplementationOnce(async ({ target_case_id: caseId }: { target_case_id: string }) => {
      casesData = casesData.filter((item) => item.id !== caseId);
      return { data: { deleted: true, storage_paths: ["user-1/case-1/report.pdf"] }, error: null };
    });
    render(<CasesPage />);
    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    fireEvent.click(screen.getByTitle("cases-delete"));

    await waitFor(() => {
      expect(removeCaseEvidenceObjectsMock).toHaveBeenCalledWith(storageMock, ["user-1/case-1/report.pdf"]);
      expect(completeCaseEvidenceCleanupMock).toHaveBeenCalledWith({ target_case_id: "case-1" });
    });
    expect(screen.queryByText("Alpine Tower")).toBeNull();
  });

  it("defers deletion cleanup until the pending upload reports a terminal outcome", async () => {
    deleteCaseWithEvidenceMock.mockImplementationOnce(async ({ target_case_id: caseId }: { target_case_id: string }) => {
      casesData = casesData.filter((item) => item.id !== caseId);
      return {
        data: {
          deleted: true,
          storage_paths: ["user-1/case-1/report.pdf"],
          cleanup_pending: true,
        },
        error: null,
      };
    });
    render(<CasesPage />);
    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    fireEvent.click(screen.getByTitle("cases-delete"));

    await waitFor(() => expect(screen.queryByText("Alpine Tower")).toBeNull());
    expect(removeCaseEvidenceObjectsMock).not.toHaveBeenCalled();
    expect(completeCaseEvidenceCleanupMock).not.toHaveBeenCalled();
    expect(screen.queryByText("cases-delete-evidence-cleanup-error")).toBeNull();
  });

  it("acknowledges the durable cleanup job when the deleted case has no evidence paths", async () => {
    deleteCaseWithEvidenceMock.mockImplementationOnce(async ({ target_case_id: caseId }: { target_case_id: string }) => {
      casesData = casesData.filter((item) => item.id !== caseId);
      return { data: { deleted: true, storage_paths: [] }, error: null };
    });
    render(<CasesPage />);
    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    fireEvent.click(screen.getByTitle("cases-delete"));

    await waitFor(() => {
      expect(removeCaseEvidenceObjectsMock).toHaveBeenCalledWith(storageMock, []);
      expect(completeCaseEvidenceCleanupMock).toHaveBeenCalledWith({ target_case_id: "case-1" });
    });
    expect(screen.queryByText("Alpine Tower")).toBeNull();
  });

  it("keeps the delete control disabled while a delete request is in flight", async () => {
    let resolveDelete!: (value: { data: { deleted: true; storage_paths: string[] }; error: null }) => void;
    deleteCaseWithEvidenceMock.mockImplementationOnce(
      () =>
        new Promise<{ data: { deleted: true; storage_paths: string[] }; error: null }>((resolve) => {
          resolveDelete = resolve;
        })
    );

    render(<CasesPage />);

    const deleteButton = await screen.findByTitle("cases-delete");
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect((screen.getByTitle("cases-delete") as HTMLButtonElement).disabled).toBe(true);
    });

    resolveDelete({ data: { deleted: true, storage_paths: [] }, error: null });

    await waitFor(() => {
      expect(deleteCaseWithEvidenceMock).toHaveBeenCalledWith({ target_case_id: "case-1" });
    });
  });

  it("clears stale delete feedback after a successful retry following a thrown delete failure", async () => {
    deleteCaseWithEvidenceMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockImplementationOnce(async ({ target_case_id: caseId }: { target_case_id: string }) => {
        casesData = casesData.filter((item) => item.id !== caseId);
        return { data: { deleted: true, storage_paths: ["user-1/case-1/report.pdf"] }, error: null };
      });

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    fireEvent.click(screen.getByTitle("cases-delete"));

    expect(await screen.findByText("cases-delete-error")).toBeTruthy();
    expect(screen.getByText("Alpine Tower")).toBeTruthy();

    fireEvent.click(screen.getByTitle("cases-delete"));

    await waitFor(() => {
      expect(screen.queryByText("cases-delete-error")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByText("Alpine Tower")).toBeNull();
    });
  });
});
