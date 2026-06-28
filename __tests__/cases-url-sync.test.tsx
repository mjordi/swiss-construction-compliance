import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

let currentSearch = "";
const replaceMock = vi.fn();
const routerMock = { replace: replaceMock };
const deleteCaseEqMock = vi.fn();

type CasesResponse = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
type ProtocolsResponse = { data: Array<{ case_id: string | null }> | null; error: { message: string } | null };

type CasesFactoryResult = CasesResponse | Promise<CasesResponse> | never;
type ProtocolsFactoryResult = ProtocolsResponse | Promise<ProtocolsResponse> | never;

let caseResponseFactory: () => CasesFactoryResult;
let protocolResponseFactory: () => ProtocolsFactoryResult;

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/cases",
  useRouter: () => routerMock,
  useSearchParams: () => {
    const params = new URLSearchParams(currentSearch);
    return {
      get: (key: string) => params.get(key),
      toString: () => params.toString(),
    };
  },
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
      statusLabel: "Warning",
      deadlineCountdownTone: "warning",
      deadlineCountdownLabel: "10 days left",
      regimeLabel: "New law",
      regime: "new",
      noticeApplies: true,
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
              order: () => Promise.resolve().then(() => caseResponseFactory()),
            }),
          }),
          delete: () => ({
            eq: deleteCaseEqMock,
          }),
        };
      }

      if (table === "protocols") {
        return {
          select: () => ({
            eq: () => ({
              not: () => Promise.resolve().then(() => protocolResponseFactory()),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import CasesPage from "@/app/dashboard/cases/page";

function successCase(id = "case-1", projectName = "Alpine Tower") {
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

describe("cases filter URL synchronization", () => {
  beforeEach(() => {
    currentSearch = "";
    replaceMock.mockReset();
    deleteCaseEqMock.mockReset();
    deleteCaseEqMock.mockResolvedValue({ error: null });
    caseResponseFactory = () => ({ data: [], error: null });
    protocolResponseFactory = () => ({ data: [], error: null });
  });

  it("hydrates the current query params into the visible filter controls, including triage", async () => {
    currentSearch = "regime=new&status=triage&sort=most-urgent&q=alpha";

    render(<CasesPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-filter-regime") as HTMLSelectElement).value).toBe("new");
    });

    expect((screen.getByLabelText("cases-filter-status") as HTMLSelectElement).value).toBe("triage");
    expect((screen.getByLabelText("cases-filter-sort") as HTMLSelectElement).value).toBe("most-urgent");
    expect((screen.getByLabelText("cases-search-label") as HTMLInputElement).value).toBe("alpha");
  });

  it("renders the vault triage handoff in the visible status control", async () => {
    currentSearch = "q=Riverside+Bridge&status=triage";

    render(<CasesPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-filter-status") as HTMLSelectElement).value).toBe("triage");
    });

    expect((screen.getByLabelText("cases-search-label") as HTMLInputElement).value).toBe("Riverside Bridge");
  });

  it("removes invalid filter params while preserving valid search and unrelated params", async () => {
    currentSearch = "regime=bad&status=triage&sort=sideways&q=Riverside+Bridge&tab=active";

    render(<CasesPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        "/dashboard/cases?status=triage&q=Riverside+Bridge&tab=active",
        { scroll: false }
      );
    });

    expect((screen.getByLabelText("cases-filter-regime") as HTMLSelectElement).value).toBe("all");
    expect((screen.getByLabelText("cases-filter-status") as HTMLSelectElement).value).toBe("triage");
    expect((screen.getByLabelText("cases-filter-sort") as HTMLSelectElement).value).toBe("nearest-deadline");
    expect((screen.getByLabelText("cases-search-label") as HTMLInputElement).value).toBe("Riverside Bridge");
  });

  it("normalizes externally introduced invalid filter params even when parsed filters are unchanged", async () => {
    const { rerender } = render(<CasesPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("cases-filter-regime")).toBeTruthy();
    });
    replaceMock.mockClear();

    currentSearch = "regime=legacy&status=nope&sort=random&q=alpha";
    rerender(<CasesPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/cases?q=alpha", { scroll: false });
    });

    expect((screen.getByLabelText("cases-filter-regime") as HTMLSelectElement).value).toBe("all");
    expect((screen.getByLabelText("cases-filter-status") as HTMLSelectElement).value).toBe("all");
    expect((screen.getByLabelText("cases-filter-sort") as HTMLSelectElement).value).toBe("nearest-deadline");
  });

  it("re-hydrates filter state when the query params change externally", async () => {
    currentSearch = "regime=new&status=warning&sort=most-urgent&q=alpha";

    const { rerender } = render(<CasesPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-search-label") as HTMLInputElement).value).toBe("alpha");
    });

    currentSearch = "status=expired&q=beta";
    rerender(<CasesPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-filter-regime") as HTMLSelectElement).value).toBe("all");
    });

    expect((screen.getByLabelText("cases-filter-status") as HTMLSelectElement).value).toBe("expired");
    expect((screen.getByLabelText("cases-filter-sort") as HTMLSelectElement).value).toBe("nearest-deadline");
    expect((screen.getByLabelText("cases-search-label") as HTMLInputElement).value).toBe("beta");
  });

  it("consumes calculator handoff dates into the create-case form while preserving filters", async () => {
    currentSearch = "contract=2026-02-01&discovery=2026-03-01&q=Riverside+Bridge&status=triage&from=calc";

    render(<CasesPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-contract-date-input") as HTMLInputElement).value).toBe("2026-02-01");
    });

    expect((screen.getByLabelText("cases-discovery-date-input") as HTMLInputElement).value).toBe("2026-03-01");
    expect(screen.getByText("cases-add-title")).toBeTruthy();
    expect(replaceMock).toHaveBeenCalledWith(
      "/dashboard/cases?q=Riverside+Bridge&status=triage&from=calc",
      { scroll: false }
    );
  });

  it("removes invalid calculator handoff params without opening the create-case form", async () => {
    currentSearch = "contract=bad-date&discovery=nope&q=Riverside+Bridge";

    render(<CasesPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/cases?q=Riverside+Bridge", { scroll: false });
    });

    expect(screen.queryByText("cases-add-title")).toBeNull();
  });

  it("renders an initial load error with retry instead of the empty state when fetch fails", async () => {
    caseResponseFactory = () => ({ data: null, error: { message: "boom" } });
    protocolResponseFactory = () => ({ data: [], error: null });

    render(<CasesPage />);

    expect(await screen.findByText("cases-load-error")).toBeTruthy();
    expect(screen.getByText("cases-load-retry")).toBeTruthy();
    expect(screen.queryByText("cases-no-cases")).toBeNull();
  });

  it("renders an initial load error with retry when the linked protocols query fails", async () => {
    caseResponseFactory = () => ({ data: [successCase()], error: null });
    protocolResponseFactory = () => ({ data: null, error: { message: "protocols boom" } });

    render(<CasesPage />);

    expect(await screen.findByText("cases-load-error")).toBeTruthy();
    expect(screen.getByText("cases-load-retry")).toBeTruthy();
    expect(screen.queryByText("Alpine Tower")).toBeNull();
  });

  it("renders an initial load error when a fetch rejects instead of returning an error payload", async () => {
    caseResponseFactory = () => Promise.reject(new Error("network down"));
    protocolResponseFactory = () => ({ data: [], error: null });

    render(<CasesPage />);

    expect(await screen.findByText("cases-load-error")).toBeTruthy();
    expect(screen.getByText("cases-load-retry")).toBeTruthy();
  });

  it("retries through the existing refresh path and renders normal content after recovery", async () => {
    let caseFetchCount = 0;
    caseResponseFactory = () => {
      caseFetchCount += 1;
      if (caseFetchCount === 1) {
        return { data: null, error: { message: "boom" } };
      }
      return { data: [successCase()], error: null };
    };

    protocolResponseFactory = () => ({ data: [{ case_id: "case-1" }], error: null });

    render(<CasesPage />);

    const retryButton = await screen.findByText("cases-load-retry");

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.queryByText("cases-load-error")).toBeNull();
    });
    expect(screen.getByText("Alpine Tower")).toBeTruthy();
    expect(screen.getByText(/1 cases-protocols/)).toBeTruthy();
  });

  it("renders a direct create-protocol handoff for each visible case", async () => {
    caseResponseFactory = () => ({ data: [successCase()], error: null });
    protocolResponseFactory = () => ({ data: [], error: null });

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    expect(screen.getByRole("link", { name: "cases-create-protocol" }).getAttribute("href")).toBe(
      "/dashboard?case=case-1"
    );
  });

  it("renders a per-case vault handoff scoped to the case project name", async () => {
    caseResponseFactory = () => ({ data: [successCase()], error: null });
    protocolResponseFactory = () => ({ data: [], error: null });

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    expect(screen.getByRole("link", { name: "cases-open-in-vault" }).getAttribute("href")).toBe(
      "/dashboard/vault?q=Alpine+Tower"
    );
  });

  it("keeps the already-rendered list visible when a later refresh fails after a successful load", async () => {
    let caseFetchCount = 0;
    caseResponseFactory = () => {
      caseFetchCount += 1;
      if (caseFetchCount === 1) {
        return { data: [successCase()], error: null };
      }
      return { data: null, error: { message: "refresh failed" } };
    };

    let protocolFetchCount = 0;
    protocolResponseFactory = () => {
      protocolFetchCount += 1;
      if (protocolFetchCount === 1) {
        return { data: [{ case_id: "case-1" }], error: null };
      }
      return { data: null, error: { message: "refresh failed" } };
    };

    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<CasesPage />);

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    fireEvent.click(screen.getByTitle("cases-delete"));

    await waitFor(() => {
      expect(deleteCaseEqMock).toHaveBeenCalledWith("id", "case-1");
    });

    expect(screen.getByText("Alpine Tower")).toBeTruthy();
    expect(screen.queryByText("cases-load-error")).toBeNull();

    confirmMock.mockRestore();
  });
});
