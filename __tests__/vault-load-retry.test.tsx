import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/vault",
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => "",
  }),
}));

let caseResponseFactory: () =>
  | { data: Array<Record<string, unknown>> | null; error: { message: string } | null }
  | Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
let protocolResponseFactory: () =>
  | { data: Array<Record<string, unknown>> | null; error: { message: string } | null }
  | Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
let caseResponsesQueue: Array<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
let protocolResponsesQueue: Array<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
let caseFetchCount = 0;
let protocolFetchCount = 0;

const languageState = {
  lang: "en",
  t: (key: string) => key,
};

const authState = {
  user: { id: "user-1" },
};

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => languageState,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/lib/case-timeline", () => ({
  buildComplianceCaseTimeline: vi.fn(() => []),
  deriveChecklistProgress: (checklist: Record<string, boolean>) => ({
    completed: Object.values(checklist).filter(Boolean).length,
    total: Object.keys(checklist).length,
    label: `${Object.values(checklist).filter(Boolean).length}/${Object.keys(checklist).length}`,
  }),
}));

const supabaseMock = {
  from: (table: string) => {
    if (table === "cases") {
      return {
        select: () => ({
          eq: () => ({
            order: () => {
              caseFetchCount += 1;
              if (caseResponsesQueue.length > 0) {
                return Promise.resolve(caseResponsesQueue.shift());
              }

              return Promise.resolve().then(() => caseResponseFactory());
            },
          }),
        }),
      };
    }

    if (table === "protocols") {
      return {
        select: () => ({
          eq: () => {
            protocolFetchCount += 1;
            if (protocolResponsesQueue.length > 0) {
              return Promise.resolve(protocolResponsesQueue.shift());
            }

            return Promise.resolve().then(() => protocolResponseFactory());
          },
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  },
};

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => supabaseMock,
}));

import TechVault from "@/app/dashboard/vault/page";

function buildCase(id = "case-1", projectName = "Alpine Tower") {
  return {
    id,
    user_id: "user-1",
    project_name: projectName,
    canton: "ZH",
    contract_date: "2026-03-01T00:00:00.000Z",
    discovery_date: "2026-03-21T00:00:00.000Z",
    checklist: null,
    created_at: "2026-03-21T00:00:00.000Z",
    updated_at: "2026-05-16T09:00:00.000Z",
    status: "active",
  };
}

describe("vault aggregate load retry", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    caseResponsesQueue = [];
    protocolResponsesQueue = [];
    caseFetchCount = 0;
    protocolFetchCount = 0;
    languageState.lang = "en";
    authState.user = { id: "user-1" };
    caseResponseFactory = () => ({ data: [], error: null });
    protocolResponseFactory = () => ({ data: [], error: null });
  });

  it("shows a retry call-to-action when the initial aggregate vault load fails", async () => {
    caseResponsesQueue = [{ data: null, error: { message: "cases failed" } }];
    protocolResponsesQueue = [{ data: [], error: null }];

    render(<TechVault />);

    expect((await screen.findByRole("alert")).textContent).toContain("vault-error-load");
    expect(screen.getByRole("button", { name: "vault-load-retry" })).toBeTruthy();
  });

  it("retries a failed aggregate vault load and restores the projects empty state after recovery", async () => {
    let resolveCasesRetry: ((value: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => void) | null = null;
    let resolveProtocolsRetry: ((value: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => void) | null = null;

    caseResponsesQueue = [{ data: null, error: { message: "cases failed" } }];
    protocolResponsesQueue = [{ data: [], error: null }];
    caseResponseFactory = () =>
      new Promise((resolve) => {
        resolveCasesRetry = resolve;
      });
    protocolResponseFactory = () =>
      new Promise((resolve) => {
        resolveProtocolsRetry = resolve;
      });

    render(<TechVault />);

    const retryButton = await screen.findByRole("button", { name: "vault-load-retry" });
    fireEvent.click(retryButton);

    expect(await screen.findByText("vault-loading")).toBeTruthy();

    resolveCasesRetry?.({ data: [], error: null });
    resolveProtocolsRetry?.({ data: [], error: null });

    await waitFor(() => {
      expect(screen.getByText("vault-empty-projects-title")).toBeTruthy();
    });
    expect(screen.getByText("vault-empty-projects-body-no-archived")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not refetch vault data when only the language changes", async () => {
    caseResponsesQueue = [{ data: [buildCase()], error: null }];
    protocolResponsesQueue = [{ data: [], error: null }];

    const { rerender } = render(<TechVault />);

    await waitFor(() => {
      expect(screen.getByText("Alpine Tower")).toBeTruthy();
    });
    expect(caseFetchCount).toBe(1);
    expect(protocolFetchCount).toBe(1);

    languageState.lang = "fr";
    rerender(<TechVault />);

    await waitFor(() => {
      expect(screen.getByText("Alpine Tower")).toBeTruthy();
    });
    expect(caseFetchCount).toBe(1);
    expect(protocolFetchCount).toBe(1);
  });

  it("keeps the last successful vault data visible if a later same-user refresh fails", async () => {
    caseResponsesQueue = [{ data: [buildCase()], error: null }];
    protocolResponsesQueue = [{ data: [], error: null }];
    caseResponseFactory = () => ({ data: null, error: { message: "refresh failed" } });
    protocolResponseFactory = () => ({ data: [], error: null });

    const { rerender } = render(<TechVault />);

    await waitFor(() => {
      expect(screen.getByText("Alpine Tower")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();

    authState.user = { id: "user-1" };
    rerender(<TechVault />);

    await waitFor(() => {
      expect(screen.getByText("Alpine Tower")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears stale vault data and shows the error state when a different user refresh fails", async () => {
    caseResponsesQueue = [{ data: [buildCase()], error: null }];
    protocolResponsesQueue = [{ data: [], error: null }];
    caseResponseFactory = () => ({ data: null, error: { message: "new user failed" } });
    protocolResponseFactory = () => ({ data: [], error: null });

    const { rerender } = render(<TechVault />);

    await waitFor(() => {
      expect(screen.getByText("Alpine Tower")).toBeTruthy();
    });

    authState.user = { id: "user-2" };
    rerender(<TechVault />);

    expect((await screen.findByRole("alert")).textContent).toContain("vault-error-load");
    expect(screen.queryByText("Alpine Tower")).toBeNull();
  });
});
