import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key: string) => key,
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

import DeadlinesPage from "@/app/dashboard/deadlines/page";

describe("deadlines share-link restoration", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/dashboard/deadlines");
  });

  it("hydrates shared acceptance links after the initial render", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");

    render(<DeadlinesPage />);

    const input = screen.getByLabelText("deadlines-input-label") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.queryByText("deadlines-result-title")).toBeNull();

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    expect(input.value).toBe("2026-04-30");
    expect(screen.getByText("deadlines-60day-title")).toBeTruthy();
    expect(screen.getByText("deadlines-2year-title")).toBeTruthy();
    expect(screen.getByText("deadlines-5year-title")).toBeTruthy();
  });
});
