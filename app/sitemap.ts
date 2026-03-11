import { MetadataRoute } from "next";

const BASE_URL = "https://baucompliance.ch";

const publicRoutes = [
  { path: "/", priority: 1.0, changeFreq: "weekly" as const },
  { path: "/login", priority: 0.6, changeFreq: "monthly" as const },
];

const toolRoutes = [
  {
    path: "/tools/ruegefrist-rechner",
    priority: 0.9,
    changeFreq: "monthly" as const,
  },
];

const languages = ["de", "fr", "it", "rm", "en"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  const allRoutes = [...publicRoutes, ...toolRoutes];

  for (const route of allRoutes) {
    const alternates: Record<string, string> = {};
    for (const lang of languages) {
      alternates[lang] = `${BASE_URL}${route.path}${lang === "de" ? "" : `?lang=${lang}`}`;
    }

    entries.push({
      url: `${BASE_URL}${route.path}`,
      lastModified: new Date(),
      changeFrequency: route.changeFreq,
      priority: route.priority,
      alternates: {
        languages: alternates,
      },
    });
  }

  return entries;
}
