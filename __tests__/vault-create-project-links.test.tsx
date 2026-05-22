import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
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
                      project_name: "Alpine Tower",
                      canton: "ZH",
                      contract_date: "2026-01-10",
                      discovery_date: "2026-04-01",
                      updated_at: "2026-05-12T10:00:00.000Z",
                      status: "open",
                      checklist: {},
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }

      if (table === "protocols") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [],
                error: null,
              }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import TechVault from "@/app/dashboard/vault/page";

describe("vault create-project links", () => {
  it("renders both create-project CTAs as dashboard links", async () => {
    render(<TechVault />);

    await waitFor(() => {
      expect(screen.getByText("Alpine Tower")).toBeTruthy();
    });

    expect(screen.getByRole("link", { name: "vault-new-project" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.getByRole("link", { name: "vault-create-project" }).getAttribute("href")).toBe("/dashboard");
  });
});
