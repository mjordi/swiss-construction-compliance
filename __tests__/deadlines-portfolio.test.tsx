import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { CASE_DEADLINE_PORTFOLIO_PAGE_SIZE } from "@/lib/case-deadline-portfolio";

const portfolioMocks = vi.hoisted(() => ({
  generateICS: vi.fn(),
}));
const languageState = vi.hoisted(() => ({ lang: "en" }));

const authState: { user: { id: string } | null } = { user: { id: "owner-1" } };
let responseFactory: (ownerId: string, from: number, to: number) =>
  | Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>
  | { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
const ownerScopes: string[] = [];
const requestedRanges: Array<[number, number]> = [];

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table !== "cases") throw new Error(`Unexpected table: ${table}`);
    return {
      select: vi.fn(() => ({
        eq: vi.fn((_column: string, ownerId: string) => {
          ownerScopes.push(ownerId);
          return {
            order: vi.fn((_column: string, options: { ascending: boolean }) => {
              expect(options).toEqual({ ascending: true });
              return {
                range: vi.fn((from: number, to: number) => {
                  requestedRanges.push([from, to]);
                  return Promise.resolve().then(() => responseFactory(ownerId, from, to));
                }),
              };
            }),
          };
        }),
      })),
    };
  }),
};

vi.mock("@/context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: languageState.lang,
    t: (key: string) => key.startsWith("deadlines-portfolio-ics-") ? `${languageState.lang}:${key}` : key,
  }),
}));
vi.mock("@/components/dashboard/PageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => supabaseMock }));
vi.mock("@/lib/case-deadline-portfolio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/case-deadline-portfolio")>();
  portfolioMocks.generateICS.mockImplementation(actual.generateCaseDeadlinePortfolioICS);
  return { ...actual, generateCaseDeadlinePortfolioICS: portfolioMocks.generateICS };
});

import DeadlinesPage from "@/app/dashboard/deadlines/page";

function caseRow(id: string, projectName: string, discoveryDate = "2026-05-01", status = "active") {
  return {
    id,
    project_name: projectName,
    contract_date: "2026-01-15",
    discovery_date: discoveryDate,
    status,
  };
}

