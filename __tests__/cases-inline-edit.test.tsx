import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const replaceMock = vi.fn();
const updateEqMock = vi.fn();

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
            eq: vi.fn(),
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

describe("cases inline edit", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    updateEqMock.mockReset();
    casesData = [buildCase("case-1", "Alpine Tower")];
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
});
