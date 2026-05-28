import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/vault",
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
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
  deriveChecklistProgress: () => ({
    completed: 0,
    total: 4,
    label: "0/4",
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
                  data: [],
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

describe("vault empty first-project CTA", () => {
  it("renders the no-content empty-state action as a dashboard create-project link", async () => {
    render(<TechVault />);

    await waitFor(() => {
      expect(screen.getByText("vault-empty-projects-title")).toBeTruthy();
    });

    const links = screen.getAllByRole("link", { name: "vault-create-project" });
    expect(links.some((link) => link.getAttribute("href") === "/dashboard")).toBe(true);
    expect(screen.queryByRole("button", { name: "vault-create-project" })).toBeNull();
  });
});
