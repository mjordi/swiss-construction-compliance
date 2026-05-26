import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

const replaceMock = vi.fn();
const pushMock = vi.fn();
const updateMock = vi.fn();

const baseCases = [
  {
    id: "case-active",
    project_name: "Alpine Tower",
    canton: "ZH",
    contract_date: "2026-01-10",
    discovery_date: "2026-04-01",
    updated_at: "2026-05-12T10:00:00.000Z",
    status: "active",
    checklist: {},
  },
  {
    id: "case-warning",
    project_name: "Harbor Retrofit",
    canton: "LU",
    contract_date: "2025-09-10",
    discovery_date: "2026-04-15",
    updated_at: "2026-05-12T12:30:00.000Z",
    status: "active",
    checklist: {},
  },
  {
    id: "case-review",
    project_name: "Riverside Bridge",
    canton: "BE",
    contract_date: "2025-06-10",
    discovery_date: "2026-05-01",
    updated_at: "2026-05-13T08:30:00.000Z",
    status: "review",
    checklist: {},
  },
  {
    id: "case-immediate",
    project_name: "Lakeside Annex",
    canton: "SG",
    contract_date: "2024-12-20",
    discovery_date: "2026-05-10",
    updated_at: "2026-05-13T09:00:00.000Z",
    status: "review",
    checklist: {},
  },
  {
    id: "case-archived",
    project_name: "Summit Depot",
    canton: "GR",
    contract_date: "2025-01-08",
    discovery_date: "2026-02-14",
    updated_at: "2026-05-11T16:45:00.000Z",
    status: "archived",
    checklist: {},
  },
];

let mockCases = structuredClone(baseCases);
let updateResponses: Array<{ error: { message: string } | null }> = [];
let deferNextUpdate = false;

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/vault",
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => "",
  }),
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/lib/case-timeline", () => ({
  buildComplianceCaseTimeline: (inputs: Array<{ id: string }>) =>
    inputs.map((input) => ({
      id: input.id,
      status:
        input.id === "case-review"
          ? "urgent"
          : input.id === "case-immediate"
            ? "immediate-notice"
            : input.id === "case-archived-triage"
              ? "urgent"
              : input.id === "case-warning"
                ? "warning"
                : "ok",
      checklistDefaults: {
        defectDocumented: true,
        evidenceAttached: false,
        noticeDrafted: false,
        calendarReminderExported: false,
      },
    })),
  deriveChecklistProgress: (checklist: Record<string, boolean>) => ({
    completed: Object.values(checklist).filter(Boolean).length,
    total: Object.keys(checklist).length,
    label: "progress",
  }),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      if (table === "cases") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: mockCases,
                  error: null,
                }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updateMock(payload);
            return {
              eq: (column: string, id: string) => ({
                eq: (userColumn: string, userId: string) => {
                  if (column !== "id" || userColumn !== "user_id" || userId !== "user-1") {
                    throw new Error("Unexpected update scope");
                  }

                  if (deferNextUpdate) {
                    deferNextUpdate = false;
                    return new Promise<{ error: { message: string } | null }>(() => {});
                  }

                  const response = updateResponses.shift() ?? { error: null };

                  if (!response.error) {
                    mockCases = mockCases.map((item) =>
                      item.id === id
                        ? {
                            ...item,
                            ...payload,
                          }
                        : item
                    );
                  }

                  return Promise.resolve(response);
                },
              }),
            };
          },
        };
      }

      if (table === "protocols") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [{ id: "protocol-1", case_id: "case-review", project_name: "Riverside Bridge" }],
                error: null,
              }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import TechVault from "@/app/dashboard/vault/page";

function getProjectCard(projectName: string) {
  const heading = screen.getByText(projectName);
  const article = heading.closest("article");

  if (!article) {
    throw new Error(`Could not find card for ${projectName}`);
  }

  return article;
}

