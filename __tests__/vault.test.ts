import { describe, expect, it } from "vitest";
import { getVaultEmptyState } from "../lib/vault";

describe("getVaultEmptyState", () => {
  it("prefers a clear-search action when the current query yields no results", () => {
    const state = getVaultEmptyState({
      activeTab: "projects",
      query: "zurich",
    });

    expect(state.titleKey).toBe("vault-empty-search-title");
    expect(state.titleParams).toEqual({ query: "zurich" });
    expect(state.bodyKey).toBe("vault-empty-search-body-projects");
    expect(state.action).toBe("clear-search");
    expect(state.actionLabelKey).toBe("vault-empty-action-clear-search");
  });

  it("suggests switching back to active projects when archived is empty but active work exists", () => {
    const state = getVaultEmptyState({
      activeTab: "archived",
      query: "",
      hasActiveProjects: true,
    });

    expect(state.titleKey).toBe("vault-empty-archived-title");
    expect(state.titleParams).toBeUndefined();
    expect(state.bodyKey).toBe("vault-empty-archived-body");
    expect(state.action).toBe("show-projects");
    expect(state.actionLabelKey).toBe("vault-empty-action-show-projects");
  });

  it("suggests switching to archived projects when only archived evidence exists", () => {
    const state = getVaultEmptyState({
      activeTab: "projects",
      query: "",
      hasArchivedProjects: true,
    });

    expect(state.titleKey).toBe("vault-empty-projects-title");
    expect(state.titleParams).toBeUndefined();
    expect(state.bodyKey).toBe("vault-empty-projects-body");
    expect(state.action).toBe("show-archived");
    expect(state.actionLabelKey).toBe("vault-empty-action-show-archived");
  });

  it("avoids misleading tab-switch CTAs when there is no opposite tab content", () => {
    const archivedState = getVaultEmptyState({
      activeTab: "archived",
      query: "",
      hasActiveProjects: false,
    });

    expect(archivedState.bodyKey).toBe("vault-empty-archived-body-no-active");
    expect(archivedState.action).toBeNull();
    expect(archivedState.actionLabelKey).toBeNull();

    const projectsState = getVaultEmptyState({
      activeTab: "projects",
      query: "",
      hasArchivedProjects: false,
    });

    expect(projectsState.bodyKey).toBe("vault-empty-projects-body-no-archived");
    expect(projectsState.action).toBeNull();
    expect(projectsState.actionLabelKey).toBeNull();
  });
});
