import "server-only";
import path from "node:path";

/** The Jekyll `docs/` folder: images and data files are read from it, never written. */
export const DOCS_DIR = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  process.env.WIKI_DOCS_DIR ?? "../docs",
);
