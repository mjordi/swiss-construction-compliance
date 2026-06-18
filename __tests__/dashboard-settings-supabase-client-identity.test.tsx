import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

const mocks = vi.hoisted(() => {
  const casesOrderMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const profilesMaybeSingleMock = vi.fn(() =>
    Promise.resolve({ data: { full_name: "Max Muster", company: "Bau AG" }, error: null })
  );
  const getSupabaseMock = vi.fn(() => ({
    from: (table: string) => {
      if (table === "cases") {
        return {
          select: () => ({
            eq: () => ({
              order: casesOrderMock,
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }

      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: profilesMaybeSingleMock,
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }

      if (table === "protocols") {
        return {
          insert: () => Promise.resolve({ error: null }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
    auth: {
      updateUser: () => Promise.resolve({ error: null }),
    },
  }));
  const user = { id: "user-1", name: "Max Muster", email: "max@example.test" };

  return { casesOrderMock, getSupabaseMock, profilesMaybeSingleMock, user };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
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
    lang: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: mocks.user,
    logout: vi.fn(),
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => <div {...props}>{children}</div>,
  },
}));

vi.mock("signature_pad", () => ({
  default: class SignaturePadMock {
    isEmpty() {
      return true;
    }
    addEventListener() {}
    removeEventListener() {}
    on() {}
    off() {}
    clear() {}
    toDataURL() {
      return "data:image/png;base64,mock";
    }
  },
}));

vi.mock("@react-pdf/renderer", () => ({
  pdf: () => ({
    toBlob: async () => new Blob(),
  }),
}));

vi.mock("@/components/dashboard/AuditReportPDF", () => ({
  AuditReportPDF: () => null,
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

vi.mock("@/lib/compliance-record", () => ({
  buildComplianceRecord: ({ caseId }: { caseId: string | null }) => ({
    caseId,
    checklist: {
      projectData: false,
      defectLog: false,
      signature: false,
      exportReady: false,
    },
  }),
}));

vi.mock("@/lib/legal-utils", () => ({
  calculateRuegefrist: () => ({
    ruegefrist60: {
      status: "ok",
      date: new Date("2026-06-01T00:00:00.000Z"),
    },
  }),
  determineLegalRegime: () => "new",
  formatDateCH: () => "01.06.2026",
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: mocks.getSupabaseMock,
}));

import DashboardPage from "@/app/dashboard/page";
import SettingsPage from "@/app/dashboard/settings/page";

beforeEach(() => {
  mocks.casesOrderMock.mockClear();
  mocks.getSupabaseMock.mockClear();
  mocks.profilesMaybeSingleMock.mockClear();
  window.localStorage.clear();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe("dashboard Supabase client identity", () => {
  it("does not recreate the client or rerun the initial case load on rerender", async () => {
    const { rerender } = render(<DashboardPage />);

    await waitFor(() => {
      expect(mocks.getSupabaseMock).toHaveBeenCalledTimes(1);
      expect(mocks.casesOrderMock).toHaveBeenCalledTimes(1);
    });

    rerender(<DashboardPage />);

    await waitFor(() => {
      expect(mocks.getSupabaseMock).toHaveBeenCalledTimes(1);
      expect(mocks.casesOrderMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe("settings Supabase client identity", () => {
  it("does not recreate the client or rerun the profile load on rerender", async () => {
    const { rerender } = render(<SettingsPage />);

    expect(await screen.findByDisplayValue("Max Muster")).toBeTruthy();
    await waitFor(() => {
      expect(mocks.getSupabaseMock).toHaveBeenCalledTimes(1);
      expect(mocks.profilesMaybeSingleMock).toHaveBeenCalledTimes(1);
    });

    rerender(<SettingsPage />);

    await waitFor(() => {
      expect(mocks.getSupabaseMock).toHaveBeenCalledTimes(1);
      expect(mocks.profilesMaybeSingleMock).toHaveBeenCalledTimes(1);
    });
  });
});
