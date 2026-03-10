import { MetadataRoute } from "next";

const BASE_URL = "https://baucompliance.ch";

const staticRoutes = [
  { path: "/", priority: 1.0, changeFreq: "weekly" as const },
  { path: "/login", priority: 0.8, changeFreq: "monthly" as const },
  { path: "/dashboard", priority: 0.7, changeFreq: "weekly" as const },
  { path: "/dashboard/risk", priority: 0.7, changeFreq: "weekly" as const },
  { path: "/dashboard/vault", priority: 0.6, changeFreq: "monthly" as const },
  { path: "/dashboard/settings", priority: 0.5, changeFreq: "monthly" as const },
  { path: "/dashboard/deadlines", priority: 0.9, changeFreq: "weekly" as const },
];

const languages = ["de", "fr", "it", "rm", "en"];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const route of staticRoutes) {
    // Default (German) entry
    entries.push({
      url: `${BASE_URL}${route.path}`,
      lastModified: new Date(),
      changeFrequency: route.changeFreq,
      priority: route.priority,
    });

    // Language-specific alternate entries (via query param approach since no locale routing)
    for (const lang of languages.slice(1)) {
      // fr, it, rm, en alternates via ?lang= (informational for search engines)
      entries.push({
        url: `${BASE_URL}${route.path}?lang=${lang}`,
        lastModified: new Date(),
        changeFrequency: route.changeFreq,
        priority: route.priority * 0.9,
      });
    }
  }

  return entries;
}
