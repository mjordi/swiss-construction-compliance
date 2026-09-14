import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const routerMock = { replace: replaceMock, push: pushMock };
let currentSearch = "";
let authUser: { id: string } | null = { id: "user-1" };
const caseLoadMock = vi.fn();
const protocolLoadMock = vi.fn();
const statusUpdateMock = vi.fn();
const evidenceActivationMock = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/vault",
  useRouter: () => routerMock,
  useSearchParams: () => {
    const params = new URLSearchParams(currentSearch);
    return { get: (key: string) => params.get(key), toString: () => params.toString() };
  },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: authUser }) }));
vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key: string) => key === "vault-linked-protocols-label" ? "linked protocols" : key,
  }),
}));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => <div {...props}>{children}</div> },
}));
vi.mock("@/lib/case-timeline", () => ({
  buildComplianceCaseTimeline: (items: Array<{ id: string }>) => items.map(({ id }) => ({
    id, status: "ok", regime: "new", daysToDeadline: 30, noticeApplies: true,
    checklistDefaults: { defectDocumented: false, evidenceAttached: false, noticeDrafted: false, calendarReminderExported: false },
  })),
  deriveChecklistProgress: (checklist: Record<string, boolean>) => ({
    completed: Object.values(checklist).filter(Boolean).length,
    total: 4,
  }),
}));
vi.mock("@/components/dashboard/CaseEvidencePanel", () => ({
  default: ({ userId, caseId, readOnly, activateOnce, onChecklistUpdated }: {
    userId: string;
    caseId: string;
    readOnly?: boolean;
    activateOnce?: boolean;
    onChecklistUpdated?: () => void;
  }) => {
    if (activateOnce) evidenceActivationMock({ userId, caseId });
    return <button
      type="button"
      data-testid={`evidence-${caseId}`}
      data-user-id={userId}
      data-activate-once={activateOnce ? "true" : "false"}
      onClick={(event) => {
        event.stopPropagation();
        if (!readOnly) {
          cases.find((item) => item.id === caseId)!.checklist = { evidenceAttached: true };
          onChecklistUpdated?.();
        }
      }}
    >
      {readOnly ? "read-only evidence" : "manage evidence"}
    </button>;
  },
}));

const cases = [
  { id: "active", user_id: "user-1", project_name: "Active Case", canton: "ZH", contract_date: "2026-01-01", discovery_date: "2026-02-01", checklist: {}, status: "active", created_at: "2026-01-01", updated_at: "2026-08-01" },
  { id: "archived", user_id: "user-1", project_name: "Archived Case", canton: "BE", contract_date: "2026-01-01", discovery_date: "2026-02-01", checklist: {}, status: "archived", created_at: "2026-01-01", updated_at: "2026-07-01" },
];
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: async () => {
      const [caseResult, protocolResult] = await Promise.all([caseLoadMock(), protocolLoadMock()]);
      const error = caseResult.error ?? protocolResult.error;
      return {
        data: error ? null : { cases: caseResult.data, protocols: protocolResult.data },
        error,
      };
    },
    from: (table: string) => table === "cases"
      ? {
          select: () => ({
            eq: () => {
              const query = { gt: () => query, order: () => query, limit: caseLoadMock };
              return query;
            },
          }),
          update: (payload: { status: string }) => ({
            eq: () => ({
              eq: async () => {
                cases.find((item) => item.id === "active")!.status = payload.status;
                return statusUpdateMock(payload);
              },
            }),
          }),
        }
      : {
          select: () => ({
            eq: () => {
              const query = { gt: () => query, order: () => query, limit: protocolLoadMock };
              return query;
            },
          }),
        },
  }),
}));

import TechVault from "@/app/dashboard/vault/page";

