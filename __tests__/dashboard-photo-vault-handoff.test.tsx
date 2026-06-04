import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";

const authState = { user: { id: "user-1" } };
const supabaseMock = {
  from: (table: string) => {
    if (table === "cases") {
      return {
        select: (columns?: string) => ({
          eq: () => {
            if (columns === "checklist") {
              return {
                single: () => Promise.resolve({ data: { checklist: null }, error: null }),
              };
            }

            return {
              order: () => Promise.resolve({ data: [], error: null }),
            };
          },
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
};

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

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => authState,
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
  getSupabase: () => supabaseMock,
}));

import DashboardPage from "@/app/dashboard/page";

function completeStep1(projectName: string) {
  fireEvent.change(screen.getByPlaceholderText("dashboard-project-placeholder"), {
    target: { value: projectName },
  });
  fireEvent.change(screen.getByPlaceholderText("dashboard-contractor-placeholder"), {
    target: { value: "Builder AG" },
  });
  fireEvent.change(screen.getByPlaceholderText("dashboard-client-placeholder"), {
    target: { value: "Owner GmbH" },
  });
  fireEvent.click(screen.getByRole("button", { name: "btn-next" }));
}

describe("dashboard photo vault handoff", () => {
  beforeEach(() => {
    window.localStorage.clear();
    authState.user = { id: "user-1" };
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      scale: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it("points the Step 2 photo action at the Tech Vault for the current project", async () => {
    render(<DashboardPage />);

    completeStep1("Alpine Tower");

    expect((await screen.findByRole("link", { name: "btn-photo" })).getAttribute("href")).toBe(
      "/dashboard/vault?q=Alpine+Tower"
    );
  });

  it("uses the latest edited project name in the Step 2 Tech Vault handoff", async () => {
    render(<DashboardPage />);

    fireEvent.change(screen.getByPlaceholderText("dashboard-project-placeholder"), {
      target: { value: "Old Name" },
    });
    fireEvent.change(screen.getByPlaceholderText("dashboard-project-placeholder"), {
      target: { value: "Updated Tower" },
    });
    fireEvent.change(screen.getByPlaceholderText("dashboard-contractor-placeholder"), {
      target: { value: "Builder AG" },
    });
    fireEvent.change(screen.getByPlaceholderText("dashboard-client-placeholder"), {
      target: { value: "Owner GmbH" },
    });
    fireEvent.click(screen.getByRole("button", { name: "btn-next" }));

    expect((await screen.findByRole("link", { name: "btn-photo" })).getAttribute("href")).toBe(
      "/dashboard/vault?q=Updated+Tower"
    );
  });
});
