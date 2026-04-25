import { describe, expect, it } from "vitest";
import { getVaultEmptyState } from "../lib/vault";

describe("getVaultEmptyState", () => {
  it("prefers a clear-search action when the current query yields no results", () => {
    const state = getVaultEmptyState({
      activeTab: "projects",
      query: "zurich",
    });

    expect(state.title).toContain("zurich");
    expect(state.action).toBe("clear-search");
    expect(state.actionLabel).toBe("Clear search");
  });

  it("suggests switching back to active projects when archived is empty but active work exists", () => {
    const state = getVaultEmptyState({
      activeTab: "archived",
      query: "",
    });

    expect(state.title).toBe("No archived projects yet");
    expect(state.action).toBe("show-projects");
    expect(state.actionLabel).toBe("View active projects");
  });

  it("suggests switching to archived projects when only archived evidence exists", () => {
    const state = getVaultEmptyState({
      activeTab: "projects",
      query: "",
    });

    expect(state.title).toBe("No active projects yet");
    expect(state.action).toBe("show-archived");
    expect(state.actionLabel).toBe("View archived projects");
  });
});
