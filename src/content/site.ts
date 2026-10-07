// ---------------------------------------------------------------------------
// SITE DETAILS — the facts only the team can supply.
//
// Everything public-facing that names a person, an entity or a way to reach
// you lives here. Pages render gracefully while a field is empty (sections
// hide, wording falls back), so nothing half-filled ever shows on the site.
// Fill these in and redeploy. See docs/SITE_DETAILS_TODO.md.
// ---------------------------------------------------------------------------

export type TeamMember = {
  name: string;
  role: string; // e.g. "Partner · Macro & risk"
  bio: string; // 1–3 sentences
  linkedin?: string; // full URL, optional
};

export const SITE = {
  name: "Whitewater",
  // Production URL — used for share previews, sitemap and canonical links.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://whitewater-management.vercel.app",
  tagline: "A concentrated, conviction-led investment club.",

  // TODO(team): legal name of the club's entity, e.g. "Whitewater Capital LLC".
  // Shown in the privacy policy and terms as the data controller / operator.
  legalEntity: "",
  // TODO(team): where the entity is registered, e.g. "Ireland" or "Delaware, USA".
  jurisdiction: "",
  // TODO(team): a monitored inbox for enquiries and privacy requests.
  contactEmail: "",
  // TODO(team): founding year, e.g. "2026".
  founded: "2026",

  // TODO(team): one entry per partner. The About page's team section stays
  // hidden until this has at least one entry.
  team: [] as TeamMember[],

  // TODO(team): the date your counsel signs off the privacy policy/terms.
  legalUpdated: "2026-10-07",
};

export const contactLine = () =>
  SITE.contactEmail
    ? SITE.contactEmail
    : "the contact form on our Invest page";
