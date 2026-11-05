#!/usr/bin/env node
// Scores OCR output from Jacob's four test photos (pages 3 and 4: Babkallah,
// pages 5 and 6: Malted "Forever" Brownies, both from Dessert Person) on the
// numbers that matter: amounts, times, temperatures and pan sizes. Run it in
// the folder holding the OCR text files; they and the photos stay out of the
// repo (published book pages). See tools/intake/README.md.
//
//   node score-photos.mjs [show]          PAGES=3,4 node score-photos.mjs   (one recipe)
import fs from "node:fs";
// The numbers each page holds, as read off the photos by eye. Each is a pattern
// that also accepts the ASCII form ("1/2" for "½").
const F = { "½": "(?:½|1/2)", "⅓": "(?:⅓|1/3)", "¼": "(?:¼|1/4)", "¾": "(?:¾|3/4)" };
const pat = (s) => new RegExp(s.replace(/°/g, "[°º]?").replace(/[½⅓¼¾]/g, (c) => F[c]).replace(/ /g, "\\s*").replace(/×/g, "\\s*[x×]\\s*"), "i");
const REF = {
  3: ["½ cup whole milk", "0.25 oz", "2¼ teaspoons", "⅓ cup granulated", "4 large egg yolks", "1 teaspoon vanilla", "3 cups all-purpose", "1 teaspoon Diamond", "1 stick", "½-inch pieces", "6 ounces", "⅓ cup packed", "1½ teaspoons ground", "4 tablespoons unsalted", "1 large egg", "105°F", "5 to 10 minutes", "8 to 10 minutes", "5 to 8", "1½ to 2½ hours", "3 equal", "Serves 12"],
  4: ["12 inches", "12 × 6-inch", "½-inch border", "3 pieces", "1½ times", "1 to 2 hours", "350°F", "35 to 45 minutes"],
  5: ["8 × 8-inch pan", "¼ cup Dutch", "5 ounces", "64 to 68%", "6 tablespoons", "¼ cup neutral", "½ cup granulated", "½ cup packed", "1 large egg", "2 large egg yolks", "1½ teaspoons vanilla", "¾ cup all-purpose", "2 tablespoons malted", "1 teaspoon Diamond", "6 ounces \\(170g\\) milk", "350°F", "¼ cup boiling", "1 inch", "45 seconds", "16 brownies"],
  6: ["25 to 30 minutes", "about 1 hour, then", "about 1 hour longer", "16 squares", "25°F", "½ teaspoon peppermint", "6 ounces", "1 cup coarsely", "¼ cup buckwheat"],
};
// Free repairs: "11/2" -> "1 1/2" (no recipe means eleven halves), "0z" -> "oz".
const repair = (t) => t.replace(/\b(\d)(1\/[2348])\b/g, "$1 $2").replace(/(\d)\s*0z\b/g, "$1 oz").replace(/\b0z\b/g, "oz");
const rows = [];
const name = (file, p) => (file.includes("{p}") ? file.replace("{p}", p) : `${file}${p}.txt`);
for (const [kind, file] of [["Tesseract, photo as is", "raw"], ["Tesseract, cleaned up", "ocr"], ["RapidOCR, photo as is", "rapid"], ["Florence-2 large, tiled", "photo{p}.Florence-2-large.txt"], ["Florence-2 base, fast settings", "photo{p}.Florence-2-base-fast.txt"], ["Apple Live Text (whole page)", "livetext"]]) {
  if (!fs.existsSync(name(file, 3))) continue;
  let hit = 0, fixed = 0, n = 0; const missed = [];
  for (const [p, list] of Object.entries(REF).filter(([page]) => !process.env.PAGES || process.env.PAGES.split(",").includes(page))) {
    const t = !fs.existsSync(name(file, p)) ? "" : fs.readFileSync(name(file, p), "utf8").replace(/\s+/g, " ");
    for (const r of list) { n++; if (pat(r).test(t)) hit++; else missed.push(`p${p}: ${r}`); if (pat(r).test(repair(t))) fixed++; }
  }
  rows.push(`${kind.padEnd(26)} ${hit}/${n} right, ${fixed}/${n} after repairs`);
  if (process.argv[2]) rows.push("   missed: " + missed.join(" | "));
}
console.log(rows.join("\n"));