describe("Case deadline portfolio on the deadlines page", () => {
  const createObjectURL = vi.fn(() => "blob:portfolio");
  const revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));
    authState.user = { id: "owner-1" };
    languageState.lang = "en";
    responseFactory = () => ({ data: [], error: null });
    ownerScopes.length = 0;
    requestedRanges.length = 0;
    supabaseMock.from.mockClear();
    portfolioMocks.generateICS.mockClear();
    createObjectURL.mockReset();
    createObjectURL.mockReturnValue("blob:portfolio");
    revokeObjectURL.mockReset();
    anchorClick.mockClear();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    window.history.replaceState(null, "", "/dashboard/deadlines");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("loads Cases owner-scoped and renders loading, eligible count/context, and exclusions", async () => {
    let resolveQuery: ((value: { data: Array<Record<string, unknown>>; error: null }) => void) | undefined;
    responseFactory = () => new Promise((resolve) => { resolveQuery = resolve; });

    render(<DeadlinesPage />);

    expect(screen.getByText("deadlines-portfolio-loading")).toBeTruthy();
    expect(ownerScopes).toEqual(["owner-1"]);
    await waitFor(() => expect(resolveQuery).toBeTypeOf("function"));

    resolveQuery?.({
      data: [
        caseRow("eligible", "Alpine Tower"),
        caseRow("expired", "Expired", "2026-04-01"),
        caseRow("archived", "Archived", "2026-05-01", "archived"),
      ],
      error: null,
    });

    const region = await screen.findByRole("region", { name: "deadlines-portfolio-title" });
    expect(await within(region).findByText("deadlines-portfolio-count")).toBeTruthy();
    expect(within(region).getByText("Alpine Tower")).toBeTruthy();
    expect(within(region).queryByText("Expired")).toBeNull();
    expect(within(region).queryByText("Archived")).toBeNull();
  });

  it("renders the localized empty state", async () => {
    render(<DeadlinesPage />);

    expect(await screen.findByText("deadlines-portfolio-empty")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "deadlines-portfolio-download" })).toBeNull();
  });

  it("loads the portfolio after React Strict Mode replays mount effects", async () => {
    responseFactory = () => ({ data: [caseRow("strict-case", "Strict Project")], error: null });

    render(
      <StrictMode>
        <DeadlinesPage />
      </StrictMode>
    );

    expect(await screen.findByText("Strict Project")).toBeTruthy();
    expect(screen.queryByText("deadlines-portfolio-loading")).toBeNull();
  });

  it("handles returned and thrown query failures with retry", async () => {
    let attempt = 0;
    responseFactory = () => {
      attempt += 1;
      if (attempt === 1) return { data: null, error: { message: "failed" } };
      if (attempt === 2) throw new Error("thrown failure");
      return { data: [caseRow("eligible", "Recovered")], error: null };
    };

    render(<DeadlinesPage />);

    fireEvent.click(await screen.findByRole("button", { name: "deadlines-portfolio-retry" }));
    fireEvent.click(await screen.findByRole("button", { name: "deadlines-portfolio-retry" }));

    expect(await screen.findByText("Recovered")).toBeTruthy();
    expect(ownerScopes).toEqual(["owner-1", "owner-1", "owner-1"]);
  });

  it("exports one snapshot with current reminder selections, suppresses duplicate clicks, and cleans the URL", async () => {
    responseFactory = () => ({ data: [caseRow("eligible", "Portfolio Project")], error: null });
    render(<DeadlinesPage />);
    const region = await screen.findByRole("region", { name: "deadlines-portfolio-title" });

    expect(within(region).getByText("deadlines-portfolio-guidance")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "14 deadlines-reminder-days" }));
    fireEvent.click(screen.getByRole("button", { name: "30 deadlines-reminder-days" }));

    const button = within(region).getByRole("button", { name: "deadlines-portfolio-download" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(portfolioMocks.generateICS).toHaveBeenCalledTimes(1));
    expect(portfolioMocks.generateICS.mock.calls[0][1]).toEqual([30, 7, 1]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:portfolio");
    expect((anchorClick.mock.instances[0] as HTMLAnchorElement).download).toBe("baucompliance-case-deadlines-2026-06-01.ics");
    expect(await within(region).findByRole("button", { name: "deadlines-portfolio-ready" })).toBeTruthy();
  });

  it("reports blob preparation failure and permits a retry", async () => {
    responseFactory = () => ({ data: [caseRow("eligible", "Retry Project")], error: null });
    createObjectURL.mockImplementationOnce(() => { throw new Error("blob unavailable"); });
    render(<DeadlinesPage />);
    const region = await screen.findByRole("region", { name: "deadlines-portfolio-title" });

    fireEvent.click(within(region).getByRole("button", { name: "deadlines-portfolio-download" }));
    const retry = await within(region).findByRole("button", { name: "deadlines-portfolio-download-error" });
    fireEvent.click(retry);

    expect(await within(region).findByRole("button", { name: "deadlines-portfolio-ready" })).toBeTruthy();
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("hides prior-owner data and ignores stale completions across account transitions", async () => {
    let resolveOwnerOne: ((value: { data: Array<Record<string, unknown>>; error: null }) => void) | undefined;
    responseFactory = (ownerId) => ownerId === "owner-1"
      ? new Promise((resolve) => { resolveOwnerOne = resolve; })
      : { data: [caseRow("owner-2-case", "Owner Two")], error: null };

    const view = render(<DeadlinesPage />);
    await waitFor(() => expect(resolveOwnerOne).toBeTypeOf("function"));
    authState.user = { id: "owner-2" };
    view.rerender(<DeadlinesPage />);

    expect(screen.queryByText("Owner One")).toBeNull();
    expect(await screen.findByText("Owner Two")).toBeTruthy();

    resolveOwnerOne?.({ data: [caseRow("owner-1-case", "Owner One")], error: null });
    await Promise.resolve();

    expect(screen.queryByText("Owner One")).toBeNull();
    expect(screen.getByText("Owner Two")).toBeTruthy();
  });

  it("loads every deterministic page before composing the portfolio", async () => {
    const firstPage = Array.from({ length: CASE_DEADLINE_PORTFOLIO_PAGE_SIZE }, (_, index) =>
      caseRow(`case-${String(index).padStart(4, "0")}`, `Project ${index}`)
    );
    responseFactory = (_ownerId, from) => ({
      data: from === 0 ? firstPage : [caseRow("case-final", "Final Page Project")],
      error: null,
    });

    render(<DeadlinesPage />);

    expect(await screen.findByText("Final Page Project")).toBeTruthy();
    expect(screen.getByText(String(CASE_DEADLINE_PORTFOLIO_PAGE_SIZE + 1))).toBeTruthy();
    expect(requestedRanges).toEqual([
      [0, CASE_DEADLINE_PORTFOLIO_PAGE_SIZE - 1],
      [CASE_DEADLINE_PORTFOLIO_PAGE_SIZE, CASE_DEADLINE_PORTFOLIO_PAGE_SIZE * 2 - 1],
    ]);
  });

  it("stops a stale paginated request when the owner changes", async () => {
    let resolveSecondPage: ((value: { data: Array<Record<string, unknown>>; error: null }) => void) | undefined;
    responseFactory = (ownerId, from) => {
      if (ownerId === "owner-2") return { data: [caseRow("owner-2", "Owner Two Current")], error: null };
      if (from === 0) {
        return {
          data: Array.from({ length: CASE_DEADLINE_PORTFOLIO_PAGE_SIZE }, (_, index) =>
            caseRow(`stale-${index}`, `Stale ${index}`)
          ),
          error: null,
        };
      }
      return new Promise((resolve) => { resolveSecondPage = resolve; });
    };

    const view = render(<DeadlinesPage />);
    await waitFor(() => expect(resolveSecondPage).toBeTypeOf("function"));
    authState.user = { id: "owner-2" };
    view.rerender(<DeadlinesPage />);
    expect(await screen.findByText("Owner Two Current")).toBeTruthy();

    resolveSecondPage?.({ data: [caseRow("stale-final", "Stale Final Page")], error: null });
    await Promise.resolve();
    expect(screen.queryByText("Stale Final Page")).toBeNull();
    expect(screen.getByText("Owner Two Current")).toBeTruthy();
  });

  it("rebuilds retained Cases at Swiss midnight so a due-today row disappears", async () => {
    responseFactory = () => ({ data: [caseRow("due-today", "Due Today", "2026-04-02")], error: null });
    render(<DeadlinesPage />);
    expect(await screen.findByText("Due Today")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    });

    expect(await screen.findByText("deadlines-portfolio-empty")).toBeTruthy();
    expect(screen.queryByText("Due Today")).toBeNull();
  });

  it("revalidates immediately before export when the midnight timer is delayed", async () => {
    responseFactory = () => ({ data: [caseRow("due-today", "Stale Export", "2026-04-02")], error: null });
    render(<DeadlinesPage />);
    const region = await screen.findByRole("region", { name: "deadlines-portfolio-title" });
    expect(within(region).getByText("Stale Export")).toBeTruthy();

    vi.clearAllTimers();
    vi.setSystemTime(new Date("2026-06-01T22:01:00.000Z"));
    fireEvent.click(within(region).getByRole("button", { name: "deadlines-portfolio-download" }));

    await waitFor(() => expect(within(region).getByText("deadlines-portfolio-empty")).toBeTruthy());
    expect(portfolioMocks.generateICS).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("exports an event-only portfolio with localized calendar copy when no reminders are selected", async () => {
    languageState.lang = "it";
    responseFactory = () => ({ data: [caseRow("event-only", "Event Only")], error: null });
    render(<DeadlinesPage />);
    const region = await screen.findByRole("region", { name: "deadlines-portfolio-title" });
    for (const offset of [14, 7, 1]) {
      fireEvent.click(screen.getByRole("button", { name: `${offset} deadlines-reminder-days` }));
    }
    expect(within(region).getByText("deadlines-portfolio-event-only-guidance")).toBeTruthy();

    fireEvent.click(within(region).getByRole("button", { name: "deadlines-portfolio-download" }));
    await waitFor(() => expect(portfolioMocks.generateICS).toHaveBeenCalledTimes(1));
    expect(portfolioMocks.generateICS.mock.calls[0][1]).toEqual([]);
    expect(portfolioMocks.generateICS.mock.calls[0][2]).toMatchObject({
      summaryTemplate: "it:deadlines-portfolio-ics-summary-template",
      pointInTimeNotice: "it:deadlines-portfolio-ics-point-in-time",
    });
    expect(await within(region).findByRole("button", { name: "deadlines-portfolio-event-only-ready" })).toBeTruthy();
  });

  it("ignores a rejected stale request after logout", async () => {
    let rejectQuery: ((reason: Error) => void) | undefined;
    responseFactory = () => new Promise((_resolve, reject) => { rejectQuery = reject; });
    const view = render(<DeadlinesPage />);
    await waitFor(() => expect(rejectQuery).toBeTypeOf("function"));

    authState.user = null;
    view.rerender(<DeadlinesPage />);
    await act(async () => {
      rejectQuery?.(new Error("stale failure"));
      await Promise.resolve();
    });

    expect(screen.queryByRole("region", { name: "deadlines-portfolio-title" })).toBeNull();
    expect(screen.queryByText("deadlines-portfolio-error")).toBeNull();
  });

  it("ignores a stale query completion after unmount", async () => {
    let resolveQuery: ((value: { data: Array<Record<string, unknown>>; error: null }) => void) | undefined;
    responseFactory = () => new Promise((resolve) => { resolveQuery = resolve; });
    const view = render(<DeadlinesPage />);
    await waitFor(() => expect(resolveQuery).toBeTypeOf("function"));
    view.unmount();

    await act(async () => {
      resolveQuery?.({ data: [caseRow("stale-unmounted", "Unmounted Stale")], error: null });
      await Promise.resolve();
    });
    expect(screen.queryByText("Unmounted Stale")).toBeNull();
  });
});
