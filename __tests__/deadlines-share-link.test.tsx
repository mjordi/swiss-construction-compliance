import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const legalUtilsMocks = vi.hoisted(() => ({
  parseDateInput: vi.fn(),
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

  legalUtilsMocks.parseDateInput.mockImplementation(actual.parseDateInput);
  legalUtilsMocks.generateDeadlineCalendarICS.mockImplementation(actual.generateDeadlineCalendarICS);

  return {
    ...actual,
    parseDateInput: legalUtilsMocks.parseDateInput,
    generateDeadlineCalendarICS: legalUtilsMocks.generateDeadlineCalendarICS,
  };
});

import DeadlinesPage from "@/app/dashboard/deadlines/page";

describe("deadlines share-link restoration", () => {
  const writeText = vi.fn<() => Promise<void>>();
  const createObjectURL = vi.fn(() => "blob:deadlines-ics");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    legalUtilsMocks.parseDateInput.mockClear();
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
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/dashboard/deadlines?acceptance=2026-04-30");
    });
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
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/dashboard/deadlines?acceptance=2026-04-30");
    });

    expect(screen.getByRole("button", { name: "deadlines-share-link-copied" })).toBeTruthy();
  });

  it("keeps the exported acceptance-date label on the selected calendar day", async () => {
    window.history.replaceState(null, "", "/dashboard/deadlines?acceptance=2026-04-30");
    legalUtilsMocks.parseDateInput.mockImplementationOnce((value: string) => {
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
