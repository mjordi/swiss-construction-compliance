export type VaultTab = "projects" | "archived";
export type VaultEmptyStateAction = "clear-search" | "show-projects" | "show-archived" | null;

export interface VaultEmptyState {
  title: string;
  body: string;
  actionLabel: string | null;
  action: VaultEmptyStateAction;
}

export interface VaultEmptyStateInput {
  activeTab: VaultTab;
  query: string;
}

export function getVaultEmptyState({
  activeTab,
  query,
}: VaultEmptyStateInput): VaultEmptyState {
  const normalizedQuery = query.trim();

  if (normalizedQuery) {
    return {
      title: `No vault results for “${normalizedQuery}”`,
      body:
        activeTab === "archived"
          ? "Try a different project name or clear the search to review archived evidence again."
          : "Try a different project name or clear the search to get back to your active evidence projects.",
      actionLabel: "Clear search",
      action: "clear-search",
    };
  }

  if (activeTab === "archived") {
    return {
      title: "No archived projects yet",
      body: "Archive a project later, or jump back to active projects now to review live evidence.",
      actionLabel: "View active projects",
      action: "show-projects",
    };
  }

  return {
    title: "No active projects yet",
    body: "Switch to archived projects to review older records, or create a new project to start storing evidence here.",
    actionLabel: "View archived projects",
    action: "show-archived",
  };
}