describe("case evidence Vault integration", () => {
  beforeEach(() => {
    currentSearch = "";
    authUser = { id: "user-1" };
    replaceMock.mockReset();
    evidenceActivationMock.mockReset();
    cases[0].checklist = {};
    cases[0].status = "active";
    pushMock.mockClear();
    statusUpdateMock.mockReset().mockResolvedValue({ error: null });
    caseLoadMock.mockReset().mockResolvedValue({ data: cases, error: null });
    protocolLoadMock.mockReset().mockResolvedValue({
      data: [{ id: "p1", case_id: "active", project_name: "Active Case" }],
      error: null,
    });
  });

  it("uses exact Case identity when duplicate project names exist and cleans only owned params", async () => {
    const duplicateCases = [
      { ...cases[0], id: "same-name-other", project_name: "Shared Project", updated_at: "2026-08-03" },
      { ...cases[0], id: "same-name-target", project_name: "Shared Project", updated_at: "2026-08-02" },
    ];
    caseLoadMock.mockResolvedValue({ data: duplicateCases, error: null });
    currentSearch = "q=Shared+Project&case=same-name-target&evidence=1&source=notice";

    render(<TechVault />);

    const target = await screen.findByTestId("evidence-same-name-target");
    await waitFor(() => expect(target.getAttribute("data-activate-once")).toBe("true"));
    expect(screen.queryByTestId("evidence-same-name-other")).toBeNull();
    expect(screen.getAllByText("Shared Project")).toHaveLength(1);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(
      "/dashboard/vault?q=Shared+Project&source=notice",
      { scroll: false }
    ));
  });

  it("does not replay activation after the router applies the cleaned URL", async () => {
    currentSearch = "q=Active+Case&case=active&evidence=1&source=notice";
    const { rerender } = render(<TechVault />);

    const activated = await screen.findByTestId("evidence-active");
    await waitFor(() => expect(activated.getAttribute("data-activate-once")).toBe("true"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(
      "/dashboard/vault?q=Active+Case&source=notice",
      { scroll: false }
    ));

    currentSearch = "q=Active+Case&source=notice";
    rerender(<TechVault />);

    expect(screen.getByTestId("evidence-active").getAttribute("data-activate-once")).toBe("false");
    expect(caseLoadMock).toHaveBeenCalledTimes(1);
    expect(evidenceActivationMock).toHaveBeenCalledTimes(1);
  });

  it("still activates once when URL cleanup lands before the owner snapshot", async () => {
    const pendingCases = deferred<{ data: typeof cases; error: null }>();
    caseLoadMock.mockReturnValueOnce(pendingCases.promise);
    currentSearch = "q=Active+Case&case=active&evidence=1&source=notice";
    const { rerender } = render(<TechVault />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(
      "/dashboard/vault?q=Active+Case&source=notice",
      { scroll: false }
    ));
    currentSearch = "q=Active+Case&source=notice";
    rerender(<TechVault />);
    expect(evidenceActivationMock).not.toHaveBeenCalled();

    pendingCases.resolve({ data: cases, error: null });
    await screen.findByTestId("evidence-active");
    await waitFor(() => expect(evidenceActivationMock).toHaveBeenCalledTimes(1));

    rerender(<TechVault />);
    expect(evidenceActivationMock).toHaveBeenCalledTimes(1);
  });

  it("invalidates a handoff synchronously when the account changes", async () => {
    currentSearch = "q=Active+Case&case=active&evidence=1";
    const { rerender } = render(<TechVault />);
    const activated = await screen.findByTestId("evidence-active");
    await waitFor(() => expect(activated.getAttribute("data-activate-once")).toBe("true"));

    const nextAccountLoad = deferred<{ data: typeof cases; error: null }>();
    caseLoadMock.mockReturnValueOnce(nextAccountLoad.promise);
    authUser = { id: "user-2" };
    rerender(<TechVault />);

    const staleControl = screen.queryByTestId("evidence-active");
    if (staleControl) {
      expect(staleControl.getAttribute("data-user-id")).toBe("user-2");
      expect(staleControl.getAttribute("data-activate-once")).toBe("false");
    }

    nextAccountLoad.resolve({
      data: [{ ...cases[0], id: "user-2-case", user_id: "user-2", project_name: "Active Case" }],
      error: null,
    });
    const nextAccountControl = await screen.findByTestId("evidence-user-2-case");
    expect(nextAccountControl.getAttribute("data-user-id")).toBe("user-2");
    expect(nextAccountControl.getAttribute("data-activate-once")).toBe("false");
    expect(screen.queryByTestId("evidence-active")).toBeNull();
  });

  it("releases exact handoff scoping when the user changes the search", async () => {
    const searchableCases = [
      { ...cases[0], id: "target", project_name: "Shared Project" },
      { ...cases[0], id: "other", project_name: "Different Project" },
    ];
    caseLoadMock.mockResolvedValue({ data: searchableCases, error: null });
    currentSearch = "q=Shared+Project&case=target&evidence=1";
    render(<TechVault />);

    const target = await screen.findByTestId("evidence-target");
    await waitFor(() => expect(target.getAttribute("data-activate-once")).toBe("true"));
    expect(screen.queryByTestId("evidence-other")).toBeNull();

    fireEvent.change(screen.getByLabelText("vault-search-placeholder"), {
      target: { value: "Different" },
    });

    const other = await screen.findByTestId("evidence-other");
    expect(other.getAttribute("data-activate-once")).toBe("false");
    expect(screen.queryByTestId("evidence-target")).toBeNull();
  });

  it("releases exact handoff scoping when external URL state later diverges", async () => {
    const searchableCases = [
      { ...cases[0], id: "target", project_name: "Shared Project" },
      { ...cases[0], id: "other", project_name: "Different Project" },
    ];
    caseLoadMock.mockResolvedValue({ data: searchableCases, error: null });
    currentSearch = "q=Shared+Project&case=target&evidence=1&source=notice";
    const { rerender } = render(<TechVault />);

    await screen.findByTestId("evidence-target");
    await waitFor(() => expect(evidenceActivationMock).toHaveBeenCalledTimes(1));

    currentSearch = "q=Shared+Project&source=notice";
    rerender(<TechVault />);
    expect(screen.queryByTestId("evidence-other")).toBeNull();

    currentSearch = "q=Different+Project&source=history";
    rerender(<TechVault />);

    await screen.findByTestId("evidence-other");
    expect(screen.queryByTestId("evidence-target")).toBeNull();
    expect(evidenceActivationMock).toHaveBeenCalledTimes(1);
  });

  it("releases exact handoff scoping when the user changes tabs", async () => {
    currentSearch = "case=active&evidence=1";
    render(<TechVault />);

    const activated = await screen.findByTestId("evidence-active");
    await waitFor(() => expect(activated.getAttribute("data-activate-once")).toBe("true"));

    fireEvent.click(screen.getByRole("tab", { name: "vault-tab-archived" }));

    const archived = await screen.findByTestId("evidence-archived");
    expect(archived.getAttribute("data-activate-once")).toBe("false");
    expect(screen.queryByTestId("evidence-active")).toBeNull();
  });

  it("selects and activates an exact archived Case read-only", async () => {
    currentSearch = "tab=archived&q=Archived+Case&case=archived&evidence=1&source=notice";

    render(<TechVault />);

    const evidenceControl = await screen.findByTestId("evidence-archived");
    expect(evidenceControl.textContent).toBe("read-only evidence");
    await waitFor(() => expect(evidenceControl.getAttribute("data-activate-once")).toBe("true"));
    expect(screen.getByRole("tab", { name: "vault-tab-archived" }).className).toContain("bg-accent");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(
      "/dashboard/vault?tab=archived&q=Archived+Case&source=notice",
      { scroll: false }
    ));
  });

  it.each([
    "q=Active+Case&case=missing&evidence=1&source=notice",
    "q=Active+Case&case=active&source=notice",
    "q=Active+Case&evidence=1&source=notice",
    "q=Active+Case&case=active&evidence=true&source=notice",
  ])("discards missing or malformed handoff without implying access: %s", async (search) => {
    currentSearch = search;

    render(<TechVault />);

    const normalControl = await screen.findByTestId("evidence-active");
    expect(normalControl.getAttribute("data-activate-once")).toBe("false");
    expect(screen.queryByTestId("evidence-archived")).toBeNull();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(
      "/dashboard/vault?q=Active+Case&source=notice",
      { scroll: false }
    ));
  });

  it("mounts evidence controls on active cards without activating card navigation and labels counts as linked protocols", async () => {
    render(<TechVault />);
    await screen.findByText("Active Case");

    const article = screen.getByText("Active Case").closest("article")!;
    expect(within(article).getByText("1 linked protocols")).toBeTruthy();
    expect(within(article).getByText("0%")).toBeTruthy();
    fireEvent.click(within(article).getByTestId("evidence-active"));
    expect(within(article).getByText("manage evidence")).toBeTruthy();
    await waitFor(() => {
      const refreshedArticle = screen.getByText("Active Case").closest("article")!;
      expect(within(refreshedArticle).getByText("25%")).toBeTruthy();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("renders archived card evidence access as read-only", async () => {
    render(<TechVault />);
    await screen.findByText("Active Case");
    fireEvent.click(screen.getByRole("tab", { name: "vault-tab-archived" }));

    await waitFor(() => expect(screen.getByText("Archived Case")).toBeTruthy());
    const article = screen.getByText("Archived Case").closest("article")!;
    expect(within(article).getByText("read-only evidence")).toBeTruthy();
  });

  it("keeps the evidence card mounted during a background checklist refresh", async () => {
    const pendingRefresh = deferred<{ data: typeof cases; error: null }>();
    caseLoadMock
      .mockResolvedValueOnce({ data: cases, error: null })
      .mockReturnValueOnce(pendingRefresh.promise);
    render(<TechVault />);
    await screen.findByText("Active Case");

    const article = screen.getByText("Active Case").closest("article")!;
    fireEvent.click(within(article).getByTestId("evidence-active"));
    await waitFor(() => expect(caseLoadMock).toHaveBeenCalledTimes(2));

    expect(screen.getByText("Active Case")).toBeTruthy();
    expect(screen.queryByText("vault-loading")).toBeNull();

    pendingRefresh.resolve({ data: cases, error: null });
    await waitFor(() => {
      const refreshedArticle = screen.getByText("Active Case").closest("article")!;
      expect(within(refreshedArticle).getByText("25%")).toBeTruthy();
    });
  });

  it("does not let an older evidence refresh overwrite a concurrent archive", async () => {
    const pendingRefresh = deferred<{ data: typeof cases; error: null }>();
    const staleCases = cases.map((item) => ({ ...item, checklist: { ...item.checklist } })) as typeof cases;
    caseLoadMock
      .mockResolvedValueOnce({ data: cases, error: null })
      .mockReturnValueOnce(pendingRefresh.promise)
      .mockResolvedValue({ data: cases, error: null });

    render(<TechVault />);
    const article = (await screen.findByText("Active Case")).closest("article")!;
    fireEvent.click(within(article).getByTestId("evidence-active"));
    await waitFor(() => expect(caseLoadMock).toHaveBeenCalledTimes(2));

    fireEvent.click(within(article).getByRole("button", { name: "vault-archive-project" }));
    await waitFor(() => expect(caseLoadMock).toHaveBeenCalledTimes(3));
    pendingRefresh.resolve({ data: staleCases, error: null });

    fireEvent.click(screen.getByRole("tab", { name: "vault-tab-archived" }));
    await waitFor(() => expect(screen.getByText("Active Case")).toBeTruthy());
    expect(statusUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "archived" }));
    expect(within(screen.getByText("Active Case").closest("article")!).getByText("vault-status-archived")).toBeTruthy();
  });
});
