import { describe, expect, it } from "vitest";

import { buildLoginRedirectHref, getPostLoginRedirect } from "@/lib/auth-redirect";

describe("auth redirect handoff", () => {
  it("carries protected dashboard query params into login next", () => {
    expect(
      buildLoginRedirectHref(
        "/dashboard/cases",
        "contract=2026-02-01&discovery=2026-03-01&from=calc"
      )
    ).toBe(
      "/login?next=%2Fdashboard%2Fcases%3Fcontract%3D2026-02-01%26discovery%3D2026-03-01%26from%3Dcalc"
    );
  });

  it("returns a same-app next destination after successful login", () => {
    expect(
      getPostLoginRedirect(
        "?next=%2Fdashboard%2Fcases%3Fcontract%3D2026-02-01%26discovery%3D2026-03-01%26from%3Dcalc"
      )
    ).toBe("/dashboard/cases?contract=2026-02-01&discovery=2026-03-01&from=calc");
  });

  it("falls back to the dashboard for unsafe or missing next destinations", () => {
    expect(getPostLoginRedirect("")).toBe("/dashboard");
    expect(getPostLoginRedirect("?next=https%3A%2F%2Fevil.example%2Fdashboard")).toBe("/dashboard");
    expect(getPostLoginRedirect("?next=%2F%2Fevil.example%2Fdashboard")).toBe("/dashboard");
  });
});
