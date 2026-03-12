import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("root metadata source", () => {
  it("does not include rm-CH hreflang alternate", () => {
    const layoutSource = readFileSync(resolve("app/layout.tsx"), "utf8");

    expect(layoutSource).not.toContain('"rm-CH": "/?lang=rm"');
    expect(layoutSource).not.toContain('"rm_CH"');
  });
});
