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
const snapshotRpcMock = vi.fn();
const ownedGrantsRpcMock = vi.fn();
const sharedOwnersRpcMock = vi.fn();
const grantRpcMock = vi.fn();
const revokeRpcMock = vi.fn();
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
const SHARED_OWNER_ID = "11111111-1111-4111-8111-111111111111";
const COLLABORATOR_ID = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP_ID = "33333333-3333-4333-8333-333333333333";

const ownedGrant = {
  membership_id: MEMBERSHIP_ID,
  collaborator_id: COLLABORATOR_ID,
  collaborator_email: "member@example.ch",
  granted_at: "2026-08-31T08:00:00.000Z",
};

function buildCase(overrides: Partial<Case> = {}): Case {
  return {
    id: "case-1",
    user_id: "owner-1",
    project_name: "Alpine Tower",
    canton: "ZH",
    contract_date: "2026-01-10T00:00:00.000Z",
    discovery_date: "2026-01-15T00:00:00.000Z",
    acceptance_date: null,
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

function snapshot(cases: Case[], protocols: Array<{ id: string; case_id: string | null }> = []) {
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
    snapshotRpcMock.mockReset();
    ownedGrantsRpcMock.mockReset();
    sharedOwnersRpcMock.mockReset();
    grantRpcMock.mockReset();
    revokeRpcMock.mockReset();
    ownedGrantsRpcMock.mockResolvedValue({ data: [], error: null });
    sharedOwnersRpcMock.mockResolvedValue({ data: [], error: null });
    rpcMock.mockImplementation((name: string, args?: unknown) => {
      if (name === "get_compliance_work_queue_snapshot") return snapshotRpcMock(args);
      if (name === "list_owned_compliance_queue_grants") return ownedGrantsRpcMock(args);
      if (name === "list_shared_compliance_queue_owners") return sharedOwnersRpcMock(args);
      if (name === "grant_compliance_queue_access") return grantRpcMock(args);
      if (name === "revoke_compliance_queue_access") return revokeRpcMock(args);
      throw new Error(`Unexpected RPC: ${name}`);
    });
    getSupabaseMock.mockClear();
  });

  afterEach(() => vi.useRealTimers());

  it("loads exactly one owner snapshot RPC and renders the complete prioritized queue with native handoffs", async () => {
    snapshotRpcMock.mockResolvedValue(snapshot([
      buildCase(),
      buildCase({
        id: "case-ready",
        project_name: "Lake House",
        discovery_date: "2026-08-25T00:00:00.000Z",
        checklist: { ...COMPLETE, noticeDrafted: false },
      }),
    ], [
      { id: "p-1", case_id: "case-1" },
    ]));

    render(<ComplianceWorkQueuePage />);

    expect(screen.getByRole("status").textContent).toContain("work-loading");
    expect(await screen.findByText("Alpine Tower")).toBeTruthy();
    expect(screen.getByText("Lake House")).toBeTruthy();
    expect(snapshotRpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("get_compliance_work_queue_snapshot", { target_owner_id: "owner-1" });
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
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    render(<ComplianceWorkQueuePage />);

    expect(await screen.findByText("work-empty-title")).toBeTruthy();
    expect(screen.queryByRole("main")).toBeNull();
  });

  it("shows retryable RPC errors, loading on retry, and then the empty state", async () => {
    const retry = deferred<ReturnType<typeof snapshot>>();
    snapshotRpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "failed" } })
      .mockReturnValueOnce(retry.promise);

    render(<ComplianceWorkQueuePage />);
    expect((await screen.findByRole("alert")).textContent).toContain("work-error");
    fireEvent.click(screen.getByRole("button", { name: "work-retry" }));
    expect(screen.getByText("work-loading")).toBeTruthy();
    retry.resolve(snapshot([]));
    expect(await screen.findByText("work-empty-title")).toBeTruthy();
    expect(snapshotRpcMock).toHaveBeenCalledTimes(2);
  });

  it("treats either malformed snapshot collection as a retryable malformed state", async () => {
    snapshotRpcMock.mockResolvedValue({ data: { cases: {}, protocols: [] }, error: null });
    render(<ComplianceWorkQueuePage />);
    expect((await screen.findByRole("alert")).textContent).toContain("work-malformed");
  });

  it("renders valid siblings with a localized incomplete warning for malformed elements", async () => {
    snapshotRpcMock.mockResolvedValue({
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
    snapshotRpcMock.mockResolvedValue({
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
    snapshotRpcMock
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
    snapshotRpcMock
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
    snapshotRpcMock.mockReturnValue(pending.promise);
    const view = render(<ComplianceWorkQueuePage />);
    view.unmount();
    await act(async () => pending.resolve(snapshot([buildCase()])));
    expect(document.body.textContent).not.toContain("Alpine Tower");
  });

  it("creates one fresh Supabase client per mount, not per rerender", async () => {
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    const first = render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("work-empty-title")).toBeTruthy();
    first.rerender(<ComplianceWorkQueuePage />);
    expect(getSupabaseMock).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<ComplianceWorkQueuePage />);
    await waitFor(() => expect(getSupabaseMock).toHaveBeenCalledTimes(2));
  });

  it("reloads the queue when the Swiss legal calendar day changes", async () => {
    snapshotRpcMock
      .mockResolvedValueOnce(snapshot([buildCase({ project_name: "Before Midnight" })]))
      .mockResolvedValueOnce(snapshot([buildCase({ project_name: "After Midnight" })]));

    render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("Before Midnight")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    });

    expect(await screen.findByText("After Midnight")).toBeTruthy();
    expect(screen.queryByText("Before Midnight")).toBeNull();
    expect(snapshotRpcMock).toHaveBeenCalledTimes(2);
  });

  it("states the personal point-in-time boundary without governance or delivery claims", async () => {
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    render(<ComplianceWorkQueuePage />);
    await screen.findByText("work-empty-title");
    expect(screen.getByText("work-boundary")).toBeTruthy();
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/approved by|assigned to|actively monitored|notification sent/);
  });

  it("grants an exact existing-account email and keeps the confirmed grant visible", async () => {
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [ownedGrant], error: null });
    grantRpcMock.mockResolvedValue({ data: [ownedGrant], error: null });

    render(<ComplianceWorkQueuePage />);
    const email = await screen.findByRole("textbox", { name: "work-sharing-email" });
    fireEvent.change(email, { target: { value: "member@example.ch" } });
    fireEvent.submit(screen.getByRole("form", { name: "work-sharing-form" }));

    expect(await screen.findByText("member@example.ch")).toBeTruthy();
    expect(grantRpcMock).toHaveBeenCalledWith({ target_collaborator_email: "member@example.ch" });
    expect(screen.getByRole("status").textContent).toContain("work-sharing-grant-success");
  });

  it("does not let an older access-list response remove a confirmed grant", async () => {
    const staleOwnedList = deferred<{ data: unknown[]; error: null }>();
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock.mockReturnValueOnce(staleOwnedList.promise);
    grantRpcMock.mockResolvedValue({ data: [ownedGrant], error: null });

    render(<ComplianceWorkQueuePage />);
    const email = screen.getByRole("textbox", { name: "work-sharing-email" });
    fireEvent.change(email, { target: { value: "member@example.ch" } });
    fireEvent.submit(screen.getByRole("form", { name: "work-sharing-form" }));
    expect(await screen.findByText("member@example.ch")).toBeTruthy();

    await act(async () => staleOwnedList.resolve({ data: [], error: null }));

    expect(screen.getByText("member@example.ch")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("work-sharing-grant-success");
  });

  it("preserves the confirmed owned-grant list when a reload payload is malformed", async () => {
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock
      .mockResolvedValueOnce({ data: [ownedGrant], error: null })
      .mockResolvedValueOnce({ data: [ownedGrant, { membership_id: "rejected" }], error: null });
    sharedOwnersRpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "retryable" } })
      .mockResolvedValueOnce({ data: [], error: null });

    render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("member@example.ch")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "work-sharing-retry" }));

    await waitFor(() => expect(ownedGrantsRpcMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("member@example.ch")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("work-sharing-list-error");
  });

  it("preserves the confirmed shared-owner list when a reload payload is not an array", async () => {
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "retryable" } })
      .mockResolvedValueOnce({ data: [], error: null });
    sharedOwnersRpcMock
      .mockResolvedValueOnce({ data: [{
        owner_id: SHARED_OWNER_ID,
        owner_name: "Confirmed Shared Owner",
        owner_company: null,
        granted_at: "2026-08-31T08:00:00.000Z",
      }], error: null })
      .mockResolvedValueOnce({ data: { rows: [] }, error: null });

    render(<ComplianceWorkQueuePage />);
    expect(await screen.findByRole("option", { name: "Confirmed Shared Owner" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "work-sharing-retry" }));

    await waitFor(() => expect(sharedOwnersRpcMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("option", { name: "Confirmed Shared Owner" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("work-sharing-list-error");
  });

  it("revokes a confirmed owned grant only after RPC success", async () => {
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock
      .mockResolvedValueOnce({ data: [ownedGrant], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    revokeRpcMock.mockResolvedValue({ data: true, error: null });

    render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("member@example.ch")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "work-sharing-revoke member@example.ch" }));

    await waitFor(() => expect(screen.queryByText("member@example.ch")).toBeNull());
    expect(revokeRpcMock).toHaveBeenCalledWith({ target_collaborator_id: COLLABORATOR_ID });
  });

  it("does not let an older access-list response restore a confirmed revoke", async () => {
    const staleOwnedList = deferred<{ data: unknown[]; error: null }>();
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock
      .mockResolvedValueOnce({ data: [ownedGrant], error: null })
      .mockReturnValueOnce(staleOwnedList.promise);
    sharedOwnersRpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "retryable" } })
      .mockResolvedValueOnce({ data: [], error: null });
    revokeRpcMock.mockResolvedValue({ data: true, error: null });

    render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("member@example.ch")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "work-sharing-retry" }));
    await waitFor(() => expect(ownedGrantsRpcMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "work-sharing-revoke member@example.ch" }));
    await waitFor(() => expect(screen.queryByText("member@example.ch")).toBeNull());

    await act(async () => staleOwnedList.resolve({ data: [ownedGrant], error: null }));

    expect(screen.queryByText("member@example.ch")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("work-sharing-revoke-success");
  });

  it("loads an explicitly shared owner by ID as read-only and suppresses Case handoffs", async () => {
    authState.user = { id: COLLABORATOR_ID, name: "Member", email: "member@example.ch" };
    sharedOwnersRpcMock.mockResolvedValue({ data: [{
      owner_id: SHARED_OWNER_ID,
      owner_name: "Owner One",
      owner_company: "Alpine AG",
      granted_at: "2026-08-31T08:00:00.000Z",
    }], error: null });
    snapshotRpcMock.mockImplementation(({ target_owner_id }: { target_owner_id: string }) =>
      Promise.resolve(target_owner_id === SHARED_OWNER_ID
        ? snapshot([buildCase({ user_id: SHARED_OWNER_ID, project_name: "Shared Alpine" })])
        : snapshot([]))
    );

    render(<ComplianceWorkQueuePage />);
    const selector = await screen.findByRole("combobox", { name: "work-owner-selector" });
    await screen.findByRole("option", { name: "Owner One · Alpine AG" });
    fireEvent.change(selector, { target: { value: SHARED_OWNER_ID } });

    expect(await screen.findByText("Shared Alpine")).toBeTruthy();
    expect(screen.getByText("work-shared-read-only")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "work-open-case" })).toBeNull();
    expect(snapshotRpcMock).toHaveBeenLastCalledWith({ target_owner_id: SHARED_OWNER_ID });
  });

  it("locks conflicting grant and revoke controls while a grant is pending", async () => {
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock.mockResolvedValue({ data: [ownedGrant], error: null });
    const pending = deferred<{ data: unknown; error: null }>();
    grantRpcMock.mockReturnValue(pending.promise);

    render(<ComplianceWorkQueuePage />);
    const email = await screen.findByRole("textbox", { name: "work-sharing-email" });
    fireEvent.change(email, { target: { value: "another@example.ch" } });
    const grant = screen.getByRole("button", { name: "work-sharing-grant" });
    fireEvent.click(grant);
    fireEvent.click(grant);

    expect(grantRpcMock).toHaveBeenCalledTimes(1);
    expect(grant.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "work-sharing-revoke member@example.ch" }).hasAttribute("disabled")).toBe(true);
    pending.resolve({ data: [], error: null });
  });

  it("uses non-enumerating mutation failures and preserves the last confirmed grant list", async () => {
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock.mockResolvedValue({ data: [ownedGrant], error: null });
    grantRpcMock.mockResolvedValue({ data: null, error: { message: "missing user" } });

    render(<ComplianceWorkQueuePage />);
    const email = await screen.findByRole("textbox", { name: "work-sharing-email" });
    fireEvent.change(email, { target: { value: "missing@example.ch" } });
    fireEvent.click(screen.getByRole("button", { name: "work-sharing-grant" }));

    expect((await screen.findByRole("alert", { name: "work-sharing-feedback" })).textContent).toContain("work-sharing-grant-error");
    expect(screen.getByText("member@example.ch")).toBeTruthy();
    expect(document.body.textContent).not.toContain("missing user");
  });

  it("clears access, queue rows, form, and feedback synchronously on account switch", async () => {
    snapshotRpcMock
      .mockResolvedValueOnce(snapshot([buildCase({ project_name: "Owner One Queue" })]))
      .mockResolvedValueOnce(snapshot([]));
    ownedGrantsRpcMock
      .mockResolvedValueOnce({ data: [ownedGrant], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    sharedOwnersRpcMock
      .mockResolvedValueOnce({ data: [{
        owner_id: SHARED_OWNER_ID,
        owner_name: "Shared Owner",
        owner_company: null,
        granted_at: "2026-08-31T08:00:00.000Z",
      }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    grantRpcMock.mockResolvedValue({ data: null, error: { message: "private backend detail" } });

    const view = render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("Owner One Queue")).toBeTruthy();
    expect(await screen.findByText("member@example.ch")).toBeTruthy();
    const email = screen.getByRole("textbox", { name: "work-sharing-email" });
    fireEvent.change(email, { target: { value: "missing@example.ch" } });
    fireEvent.click(screen.getByRole("button", { name: "work-sharing-grant" }));
    expect(await screen.findByRole("alert", { name: "work-sharing-feedback" })).toBeTruthy();

    authState.user = { id: "owner-2", name: "Owner Two", email: "two@example.ch" };
    view.rerender(<ComplianceWorkQueuePage />);

    expect(screen.queryByText("Owner One Queue")).toBeNull();
    expect(screen.queryByText("member@example.ch")).toBeNull();
    expect(screen.queryByRole("option", { name: /Shared Owner/ })).toBeNull();
    expect((screen.getByRole("textbox", { name: "work-sharing-email" }) as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("alert", { name: "work-sharing-feedback" })).toBeNull();
  });

  it("scopes queue errors and rows synchronously to a new account before its load completes", async () => {
    const nextAccount = deferred<ReturnType<typeof snapshot>>();
    snapshotRpcMock
      .mockResolvedValueOnce({
        data: { cases: [null, buildCase({ project_name: "Prior Account Row" })], protocols: [] },
        error: null,
      })
      .mockReturnValueOnce(nextAccount.promise);

    const view = render(<ComplianceWorkQueuePage />);
    expect((await screen.findByRole("alert")).textContent).toContain("work-malformed");
    expect(screen.getByText("Prior Account Row")).toBeTruthy();

    authState.user = { id: "owner-2", name: "Owner Two", email: "two@example.ch" };
    view.rerender(<ComplianceWorkQueuePage />);

    expect(screen.queryByText("work-malformed")).toBeNull();
    expect(screen.queryByText("Prior Account Row")).toBeNull();
    expect(screen.queryByText("work-empty-title")).toBeNull();
    expect(screen.getByText("work-loading")).toBeTruthy();

    await act(async () => nextAccount.resolve(snapshot([])));
    expect(await screen.findByText("work-empty-title")).toBeTruthy();
  });

  it("hides the prior empty state synchronously when switching to a shared-owner target", async () => {
    const sharedQueue = deferred<ReturnType<typeof snapshot>>();
    sharedOwnersRpcMock.mockResolvedValue({ data: [{
      owner_id: SHARED_OWNER_ID,
      owner_name: "Shared Owner",
      owner_company: null,
      granted_at: "2026-08-31T08:00:00.000Z",
    }], error: null });
    snapshotRpcMock
      .mockResolvedValueOnce(snapshot([]))
      .mockReturnValueOnce(sharedQueue.promise);

    render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("work-empty-title")).toBeTruthy();
    const selector = await screen.findByRole("combobox", { name: "work-owner-selector" });
    await screen.findByRole("option", { name: "Shared Owner" });

    fireEvent.change(selector, { target: { value: SHARED_OWNER_ID } });

    expect(screen.queryByText("work-empty-title")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Alpine Tower")).toBeNull();
    expect(screen.getByText("work-loading")).toBeTruthy();

    await act(async () => sharedQueue.resolve(snapshot([
      buildCase({ user_id: SHARED_OWNER_ID, project_name: "Replacement Shared Queue" }),
    ])));
    expect(await screen.findByText("Replacement Shared Queue")).toBeTruthy();
    expect(screen.queryByText("work-empty-title")).toBeNull();
  });

  it("ignores stale access-list and grant completions from a previous account", async () => {
    const oldOwned = deferred<{ data: unknown; error: null }>();
    const oldShared = deferred<{ data: unknown; error: null }>();
    const oldGrant = deferred<{ data: unknown; error: null }>();
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock
      .mockReturnValueOnce(oldOwned.promise)
      .mockResolvedValueOnce({ data: [], error: null });
    sharedOwnersRpcMock
      .mockReturnValueOnce(oldShared.promise)
      .mockResolvedValueOnce({ data: [], error: null });
    grantRpcMock.mockReturnValue(oldGrant.promise);

    const view = render(<ComplianceWorkQueuePage />);
    const email = screen.getByRole("textbox", { name: "work-sharing-email" });
    fireEvent.change(email, { target: { value: "member@example.ch" } });
    fireEvent.click(screen.getByRole("button", { name: "work-sharing-grant" }));

    authState.user = { id: "owner-2", name: "Owner Two", email: "two@example.ch" };
    view.rerender(<ComplianceWorkQueuePage />);
    await act(async () => {
      oldOwned.resolve({ data: [ownedGrant], error: null });
      oldShared.resolve({ data: [{
        owner_id: SHARED_OWNER_ID,
        owner_name: "Stale Shared Owner",
        owner_company: null,
        granted_at: "2026-08-31T08:00:00.000Z",
      }], error: null });
      oldGrant.resolve({ data: [ownedGrant], error: null });
    });

    expect(screen.queryByText("member@example.ch")).toBeNull();
    expect(screen.queryByRole("option", { name: /Stale Shared Owner/ })).toBeNull();
    expect(screen.queryByText("work-sharing-grant-success")).toBeNull();
    expect(screen.getByRole("button", { name: "work-sharing-grant" }).hasAttribute("disabled")).toBe(true);
  });

  it("does not show a prior account access-list error after an account switch", async () => {
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "owner one list failed" } })
      .mockResolvedValueOnce({ data: [], error: null });

    const view = render(<ComplianceWorkQueuePage />);
    expect((await screen.findByRole("alert")).textContent).toContain("work-sharing-list-error");

    authState.user = { id: "owner-2", name: "Owner Two", email: "two@example.ch" };
    view.rerender(<ComplianceWorkQueuePage />);

    expect(screen.queryByText("work-sharing-list-error")).toBeNull();
    await waitFor(() => expect(ownedGrantsRpcMock).toHaveBeenCalledTimes(2));
  });

  it("ignores a stale revoke completion and unlocks the next account synchronously", async () => {
    const oldRevoke = deferred<{ data: true; error: null }>();
    const secondGrant = {
      ...ownedGrant,
      membership_id: "44444444-4444-4444-8444-444444444444",
      collaborator_id: "55555555-5555-4555-8555-555555555555",
      collaborator_email: "second@example.ch",
    };
    snapshotRpcMock.mockResolvedValue(snapshot([]));
    ownedGrantsRpcMock
      .mockResolvedValueOnce({ data: [ownedGrant], error: null })
      .mockResolvedValueOnce({ data: [secondGrant], error: null });
    revokeRpcMock.mockReturnValue(oldRevoke.promise);

    const view = render(<ComplianceWorkQueuePage />);
    expect(await screen.findByText("member@example.ch")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "work-sharing-revoke member@example.ch" }));

    authState.user = { id: "owner-2", name: "Owner Two", email: "two@example.ch" };
    view.rerender(<ComplianceWorkQueuePage />);
    expect(screen.queryByText("member@example.ch")).toBeNull();
    expect(screen.getByRole("textbox", { name: "work-sharing-email" }).hasAttribute("disabled")).toBe(false);
    await act(async () => oldRevoke.resolve({ data: true, error: null }));

    expect(await screen.findByText("second@example.ch")).toBeTruthy();
    expect(screen.queryByText("work-sharing-revoke-success")).toBeNull();
  });
});
