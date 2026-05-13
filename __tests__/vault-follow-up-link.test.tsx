import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

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
  buildComplianceCaseTimeline: (inputs: Array<{ id: string }>) =>
    inputs.map((input) => ({
      id: input.id,
      status:
        input.id === "case-review"
          ? "urgent"
          : input.id === "case-immediate"
            ? "immediate-notice"
            : input.id === "case-warning"
              ? "warning"
              : "ok",
    })),
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
                      id: "case-active",
                      project_name: "Alpine Tower",
                      canton: "ZH",
                      contract_date: "2026-01-10",
                      discovery_date: "2026-04-01",
                      updated_at: "2026-05-12T10:00:00.000Z",
                      status: "open",
                      checklist: {},
                    },
                    {
                      id: "case-warning",
                      project_name: "Harbor Retrofit",
                      canton: "LU",
                      contract_date: "2025-09-10",
                      discovery_date: "2026-04-15",
                      updated_at: "2026-05-12T12:30:00.000Z",
                      status: "open",
                      checklist: {},
                    },
                    {
                      id: "case-review",
                      project_name: "Riverside Bridge",
                      canton: "BE",
                      contract_date: "2025-06-10",
                      discovery_date: "2026-05-01",
                      updated_at: "2026-05-13T08:30:00.000Z",
                      status: "open",
                      checklist: {},
                    },
                    {
                      id: "case-immediate",
                      project_name: "Lakeside Annex",
                      canton: "SG",
                      contract_date: "2024-12-20",
                      discovery_date: "2026-05-10",
                      updated_at: "2026-05-13T09:00:00.000Z",
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
                data: [{ id: "protocol-1", case_id: "case-review", project_name: "Riverside Bridge" }],
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

describe("vault follow-up links", () => {
  it("routes only triage-eligible review projects into triage while keeping warning review cards scoped to project search", async () => {
    render(<TechVault />);

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "vault-open-in-cases" })).toHaveLength(4);
    });

    const hrefs = screen
      .getAllByRole("link", { name: "vault-open-in-cases" })
      .map((link) => link.getAttribute("href"));

    expect(hrefs).toContain("/dashboard/cases?q=Alpine+Tower");
    expect(hrefs).toContain("/dashboard/cases?q=Harbor+Retrofit");
    expect(hrefs).toContain("/dashboard/cases?q=Riverside+Bridge&status=triage");
    expect(hrefs).toContain("/dashboard/cases?q=Lakeside+Annex&status=triage");
  });
});
