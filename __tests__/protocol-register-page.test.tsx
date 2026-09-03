import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Protocol } from "@/lib/database.types";
import type { ProtocolRegisterRecord } from "@/lib/protocol-register";

const mocks = vi.hoisted(() => ({
  currentUser: { id: "owner-1", email: "owner@example.ch", name: "Owner" } as { id: string; email: string; name: string } | null,
  fromMock: vi.fn(),
  pdfMock: vi.fn(),
}));
let currentUser = mocks.currentUser;
let queryResults: Array<Promise<{ data: ProtocolRegisterRecord[] | null; error: { message: string } | null }>> = [];
let downloadResults: Array<Promise<{ data: Protocol | null; error: { message: string } | null }>> = [];
const eqMock = vi.fn();
const statusEqMock = vi.fn();
const detailOwnerEqMock = vi.fn();
const detailStatusEqMock = vi.fn();
const singleMock = vi.fn();
const orderMock = vi.fn();
const idOrderMock = vi.fn();
const limitMock = vi.fn();
const orMock = vi.fn();
const selectMock = vi.fn();
const fromMock = mocks.fromMock;
const pdfMock = mocks.pdfMock;
const toBlobMock = vi.fn();
const clickMock = vi.fn();
const revokeObjectURLMock = vi.fn();
const createObjectURLMock = vi.fn(() => "blob:protocol");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function protocolRow(overrides: Partial<Protocol>): Protocol {
  return {
    id: "protocol-1",
    user_id: "owner-1",
    case_id: null,
    project_name: "Standalone project",
    contractor: "Contractor AG",
    client: "Client GmbH",
    defect_description: "Crack recorded",
    signature_data: "data:image/png;base64,signed",
    status: "finalized",
    created_at: "2026-08-13T08:00:00.000Z",
    finalized_at: "2026-08-13T08:30:00.000Z",
    ...overrides,
  };
}

function registerRow(overrides: Partial<ProtocolRegisterRecord>): ProtocolRegisterRecord {
  const protocol = protocolRow(overrides);
  return {
    id: protocol.id,
    user_id: protocol.user_id,
    case_id: protocol.case_id,
    project_name: protocol.project_name,
    contractor: protocol.contractor,
    client: protocol.client,
    status: protocol.status,
    finalized_at: protocol.finalized_at,
    signature_captured: overrides.signature_captured ?? true,
  };
}

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: mocks.currentUser }),
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key: string) => ({
      "protocols-title": "Finalized protocols",
      "protocols-subtitle": "Retrieve persisted finalized records. Download does not indicate delivery or acceptance.",
      "protocols-integrity-note": "Finalized protocol content and signatures cannot be changed, and authenticated users cannot individually delete a protocol. Deleting a linked Case clears only its Case association. Deleting your account deletes its protocol records. This is not external retention or absolute immutability.",
      "protocols-loading": "Loading protocols…",
      "protocols-empty-title": "No finalized protocols",
      "protocols-empty-body": "Finalized protocols will appear here.",
      "protocols-error": "Protocols could not be loaded.",
      "protocols-retry": "Retry",
      "protocols-project": "Project",
      "protocols-contractor": "Contractor",
      "protocols-client": "Client",
      "protocols-record-id": "Record ID",
      "protocols-record-date": "Finalized on",
      "protocols-signature": "Signature",
      "protocols-signature-captured": "Captured",
      "protocols-signature-missing": "Missing",
      "protocols-context": "Context",
      "protocols-context-linked": "Linked case",
      "protocols-context-standalone": "Standalone protocol",
      "protocols-download": "Download PDF",
      "protocols-downloading": "Generating PDF…",
      "protocols-download-success": "PDF downloaded.",
      "protocols-download-error": "PDF could not be created. Try again.",
      "protocols-audit-export-action": "Download audit index (.csv)",
      "protocols-audit-export-pending": "Preparing audit index…",
      "protocols-audit-export-guidance": "This CSV is a point-in-time register index. It is not proof of legal completeness, delivery, acceptance, or external retention.",
      "protocols-audit-export-success": "Audit index downloaded.",
      "protocols-audit-export-error": "Audit index could not be created. Try again.",
      "protocols-audit-export-generated-at": "Generated at",
      "protocols-audit-export-scope": "Scope",
      "protocols-audit-export-scope-value": "Point-in-time finalized protocol register",
      "protocols-audit-export-protocol-id": "Protocol ID",
      "protocols-audit-export-case-id": "Case ID",
      "protocols-audit-export-standalone": "Standalone protocol",
      "protocols-audit-export-project": "Project",
      "protocols-audit-export-contractor": "Contractor",
      "protocols-audit-export-client": "Client",
      "protocols-audit-export-finalized-at": "Finalized at",
      "protocols-audit-export-signature-state": "Signature state",
      "protocols-audit-export-signature-captured": "Captured",
      "protocols-audit-export-signature-missing": "Missing",
    }[key] ?? key),
  }),
}));

vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ from: mocks.fromMock }) }));
vi.mock("@react-pdf/renderer", () => ({ pdf: mocks.pdfMock }));
vi.mock("@/components/dashboard/AuditReportPDF", () => ({
  AuditReportPDF: (props: unknown) => <div data-testid="audit-pdf" data-props={JSON.stringify(props)} />,
}));

import ProtocolRegisterPage from "@/app/dashboard/protocols/page";

beforeEach(() => {
  currentUser = { id: "owner-1", email: "owner@example.ch", name: "Owner" };
  mocks.currentUser = currentUser;
  queryResults = [];
  downloadResults = [];
  vi.clearAllMocks();
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  eqMock.mockImplementation((column: string) => column === "id" ? { eq: detailOwnerEqMock } : { eq: statusEqMock });
  statusEqMock.mockImplementation(() => ({ order: orderMock }));
  detailOwnerEqMock.mockImplementation(() => ({ eq: detailStatusEqMock }));
  detailStatusEqMock.mockImplementation(() => ({ single: singleMock }));
  singleMock.mockImplementation(() => downloadResults.shift() ?? Promise.resolve({ data: null, error: { message: "not found" } }));
  orderMock.mockImplementation(() => ({ order: idOrderMock }));
  idOrderMock.mockImplementation(() => ({ limit: limitMock }));
  limitMock.mockImplementation(() => ({
    or: orMock,
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      (queryResults.shift() ?? Promise.resolve({ data: [], error: null })).then(onFulfilled, onRejected),
  }));
  orMock.mockImplementation(() => queryResults.shift() ?? Promise.resolve({ data: [], error: null }));
  fromMock.mockReturnValue({ select: selectMock });
  toBlobMock.mockResolvedValue(new Blob(["pdf"]));
  pdfMock.mockReturnValue({ toBlob: toBlobMock });
  createObjectURLMock.mockReturnValue("blob:protocol");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURLMock });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURLMock });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickMock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ProtocolRegisterPage", () => {
  it("exposes no audit-index export while the register is loading, failed, or empty", async () => {
    const loading = deferred<{ data: ProtocolRegisterRecord[] | null; error: { message: string } | null }>();
    queryResults.push(loading.promise, Promise.resolve({ data: [], error: null }));
    render(<ProtocolRegisterPage />);

    expect(screen.queryByRole("button", { name: "Download audit index (.csv)" })).toBeNull();
    await act(async () => loading.resolve({ data: null, error: { message: "offline" } }));
    expect(await screen.findByText("Protocols could not be loaded.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download audit index (.csv)" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No finalized protocols")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download audit index (.csv)" })).toBeNull();
  });

  it("shows the finalized-record content, Case unlink, and account boundaries below the header", async () => {
    queryResults.push(Promise.resolve({ data: [], error: null }));

    render(<ProtocolRegisterPage />);
    await screen.findByText("No finalized protocols");

    const heading = screen.getByRole("heading", { name: "Finalized protocols" });
    const note = screen.getByText(
      "Finalized protocol content and signatures cannot be changed, and authenticated users cannot individually delete a protocol. Deleting a linked Case clears only its Case association. Deleting your account deletes its protocol records. This is not external retention or absolute immutability.",
    );
    expect(heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("queries by owner and renders finalized rows newest first with exact linked Case context and plain standalone context", async () => {
    queryResults.push(Promise.resolve({ data: [
      registerRow({ id: "old", finalized_at: "2026-08-12T08:00:00.000Z", signature_captured: false, case_id: "case-9" }),
      registerRow({ id: "draft", status: "draft" }),
      registerRow({ id: "standalone-new", finalized_at: "2026-08-14T08:00:00.000Z", case_id: null }),
    ], error: null }));

    render(<ProtocolRegisterPage />);
    expect(screen.getByText("Loading protocols…")).toBeTruthy();

    const cards = await screen.findAllByTestId("protocol-record");
    expect(cards.map((card) => card.getAttribute("data-protocol-id"))).toEqual(["standalone-new", "old"]);
    const standaloneContext = screen.getByText("Standalone protocol");
    expect(standaloneContext.closest("a")).toBeNull();
    const linkedCase = screen.getByRole("link", { name: "Linked case: case-9" });
    expect(linkedCase.getAttribute("href")).toBe("/dashboard/cases?case=case-9");
    expect(eqMock).toHaveBeenCalledWith("user_id", "owner-1");
    expect(statusEqMock).toHaveBeenCalledWith("status", "finalized");
    expect(orderMock).toHaveBeenCalledWith("finalized_at", { ascending: false });
    expect(idOrderMock).toHaveBeenCalledWith("id", { ascending: true });
    expect(fromMock).toHaveBeenCalledWith("protocol_register_records");
    expect(selectMock).toHaveBeenCalledWith("id, user_id, case_id, project_name, contractor, client, status, finalized_at, signature_captured");
    expect(limitMock).toHaveBeenCalledWith(1000);
    expect(screen.getByText("Missing")).toBeTruthy();
  });

  it("loads every finalized page instead of silently stopping at the response limit", async () => {
    // Keep the mocked page full so pagination continues, but filter most rows before
    // rendering; materializing 1,001 cards makes this query-focused test needlessly slow.
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      registerRow({
        id: `page-one-${index}`,
        finalized_at: `2026-08-12T08:${String(index % 60).padStart(2, "0")}:00.000Z`,
        status: index === 999 ? "finalized" : "draft",
      })
    );
    queryResults.push(
      Promise.resolve({ data: firstPage, error: null }),
      Promise.resolve({ data: [registerRow({ id: "page-two-record", finalized_at: "2026-08-14T08:00:00.000Z" })], error: null }),
    );

    render(<ProtocolRegisterPage />);

    expect(await screen.findByText("page-two-record")).toBeTruthy();
    expect(limitMock).toHaveBeenCalledTimes(2);
    expect(orMock).toHaveBeenCalledWith(
      "finalized_at.lt.2026-08-12T08:39:00.000Z,and(finalized_at.eq.2026-08-12T08:39:00.000Z,id.gt.page-one-999)",
    );
    expect(await screen.findAllByTestId("protocol-record")).toHaveLength(2);
  });

  it("exports every loaded finalized page without another query and uses one captured timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:34:56.789Z"));
    const firstPage = Array.from({ length: 1000 }, (_, index) => registerRow({
      id: `page-one-${index}`,
      finalized_at: `2026-08-12T08:${String(index % 60).padStart(2, "0")}:00.000Z`,
      status: index === 999 ? "finalized" : "draft",
      signature_captured: false,
      case_id: index === 999 ? null : "ignored",
    }));
    queryResults.push(
      Promise.resolve({ data: firstPage, error: null }),
      Promise.resolve({ data: [registerRow({ id: "page-two", case_id: "case-2" })], error: null }),
    );
    render(<ProtocolRegisterPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const queryCount = fromMock.mock.calls.length;

    expect(screen.getByText("This CSV is a point-in-time register index. It is not proof of legal completeness, delivery, acceptance, or external retention.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download audit index (.csv)" }));
    expect(screen.getByRole("button", { name: "Preparing audit index…" }).hasAttribute("disabled")).toBe(true);
    await act(async () => { await Promise.resolve(); });

    expect(fromMock).toHaveBeenCalledTimes(queryCount);
    expect(pdfMock).not.toHaveBeenCalled();
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    const csv = await ((createObjectURLMock.mock.calls as unknown as [[Blob]])[0][0]).text();
    expect(csv).toContain('"Generated at","2026-09-03T12:34:56.789Z"');
    expect(csv).toContain('"page-one-999","Standalone protocol"');
    expect(csv).toContain('"page-two","case-2"');
    expect(csv).toContain('"Signature state"');
    expect((clickMock.mock.instances[0] as HTMLAnchorElement).download).toBe("baucompliance-protocol-register-audit-2026-09-03.csv");
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:protocol");
    expect(screen.getByText("Audit index downloaded.")).toBeTruthy();

    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByText("Audit index downloaded.")).toBeNull();
    vi.useRealTimers();
  });

  it("suppresses synchronous duplicate audit exports and expires localized creation errors", async () => {
    vi.useFakeTimers();
    queryResults.push(Promise.resolve({ data: [registerRow({ id: "exportable" })], error: null }));
    createObjectURLMock.mockImplementationOnce(() => { throw new Error("blocked"); });
    render(<ProtocolRegisterPage />);
    await act(async () => { await Promise.resolve(); });
    const button = screen.getByRole("button", { name: "Download audit index (.csv)" });

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText("Audit index could not be created. Try again.")).toBeTruthy();
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickMock).not.toHaveBeenCalled();

    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByText("Audit index could not be created. Try again.")).toBeNull();
  });

  it("ignores pending audit export after an account switch", async () => {
    queryResults.push(Promise.resolve({ data: [registerRow({ id: "owner-one-export" })], error: null }), Promise.resolve({ data: [], error: null }));
    const view = render(<ProtocolRegisterPage />);
    const button = await screen.findByRole("button", { name: "Download audit index (.csv)" });

    fireEvent.click(button);
    currentUser = { id: "owner-2", email: "two@example.ch", name: "Two" };
    mocks.currentUser = currentUser;
    view.rerender(<ProtocolRegisterPage />);
    await act(async () => { await Promise.resolve(); });

    expect(createObjectURLMock).not.toHaveBeenCalled();
    expect(clickMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Audit index downloaded.")).toBeNull();
  });

  it("invalidates a pending audit export request even if the original owner returns", async () => {
    queryResults.push(
      Promise.resolve({ data: [registerRow({ id: "stale-request" })], error: null }),
      Promise.resolve({ data: [], error: null }),
      Promise.resolve({ data: [registerRow({ id: "fresh-request" })], error: null }),
    );
    const view = render(<ProtocolRegisterPage />);
    const button = await screen.findByRole("button", { name: "Download audit index (.csv)" });

    fireEvent.click(button);
    currentUser = { id: "owner-2", email: "two@example.ch", name: "Two" };
    mocks.currentUser = currentUser;
    view.rerender(<ProtocolRegisterPage />);
    currentUser = { id: "owner-1", email: "owner@example.ch", name: "Owner" };
    mocks.currentUser = currentUser;
    view.rerender(<ProtocolRegisterPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(createObjectURLMock).not.toHaveBeenCalled();
    expect(clickMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Audit index downloaded.")).toBeNull();
    expect(await screen.findByText("fresh-request")).toBeTruthy();
  });

  it("ignores pending audit export after unmount and leaves no timers", async () => {
    vi.useFakeTimers();
    queryResults.push(Promise.resolve({ data: [registerRow({ id: "unmounted-export" })], error: null }));
    const view = render(<ProtocolRegisterPage />);
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByRole("button", { name: "Download audit index (.csv)" }));
    view.unmount();
    await act(async () => { await Promise.resolve(); });

    expect(createObjectURLMock).not.toHaveBeenCalled();
    expect(clickMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("shows empty and error states and retries", async () => {
    queryResults.push(
      Promise.resolve({ data: null, error: { message: "offline" } }),
      Promise.resolve({ data: [], error: null }),
    );
    render(<ProtocolRegisterPage />);

    expect(await screen.findByText("Protocols could not be loaded.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No finalized protocols")).toBeTruthy();
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("clears prior-owner rows immediately and ignores stale account completions", async () => {
    const ownerOne = deferred<{ data: ProtocolRegisterRecord[] | null; error: null }>();
    const ownerTwo = deferred<{ data: ProtocolRegisterRecord[] | null; error: null }>();
    queryResults.push(ownerOne.promise, ownerTwo.promise);
    const view = render(<ProtocolRegisterPage />);

    await act(async () => ownerOne.resolve({ data: [registerRow({ id: "private-owner-1" })], error: null }));
    expect(await screen.findByText("private-owner-1")).toBeTruthy();

    currentUser = { id: "owner-2", email: "two@example.ch", name: "Two" };
    mocks.currentUser = currentUser;
    view.rerender(<ProtocolRegisterPage />);
    expect(screen.queryByText("private-owner-1")).toBeNull();

    await act(async () => ownerTwo.resolve({ data: [registerRow({ id: "owner-2-row", user_id: "owner-2" })], error: null }));
    expect(await screen.findByText("owner-2-row")).toBeTruthy();
    expect(screen.queryByText("private-owner-1")).toBeNull();
    expect(eqMock).toHaveBeenCalledWith("user_id", "owner-2");
  });

  it("re-reads and generates the exact persisted record with deterministic filename and cleans the URL", async () => {
    queryResults.push(Promise.resolve({ data: [registerRow({ id: "exact-record", project_name: "Cached project", case_id: null })], error: null }));
    downloadResults.push(Promise.resolve({ data: protocolRow({ id: "exact-record", project_name: "Fresh project", defect_description: "Fresh defect", case_id: null }), error: null }));
    render(<ProtocolRegisterPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));

    await waitFor(() => expect(pdfMock).toHaveBeenCalledTimes(1));
    expect(eqMock).toHaveBeenCalledWith("id", "exact-record");
    expect(detailOwnerEqMock).toHaveBeenCalledWith("user_id", "owner-1");
    expect(detailStatusEqMock).toHaveBeenCalledWith("status", "finalized");
    expect(singleMock).toHaveBeenCalledTimes(1);
    const pdfElement = pdfMock.mock.calls[0][0];
    expect(pdfElement.props).toMatchObject({
      fileName: "Fresh project",
      caseId: "exact-record",
      contractor: "Contractor AG",
      client: "Client GmbH",
    });
    expect(pdfElement.props.report).toMatchObject({ status: "finalized", linkedCaseId: null, signatureCaptured: true, finalizedAt: "2026-08-13T08:30:00.000Z" });
    await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:protocol");
    expect((clickMock.mock.instances[0] as HTMLAnchorElement).download).toBe("baucompliance-protocol-exact-record.pdf");
    expect(await screen.findByText("PDF downloaded.")).toBeTruthy();
  });

  it("suppresses synchronous duplicate downloads per record and supports retry after failure", async () => {
    const blob = deferred<Blob>();
    toBlobMock.mockReturnValueOnce(blob.promise).mockRejectedValueOnce(new Error("failed"));
    queryResults.push(Promise.resolve({ data: [registerRow({ id: "locked" })], error: null }));
    downloadResults.push(
      Promise.resolve({ data: protocolRow({ id: "locked" }), error: null }),
      Promise.resolve({ data: protocolRow({ id: "locked" }), error: null }),
    );
    render(<ProtocolRegisterPage />);
    const button = await screen.findByRole("button", { name: "Download PDF" });

    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(pdfMock).toHaveBeenCalledTimes(1));
    await act(async () => blob.resolve(new Blob(["pdf"])));
    await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByText("PDF could not be created. Try again.")).toBeTruthy();
    expect(pdfMock).toHaveBeenCalledTimes(2);
  });

  it("ignores stale PDF completion after account switch and cleans feedback timers on unmount", async () => {
    vi.useFakeTimers();
    const blob = deferred<Blob>();
    toBlobMock.mockReturnValue(blob.promise);
    queryResults.push(Promise.resolve({ data: [registerRow({ id: "owner-one-pdf" })], error: null }), Promise.resolve({ data: [], error: null }));
    downloadResults.push(Promise.resolve({ data: protocolRow({ id: "owner-one-pdf" }), error: null }));
    const view = render(<ProtocolRegisterPage />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    currentUser = { id: "owner-2", email: "two@example.ch", name: "Two" };
    mocks.currentUser = currentUser;
    view.rerender(<ProtocolRegisterPage />);
    await act(async () => blob.resolve(new Blob(["pdf"])));
    expect(clickMock).not.toHaveBeenCalled();
    expect(createObjectURLMock).not.toHaveBeenCalled();

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("ignores PDF completion after unmount", async () => {
    const blob = deferred<Blob>();
    toBlobMock.mockReturnValue(blob.promise);
    queryResults.push(Promise.resolve({ data: [registerRow({ id: "unmounted-pdf" })], error: null }));
    downloadResults.push(Promise.resolve({ data: protocolRow({ id: "unmounted-pdf" }), error: null }));
    const view = render(<ProtocolRegisterPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));

    view.unmount();
    await act(async () => blob.resolve(new Blob(["pdf"])));

    expect(clickMock).not.toHaveBeenCalled();
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it("does not generate a PDF when the persisted protocol is no longer finalized", async () => {
    queryResults.push(Promise.resolve({ data: [registerRow({ id: "stale-finalized" })], error: null }));
    downloadResults.push(Promise.resolve({ data: null, error: { message: "not found" } }));
    render(<ProtocolRegisterPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));

    expect(await screen.findByText("PDF could not be created. Try again.")).toBeTruthy();
    expect(pdfMock).not.toHaveBeenCalled();
    expect(clickMock).not.toHaveBeenCalled();
  });
});
