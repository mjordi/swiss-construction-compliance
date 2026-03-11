import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("root metadata source", () => {
  it("contains rm-CH hreflang alternate", () => {
    const layoutSource = readFileSync(resolve("app/layout.tsx"), "utf8");

    expect(layoutSource).toContain('"rm-CH": "/?lang=rm"');
  });
});
