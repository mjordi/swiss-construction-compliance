import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Protocol } from "@/lib/database.types";

const mocks = vi.hoisted(() => ({
  currentUser: { id: "owner-1", email: "owner@example.ch", name: "Owner" } as { id: string; email: string; name: string } | null,
  fromMock: vi.fn(),
  pdfMock: vi.fn(),
}));
let currentUser = mocks.currentUser;
let queryResults: Array<Promise<{ data: Protocol[] | null; error: { message: string } | null }>> = [];
let downloadResults: Array<Promise<{ data: Protocol | null; error: { message: string } | null }>> = [];
const eqMock = vi.fn();
const statusEqMock = vi.fn();
const detailOwnerEqMock = vi.fn();
const detailStatusEqMock = vi.fn();
const singleMock = vi.fn();
const orderMock = vi.fn();
const idOrderMock = vi.fn();
const rangeMock = vi.fn();
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

function row(overrides: Partial<Protocol>): Protocol {
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
    ...overrides,
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
  idOrderMock.mockImplementation(() => ({ range: rangeMock }));
  rangeMock.mockImplementation(() => queryResults.shift() ?? Promise.resolve({ data: [], error: null }));
  fromMock.mockReturnValue({ select: selectMock });
  toBlobMock.mockResolvedValue(new Blob(["pdf"]));
  pdfMock.mockReturnValue({ toBlob: toBlobMock });
  createObjectURLMock.mockReturnValue("blob:protocol");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURLMock });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURLMock });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickMock);
});

describe("ProtocolRegisterPage", () => {
  it("queries by owner and renders finalized rows newest first, including standalone records", async () => {
    queryResults.push(Promise.resolve({ data: [
      row({ id: "old", created_at: "2026-08-12T08:00:00.000Z", signature_data: null, case_id: "case-9" }),
      row({ id: "draft", status: "draft" }),
      row({ id: "standalone-new", created_at: "2026-08-14T08:00:00.000Z", case_id: null }),
    ], error: null }));

    render(<ProtocolRegisterPage />);
    expect(screen.getByText("Loading protocols…")).toBeTruthy();

    const cards = await screen.findAllByTestId("protocol-record");
    expect(cards.map((card) => card.getAttribute("data-protocol-id"))).toEqual(["standalone-new", "old"]);
    expect(screen.getByText("Standalone protocol")).toBeTruthy();
    expect(screen.getByText("Linked case: case-9")).toBeTruthy();
    expect(eqMock).toHaveBeenCalledWith("user_id", "owner-1");
    expect(statusEqMock).toHaveBeenCalledWith("status", "finalized");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(idOrderMock).toHaveBeenCalledWith("id", { ascending: true });
    expect(rangeMock).toHaveBeenCalledWith(0, 999);
  });

  it("loads every finalized page instead of silently stopping at the response limit", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      row({ id: `page-one-${index}`, created_at: `2026-08-12T08:${String(index % 60).padStart(2, "0")}:00.000Z` })
    );
    queryResults.push(
      Promise.resolve({ data: firstPage, error: null }),
      Promise.resolve({ data: [row({ id: "page-two-record", created_at: "2026-08-14T08:00:00.000Z" })], error: null }),
    );

    render(<ProtocolRegisterPage />);

    expect(await screen.findByText("page-two-record")).toBeTruthy();
    expect(rangeMock).toHaveBeenNthCalledWith(1, 0, 999);
    expect(rangeMock).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(await screen.findAllByTestId("protocol-record")).toHaveLength(1001);
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
    const ownerOne = deferred<{ data: Protocol[] | null; error: null }>();
    const ownerTwo = deferred<{ data: Protocol[] | null; error: null }>();
    queryResults.push(ownerOne.promise, ownerTwo.promise);
    const view = render(<ProtocolRegisterPage />);

    await act(async () => ownerOne.resolve({ data: [row({ id: "private-owner-1" })], error: null }));
    expect(await screen.findByText("private-owner-1")).toBeTruthy();

    currentUser = { id: "owner-2", email: "two@example.ch", name: "Two" };
    mocks.currentUser = currentUser;
    view.rerender(<ProtocolRegisterPage />);
    expect(screen.queryByText("private-owner-1")).toBeNull();

    await act(async () => ownerTwo.resolve({ data: [row({ id: "owner-2-row", user_id: "owner-2" })], error: null }));
    expect(await screen.findByText("owner-2-row")).toBeTruthy();
    expect(screen.queryByText("private-owner-1")).toBeNull();
    expect(eqMock).toHaveBeenCalledWith("user_id", "owner-2");
  });

  it("re-reads and generates the exact persisted record with deterministic filename and cleans the URL", async () => {
    queryResults.push(Promise.resolve({ data: [row({ id: "exact-record", project_name: "Cached project", case_id: null })], error: null }));
    downloadResults.push(Promise.resolve({ data: row({ id: "exact-record", project_name: "Fresh project", defect_description: "Fresh defect", case_id: null }), error: null }));
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
    expect(pdfElement.props.report).toMatchObject({ status: "finalized", linkedCaseId: null, signatureCaptured: true });
    await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:protocol");
    expect((clickMock.mock.instances[0] as HTMLAnchorElement).download).toBe("baucompliance-protocol-exact-record.pdf");
    expect(await screen.findByText("PDF downloaded.")).toBeTruthy();
  });

  it("suppresses synchronous duplicate downloads per record and supports retry after failure", async () => {
    const blob = deferred<Blob>();
    toBlobMock.mockReturnValueOnce(blob.promise).mockRejectedValueOnce(new Error("failed"));
    queryResults.push(Promise.resolve({ data: [row({ id: "locked" })], error: null }));
    downloadResults.push(
      Promise.resolve({ data: row({ id: "locked" }), error: null }),
      Promise.resolve({ data: row({ id: "locked" }), error: null }),
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
    queryResults.push(Promise.resolve({ data: [row({ id: "owner-one-pdf" })], error: null }), Promise.resolve({ data: [], error: null }));
    downloadResults.push(Promise.resolve({ data: row({ id: "owner-one-pdf" }), error: null }));
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
    queryResults.push(Promise.resolve({ data: [row({ id: "unmounted-pdf" })], error: null }));
    downloadResults.push(Promise.resolve({ data: row({ id: "unmounted-pdf" }), error: null }));
    const view = render(<ProtocolRegisterPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));

    view.unmount();
    await act(async () => blob.resolve(new Blob(["pdf"])));

    expect(clickMock).not.toHaveBeenCalled();
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it("does not generate a PDF when the persisted protocol is no longer finalized", async () => {
    queryResults.push(Promise.resolve({ data: [row({ id: "stale-finalized" })], error: null }));
    downloadResults.push(Promise.resolve({ data: null, error: { message: "not found" } }));
    render(<ProtocolRegisterPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));

    expect(await screen.findByText("PDF could not be created. Try again.")).toBeTruthy();
    expect(pdfMock).not.toHaveBeenCalled();
    expect(clickMock).not.toHaveBeenCalled();
  });
});
