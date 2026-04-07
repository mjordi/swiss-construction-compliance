export const ATTRIBUTION_STORAGE_KEY = "baucompliance.attribution";

export type MarketingAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  ref?: string;
  landing_path?: string;
  first_seen_at?: string;
};

const ATTRIBUTION_QUERY_KEYS: Array<keyof MarketingAttribution> = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
];

function hasAnyAttribution(params: URLSearchParams): boolean {
  return ATTRIBUTION_QUERY_KEYS.some((key) => Boolean(params.get(key)));
}

export function buildPreservedHref(
  targetPath: string,
  search: string,
  keysToKeep: string[] = ["lang", ...ATTRIBUTION_QUERY_KEYS]
): string {
  const source = new URLSearchParams(search);
  const next = new URLSearchParams();

  keysToKeep.forEach((key) => {
    const value = source.get(key);
    if (value) next.set(key, value);
  });

  const qs = next.toString();
  return qs ? `${targetPath}?${qs}` : targetPath;
}

export function captureMarketingAttributionFromLocation(): MarketingAttribution | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  if (!hasAnyAttribution(params)) return null;

  const payload: MarketingAttribution = {
    landing_path: window.location.pathname,
    first_seen_at: new Date().toISOString(),
  };

  ATTRIBUTION_QUERY_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) payload[key] = value;
  });

  window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

export function getStoredMarketingAttribution(): MarketingAttribution | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as MarketingAttribution;
  } catch {
    return null;
  }
}
