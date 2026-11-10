// Loading, saving and deleting recipes on main (docs/specs/recipe-editor-plan.md,
// slice 6). Every save is checked with the same checker as the build script
// (assets/recipe-checks.js), and the recipe file and recipes/index.json change
// together in one commit, or not at all.
//
// - Conflicts: the editor sends the version of the file it opened (its blob
//   SHA). If the file on main is a different version now, nothing is saved.
//   Changes to other recipes don't matter: only this recipe's index entry is
//   replaced, in main's index as it is now.
// - If main moves between reading it and committing, it's tried once more from
//   the new main.
import checks from "../../assets/recipe-checks.js";
import { formatRecipe } from "./format.js";
import { Refusal, blobSha } from "./github.js";

const { checkRecipe, checkLinks, indexEntry, linkedFrom, patchIndex } = checks;

const CHANGED = "This recipe changed since you opened it. Your changes are kept in this browser: reload to see the new version, then bring your changes back if you still want them.";
const NOT_FOUND = "There's no recipe with that name.";
const INDEX = "recipes/index.json";
const VOCAB = "recipes/vocabulary.json";
const pathOf = (slug) => `recipes/${slug}.json`;

// A recipe's file name: lowercase letters, numbers and dashes (README), and
// not one of the files beside the recipes.
export const isSlug = (slug) => typeof slug === "string" && /^[a-z0-9-]+$/.test(slug) && slug !== "index" && slug !== "vocabulary";

const parse = (text, what) => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Refusal(500, `${what} on GitHub isn't valid JSON, so it can't be changed here.`);
  }
};

export async function loadRecipe(gh, slug) {
  if (!isSlug(slug)) throw new Refusal(404, NOT_FOUND);
  const { commit } = await gh.main();
  const file = await gh.file(pathOf(slug), commit);
  if (!file) throw new Refusal(404, NOT_FOUND);
  return { slug, recipe: parse(file.text, `recipes/${slug}.json`), sha: file.sha };
}

// { slug, recipe, baseSha }: baseSha is the version opened, or missing for a
// new recipe, whose file name must be free.
export async function saveRecipe(gh, { slug, recipe, baseSha }) {
  return twice(async () => {
    const { commit, tree } = await gh.main();
    const [file, indexText, vocabText] = await Promise.all([gh.file(pathOf(slug), commit), gh.text(INDEX, commit), gh.text(VOCAB, commit)]);
    if (baseSha === undefined && file) throw new Refusal(409, `There's already a recipe called recipes/${slug}.json. Open it in the editor to change it.`);
    if (baseSha !== undefined && file?.sha !== baseSha) throw new Refusal(409, CHANGED);
    const vocab = parse(vocabText, "recipes/vocabulary.json");
    const index = parse(indexText, "recipes/index.json");

    const problems = checkRecipe(slug, recipe, vocab).errors;
    const patched = patchIndex(index, slug, indexEntry(slug, recipe, vocab));
    // Only link problems this save makes: a problem already on main isn't this recipe's to fix.
    const before = new Set(checkLinks(index));
    const mine = `recipes/${slug}.json: `;
    problems.push(...checkLinks(patched).filter((e) => !before.has(e)).map((e) => (e.startsWith(mine) ? e.slice(mine.length) : e)));
    if (problems.length) throw new Refusal(422, "This recipe has problems to fix before it can be saved.", { problems });

    const text = formatRecipe(recipe);
    const message = `${file ? "Edit" : "Add"} ${recipe.title}`;
    const made = await gh.commit(commit, tree, { [pathOf(slug)]: text, [INDEX]: formatIndex(patched) }, message);
    if (!(await gh.moveMain(made))) return null;
    return { slug, title: recipe.title, sha: await blobSha(text), commit: made };
  });
}

// { slug, baseSha }: refused while another recipe links to this one.
export async function deleteRecipe(gh, { slug, baseSha }) {
  return twice(async () => {
    const { commit, tree } = await gh.main();
    const [file, indexText] = await Promise.all([gh.file(pathOf(slug), commit), gh.text(INDEX, commit)]);
    if (file?.sha !== baseSha) throw new Refusal(409, file ? CHANGED : NOT_FOUND);
    const index = parse(indexText, "recipes/index.json");
    const usedBy = linkedFrom(index, slug).filter((l) => l.slug !== slug);
    if (usedBy.length) {
      const says = usedBy.map((l) => `${l.title} uses this recipe for its "${l.item}"`);
      throw new Refusal(409, `${says.join("; ")}. Take ${usedBy.length === 1 ? "that link" : "those links"} out first.`, { usedBy });
    }
    const title = parse(file.text, `recipes/${slug}.json`).title || slug;
    const made = await gh.commit(commit, tree, { [pathOf(slug)]: null, [INDEX]: formatIndex(patchIndex(index, slug, null)) }, `Delete ${title}`);
    if (!(await gh.moveMain(made))) return null;
    return { slug, title, commit: made };
  });
}

// The index as the build script writes it.
const formatIndex = (index) => `${JSON.stringify(index, null, 2)}\n`;

// Runs a save; if main moved before it could commit (null), once more from the new main.
async function twice(attempt) {
  for (let n = 0; n < 2; n++) {
    const done = await attempt();
    if (done) return done;
  }
  throw new Refusal(409, CHANGED);
}
