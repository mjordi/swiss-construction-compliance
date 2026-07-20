import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();
const updateEqMock = vi.fn();
const createObjectURLMock = vi.fn(() => "blob:case-reminder");
const revokeObjectURLMock = vi.fn();
let updatePayloads: Array<{ checklist?: Record<string, boolean> }> = [];
let caseChecklistData: Record<string, boolean> | null = {
  defectDocumented: false,
  evidenceAttached: false,
  noticeDrafted: false,
  calendarReminderExported: false,
};
let protocolRows: Array<{ case_id: string }> = [];

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
  buildComplianceCaseTimeline: (inputs: Array<{ id: string; projectName: string; canton: string }>) =>
    inputs.map((input) => ({
      id: input.id,
      projectName: input.projectName,
      canton: input.canton,
      status: "warning",
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
    })),
  buildCaseDeadlineReminderICS: () => "BEGIN:VCALENDAR\nEND:VCALENDAR",
  deriveChecklistProgress: (checklist: Record<string, boolean>) => ({
    completed: Object.values(checklist).filter(Boolean).length,
    total: Object.keys(checklist).length,
    label: "progress",
  }),
  isDeadlineReminderIcsExportEligible: () => true,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
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
          select: () => ({
            eq: () => ({
              not: () => Promise.resolve({ data: protocolRows, error: null }),
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
    updateEqMock.mockReset();
    updatePayloads = [];
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
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
    protocolRows = [];
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
    let resolveUpdate: (value: { error: null }) => void = () => {};
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

    resolveUpdate({ error: null });

    await waitFor(() => {
      expect((screen.getByText("cases-export-ics").closest("button") as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("keeps calendar reminder export complete when the reminder is downloaded again", async () => {
    updateEqMock.mockResolvedValueOnce({ error: null });
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
      expect(updateEqMock).toHaveBeenCalledWith("id", "case-1");
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
    let resolveUpdate: (value: { error: null }) => void = () => {};
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

    resolveUpdate({ error: null });

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "cases-edit" }) as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByTitle("cases-delete") as HTMLButtonElement).disabled).toBe(false);
      expect(screen.getByRole("link", { name: "cases-open-in-vault" }).getAttribute("href")).toBe("/dashboard/vault?q=Alpine+Tower");
      expect(screen.getByRole("link", { name: "cases-create-protocol" }).getAttribute("href")).toBe("/dashboard?case=case-1");
    });
  });

  it("temporarily disables checklist inputs while a save is in flight and re-enables them after success", async () => {
    let resolveUpdate: (value: { error: null }) => void = () => {};
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

    resolveUpdate({ error: null });

    await waitFor(() => {
      const refreshedCheckbox = screen.getByLabelText("cases-checklist-evidence-attached") as HTMLInputElement;
      expect(refreshedCheckbox.disabled).toBe(false);
    });
    expect(screen.queryByText("cases-checklist-save-error")).toBeNull();
  });
});
