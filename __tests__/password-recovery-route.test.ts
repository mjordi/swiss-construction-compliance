import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getAll: vi.fn(() => []),
  get: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: mocks.getAll, get: mocks.get })),
}));

import { GET, POST } from "@/app/auth/recovery/route";

function confirmationRequest(confirmationId = "a".repeat(32)) {
  return new Request("https://baucompliance.ch/auth/recovery", {
    method: "POST",
    body: new URLSearchParams({ confirmation_id: confirmationId }),
  });
}

describe("password recovery callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    mocks.get.mockReturnValue({ value: "emailed-token" });
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.createServerClient.mockReturnValue({
      auth: { verifyOtp: mocks.verifyOtp },
    });
  });

  it("defers verification on GET and forwards to a user-confirmation page", async () => {
    const response = await GET(
      new Request(
        "https://baucompliance.ch/auth/recovery?token_hash=emailed-token&type=recovery"
      )
    );

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    const location = new URL(response.headers.get("location")!);
    const confirmationId = location.searchParams.get("confirmation_id");
    expect(location.pathname).toBe("/auth/recovery/confirm");
    expect(confirmationId).toMatch(/^[a-f0-9]{32}$/);
    expect(response.headers.get("set-cookie")).toContain(
      `baucompliance-recovery-token-${confirmationId}=emailed-token`
    );
  });

  it("keeps simultaneous confirmation pages bound to their own recovery tokens", async () => {
    const firstGet = await GET(
      new Request(
        "https://baucompliance.ch/auth/recovery?token_hash=first-token&type=recovery"
      )
    );
    const secondGet = await GET(
      new Request(
        "https://baucompliance.ch/auth/recovery?token_hash=second-token&type=recovery"
      )
    );
    const firstId = new URL(firstGet.headers.get("location")!).searchParams.get(
      "confirmation_id"
    )!;
    const secondId = new URL(secondGet.headers.get("location")!).searchParams.get(
      "confirmation_id"
    )!;
    const tokens = new Map([
      [`baucompliance-recovery-token-${firstId}`, { value: "first-token" }],
      [`baucompliance-recovery-token-${secondId}`, { value: "second-token" }],
    ]);
    mocks.get.mockImplementation((name: string) => tokens.get(name));

    await POST(confirmationRequest(firstId));
    await POST(confirmationRequest(secondId));

    expect(firstId).not.toBe(secondId);
    expect(mocks.verifyOtp).toHaveBeenNthCalledWith(1, {
      token_hash: "first-token",
      type: "recovery",
    });
    expect(mocks.verifyOtp).toHaveBeenNthCalledWith(2, {
      token_hash: "second-token",
      type: "recovery",
    });
  });

  it("verifies the recovery token only after the confirmation form is submitted", async () => {
    const response = await POST(confirmationRequest());

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
      expect.objectContaining({ cookies: expect.any(Object) })
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "emailed-token",
      type: "recovery",
    });
    expect(response.headers.get("location")).toBe(
      "https://baucompliance.ch/dashboard/settings?recovery=1"
    );
  });

  it("rejects callbacks that do not contain a recovery token", async () => {
    const response = await GET(
      new Request("https://baucompliance.ch/auth/recovery?code=pkce-code")
    );

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://baucompliance.ch/login?recovery_error=1"
    );
  });

  it("rejects confirmation posts when the short-lived recovery cookie is missing", async () => {
    mocks.get.mockReturnValueOnce(undefined);

    const response = await POST(confirmationRequest());

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://baucompliance.ch/login?recovery_error=1"
    );
  });

  it("returns to login when confirmed token verification fails", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ error: { message: "expired" } });

    const response = await POST(confirmationRequest());

    expect(response.headers.get("location")).toBe(
      "https://baucompliance.ch/login?recovery_error=1"
    );
  });

  it("returns to login when confirmed token verification throws", async () => {
    mocks.verifyOtp.mockRejectedValueOnce(new Error("network details"));

    const response = await POST(confirmationRequest());

    expect(response.headers.get("location")).toBe(
      "https://baucompliance.ch/login?recovery_error=1"
    );
  });
});
