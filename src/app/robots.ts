import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";
import { PROTECTED_PATHS } from "@/lib/modules";

// Public pages are indexable; the members area and APIs are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PROTECTED_PATHS, "/login", "/api/"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
