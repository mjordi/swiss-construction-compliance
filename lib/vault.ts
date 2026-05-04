import type { TranslationKey } from "@/locales";

export type VaultTab = "projects" | "archived";
export type VaultEmptyStateAction = "clear-search" | "show-projects" | "show-archived" | null;

export interface VaultEmptyState {
  titleKey: TranslationKey;
  titleParams?: Record<string, string>;
  bodyKey: TranslationKey;
  actionLabelKey: TranslationKey | null;
  action: VaultEmptyStateAction;
}

export interface VaultEmptyStateInput {
  activeTab: VaultTab;
  query: string;
  hasActiveProjects?: boolean;
  hasArchivedProjects?: boolean;
}

export function getVaultEmptyState({
  activeTab,
  query,
  hasActiveProjects = false,
  hasArchivedProjects = false,
}: VaultEmptyStateInput): VaultEmptyState {
  const normalizedQuery = query.trim();

  if (normalizedQuery) {
    return {
      titleKey: "vault-empty-search-title",
      titleParams: { query: normalizedQuery },
      bodyKey:
        activeTab === "archived"
          ? "vault-empty-search-body-archived"
          : "vault-empty-search-body-projects",
      actionLabelKey: "vault-empty-action-clear-search",
      action: "clear-search",
    };
  }

  if (activeTab === "archived") {
    return {
      titleKey: "vault-empty-archived-title",
      bodyKey: hasActiveProjects
        ? "vault-empty-archived-body"
        : "vault-empty-archived-body-no-active",
      actionLabelKey: hasActiveProjects
        ? "vault-empty-action-show-projects"
        : null,
      action: hasActiveProjects ? "show-projects" : null,
    };
  }

  return {
    titleKey: "vault-empty-projects-title",
    bodyKey: hasArchivedProjects
      ? "vault-empty-projects-body"
      : "vault-empty-projects-body-no-archived",
    actionLabelKey: hasArchivedProjects
      ? "vault-empty-action-show-archived"
      : null,
    action: hasArchivedProjects ? "show-archived" : null,
  };
}
