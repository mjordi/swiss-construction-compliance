import React from "react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockCase = {
  id: "case-1",
  user_id: "user-1",
  project_name: "Linked Project",
  canton: "ZH",
  contract_date: "2026-01-10",
  discovery_date: "2026-03-01",
  checklist: {
    defectDocumented: false,
    evidenceAttached: false,
    noticeDrafted: false,
    calendarReminderExported: false,
  },
  status: "active" as const,
  created_at: "2026-04-29T08:00:00.000Z",
  updated_at: "2026-04-29T08:00:00.000Z",
};

function createSupabaseMock() {
  return {
    from(table: string) {
      if (table === "cases") {
        return {
          select() {
            return {
              eq() {
                return {
                  order: vi.fn().mockResolvedValue({ data: [mockCase], error: null }),
                };
              },
            };
          },
        };
      }

      if (table === "protocols") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const mockSupabase = createSupabaseMock();

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock("@/components/dashboard/AuditReportPDF", () => ({
  AuditReportPDF: () => null,
}));

vi.mock("@react-pdf/renderer", () => ({
  pdf: () => ({ toBlob: async () => new Blob() }),
}));

const motionComponentCache = new Map<string, React.FC<React.HTMLAttributes<HTMLDivElement>>>();

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (!motionComponentCache.has(prop)) {
          motionComponentCache.set(
            prop,
            ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>
          );
        }
        return motionComponentCache.get(prop);
      },
    }
  ),
}));

vi.mock("signature_pad", () => ({
  default: class SignaturePad {
    constructor() {}
    addEventListener(event: string, callback: () => void) {
      if (event === "endStroke") callback();
    }
    removeEventListener() {}
    off() {}
    clear() {}
    isEmpty() {
      return false;
    }
    toDataURL() {
      return "data:image/png;base64,signature";
    }
  },
}));

import Dashboard from "../app/dashboard/page";

describe("dashboard linked-case finalization guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => ({ scale: () => undefined }),
    });
  });

  it("blocks linked-case finalization until a defect description is captured", async () => {
    render(<Dashboard />);

    fireEvent.change(screen.getByPlaceholderText("dashboard-project-placeholder"), {
      target: { value: "Linked Project" },
    });
    fireEvent.change(screen.getByPlaceholderText("dashboard-contractor-placeholder"), {
      target: { value: "Example AG" },
    });
    fireEvent.change(screen.getByPlaceholderText("dashboard-client-placeholder"), {
      target: { value: "Client GmbH" },
    });

    const caseSelector = await screen.findByRole("combobox");
    fireEvent.change(caseSelector, { target: { value: mockCase.id } });

    fireEvent.click(screen.getByRole("button", { name: "btn-next" }));

    const finalizeButton = await screen.findByRole("button", { name: "btn-finalize" });
    const defectTextarea = screen.getByPlaceholderText("defect-placeholder");

    expect(screen.getByText("dashboard-linked-case-defect-required")).toBeInTheDocument();
    expect(defectTextarea).toHaveAttribute("aria-invalid", "true");
    expect(defectTextarea).toHaveAttribute("aria-describedby", "dashboard-linked-case-defect-required");
    expect(finalizeButton).toBeDisabled();

    fireEvent.change(defectTextarea, { target: { value: "Cracked tile near the entrance" } });

    await waitFor(() => {
      expect(screen.queryByText("dashboard-linked-case-defect-required")).not.toBeInTheDocument();
      expect(defectTextarea).toHaveAttribute("aria-invalid", "false");
    });
  });
});
