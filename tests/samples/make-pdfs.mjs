#!/usr/bin/env node
// Writes the small sample PDFs the intake's browser tests read
// (tests/e2e/intake-import.spec.mjs). Run from the repo root if they need
// changing: node tests/samples/make-pdfs.mjs
//   recipe.pdf   a one-page recipe with its text in it, as saved from a website
//   scanned.pdf  a page with no text, like a scan or a photo
import { writeFileSync } from "node:fs";

const RECIPE = [
  "Brown Butter Shortbread",
  "Makes 16 squares",
  "INGREDIENTS",
  "1 cup unsalted butter",
  "1/2 cup powdered sugar",
  "2 cups all-purpose flour",
  "1/2 teaspoon salt",
  "METHOD",
  "1. Heat the oven to 325F.",
  "2. Mix the butter, sugar, flour and salt into a dough.",
  "3. Press into a pan and bake until pale golden, 30 to 35 minutes.",
];

// A PDF with one page, drawing `content` (a PDF content stream).
function pdf(content, withFont) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R${withFont ? " /Resources << /Font << /F1 5 0 R >> >>" : ""} >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ...(withFont ? ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"] : []),
  ];
  let out = "%PDF-1.4\n";
  const at = [];
  objects.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const esc = (s) => s.replace(/[\\()]/g, "\\$&");
const text = `BT /F1 12 Tf 16 TL 72 720 Td\n${RECIPE.map((l) => `(${esc(l)}) Tj T*`).join("\n")}\nET`;
writeFileSync(new URL("recipe.pdf", import.meta.url), pdf(text, true), "latin1");
// A grey box where a photo of a page would be.
writeFileSync(new URL("scanned.pdf", import.meta.url), pdf("0.8 g 72 72 468 648 re f", false), "latin1");
