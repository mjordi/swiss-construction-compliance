import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CaseEvidencePanel from "@/components/dashboard/CaseEvidencePanel";

const evidence = {
  id: "evidence-1",
  user_id: "user-1",
  case_id: "case-1",
  storage_path: "user-1/case-1/evidence-1.pdf",
  original_name: "report.pdf",
  mime_type: "application/pdf",
  size_bytes: 12,
  created_at: "2026-08-01T10:00:00.000Z",
};

const listMock = vi.fn();
const activityListMock = vi.fn();
const uploadMock = vi.fn();
const storageListMock = vi.fn();
const removeMock = vi.fn();
const insertMock = vi.fn();
const lookupMock = vi.fn();
const pendingUploadsMock = vi.fn();
const uploadJobInsertMock = vi.fn();
const uploadJobDeleteMock = vi.fn();
const rpcMock = vi.fn();
const signedUrlMock = vi.fn();

const activity = {
  id: "activity-1",
  user_id: "user-1",
  case_id: "case-1",
  evidence_id: evidence.id,
  event_type: "evidence_uploaded" as const,
  source_name: evidence.original_name,
  source_mime_type: evidence.mime_type,
  source_size_bytes: evidence.size_bytes,
  occurred_at: evidence.created_at,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const supabaseMock = {
  from: (table: string) => {
    if (table === "case_evidence_upload_jobs") {
      return {
        select: () => ({ eq: () => ({ eq: pendingUploadsMock }) }),
        insert: uploadJobInsertMock,
        delete: () => ({ eq: uploadJobDeleteMock }),
      };
    }
    if (table === "case_evidence") {
      return {
        select: () => ({
          eq: (column: string) => column === "storage_path"
            ? { maybeSingle: lookupMock }
            : { eq: () => ({ order: listMock }) },
        }),
        insert: (payload: unknown) => {
          insertMock(payload);
          return { select: () => ({ single: () => insertMock.mock.results.at(-1)?.value }) };
        },
      };
    }
    if (table === "case_activity_events") {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ order: activityListMock }) }) }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  },
  rpc: rpcMock,
  storage: {
    from: () => ({ upload: uploadMock, list: storageListMock, remove: removeMock, createSignedUrl: signedUrlMock }),
  },
};

vi.mock("@/lib/supabase", () => ({ getSupabase: () => supabaseMock }));
vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ lang: "en", t: (key: string) => key }),
}));

