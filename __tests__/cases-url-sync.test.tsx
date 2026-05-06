import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

let currentSearch = "";
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/cases",
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
    t: (key: string) => key,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
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

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({}),
}));

import CasesPage from "@/app/dashboard/cases/page";

describe("cases filter URL synchronization", () => {
  beforeEach(() => {
    currentSearch = "";
    replaceMock.mockReset();
  });

  it("hydrates the current query params into the visible filter controls", async () => {
    currentSearch = "regime=new&status=warning&sort=most-urgent&q=alpha";

    render(<CasesPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-filter-regime") as HTMLSelectElement).value).toBe("new");
    });

    expect((screen.getByLabelText("cases-filter-status") as HTMLSelectElement).value).toBe("warning");
    expect((screen.getByLabelText("cases-filter-sort") as HTMLSelectElement).value).toBe("most-urgent");
    expect((screen.getByLabelText("cases-search-label") as HTMLInputElement).value).toBe("alpha");
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
});
