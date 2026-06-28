const DEFAULT_POST_LOGIN_REDIRECT = "/dashboard";

export function isSafeAppRedirect(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;

  try {
    const parsed = new URL(value, "https://baucompliance.local");
    return parsed.origin === "https://baucompliance.local";
  } catch {
    return false;
  }
}

export function buildLoginRedirectHref(pathname: string, search: string): string {
  const destination = `${pathname}${search ? `?${search}` : ""}`;
  const params = new URLSearchParams({ next: destination });
  return `/login?${params.toString()}`;
}

export function getPostLoginRedirect(search: string): string {
  const next = new URLSearchParams(search).get("next");
  return isSafeAppRedirect(next) ? next : DEFAULT_POST_LOGIN_REDIRECT;
}