describe("CaseEvidencePanel", () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue({ data: [], error: null });
    activityListMock.mockReset().mockResolvedValue({ data: [], error: null });
    uploadMock.mockReset().mockResolvedValue({ data: { path: evidence.storage_path }, error: null });
    storageListMock.mockReset().mockResolvedValue({ data: [], error: null });
    removeMock.mockReset().mockResolvedValue({ data: null, error: null });
    insertMock.mockReset().mockReturnValue(Promise.resolve({ data: evidence, error: null }));
    lookupMock.mockReset().mockResolvedValue({ data: null, error: null });
    pendingUploadsMock.mockReset().mockResolvedValue({ data: [], error: null });
    uploadJobInsertMock.mockReset().mockResolvedValue({ data: null, error: null });
    uploadJobDeleteMock.mockReset().mockResolvedValue({ data: null, error: null });
    rpcMock.mockReset().mockResolvedValue({ data: true, error: null });
    signedUrlMock.mockReset().mockResolvedValue({ data: { signedUrl: "https://signed.test/file" }, error: null });
  });

  it("lists lazily and renders the empty state", async () => {
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    expect(listMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));

    expect(await screen.findByText("vault-evidence-empty")).toBeTruthy();
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(activityListMock).toHaveBeenCalledTimes(1);
  });

  it("shows trigger-recorded evidence activity with its source name and server timestamp", async () => {
    listMock.mockResolvedValue({ data: [evidence], error: null });
    activityListMock.mockResolvedValue({ data: [activity], error: null });
    const { container } = render(
      <CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />
    );

    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));

    const activityRegion = await screen.findByRole("region", { name: "vault-evidence-activity-title" });
    expect(activityRegion.textContent).toContain("vault-evidence-activity-uploaded");
    expect(activityRegion.textContent).toContain("report.pdf");
    expect(container.querySelector(`time[datetime="${activity.occurred_at}"]`)).toBeTruthy();
  });

  it("does not block the evidence file list while activity is still loading", async () => {
    const pendingActivity = deferred<{ data: (typeof activity)[]; error: null }>();
    listMock.mockResolvedValue({ data: [evidence], error: null });
    activityListMock.mockReturnValue(pendingActivity.promise);
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);

    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));

    expect(await screen.findByRole("button", { name: "vault-evidence-download report.pdf" })).toBeTruthy();
    expect(screen.getByText("vault-evidence-activity-loading")).toBeTruthy();
    await act(async () => pendingActivity.resolve({ data: [activity], error: null }));
  });

  it("refreshes activity after upload without leaving a superseded load spinning", async () => {
    const pendingActivity = deferred<{ data: (typeof activity)[]; error: null }>();
    const pendingActivityRefresh = deferred<{ data: (typeof activity)[]; error: null }>();
    const uploadedActivity = {
      ...activity,
      id: "activity-2",
      source_name: "uploaded.pdf",
      occurred_at: "2026-08-04T07:30:00.000Z",
    };
    activityListMock
      .mockReturnValueOnce(pendingActivity.promise)
      .mockReturnValueOnce(pendingActivityRefresh.promise);
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);

    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = await screen.findByLabelText("vault-evidence-file-label");
    await waitFor(() => expect(activityListMock).toHaveBeenCalledTimes(1));

    fireEvent.change(input, {
      target: { files: [new File(["pdf"], "uploaded.pdf", { type: "application/pdf" })] },
    });

    expect(await screen.findByText("vault-evidence-upload-success")).toBeTruthy();
    expect(activityListMock).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText("vault-evidence-file-label") as HTMLInputElement).disabled).toBe(false);
    expect(uploadJobDeleteMock).toHaveBeenCalled();
    expect(screen.getByText("vault-evidence-activity-loading")).toBeTruthy();

    await act(async () => pendingActivityRefresh.resolve({ data: [uploadedActivity], error: null }));
    const activityRegion = screen.getByRole("region", { name: "vault-evidence-activity-title" });
    expect(activityRegion.textContent).toContain("uploaded.pdf");
    expect(screen.queryByText("vault-evidence-activity-loading")).toBeNull();

    await act(async () => pendingActivity.resolve({ data: [activity], error: null }));
    expect(activityRegion.textContent).toContain("uploaded.pdf");
  });

  it("keeps the evidence list usable when activity loading fails", async () => {
    listMock.mockResolvedValue({ data: [evidence], error: null });
    activityListMock.mockResolvedValue({ data: null, error: { message: "activity failed" } });
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);

    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));

    expect(await screen.findByRole("button", { name: "vault-evidence-download report.pdf" })).toBeTruthy();
    expect(screen.getByText("vault-evidence-activity-error")).toBeTruthy();
    expect(screen.queryByText("vault-evidence-list-error")).toBeNull();
  });

  it("ignores activity returned for an old case context", async () => {
    const oldActivity = deferred<{ data: (typeof activity)[]; error: null }>();
    activityListMock
      .mockReturnValueOnce(oldActivity.promise)
      .mockResolvedValueOnce({ data: [], error: null });
    const { rerender } = render(
      <CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />
    );
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    await waitFor(() => expect(activityListMock).toHaveBeenCalledTimes(1));

    rerender(<CaseEvidencePanel userId="user-1" caseId="case-2" caseName="Bern" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    await waitFor(() => expect(activityListMock).toHaveBeenCalledTimes(2));
    await act(async () => oldActivity.resolve({ data: [activity], error: null }));

    expect(screen.queryByText("report.pdf")).toBeNull();
  });

  it("does not claim the evidence list is empty when loading fails", async () => {
    listMock.mockResolvedValue({ data: null, error: { message: "list failed" } });
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);

    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-list-error");
    expect(screen.queryByText("vault-evidence-empty")).toBeNull();
  });

  it("validates selected files before upload", async () => {
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = await screen.findByLabelText("vault-evidence-file-label");

    fireEvent.change(input, { target: { files: [new File(["bad"], "bad.txt", { type: "text/plain" })] } });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-validation-type");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("blocks upload synchronously until a pending evidence list resolves", async () => {
    const pendingList = deferred<{ data: (typeof evidence)[]; error: null }>();
    listMock.mockReturnValue(pendingList.promise);
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = screen.getByLabelText("vault-evidence-file-label") as HTMLInputElement;
    expect(input.disabled).toBe(true);

    fireEvent.change(input, { target: { files: [new File(["pdf"], "blocked.pdf", { type: "application/pdf" })] } });
    expect(uploadMock).not.toHaveBeenCalled();

    await act(async () => pendingList.resolve({ data: [], error: null }));
    await waitFor(() => expect(input.disabled).toBe(false));
    fireEvent.change(input, { target: { files: [new File(["pdf"], "allowed.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
  });

  it("uploads, persists metadata, and atomically marks evidence attached only after both succeed", async () => {
    listMock.mockResolvedValue({ data: [evidence], error: null });
    const onChecklistUpdated = vi.fn();
    render(
      <CaseEvidencePanel
        userId="user-1"
        caseId="case-1"
        caseName="Alpine"
        onChecklistUpdated={onChecklistUpdated}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = await screen.findByLabelText("vault-evidence-file-label");
    const file = new File(["pdf"], "report.weird", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(uploadJobInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      storage_path: uploadMock.mock.calls[0][0],
      user_id: "user-1",
      case_id: "case-1",
      original_name: "report.weird",
    }));
    expect(uploadJobInsertMock.mock.invocationCallOrder[0]).toBeLessThan(uploadMock.mock.invocationCallOrder[0]);
    expect(uploadMock).toHaveBeenCalledWith(expect.stringMatching(/^user-1\/case-1\/.+\.pdf$/), file, {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(rpcMock).toHaveBeenCalledWith("mark_case_evidence_attached", { target_case_id: "case-1" });
    expect(rpcMock).toHaveBeenCalledWith("mark_case_evidence_upload_completed", {
      target_storage_path: uploadMock.mock.calls[0][0],
    });
    expect(await screen.findByText("vault-evidence-upload-success")).toBeTruthy();
    expect(onChecklistUpdated).toHaveBeenCalledTimes(1);
  });

  it("continues metadata persistence when a rejected upload is found at its generated path", async () => {
    uploadMock.mockRejectedValue(new Error("upload response lost"));
    storageListMock.mockImplementation((_folder: string, options: { search: string }) => Promise.resolve({
      data: [{ name: options.search }],
      error: null,
    }));
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] },
    });

    expect(await screen.findByText("vault-evidence-upload-success")).toBeTruthy();
    const storagePath = uploadMock.mock.calls[0][0] as string;
    expect(storageListMock).toHaveBeenCalledWith("user-1/case-1", {
      limit: 100,
      search: storagePath.split("/").pop(),
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(removeMock).not.toHaveBeenCalled();
    expect(rpcMock.mock.calls.filter(([name]) => name === "mark_case_evidence_attached")).toHaveLength(1);
  });

  it("records the generated path when a rejected upload remains ambiguous after bounded lookups", async () => {
    uploadMock.mockRejectedValue(new Error("upload response lost"));
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] },
    });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-persistence-unknown");
    expect(storageListMock).toHaveBeenCalledTimes(3);
    expect(removeMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(uploadJobInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      storage_path: uploadMock.mock.calls[0][0],
      original_name: "report.pdf",
    }));
    expect(uploadJobDeleteMock).not.toHaveBeenCalled();
    expect(rpcMock.mock.calls.some(([name]) => name === "mark_case_evidence_upload_completed")).toBe(false);
  });

  it("reconciles a returned StorageUnknownError without retiring the upload job", async () => {
    uploadMock.mockResolvedValue({
      data: null,
      error: { name: "StorageUnknownError", message: "upload response lost" },
    });
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] },
    });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-persistence-unknown");
    expect(storageListMock).toHaveBeenCalledTimes(3);
    expect(insertMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
    expect(uploadJobDeleteMock).not.toHaveBeenCalled();
  });

  it("reconciles pending upload paths and refreshes the parent checklist before listing evidence", async () => {
    pendingUploadsMock.mockResolvedValue({ data: [{ storage_path: evidence.storage_path }], error: null });
    const onChecklistUpdated = vi.fn();
    render(
      <CaseEvidencePanel
        userId="user-1"
        caseId="case-1"
        caseName="Alpine"
        onChecklistUpdated={onChecklistUpdated}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));

    await screen.findByText("vault-evidence-empty");
    expect(rpcMock).toHaveBeenCalledWith("reconcile_case_evidence_uploads", { target_case_id: "case-1" });
    expect(rpcMock.mock.invocationCallOrder[0]).toBeLessThan(listMock.mock.invocationCallOrder[0]);
    expect(onChecklistUpdated).toHaveBeenCalledTimes(1);
  });

  it("removes the new object and skips checklist updates when metadata persistence fails", async () => {
    insertMock.mockReset().mockReturnValue(Promise.resolve({ data: null, error: { message: "metadata failed" } }));
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = await screen.findByLabelText("vault-evidence-file-label");

    fireEvent.change(input, { target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] } });

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith([expect.stringMatching(/^user-1\/case-1\/.+\.pdf$/)]));
    expect(rpcMock.mock.calls.some(([name]) => name === "mark_case_evidence_attached")).toBe(false);
    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-upload-error");
  });

  it("compensates when metadata persistence returns no row", async () => {
    insertMock.mockReset().mockReturnValue(Promise.resolve({ data: null, error: null }));
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith([uploadMock.mock.calls[0][0]]));
    expect(rpcMock.mock.calls.some(([name]) => name === "mark_case_evidence_attached")).toBe(false);
    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-upload-error");
  });

  it("keeps persisted evidence and reports a checklist warning when the RPC returns an error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "sync failed" } });
    const onChecklistUpdated = vi.fn();
    render(
      <CaseEvidencePanel
        userId="user-1"
        caseId="case-1"
        caseName="Alpine"
        onChecklistUpdated={onChecklistUpdated}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = await screen.findByLabelText("vault-evidence-file-label");
    fireEvent.change(input, { target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] } });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-checklist-warning");
    expect(removeMock).not.toHaveBeenCalled();
    expect(uploadJobDeleteMock).not.toHaveBeenCalled();
    expect(onChecklistUpdated).not.toHaveBeenCalled();
  });

  it("reports a checklist warning when the atomic checklist RPC rejects", async () => {
    rpcMock.mockRejectedValue(new Error("rpc unavailable"));
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] },
    });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-checklist-warning");
    expect(removeMock).not.toHaveBeenCalled();
  });

  it.each([false, null, undefined])("reports a checklist warning when the RPC confirmation is %s", async (confirmation) => {
    rpcMock.mockResolvedValue({ data: confirmation, error: null });
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] },
    });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-checklist-warning");
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("retrieves evidence with a 60-second signed URL", async () => {
    listMock.mockResolvedValue({ data: [evidence], error: null });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));

    fireEvent.click(await screen.findByRole("button", { name: "vault-evidence-download report.pdf" }));

    await waitFor(() => expect(signedUrlMock).toHaveBeenCalledWith(evidence.storage_path, 60, { download: "report.pdf" }));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("records the uploaded object after bounded reconciliation misses on an ambiguous insert rejection", async () => {
    const metadataInsert = deferred<never>();
    insertMock.mockReset().mockReturnValue(metadataInsert.promise);
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = await screen.findByLabelText("vault-evidence-file-label");

    fireEvent.change(input, { target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    await act(async () => metadataInsert.reject(new Error("metadata unavailable")));

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-persistence-unknown");
    expect(lookupMock).toHaveBeenCalledTimes(3);
    expect(removeMock).not.toHaveBeenCalled();
    expect(uploadJobInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      storage_path: uploadMock.mock.calls[0][0],
      original_name: "report.pdf",
    }));
    expect(uploadJobDeleteMock).not.toHaveBeenCalled();
  });

  it("retries reconciliation for a returned metadata transport error", async () => {
    insertMock.mockReset().mockReturnValue(Promise.resolve({
      data: null,
      error: { message: "fetch failed" },
      status: 0,
    }));
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] },
    });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-persistence-unknown");
    expect(lookupMock).toHaveBeenCalledTimes(3);
    expect(removeMock).not.toHaveBeenCalled();
    expect(uploadJobDeleteMock).not.toHaveBeenCalled();
  });

  it("retries reconciliation until delayed metadata appears after an ambiguous insert rejection", async () => {
    insertMock.mockReset().mockImplementation(() => Promise.reject(new Error("response lost")));
    lookupMock
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: evidence, error: null });
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] },
    });

    expect(await screen.findByText("vault-evidence-upload-success")).toBeTruthy();
    expect(lookupMock).toHaveBeenCalledTimes(3);
    expect(removeMock).not.toHaveBeenCalled();
    expect(rpcMock.mock.calls.filter(([name]) => name === "mark_case_evidence_attached")).toHaveLength(1);
  });

  it("does not delete the object when metadata reconciliation also fails", async () => {
    insertMock.mockReset().mockImplementation(() => Promise.reject(new Error("response lost")));
    lookupMock.mockResolvedValue({ data: null, error: { message: "lookup failed" } });
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] },
    });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-persistence-unknown");
    expect(removeMock).not.toHaveBeenCalled();
    expect(uploadJobInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      storage_path: uploadMock.mock.calls[0][0],
    }));
    expect(uploadJobDeleteMock).not.toHaveBeenCalled();
  });

  it("retries a returned compensation error and reports the metadata upload failure after cleanup succeeds", async () => {
    insertMock.mockReset().mockReturnValue(Promise.resolve({ data: null, error: { message: "metadata failed" } }));
    removeMock
      .mockResolvedValueOnce({ data: null, error: { message: "remove failed" } })
      .mockResolvedValueOnce({ data: null, error: null });
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] },
    });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-upload-error");
    expect(removeMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls.some(([name]) => name === "mark_case_evidence_attached")).toBe(false);
  });

  it("reports a distinct cleanup warning after two failed compensation attempts", async () => {
    insertMock.mockReset().mockReturnValue(Promise.resolve({ data: null, error: { message: "metadata failed" } }));
    removeMock
      .mockResolvedValueOnce({ data: null, error: { message: "remove failed" } })
      .mockRejectedValueOnce(new Error("remove rejected"));
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = await screen.findByLabelText("vault-evidence-file-label");

    fireEvent.change(input, { target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] } });

    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-cleanup-warning");
    expect(removeMock).toHaveBeenCalledTimes(2);
    expect(uploadJobInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      storage_path: uploadMock.mock.calls[0][0],
      original_name: "report.pdf",
    }));
    expect(uploadJobDeleteMock).not.toHaveBeenCalled();
  });

  it("does not publish old upload success or clear a new upload after case changes", async () => {
    const oldChecklistUpdate = deferred<{ data: true; error: null }>();
    const newUpload = deferred<{ data: { path: string }; error: null }>();
    rpcMock.mockReturnValueOnce(oldChecklistUpdate.promise);
    uploadMock.mockResolvedValueOnce({ data: { path: evidence.storage_path }, error: null });
    uploadMock.mockReturnValueOnce(newUpload.promise);
    const { rerender } = render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["old"], "old.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    rerender(<CaseEvidencePanel userId="user-1" caseId="case-2" caseName="Bern" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["new"], "new.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));

    await act(async () => oldChecklistUpdate.resolve({ data: true, error: null }));

    expect(screen.queryByText("vault-evidence-upload-success")).toBeNull();
    expect(screen.getByText("vault-evidence-uploading")).toBeTruthy();
    await act(async () => newUpload.resolve({ data: { path: "user-1/case-2/new.pdf" }, error: null }));
  });

  it("does not publish old upload errors or clear a new upload after user changes", async () => {
    const oldUpload = deferred<{ data: null; error: null }>();
    const newUpload = deferred<{ data: { path: string }; error: null }>();
    uploadMock.mockReturnValueOnce(oldUpload.promise);
    uploadMock.mockReturnValueOnce(newUpload.promise);
    const { rerender } = render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["old"], "old.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    rerender(<CaseEvidencePanel userId="user-2" caseId="case-2" caseName="Bern" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.change(await screen.findByLabelText("vault-evidence-file-label"), {
      target: { files: [new File(["new"], "new.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));

    await act(async () => oldUpload.reject(new Error("old upload failed")));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("vault-evidence-uploading")).toBeTruthy();
    await act(async () => newUpload.resolve({ data: { path: "user-2/case-2/new.pdf" }, error: null }));
  });

  it("ignores an old signed URL completion without clicking or clearing new download state", async () => {
    const oldSignedUrl = deferred<{ data: { signedUrl: string }; error: null }>();
    const newSignedUrl = deferred<{ data: { signedUrl: string }; error: null }>();
    listMock.mockResolvedValue({ data: [evidence], error: null });
    signedUrlMock.mockReturnValueOnce(oldSignedUrl.promise);
    signedUrlMock.mockReturnValueOnce(newSignedUrl.promise);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { rerender } = render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.click(await screen.findByRole("button", { name: "vault-evidence-download report.pdf" }));
    await waitFor(() => expect(signedUrlMock).toHaveBeenCalledTimes(1));

    rerender(<CaseEvidencePanel userId="user-2" caseId="case-2" caseName="Bern" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const newDownloadButton = await screen.findByRole("button", { name: "vault-evidence-download report.pdf" });
    fireEvent.click(newDownloadButton);
    await waitFor(() => expect(signedUrlMock).toHaveBeenCalledTimes(2));

    await act(async () => oldSignedUrl.resolve({ data: { signedUrl: "https://signed.test/old" }, error: null }));

    expect(clickSpy).not.toHaveBeenCalled();
    expect((newDownloadButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => newSignedUrl.resolve({ data: { signedUrl: "https://signed.test/new" }, error: null }));
    clickSpy.mockRestore();
  });

  it("does not publish an old signed URL error after context changes", async () => {
    const oldSignedUrl = deferred<never>();
    listMock.mockResolvedValue({ data: [evidence], error: null });
    signedUrlMock.mockReturnValueOnce(oldSignedUrl.promise);
    const { rerender } = render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    fireEvent.click(await screen.findByRole("button", { name: "vault-evidence-download report.pdf" }));
    await waitFor(() => expect(signedUrlMock).toHaveBeenCalledTimes(1));

    rerender(<CaseEvidencePanel userId="user-2" caseId="case-2" caseName="Bern" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    await screen.findByRole("button", { name: "vault-evidence-download report.pdf" });
    await act(async () => oldSignedUrl.reject(new Error("old signed URL failed")));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("blocks duplicate uploads synchronously and hides upload controls in read-only mode", async () => {
    let resolveUpload!: (value: unknown) => void;
    uploadMock.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
    const { rerender } = render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = await screen.findByLabelText("vault-evidence-file-label");
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveUpload({ data: { path: evidence.storage_path }, error: null });
    });

    rerender(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" readOnly />);
    expect(screen.queryByLabelText("vault-evidence-file-label")).toBeNull();
  });
});
