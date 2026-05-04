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

  it("restores computed deadlines on load from a valid acceptance query param", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    expect(screen.getByDisplayValue("2026-04-30")).toBeTruthy();
    expect(screen.getByText("deadlines-60day-title")).toBeTruthy();
    expect(screen.getByText("deadlines-2year-title")).toBeTruthy();
    expect(screen.getByText("deadlines-5year-title")).toBeTruthy();
  });
});
