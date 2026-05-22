import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const replaceMock = vi.fn();
const insertMock = vi.fn();
const deleteEqMock = vi.fn();
const confirmMock = vi.fn(() => true);

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
  deriveChecklistProgress: (checklist: Record<string, boolean>) => ({
    completed: Object.values(checklist).filter(Boolean).length,
    total: Object.keys(checklist).length,
    label: "progress",
  }),
  isDeadlineReminderIcsExportEligible: () => false,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      if (table === "cases") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: casesData, error: null }),
            }),
          }),
          insert: insertMock,
          delete: () => ({
            eq: deleteEqMock,
          }),
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

      throw new Error(`Unexpected table ${table}`);
    },
  }),
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
    deleteEqMock.mockReset();
    confirmMock.mockClear();
    casesData = [buildCase("case-1", "Alpine Tower")];
    window.confirm = confirmMock;
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

  it("keeps the case visible and shows localized feedback when delete returns an error", async () => {
    deleteEqMock.mockResolvedValueOnce({ error: { message: "delete failed" } });

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    fireEvent.click(screen.getByTitle("cases-delete"));

    expect(await screen.findByText("cases-delete-error")).toBeTruthy();
    expect(screen.getByText("Alpine Tower")).toBeTruthy();
  });

  it("keeps the delete control disabled while a delete request is in flight", async () => {
    let resolveDelete: ((value: { error: null }) => void) | null = null;
    deleteEqMock.mockImplementationOnce(
      () =>
        new Promise<{ error: null }>((resolve) => {
          resolveDelete = resolve;
        })
    );

    render(<CasesPage />);

    const deleteButton = await screen.findByTitle("cases-delete");
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect((screen.getByTitle("cases-delete") as HTMLButtonElement).disabled).toBe(true);
    });

    resolveDelete?.({ error: null });

    await waitFor(() => {
      expect(deleteEqMock).toHaveBeenCalledWith("id", "case-1");
    });
  });

  it("clears stale delete feedback after a successful retry following a thrown delete failure", async () => {
    deleteEqMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockImplementationOnce(async (field: string, caseId: string) => {
        expect(field).toBe("id");
        casesData = casesData.filter((item) => item.id !== caseId);
        return { error: null };
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
