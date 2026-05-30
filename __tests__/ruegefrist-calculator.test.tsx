import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RuegefristCalculator from "@/components/ruegefrist-calculator";

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

describe("RuegefristCalculator", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("clears a displayed deadline result when source dates change", async () => {
    render(<RuegefristCalculator />);

    const contractDate = screen.getByLabelText("calc-contract-date") as HTMLInputElement;
    const discoveryDate = screen.getByLabelText("calc-discovery-date") as HTMLInputElement;

    fireEvent.change(contractDate, { target: { value: "2026-02-01" } });
    fireEvent.change(discoveryDate, { target: { value: "2026-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "calc-calculate" }));

    expect(screen.getByText("calc-60day-title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "calc-download-ics" })).toBeTruthy();

    fireEvent.change(discoveryDate, { target: { value: "2026-03-02" } });

    await waitFor(() => {
      expect(screen.queryByText("calc-60day-title")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: "calc-download-ics" })).toBeNull();
  });
});
