import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

const pushMock = vi.fn();
const authUser = { id: "user-1" };
const caseLoadMock = vi.fn();
const protocolLoadMock = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/vault",
  useRouter: () => ({ replace: vi.fn(), push: pushMock }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
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
  default: ({ caseId, readOnly, onChecklistUpdated }: {
    caseId: string;
    readOnly?: boolean;
    onChecklistUpdated?: () => void;
  }) => (
    <button
      type="button"
      data-testid={`evidence-${caseId}`}
      onClick={(event) => {
        event.stopPropagation();
        if (!readOnly) {
          cases.find((item) => item.id === caseId)!.checklist = { evidenceAttached: true };
          onChecklistUpdated?.();
        }
      }}
    >
      {readOnly ? "read-only evidence" : "manage evidence"}
    </button>
  ),
}));

const cases = [
  { id: "active", user_id: "user-1", project_name: "Active Case", canton: "ZH", contract_date: "2026-01-01", discovery_date: "2026-02-01", checklist: {}, status: "active", created_at: "2026-01-01", updated_at: "2026-08-01" },
  { id: "archived", user_id: "user-1", project_name: "Archived Case", canton: "BE", contract_date: "2026-01-01", discovery_date: "2026-02-01", checklist: {}, status: "archived", created_at: "2026-01-01", updated_at: "2026-07-01" },
];
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => table === "cases"
      ? { select: () => ({ eq: () => ({ order: caseLoadMock }) }) }
      : { select: () => ({ eq: protocolLoadMock }) },
  }),
}));

import TechVault from "@/app/dashboard/vault/page";

describe("case evidence Vault integration", () => {
  beforeEach(() => {
    cases[0].checklist = {};
    pushMock.mockClear();
    caseLoadMock.mockReset().mockResolvedValue({ data: cases, error: null });
    protocolLoadMock.mockReset().mockResolvedValue({
      data: [{ id: "p1", case_id: "active", project_name: "Active Case" }],
      error: null,
    });
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
});
