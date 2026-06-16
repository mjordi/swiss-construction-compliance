import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => {
  const user = { id: "user-1" };
  const casesOrderMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const protocolsNotMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const getSupabaseMock = vi.fn(() => ({
    from: (table: string) => {
      if (table === "cases") {
        return {
          select: () => ({
            eq: () => ({
              order: casesOrderMock,
            }),
          }),
        };
      }

      if (table === "protocols") {
        return {
          select: () => ({
            eq: () => ({
              not: protocolsNotMock,
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  }));

  return { casesOrderMock, getSupabaseMock, protocolsNotMock, user };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/cases",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => {
    const params = new URLSearchParams("");
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
    user: mocks.user,
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

vi.mock("@/lib/case-timeline", () => ({
  applyComplianceCaseView: (cases: unknown[]) => cases,
  buildComplianceCaseTimeline: () => [],
  buildCaseDeadlineReminderICS: () => "BEGIN:VCALENDAR\nEND:VCALENDAR",
  deriveChecklistProgress: (checklist: Record<string, boolean>) => ({
    completed: Object.values(checklist).filter(Boolean).length,
    total: Object.keys(checklist).length,
    label: "progress",
  }),
  isDeadlineReminderIcsExportEligible: () => false,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: mocks.getSupabaseMock,
}));

import CasesPage from "@/app/dashboard/cases/page";

describe("CasesPage Supabase client identity", () => {
  it("does not recreate the client or rerun the initial cases/protocols load on rerender", async () => {
    const { rerender } = render(<CasesPage />);

    expect(await screen.findByText("cases-no-cases")).toBeTruthy();
    await waitFor(() => {
      expect(mocks.getSupabaseMock).toHaveBeenCalledTimes(1);
      expect(mocks.casesOrderMock).toHaveBeenCalledTimes(1);
      expect(mocks.protocolsNotMock).toHaveBeenCalledTimes(1);
    });

    rerender(<CasesPage />);

    await waitFor(() => {
      expect(mocks.getSupabaseMock).toHaveBeenCalledTimes(1);
      expect(mocks.casesOrderMock).toHaveBeenCalledTimes(1);
      expect(mocks.protocolsNotMock).toHaveBeenCalledTimes(1);
    });
  });
});
