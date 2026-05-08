import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

let currentSearch = "";
const replaceMock = vi.fn();
const writeText = vi.fn<() => Promise<void>>();

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

describe("cases share-link action", () => {
  beforeEach(() => {
    currentSearch = "";
    replaceMock.mockReset();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.history.replaceState(null, "", "/dashboard/cases");
  });

  it("copies the current filtered triage view and shows localized feedback", async () => {
    currentSearch = "regime=new&status=warning&sort=most-urgent&q=alpha";

    render(<CasesPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-search-label") as HTMLInputElement).value).toBe("alpha");
    });

    fireEvent.click(screen.getByRole("button", { name: "cases-share-link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:3000/dashboard/cases?regime=new&status=warning&sort=most-urgent&q=alpha"
      );
    });

    expect(screen.getByRole("button", { name: "cases-share-link-copied" })).toBeTruthy();
  });

  it("clears copied feedback when the shared view changes externally", async () => {
    currentSearch = "regime=new&status=warning&sort=most-urgent&q=alpha";

    const { rerender } = render(<CasesPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-search-label") as HTMLInputElement).value).toBe("alpha");
    });

    fireEvent.click(screen.getByRole("button", { name: "cases-share-link" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "cases-share-link-copied" })).toBeTruthy();
    });

    currentSearch = "status=expired&q=beta";
    rerender(<CasesPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-search-label") as HTMLInputElement).value).toBe("beta");
    });

    expect(screen.getByRole("button", { name: "cases-share-link" })).toBeTruthy();
  });

  it("keeps sharing and reset controls available for sort-only views", async () => {
    currentSearch = "sort=most-urgent";

    render(<CasesPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("cases-filter-sort") as HTMLSelectElement).value).toBe("most-urgent");
    });

    expect(screen.getByRole("button", { name: "cases-share-link" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "cases-clear-filters" })).toHaveLength(2);
  });
});
