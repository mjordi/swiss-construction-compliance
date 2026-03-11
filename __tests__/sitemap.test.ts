import { describe, it, expect } from "vitest";
import sitemap from "../app/sitemap";

describe("sitemap", () => {
  it("does not include internal dashboard routes", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls.some((url) => url.includes("/dashboard"))).toBe(false);
  });
});
