// Types for the part of recipe-checks.js the Worker uses (worker/src/recipes.ts
// and its tests). The checker stays one plain JavaScript file shared by the
// site, the build script and the Worker; this only describes it. Not served
// (.assetsignore).

// A recipe as it arrives to be saved: checked by checkRecipe, so nothing about
// its shape is promised before that.
export type Recipe = { title?: unknown; [field: string]: unknown };
// recipes/vocabulary.json, read as it is.
export type Vocabulary = object;

export type Link = { item: string; recipe: string };
export type IndexEntry = { slug: string; title: string; links?: Link[]; [field: string]: unknown };

declare const checks: {
  checkRecipe(slug: string, recipe: Recipe, vocab: Vocabulary): { errors: string[]; warnings: string[] };
  checkLinks(index: IndexEntry[]): string[];
  linkedFrom(index: IndexEntry[], slug: string): { slug: string; title: string; item: string }[];
  indexEntry(slug: string, recipe: Recipe, vocab: Vocabulary): IndexEntry;
  patchIndex(index: IndexEntry[], slug: string, entry: IndexEntry | null): IndexEntry[];
};
export default checks;
