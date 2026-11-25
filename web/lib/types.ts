/** One extra infobox row. `value` is inline Markdown and may contain [[type:slug|Label]] links. */
export type Fact = { label: string; value: string };

/** Row of `public.people` (supabase/migrations/011_wiki_content.sql). */
export type Person = {
  slug: string;
  name: string;
  subtitle: string | null;
  hjemsted: string | null;
  born: string | null;
  bsid: string | null;
  favorittbrus: string | null;
  favoritt_brawler: string | null;
  quote: string | null;
  fiende: string | null;
  image_ext: string;
  /** Image file base name, frozen at creation (migration 014) so renames don't break images. */
  image_key: string;
  hidden_profile_years: number[];
  facts: Fact[];
  body_md: string;
};

/** Row of `public.clubs`. */
export type Club = {
  slug: string;
  name: string;
  aktiv: string | null;
  stiftet: string | null;
  leder: string | null;
  medlemmer: string | null;
  underklubber: string[];
  image_ext: string;
  image_key: string;
  facts: Fact[];
  body_md: string;
};
