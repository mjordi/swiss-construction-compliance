import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";

const authState = { user: { id: "user-1" } };
const casesData = {
  items: [] as Array<{
    id: string;
    user_id: string;
    project_name: string;
    contractor?: string | null;
    client?: string | null;
    canton: string;
    contract_date: string;
    discovery_date: string;
    status?: string;
    checklist?: Record<string, boolean> | null;
    created_at?: string;
    updated_at?: string;
  }>,
};
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
              order: () => Promise.resolve({ data: casesData.items, error: null }),
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

vi.mock("@/lib/case-timeline", () => ({
  toComplianceCaseViewModel: () => ({
    id: "case-1",
    projectName: "Alpine Tower",
    canton: "ZH",
    contractDate: new Date("2026-04-01T00:00:00.000Z"),
    contractDateLabel: "01.04.2026",
    discoveryDate: new Date("2026-05-01T00:00:00.000Z"),
    discoveryDateLabel: "01.05.2026",
    regime: "new",
    regimeLabel: "New law",
    noticeApplies: true,
    noticeDeadline: new Date("2026-06-30T00:00:00.000Z"),
    noticeDeadlineLabel: "30.06.2026",
    daysToDeadline: 7,
    deadlineCountdownLabel: "7 days left",
    deadlineCountdownTone: "urgent",
    status: "urgent",
    statusLabel: "Urgent",
    nextAction: "Send notice today via traceable channel.",
    reminderReadiness: {
      calendarExportReady: true,
      emailReminderPlanned: true,
      evidenceComplete: true,
    },
    exportCapability: {
      deadlineReminderIcsEligible: true,
    },
    checklistDefaults: {
      defectDocumented: true,
      evidenceAttached: true,
      noticeDrafted: false,
      calendarReminderExported: false,
    },
  }),
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
    casesData.items = [];
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

  it("exposes the Step 2 defect description by its visible label", async () => {
    render(<DashboardPage />);

    completeStep1("Alpine Tower");

    const defectDescription = await screen.findByLabelText("defect-detected");
    fireEvent.change(defectDescription, {
      target: { value: "Hairline crack near the balcony door" },
    });

    expect((defectDescription as HTMLTextAreaElement).value).toBe("Hairline crack near the balcony door");
  });

  it("shows linked-case next legal action and deadline context in the protocol wizard", async () => {
    casesData.items = [
      {
        id: "case-1",
        user_id: "user-1",
        project_name: "Alpine Tower",
        canton: "ZH",
        contract_date: "2026-04-01",
        discovery_date: "2026-05-01",
        status: "active",
        checklist: null,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
    ];

    render(<DashboardPage />);

    const selector = await screen.findByLabelText("wizard-case-selector");
    fireEvent.change(selector, { target: { value: "case-1" } });

    expect(await screen.findByText("cases-next-legal-action")).toBeTruthy();
    expect(screen.getByText("Send notice today via traceable channel.")).toBeTruthy();
    expect(screen.getByText("7 days left")).toBeTruthy();
    expect(screen.getByText("dashboard-linked-case-deadline-date: 30.06.2026")).toBeTruthy();
  });

  it("exposes the Step 2 signature capture area by its visible label", async () => {
    render(<DashboardPage />);

    completeStep1("Alpine Tower");

    expect(await screen.findByRole("group", { name: "label-signature" })).toBeTruthy();
  });
});
