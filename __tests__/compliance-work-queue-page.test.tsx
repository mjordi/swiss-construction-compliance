import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Case } from "@/lib/database.types";

const authState: { user: { id: string; name: string; email: string } | null } = {
  user: { id: "owner-1", name: "Owner One", email: "owner@example.ch" },
};
const languageState = {
  lang: "en",
  t: (key: string) => key,
};
const rpcMock = vi.fn();
const getSupabaseMock = vi.fn(() => ({ rpc: rpcMock }));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/context/LanguageContext", () => ({ useLanguage: () => languageState }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => getSupabaseMock() }));

import ComplianceWorkQueuePage from "@/app/dashboard/work/page";

const COMPLETE = {
  defectDocumented: true,
  evidenceAttached: true,
  noticeDrafted: true,
  calendarReminderExported: true,
};

function buildCase(overrides: Partial<Case> = {}): Case {
  return {
    id: "case-1",
    user_id: "owner-1",
    project_name: "Alpine Tower",
    canton: "ZH",
    contract_date: "2026-01-10T00:00:00.000Z",
    discovery_date: "2026-01-15T00:00:00.000Z",
    notice_recipient_name: null,
    notice_recipient_address: null,
    defect_statement: null,
    checklist: { ...COMPLETE },
    status: "active",
    created_at: "2026-01-15T00:00:00.000Z",
    updated_at: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

function snapshot(cases: Case[], protocols: Array<{ id: string; case_id: string | null; project_name: string }> = []) {
  return { data: { cases, protocols }, error: null };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("owner compliance work queue page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-26T10:00:00.000Z"));
    authState.user = { id: "owner-1", name: "Owner One", email: "owner@example.ch" };
    languageState.lang = "en";
    rpcMock.mockReset();
    getSupabaseMock.mockClear();
  });

  afterEach(() => vi.useRealTimers());

  it("loads exactly one owner snapshot RPC and renders the complete prioritized queue with native handoffs", async () => {
    rpcMock.mockResolvedValue(snapshot([
      buildCase(),
      buildCase({
        id: "case-ready",
        project_name: "Lake House",
        discovery_date: "2026-08-25T00:00:00.000Z",
        checklist: { ...COMPLETE, noticeDrafted: false },
      }),
    ], [
      { id: "p-1", case_id: "case-1", project_name: "Alpine Tower" },
    ]));

    render(<ComplianceWorkQueuePage />);

    expect(screen.getByRole("status").textContent).toContain("work-loading");
    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    expect(screen.getByText("Lake House")).toBeTruthy();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("get_vault_audit_snapshot");
    expect(getSupabaseMock).toHaveBeenCalledTimes(1);

    const links = screen.getAllByRole("link", { name: "work-open-case" });
    expect(links[0].getAttribute("href")).toBe("/dashboard/cases?case=case-1");
    expect(links[1].getAttribute("href")).toBe("/dashboard/cases?case=case-ready");
    expect(screen.getAllByText("work-next-action")).toHaveLength(2);
    expect(screen.getByText("cases-next-action-expired")).toBeTruthy();
    expect(screen.getByText("4/4")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("4/4").textContent).not.toContain("work-progress");
    expect(screen.getByText("1").textContent).not.toContain("work-linked-protocols");
    expect(screen.getByText("work-reason-notice-not-drafted")).toBeTruthy();
  });

  it("leaves the page-level main landmark to the dashboard layout", async () => {
    rpcMock.mockResolvedValue(snapshot([]));
    render(<ComplianceWorkQueuePage />);

    expect(await screen.findByText("work-empty-title")).toBeTruthy();
    expect(screen.queryByRole("main")).toBeNull();
  });

  it("shows retryable RPC errors, loading on retry, and then the empty state", async () => {
    const retry = deferred<ReturnType<typeof snapshot>>();
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "failed" } })
      .mockReturnValueOnce(retry.promise);

    render(<ComplianceWorkQueuePage />);
    expect((await screen.findByRole("alert")).textContent).toContain("work-error");
    fireEvent.click(screen.getByRole("button", { name: "work-retry" }));
    expect(screen.getByText("work-loading")).toBeTruthy();
    retry.resolve(snapshot([]));
    expect(await screen.findByText("work-empty-title")).toBeTruthy();
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("treats either malformed snapshot collection as a retryable malformed state", async () => {
    rpcMock.mockResolvedValue({ data: { cases: {}, protocols: [] }, error: null });
    render(<ComplianceWorkQueuePage />);
    expect((await screen.findByRole("alert")).textContent).toContain("work-malformed");
  });

  it("renders valid siblings with a localized incomplete warning for malformed elements", async () => {
    rpcMock.mockResolvedValue({
      data: {
        cases: [null, buildCase({ checklist: { ...COMPLETE, noticeDrafted: false } })],
        protocols: [{ id: "bad-protocol" }],
      },
      error: null,
    });

    render(<ComplianceWorkQueuePage />);

    expect((await screen.findByRole("alert")).textContent).toContain("work-malformed");
    expect(screen.getByText("Alpine Tower")).toBeTruthy();
    expect(screen.queryByText("work-empty-title")).toBeNull();
  });

  it("shows malformed rather than the affirmative empty state when every element is rejected", async () => {
    rpcMock.mockResolvedValue({
      data: { cases: [null, { status: "active" }], protocols: ["bad"] },
      error: null,
    });

    render(<ComplianceWorkQueuePage />);

    expect((await screen.findByRole("alert")).textContent).toContain("work-malformed");
    expect(screen.queryByText("work-empty-title")).toBeNull();
  });

  it("does not call the RPC without an authenticated owner", async () => {
    authState.user = null;
    render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("work-empty-title")).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("clears prior-owner rows synchronously and keeps them hidden if the next owner fails", async () => {
    rpcMock
      .mockResolvedValueOnce(snapshot([buildCase()]))
      .mockResolvedValueOnce({ data: null, error: { message: "owner two failed" } });
    const view = render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("Alpine Tower")).toBeTruthy();

    authState.user = { id: "owner-2", name: "Owner Two", email: "two@example.ch" };
    view.rerender(<ComplianceWorkQueuePage />);
    expect(screen.queryByText("Alpine Tower")).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain("work-error");
  });

  it("ignores an older owner request after a newer owner succeeds", async () => {
    const oldRequest = deferred<ReturnType<typeof snapshot>>();
    rpcMock
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(snapshot([buildCase({ id: "new-case", project_name: "New Owner Project", user_id: "owner-2" })]));
    const view = render(<ComplianceWorkQueuePage />);

    authState.user = { id: "owner-2", name: "Owner Two", email: "two@example.ch" };
    view.rerender(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("New Owner Project")).toBeTruthy();

    await act(async () => oldRequest.resolve(snapshot([buildCase({ project_name: "Old Owner Project" })])));
    expect(screen.queryByText("Old Owner Project")).toBeNull();
    expect(screen.getByText("New Owner Project")).toBeTruthy();
  });

  it("ignores an async completion after unmount", async () => {
    const pending = deferred<ReturnType<typeof snapshot>>();
    rpcMock.mockReturnValue(pending.promise);
    const view = render(<ComplianceWorkQueuePage />);
    view.unmount();
    await act(async () => pending.resolve(snapshot([buildCase()])));
    expect(document.body.textContent).not.toContain("Alpine Tower");
  });

  it("creates one fresh Supabase client per mount, not per rerender", async () => {
    rpcMock.mockResolvedValue(snapshot([]));
    const first = render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("work-empty-title")).toBeTruthy();
    first.rerender(<ComplianceWorkQueuePage />);
    expect(getSupabaseMock).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<ComplianceWorkQueuePage />);
    await waitFor(() => expect(getSupabaseMock).toHaveBeenCalledTimes(2));
  });

  it("reloads the queue when the Swiss legal calendar day changes", async () => {
    rpcMock
      .mockResolvedValueOnce(snapshot([buildCase({ project_name: "Before Midnight" })]))
      .mockResolvedValueOnce(snapshot([buildCase({ project_name: "After Midnight" })]));

    render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("Before Midnight")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    });

    expect(await screen.findByText("After Midnight")).toBeTruthy();
    expect(screen.queryByText("Before Midnight")).toBeNull();
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("states the personal point-in-time boundary without governance or delivery claims", async () => {
    rpcMock.mockResolvedValue(snapshot([]));
    render(<ComplianceWorkQueuePage />);
    await screen.findByText("work-empty-title");
    expect(screen.getByText("work-boundary")).toBeTruthy();
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/approved by|assigned to|actively monitored|notification sent/);
  });
});