describe("vault follow-up links", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    updateMock.mockReset();
    mockCases = structuredClone(baseCases);
    updateResponses = [];
    deferNextUpdate = false;
  });

  it("routes only triage-eligible review projects into triage while keeping warning review cards scoped to project search", async () => {
    render(<TechVault />);

    await waitFor(() => {
      expect(screen.getAllByTestId(/vault-project-card-/)).toHaveLength(4);
    });

    const hrefs = screen
      .getAllByTestId(/vault-project-card-/)
      .map((link) => link.getAttribute("href"));

    expect(hrefs).toContain("/dashboard/cases?q=Alpine+Tower");
    expect(hrefs).toContain("/dashboard/cases?q=Harbor+Retrofit");
    expect(hrefs).toContain("/dashboard/cases?q=Riverside+Bridge&status=triage");
    expect(hrefs).toContain("/dashboard/cases?q=Lakeside+Annex&status=triage");
  });

  it("derives compliance percentages from timeline defaults when persisted checklist data is sparse", async () => {
    render(<TechVault />);

    await waitFor(() => {
      expect(screen.getByText("Alpine Tower")).toBeTruthy();
    });

    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
  });

  it("navigates to the cases handoff when a project card is clicked", async () => {
    render(<TechVault />);

    const projectCard = await screen.findByTestId("vault-project-card-case-review");
    fireEvent.click(projectCard);

    expect(pushMock).toHaveBeenCalledWith("/dashboard/cases?q=Riverside+Bridge&status=triage");
  });

  it("does not hijack modified Enter activation while still handling plain Enter keyboard activation", async () => {
    render(<TechVault />);

    const projectCard = await screen.findByTestId("vault-project-card-case-active");
    projectCard.focus();

    fireEvent.keyDown(projectCard, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(projectCard, { key: "Enter", metaKey: true });

    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.keyDown(projectCard, { key: "Enter" });

    expect(pushMock).toHaveBeenCalledWith("/dashboard/cases?q=Alpine+Tower");
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("supports space-key activation on the project card link surface", async () => {
    render(<TechVault />);

    const projectCard = await screen.findByRole("link", { name: "Harbor Retrofit vault-open-in-cases" });
    projectCard.focus();
    fireEvent.keyDown(projectCard, { key: " " });

    expect(pushMock).toHaveBeenCalledWith("/dashboard/cases?q=Harbor+Retrofit");
  });

  it("archives a project through Supabase and moves it into the archived tab immediately", async () => {
    render(<TechVault />);

    const alpineCard = await screen.findByText("Alpine Tower");
    const archiveButton = within(getProjectCard("Alpine Tower")).getByRole("button", { name: "vault-archive-project" });

    act(() => {
      fireEvent.click(archiveButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "archived" }));
    });
    await waitFor(() => {
      expect(screen.queryByText("Alpine Tower")).toBeNull();
    });

    expect(alpineCard).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "vault-tab-archived" }));

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
  });

  it("restores an archived project through Supabase and returns it to active projects immediately", async () => {
    render(<TechVault />);

    fireEvent.click(await screen.findByRole("tab", { name: "vault-tab-archived" }));

    const restoreButton = within(getProjectCard("Summit Depot")).getByRole("button", { name: "vault-restore-project" });
    act(() => {
      fireEvent.click(restoreButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
    });
    await waitFor(() => {
      expect(screen.queryByText("Summit Depot")).toBeNull();
    });

    fireEvent.click(screen.getByRole("tab", { name: "vault-tab-projects" }));

    expect(await screen.findByText("Summit Depot")).toBeTruthy();
  });

  it("restores archived triage projects with their triage-prefill handoff intact", async () => {
    mockCases = [
      {
        id: "case-archived-triage",
        project_name: "Critical Depot",
        canton: "GR",
        contract_date: "2025-01-08",
        discovery_date: "2026-02-14",
        updated_at: "2026-05-11T16:45:00.000Z",
        status: "archived",
        checklist: {},
      },
    ];

    render(<TechVault />);

    fireEvent.click(await screen.findByRole("tab", { name: "vault-tab-archived" }));

    const restoreButton = within(getProjectCard("Critical Depot")).getByRole("button", { name: "vault-restore-project" });
    act(() => {
      fireEvent.click(restoreButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "review" }));
    });
    await waitFor(() => {
      expect(screen.queryByText("Critical Depot")).toBeNull();
    });

    fireEvent.click(screen.getByRole("tab", { name: "vault-tab-projects" }));

    const restoredProjectCard = await screen.findByRole("link", { name: "Critical Depot vault-open-in-cases" });
    expect(restoredProjectCard.getAttribute("href")).toBe("/dashboard/cases?q=Critical+Depot&status=triage");
  });

  it("rolls back failed archive mutations and surfaces inline feedback", async () => {
    updateResponses.push({ error: { message: "boom" } });

    render(<TechVault />);

    const archiveButton = await waitFor(() =>
      within(getProjectCard("Harbor Retrofit")).getByRole("button", { name: "vault-archive-project" })
    );

    act(() => {
      fireEvent.click(archiveButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "archived" }));
    });

    expect(await screen.findByText("Harbor Retrofit")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("vault-update-status-error");

    fireEvent.click(screen.getByRole("tab", { name: "vault-tab-archived" }));
    expect(screen.queryByText("Harbor Retrofit")).toBeNull();
  });

  it("rolls back failed restore mutations and keeps the project in archived results", async () => {
    updateResponses.push({ error: { message: "restore failed" } });

    render(<TechVault />);

    fireEvent.click(await screen.findByRole("tab", { name: "vault-tab-archived" }));

    const restoreButton = within(getProjectCard("Summit Depot")).getByRole("button", { name: "vault-restore-project" });
    act(() => {
      fireEvent.click(restoreButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
    });

    expect(await screen.findByText("Summit Depot")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("vault-update-status-error");
  });

  it("ignores repeat archive actions while a mutation is still pending", async () => {
    deferNextUpdate = true;

    render(<TechVault />);

    const archiveButton = await waitFor(() =>
      within(getProjectCard("Alpine Tower")).getByRole("button", { name: "vault-archive-project" })
    );

    act(() => {
      fireEvent.click(archiveButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });

    const pendingArchiveButton = within(getProjectCard("Alpine Tower")).getByRole("button", { name: "vault-archive-project" });
    fireEvent.click(pendingArchiveButton);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("clears archive error feedback when a retry succeeds", async () => {
    updateResponses.push({ error: { message: "boom" } });

    render(<TechVault />);

    const archiveButton = await waitFor(() =>
      within(getProjectCard("Harbor Retrofit")).getByRole("button", { name: "vault-archive-project" })
    );

    act(() => {
      fireEvent.click(archiveButton);
    });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-update-status-error");

    const retryButton = within(getProjectCard("Harbor Retrofit")).getByRole("button", { name: "vault-archive-project" });
    act(() => {
      fireEvent.click(retryButton);
    });

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(screen.queryByText("Harbor Retrofit")).toBeNull();
  });
});
