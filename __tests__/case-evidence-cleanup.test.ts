import { describe, expect, it, vi } from "vitest";
import { removeCaseEvidenceObjects, type CaseEvidenceStorageClient } from "@/lib/case-evidence-cleanup";

describe("removeCaseEvidenceObjects", () => {
  it("lists every page and removes all case evidence before case deletion", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ name: `evidence-${index}.pdf` }));
    const secondPage = [{ name: "evidence-100.png" }];
    const list = vi.fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: secondPage, error: null });
    const remove = vi.fn().mockResolvedValue({ data: null, error: null });

    const storage = { from: vi.fn(() => ({ list, remove })) } as CaseEvidenceStorageClient;
    await removeCaseEvidenceObjects(storage, "user-1", "case-1");

    expect(storage.from).toHaveBeenCalledWith("case-evidence");
    expect(list).toHaveBeenNthCalledWith(1, "user-1/case-1", { limit: 100, offset: 0 });
    expect(list).toHaveBeenNthCalledWith(2, "user-1/case-1", { limit: 100, offset: 100 });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls[0][0]).toHaveLength(100);
    expect(remove.mock.calls[0][0][0]).toBe("user-1/case-1/evidence-0.pdf");
    expect(remove.mock.calls[1][0]).toEqual(["user-1/case-1/evidence-100.png"]);
  });

  it("stops before case deletion when evidence listing fails", async () => {
    const listError = new Error("storage list failed");
    const bucket = {
      list: vi.fn().mockResolvedValue({ data: null, error: listError }),
      remove: vi.fn(),
    };
    const storage = { from: vi.fn(() => bucket) } as CaseEvidenceStorageClient;

    await expect(removeCaseEvidenceObjects(storage, "user-1", "case-1")).rejects.toBe(listError);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("reports removal failures instead of allowing metadata paths to cascade", async () => {
    const removeError = new Error("storage remove failed");
    const bucket = {
      list: vi.fn().mockResolvedValue({ data: [{ name: "report.pdf" }], error: null }),
      remove: vi.fn().mockResolvedValue({ data: null, error: removeError }),
    };
    const storage = { from: vi.fn(() => bucket) } as CaseEvidenceStorageClient;

    await expect(removeCaseEvidenceObjects(storage, "user-1", "case-1")).rejects.toBe(removeError);
  });
});
