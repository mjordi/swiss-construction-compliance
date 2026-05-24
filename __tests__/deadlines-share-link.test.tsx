import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const legalUtilsMocks = vi.hoisted(() => ({
  parseDateInputAsUTC: vi.fn(),
  generateDeadlineCalendarICS: vi.fn(),
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: "en",
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

vi.mock("@/lib/legal-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/legal-utils")>();

  legalUtilsMocks.parseDateInputAsUTC.mockImplementation(actual.parseDateInputAsUTC);
  legalUtilsMocks.generateDeadlineCalendarICS.mockImplementation(actual.generateDeadlineCalendarICS);

  return {
    ...actual,
    parseDateInputAsUTC: legalUtilsMocks.parseDateInputAsUTC,
    generateDeadlineCalendarICS: legalUtilsMocks.generateDeadlineCalendarICS,
  };
});

import DeadlinesPage from "@/app/dashboard/deadlines/page";

describe("deadlines share-link restoration", () => {
  const writeText = vi.fn<() => Promise<void>>();
  const createObjectURL = vi.fn(() => "blob:deadlines-ics");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.useRealTimers();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    legalUtilsMocks.parseDateInputAsUTC.mockClear();
    legalUtilsMocks.generateDeadlineCalendarICS.mockClear();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    window.history.replaceState(null, "", "/dashboard/deadlines");
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("restores custom reminder presets from shared links", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30&reminders=30,3");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "deadlines-share-link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/dashboard/deadlines?acceptance=2026-04-30&reminders=30%2C3");
    });
  });

  it("round-trips empty reminder presets with the none sentinel", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30&reminders=none");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "deadlines-share-link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/dashboard/deadlines?acceptance=2026-04-30&reminders=none");
    });
  });

  it("cleans invalid reminder presets from the shared URL", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30&reminders=foo,99,7,7");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    await waitFor(() => {
      expect(window.location.search).toBe("?acceptance=2026-04-30&reminders=7");
    });
  });

  it("preserves valid reminder presets when the shared acceptance date is invalid", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=bad-date&reminders=30,3");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(window.location.search).toBe("?reminders=30%2C3");
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "30 deadlines-reminder-days" }).className).toContain("bg-accent/20");
      expect(screen.getByRole("button", { name: "3 deadlines-reminder-days" }).className).toContain("bg-accent/20");
    });

    expect(screen.queryByText("deadlines-result-title")).toBeNull();

    fireEvent.change(screen.getByLabelText("deadlines-input-label"), {
      target: { value: "2026-04-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "deadlines-calculate" }));
    fireEvent.click(screen.getByRole("button", { name: "deadlines-share-link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/dashboard/deadlines?reminders=30%2C3&acceptance=2026-04-30");
    });
  });

  it("copies the last calculated acceptance date even after the input is edited", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("deadlines-input-label"), {
      target: { value: "2026-05-01" },
    });

    fireEvent.click(screen.getByRole("button", { name: "deadlines-share-link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/dashboard/deadlines?acceptance=2026-04-30&reminders=14%2C7%2C1");
    });
  });

  it("shows localized feedback when copying the shared deadline link fails", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");
    writeText.mockRejectedValueOnce(new Error("clipboard denied"));

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "deadlines-share-link" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "deadlines-share-link-error" })).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "deadlines-share-link" })).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("copies the shared deadline link and shows localized feedback", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    const shareButton = screen.getByRole("button", { name: "deadlines-share-link" });
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/dashboard/deadlines?acceptance=2026-04-30&reminders=14%2C7%2C1");
    });

    expect(screen.getByRole("button", { name: "deadlines-share-link-copied" })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "deadlines-share-link" })).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("copies updated reminder presets after the user changes them", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "14 deadlines-reminder-days" }));
    fireEvent.click(screen.getByRole("button", { name: "30 deadlines-reminder-days" }));

    fireEvent.click(screen.getByRole("button", { name: "deadlines-share-link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/dashboard/deadlines?acceptance=2026-04-30&reminders=30%2C7%2C1");
    });
  });

  it("reset restores default reminder presets and clears reminder query state", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30&reminders=30,3");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "deadlines-reset" }));

    expect(window.location.search).toBe("");
    expect(screen.queryByText("deadlines-result-title")).toBeNull();

    fireEvent.change(screen.getByLabelText("deadlines-input-label"), {
      target: { value: "2026-04-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "deadlines-calculate" }));
    fireEvent.click(screen.getByRole("button", { name: "deadlines-share-link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/dashboard/deadlines?acceptance=2026-04-30&reminders=14%2C7%2C1");
    });
  });

  it("clears pending share-link feedback when reminder presets change", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "deadlines-share-link" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "deadlines-share-link-copied" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "30 deadlines-reminder-days" }));

    expect(screen.getByRole("button", { name: "deadlines-share-link" })).toBeTruthy();
  });

  it("clears pending share-link feedback when the input changes", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "deadlines-share-link" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "deadlines-share-link-copied" })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("deadlines-input-label"), {
      target: { value: "2026-05-01" },
    });

    expect(screen.getByRole("button", { name: "deadlines-share-link" })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "deadlines-share-link" })).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("ignores in-flight clipboard results after the input changes", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");
    let resolveWrite: (() => void) | undefined;
    writeText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        })
    );

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "deadlines-share-link" }));

    fireEvent.change(screen.getByLabelText("deadlines-input-label"), {
      target: { value: "2026-05-01" },
    });

    if (resolveWrite) {
      resolveWrite();
    }

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/dashboard/deadlines?acceptance=2026-04-30&reminders=14%2C7%2C1");
    });

    expect(screen.getByRole("button", { name: "deadlines-share-link" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "deadlines-share-link-copied" })).toBeNull();
    expect(screen.queryByRole("button", { name: "deadlines-share-link-error" })).toBeNull();
  });

  it("keeps the exported acceptance-date label on the selected calendar day", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");
    legalUtilsMocks.parseDateInputAsUTC.mockImplementationOnce((value: string) => {
      if (value === "2026-04-30") {
        return new Date("2026-04-29T22:00:00.000Z");
      }
      return null;
    });

    render(<DeadlinesPage />);

    await waitFor(() => {
      expect(screen.getByText("deadlines-result-title")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "deadlines-download-ics" }));

    await waitFor(() => {
      expect(legalUtilsMocks.generateDeadlineCalendarICS).toHaveBeenCalled();
    });

    const acceptanceDateLabel = legalUtilsMocks.generateDeadlineCalendarICS.mock.calls.at(-1)?.[1];
    expect(acceptanceDateLabel).toBe("30 April 2026");
  });
});
