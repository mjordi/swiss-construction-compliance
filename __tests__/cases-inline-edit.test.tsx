import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const replaceMock = vi.fn();
const updateEqMock = vi.fn();
const deleteEqMock = vi.fn();

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
          update: (payload: Record<string, unknown>) => ({
            eq: (field: string, caseId: string) => updateEqMock(payload, field, caseId),
          }),
          delete: () => ({
            eq: (field: string, caseId: string) => deleteEqMock(field, caseId),
          }),
          insert: vi.fn(),
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
    casesData = [buildCase("case-1", "Alpine Tower"), buildCase("case-2", "Riverside Hall")];
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
});
