import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

let currentSearch = "";
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/vault",
  useRouter: () => ({ replace: replaceMock }),
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
                      user_id: "user-1",
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

describe("vault URL synchronization", () => {
  beforeEach(() => {
    currentSearch = "";
    replaceMock.mockReset();
  });

  it("hydrates the search input from the current q query param", async () => {
    currentSearch = "q=Alpine+Tower";

    render(<TechVault />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText("vault-search-placeholder") as HTMLInputElement).value).toBe("Alpine Tower");
    });
  });

  it("hydrates the archived tab from the current tab query param", async () => {
    currentSearch = "tab=archived&q=Alpine+Tower";

    render(<TechVault />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "vault-tab-archived" }).className).toContain("bg-accent");
    });

    expect((screen.getByPlaceholderText("vault-search-placeholder") as HTMLInputElement).value).toBe("Alpine Tower");
  });

  it("writes q back into the URL when the search changes", async () => {
    render(<TechVault />);

    const input = (await screen.findByPlaceholderText("vault-search-placeholder")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Zurich" } });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/vault?q=Zurich", { scroll: false });
    });
  });

  it("writes tab back into the URL while preserving q", async () => {
    currentSearch = "q=Zurich";

    render(<TechVault />);

    fireEvent.click(await screen.findByRole("tab", { name: "vault-tab-archived" }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/vault?q=Zurich&tab=archived", { scroll: false });
    });
  });

  it("clears q back to the base vault path when the search is emptied", async () => {
    currentSearch = "q=Zurich";

    render(<TechVault />);

    const input = (await screen.findByPlaceholderText("vault-search-placeholder")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/vault", { scroll: false });
    });
  });

  it("re-hydrates search state when external params change on rerender", async () => {
    currentSearch = "q=Alpha";

    const { rerender } = render(<TechVault />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText("vault-search-placeholder") as HTMLInputElement).value).toBe("Alpha");
    });

    currentSearch = "q=Beta";
    rerender(<TechVault />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText("vault-search-placeholder") as HTMLInputElement).value).toBe("Beta");
    });
  });

  it("re-hydrates tab state when external params change on rerender", async () => {
    currentSearch = "tab=projects&q=Alpha";

    const { rerender } = render(<TechVault />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "vault-tab-projects" }).className).toContain("bg-accent");
    });

    currentSearch = "tab=archived&q=Alpha";
    rerender(<TechVault />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "vault-tab-archived" }).className).toContain("bg-accent");
    });
  });
});
