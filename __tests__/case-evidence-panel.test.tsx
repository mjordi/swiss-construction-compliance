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
const uploadMock = vi.fn();
const removeMock = vi.fn();
const insertMock = vi.fn();
const rpcMock = vi.fn();
const signedUrlMock = vi.fn();

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
    if (table === "case_evidence") {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ order: listMock }) }) }),
        insert: (payload: unknown) => {
          insertMock(payload);
          return { select: () => ({ single: () => insertMock.mock.results.at(-1)?.value }) };
        },
      };
    }
    throw new Error(`Unexpected table ${table}`);
  },
  rpc: rpcMock,
  storage: {
    from: () => ({ upload: uploadMock, remove: removeMock, createSignedUrl: signedUrlMock }),
  },
};

vi.mock("@/lib/supabase", () => ({ getSupabase: () => supabaseMock }));
vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

describe("CaseEvidencePanel", () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue({ data: [], error: null });
    uploadMock.mockReset().mockResolvedValue({ data: { path: evidence.storage_path }, error: null });
    removeMock.mockReset().mockResolvedValue({ data: null, error: null });
    insertMock.mockReset().mockReturnValue(Promise.resolve({ data: evidence, error: null }));
    rpcMock.mockReset().mockResolvedValue({ data: true, error: null });
    signedUrlMock.mockReset().mockResolvedValue({ data: { signedUrl: "https://signed.test/file" }, error: null });
  });

  it("lists lazily and renders the empty state", async () => {
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    expect(listMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));

    expect(await screen.findByText("vault-evidence-empty")).toBeTruthy();
    expect(listMock).toHaveBeenCalledTimes(1);
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
    expect(uploadMock).toHaveBeenCalledWith(expect.stringMatching(/^user-1\/case-1\/.+\.pdf$/), file, {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(rpcMock).toHaveBeenCalledWith("mark_case_evidence_attached", { target_case_id: "case-1" });
    expect(rpcMock.mock.calls[0][1]).toEqual({ target_case_id: "case-1" });
    expect(await screen.findByText("vault-evidence-upload-success")).toBeTruthy();
    expect(onChecklistUpdated).toHaveBeenCalledTimes(1);
  });

  it("removes the new object and skips checklist updates when metadata persistence fails", async () => {
    insertMock.mockReset().mockReturnValue(Promise.resolve({ data: null, error: { message: "metadata failed" } }));
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = await screen.findByLabelText("vault-evidence-file-label");

    fireEvent.change(input, { target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] } });

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith([expect.stringMatching(/^user-1\/case-1\/.+\.pdf$/)]));
    expect(rpcMock).not.toHaveBeenCalled();
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
    expect(rpcMock).not.toHaveBeenCalled();
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

  it("compensates the exact uploaded path when metadata insertion rejects", async () => {
    const metadataInsert = deferred<never>();
    insertMock.mockReset().mockReturnValue(metadataInsert.promise);
    render(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" />);
    fireEvent.click(screen.getByRole("button", { name: "vault-evidence-show" }));
    const input = await screen.findByLabelText("vault-evidence-file-label");

    fireEvent.change(input, { target: { files: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    await act(async () => metadataInsert.reject(new Error("metadata unavailable")));

    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
    const uploadedPath = uploadMock.mock.calls[0][0];
    expect(removeMock).toHaveBeenCalledWith([uploadedPath]);
    expect(rpcMock).not.toHaveBeenCalled();
    expect((await screen.findByRole("alert")).textContent).toContain("vault-evidence-upload-error");
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
    expect(rpcMock).not.toHaveBeenCalled();
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
    expect(rpcMock).not.toHaveBeenCalled();
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
    expect(uploadMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveUpload({ data: { path: evidence.storage_path }, error: null });
    });

    rerender(<CaseEvidencePanel userId="user-1" caseId="case-1" caseName="Alpine" readOnly />);
    expect(screen.queryByLabelText("vault-evidence-file-label")).toBeNull();
  });
});
