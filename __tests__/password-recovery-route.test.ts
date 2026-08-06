import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getAll: vi.fn(() => []),
  verifyOtp: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: mocks.getAll })),
}));

import { GET } from "@/app/auth/recovery/route";

describe("password recovery callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.createServerClient.mockReturnValue({
      auth: { verifyOtp: mocks.verifyOtp },
    });
  });

  it("verifies the emailed recovery token server-side and forwards to Settings", async () => {
    const response = await GET(
      new Request(
        "https://baucompliance.ch/auth/recovery?token_hash=emailed-token&type=recovery"
      )
    );

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

  it("returns to login when token verification fails", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ error: { message: "expired" } });

    const response = await GET(
      new Request(
        "https://baucompliance.ch/auth/recovery?token_hash=expired-token&type=recovery"
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://baucompliance.ch/login?recovery_error=1"
    );
  });

  it("returns to login when token verification throws", async () => {
    mocks.verifyOtp.mockRejectedValueOnce(new Error("network details"));

    const response = await GET(
      new Request(
        "https://baucompliance.ch/auth/recovery?token_hash=emailed-token&type=recovery"
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://baucompliance.ch/login?recovery_error=1"
    );
  });
});
