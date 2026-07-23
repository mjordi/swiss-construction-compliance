import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

const replaceMock = vi.fn();
const pushMock = vi.fn();
const routerMock = { replace: replaceMock, push: pushMock };
const updateMock = vi.fn();
let mockUser = { id: "user-1" };

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
type UpdateResponse = { error: { message: string } | null };

let updateResponses: UpdateResponse[] = [];
let deferNextUpdate = false;
let resolveDeferredUpdate: ((response: UpdateResponse) => void) | null = null;
let casesSelectError: { message: string } | null = null;
let protocolsSelectError: { message: string } | null = null;

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/vault",
  useRouter: () => routerMock,
  useSearchParams: () => ({
    get: () => null,
    toString: () => "",
  }),
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key: string) =>
      key === "vault-checklist-progress"
        ? "{completed}/{total} checklist items ready"
        : key === "vault-audit-deadline-context"
          ? "Deadline context: {context}"
          : key === "vault-archive-success"
            ? "{projectName} was archived."
            : key === "vault-restore-success"
              ? "{projectName} was restored."
              : key,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
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
      regime: input.id === "case-immediate" ? "old" : "new",
      noticeApplies: input.id !== "case-immediate",
      daysToDeadline: input.id === "case-review" ? 12 : input.id === "case-immediate" ? null : 45,
      checklistDefaults: {
        defectDocumented: true,
        evidenceAttached: false,
        noticeDrafted: false,
        calendarReminderExported: false,
      },
      statusLabel: input.id === "case-review" ? "Urgent" : input.id === "case-immediate" ? "Immediate notice" : "On track",
      deadlineCountdownLabel: input.id === "case-review" ? "12 days remaining" : input.id === "case-immediate" ? "Notify immediately" : "45 days remaining",
      nextAction:
        input.id === "case-review"
          ? "Send defect notice and confirm protocol evidence."
          : input.id === "case-immediate"
            ? "Send defect notice immediately and document delivery."
            : "Keep evidence ready and monitor the deadline.",
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
                  data: casesSelectError ? null : mockCases,
                  error: casesSelectError,
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
                    return new Promise<UpdateResponse>((resolve) => {
                      resolveDeferredUpdate = (response) => {
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
                        resolve(response);
                      };
                    });
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
                data: protocolsSelectError ? null : [{ id: "protocol-1", case_id: "case-review", project_name: "Riverside Bridge" }],
                error: protocolsSelectError,
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
    resolveDeferredUpdate = null;
    casesSelectError = null;
    protocolsSelectError = null;
    mockUser = { id: "user-1" };
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

  it("derives compliance percentages and checklist counts from timeline defaults when persisted checklist data is sparse", async () => {
    render(<TechVault />);

    await waitFor(() => {
      expect(screen.getByText("Alpine Tower")).toBeTruthy();
    });

    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
    expect(within(getProjectCard("Alpine Tower")).getByText("1/4 checklist items ready")).toBeTruthy();
  });

  it("shows the next legal action and deadline context on vault project cards", async () => {
    render(<TechVault />);

    await screen.findByText("Riverside Bridge");

    const card = getProjectCard("Riverside Bridge");
    expect(within(card).getByText("vault-audit-snapshot-label")).toBeTruthy();
    expect(within(card).getByText("cases-status-urgent")).toBeTruthy();
    expect(within(card).getByText("cases-next-action-urgent")).toBeTruthy();
    expect(within(card).getByText("Deadline context: 12 cases-countdown-days-left-suffix")).toBeTruthy();
  });

  it("explains missing audit blockers on vault project cards", async () => {
    render(<TechVault />);

    await screen.findByText("Riverside Bridge");

    const card = getProjectCard("Riverside Bridge");
    expect(
      within(card).getByText(
        "cases-audit-missing: cases-checklist-evidence-attached, cases-checklist-notice-drafted, cases-checklist-calendar-exported"
      )
    ).toBeTruthy();
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

  it("shows the visible open-in-cases CTA without changing the project card destination", async () => {
    render(<TechVault />);

    await screen.findByText("Harbor Retrofit");
    expect(within(getProjectCard("Harbor Retrofit")).getByText("vault-open-in-cases")).toBeTruthy();

    const projectCard = await screen.findByRole("link", { name: "Harbor Retrofit vault-open-in-cases" });
    expect(projectCard.getAttribute("href")).toBe("/dashboard/cases?q=Harbor+Retrofit");
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
    expect((await screen.findByRole("status")).textContent).toContain("Alpine Tower was archived.");

    fireEvent.click(screen.getByRole("tab", { name: "vault-tab-archived" }));

    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
  });

  it("clears archive success feedback when a different user's refresh fails", async () => {
    const { rerender } = render(<TechVault />);

    await screen.findByText("Alpine Tower");
    const archiveButton = within(getProjectCard("Alpine Tower")).getByRole("button", { name: "vault-archive-project" });

    act(() => {
      fireEvent.click(archiveButton);
    });

    expect((await screen.findByRole("status")).textContent).toContain("Alpine Tower was archived.");

    casesSelectError = { message: "new user failed" };
    mockUser = { id: "user-2" };
    rerender(<TechVault />);

    expect((await screen.findByRole("alert")).textContent).toContain("vault-error-load");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Alpine Tower was archived.")).toBeNull();
  });

  it("clears archive success feedback when a different user's refresh succeeds", async () => {
    const { rerender } = render(<TechVault />);

    await screen.findByText("Alpine Tower");
    const archiveButton = within(getProjectCard("Alpine Tower")).getByRole("button", { name: "vault-archive-project" });

    act(() => {
      fireEvent.click(archiveButton);
    });

    expect((await screen.findByRole("status")).textContent).toContain("Alpine Tower was archived.");

    mockCases = [
      {
        id: "case-user-2",
        project_name: "Beta Residence",
        canton: "ZH",
        contract_date: "2026-02-01",
        discovery_date: "2026-04-20",
        updated_at: "2026-05-15T10:00:00.000Z",
        status: "active",
        checklist: {},
      },
    ];
    mockUser = { id: "user-2" };
    rerender(<TechVault />);

    await screen.findByText("Beta Residence");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Alpine Tower was archived.")).toBeNull();
  });

  it("does not show stale archive success feedback when an in-flight mutation finishes after an account change", async () => {
    deferNextUpdate = true;
    const { rerender } = render(<TechVault />);

    await screen.findByText("Alpine Tower");
    const archiveButton = within(getProjectCard("Alpine Tower")).getByRole("button", { name: "vault-archive-project" });

    act(() => {
      fireEvent.click(archiveButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "archived" }));
    });

    mockCases = [
      {
        id: "case-user-2",
        project_name: "Beta Residence",
        canton: "ZH",
        contract_date: "2026-02-01",
        discovery_date: "2026-04-20",
        updated_at: "2026-05-15T10:00:00.000Z",
        status: "active",
        checklist: {},
      },
    ];
    mockUser = { id: "user-2" };
    rerender(<TechVault />);

    await screen.findByText("Beta Residence");

    await act(async () => {
      resolveDeferredUpdate?.({ error: null });
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Alpine Tower was archived.")).toBeNull();
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
    expect((await screen.findByRole("status")).textContent).toContain("Summit Depot was restored.");

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

    fireEvent.click(screen.getByRole("tab", { name: "vault-tab-archived" }));

    await waitFor(() => {
      const pendingRestoreButton = within(getProjectCard("Alpine Tower")).getByRole("button", { name: "vault-restore-project" });
      expect(pendingRestoreButton.hasAttribute("disabled")).toBe(true);
    });

    const pendingRestoreButton = within(getProjectCard("Alpine Tower")).getByRole("button", { name: "vault-restore-project" });
    fireEvent.click(pendingRestoreButton);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("locks the pending project handoff while a restore mutation is unresolved", async () => {
    deferNextUpdate = true;

    render(<TechVault />);

    fireEvent.click(await screen.findByRole("tab", { name: "vault-tab-archived" }));

    const restoreButton = within(getProjectCard("Summit Depot")).getByRole("button", { name: "vault-restore-project" });
    act(() => {
      fireEvent.click(restoreButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      fireEvent.click(screen.getByRole("tab", { name: "vault-tab-projects" }));
    });

    await waitFor(() => {
      const pendingProjectCard = screen.getByTestId("vault-project-card-case-archived");
      expect(pendingProjectCard.getAttribute("aria-disabled")).toBe("true");
      expect(pendingProjectCard.hasAttribute("href")).toBe(false);
    });

    const pendingProjectCard = screen.getByTestId("vault-project-card-case-archived");
    fireEvent.click(pendingProjectCard);
    pendingProjectCard.focus();
    fireEvent.keyDown(pendingProjectCard, { key: "Enter" });
    fireEvent.keyDown(pendingProjectCard, { key: " " });

    expect(pushMock).not.toHaveBeenCalled();
    expect(within(getProjectCard("Summit Depot")).getByRole("button", { name: "vault-archive-project" }).hasAttribute("disabled")).toBe(true);
  });

  it("allows toggling a different project while another archive mutation is still pending", async () => {
    deferNextUpdate = true;

    render(<TechVault />);

    const firstArchiveButton = await waitFor(() =>
      within(getProjectCard("Alpine Tower")).getByRole("button", { name: "vault-archive-project" })
    );

    act(() => {
      fireEvent.click(firstArchiveButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });

    const secondArchiveButton = within(getProjectCard("Harbor Retrofit")).getByRole("button", { name: "vault-archive-project" });
    act(() => {
      fireEvent.click(secondArchiveButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps inline mutation errors scoped per project when concurrent updates fail", async () => {
    deferNextUpdate = true;
    updateResponses.push({ error: { message: "second failure" } });

    render(<TechVault />);

    const firstArchiveButton = await waitFor(() =>
      within(getProjectCard("Alpine Tower")).getByRole("button", { name: "vault-archive-project" })
    );

    act(() => {
      fireEvent.click(firstArchiveButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });

    updateResponses.push({ error: { message: "first failure" } });

    const secondArchiveButton = within(getProjectCard("Harbor Retrofit")).getByRole("button", { name: "vault-archive-project" });
    act(() => {
      fireEvent.click(secondArchiveButton);
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(2);
    });

    expect((await within(getProjectCard("Harbor Retrofit")).findByRole("alert")).textContent).toContain("vault-update-status-error");

    updateResponses.shift();
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
