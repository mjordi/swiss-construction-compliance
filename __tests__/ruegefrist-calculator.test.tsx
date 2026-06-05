import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RuegefristCalculator from "@/components/ruegefrist-calculator";

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

describe("RuegefristCalculator", () => {
  const writeText = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    vi.useRealTimers();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.localStorage.clear();
    window.history.replaceState(null, "", "/tools/ruegefrist-rechner");
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("hydrates valid shared date params and calculates the result", async () => {
    window.history.replaceState(
      null,
      "",
      "/tools/ruegefrist-rechner?contract=2026-02-01&discovery=2026-03-01"
    );

    render(<RuegefristCalculator />);

    await waitFor(() => {
      expect(screen.getByText("calc-60day-title")).toBeTruthy();
    });

    expect((screen.getByLabelText("calc-contract-date") as HTMLInputElement).value).toBe("2026-02-01");
    expect((screen.getByLabelText("calc-discovery-date") as HTMLInputElement).value).toBe("2026-03-01");
  });

  it("cleans invalid shared params while preserving valid sibling state", async () => {
    window.history.replaceState(
      null,
      "",
      "/tools/ruegefrist-rechner?contract=bad-date&discovery=2026-03-01"
    );

    render(<RuegefristCalculator />);

    await waitFor(() => {
      expect(window.location.search).toBe("?discovery=2026-03-01");
    });

    expect((screen.getByLabelText("calc-contract-date") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("calc-discovery-date") as HTMLInputElement).value).toBe("2026-03-01");
    expect(screen.queryByText("calc-60day-title")).toBeNull();
  });

  it("copies the last calculated dates rather than live edited input", async () => {
    render(<RuegefristCalculator />);

    const contractDate = screen.getByLabelText("calc-contract-date") as HTMLInputElement;
    const discoveryDate = screen.getByLabelText("calc-discovery-date") as HTMLInputElement;

    fireEvent.change(contractDate, { target: { value: "2026-02-01" } });
    fireEvent.change(discoveryDate, { target: { value: "2026-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "calc-calculate" }));

    expect(screen.getByText("calc-60day-title")).toBeTruthy();

    fireEvent.change(discoveryDate, { target: { value: "2026-03-02" } });
    fireEvent.click(screen.getByRole("button", { name: "calc-share-link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:3000/tools/ruegefrist-rechner?contract=2026-02-01&discovery=2026-03-01"
      );
    });
  });

  it("shows and clears share-link feedback", async () => {
    render(<RuegefristCalculator />);

    fireEvent.change(screen.getByLabelText("calc-contract-date"), {
      target: { value: "2026-02-01" },
    });
    fireEvent.change(screen.getByLabelText("calc-discovery-date"), {
      target: { value: "2026-03-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "calc-calculate" }));
    fireEvent.click(screen.getByRole("button", { name: "calc-share-link" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "calc-share-link-copied" })).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "calc-share-link" })).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("shows copy failure feedback", async () => {
    writeText.mockRejectedValueOnce(new Error("clipboard denied"));
    render(<RuegefristCalculator />);

    fireEvent.change(screen.getByLabelText("calc-contract-date"), {
      target: { value: "2026-02-01" },
    });
    fireEvent.change(screen.getByLabelText("calc-discovery-date"), {
      target: { value: "2026-03-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "calc-calculate" }));
    fireEvent.click(screen.getByRole("button", { name: "calc-share-link" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "calc-share-link-error" })).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "calc-share-link" })).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("ignores in-flight clipboard results after the input changes", async () => {
    let resolveWrite: (() => void) | undefined;
    writeText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        })
    );
    render(<RuegefristCalculator />);

    fireEvent.change(screen.getByLabelText("calc-contract-date"), {
      target: { value: "2026-02-01" },
    });
    fireEvent.change(screen.getByLabelText("calc-discovery-date"), {
      target: { value: "2026-03-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "calc-calculate" }));
    fireEvent.click(screen.getByRole("button", { name: "calc-share-link" }));

    fireEvent.change(screen.getByLabelText("calc-discovery-date"), {
      target: { value: "2026-03-02" },
    });

    resolveWrite?.();

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:3000/tools/ruegefrist-rechner?contract=2026-02-01&discovery=2026-03-01"
      );
    });

    expect(screen.getByRole("button", { name: "calc-share-link" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "calc-share-link-copied" })).toBeNull();
    expect(screen.queryByRole("button", { name: "calc-share-link-error" })).toBeNull();
  });
});
