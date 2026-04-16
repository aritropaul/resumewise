// Smoke test for the markdown resume parser. Run with: npm run test:md
//
// Verifies that SAMPLE_MARKDOWN parses into a faithful block tree — headings
// at their original levels, a contact block, section-body paragraphs and
// lists in source order, no synthesized semantic fields.

import { parseResumeMarkdown, SAMPLE_MARKDOWN, type ResumeBlock } from "../src/lib/resume-md";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
}

const doc = parseResumeMarkdown(SAMPLE_MARKDOWN);
const blocks = doc.blocks;

function findIndex(pred: (b: ResumeBlock) => boolean, from = 0): number {
  for (let i = from; i < blocks.length; i++) if (pred(blocks[i])) return i;
  return -1;
}

// H1 is first.
assert(blocks[0].kind === "heading" && blocks[0].level === 1 && blocks[0].text === "Jane Doe", "H1 should be 'Jane Doe'");

// A contacts block appears.
const contactsIdx = findIndex((b) => b.kind === "contacts");
assert(contactsIdx !== -1, "expected a contacts block");
const contacts = blocks[contactsIdx];
assert(contacts.kind === "contacts" && contacts.atoms.includes("jane@doe.com"), "email should be in contacts");

// Every ## heading is preserved as level-2.
const level2 = blocks.filter((b) => b.kind === "heading" && b.level === 2).map((b) => (b as Extract<ResumeBlock, { kind: "heading" }>).text);
for (const want of ["Summary", "Experience", "Education", "Skills", "Projects", "Awards"]) {
  assert(level2.includes(want), `missing ## ${want}`);
}

// ### Acme Corp — Staff Engineer is kept intact (no title/subtitle split).
const acmeH3 = blocks.find((b) => b.kind === "heading" && b.level === 3 && b.text.startsWith("Acme Corp"));
assert(acmeH3 && acmeH3.kind === "heading" && acmeH3.text === "Acme Corp — Staff Engineer", `acme H3 text = "${(acmeH3 as { text?: string } | undefined)?.text}"`);

// The dates line under the Acme H3 is a paragraph, not a magic "dates" field.
const acmeIdx = blocks.indexOf(acmeH3!);
const afterAcme = blocks[acmeIdx + 1];
assert(afterAcme.kind === "paragraph" && afterAcme.text.startsWith("Jan 2023"), `paragraph after acme H3: ${JSON.stringify(afterAcme)}`);

// The bullet list under Acme is a single list block with the expected items.
const afterDates = blocks[acmeIdx + 2];
assert(afterDates.kind === "list" && afterDates.items.length === 3, `expected list of 3 under Acme, got ${JSON.stringify(afterDates)}`);
assert(afterDates.kind === "list" && afterDates.items[0].startsWith("Led the rewrite"), "first bullet");

// Skills block: the list items are preserved as lines with "Label: ..." intact.
const skillsH2Idx = blocks.findIndex((b) => b.kind === "heading" && b.level === 2 && b.text === "Skills");
const skillsList = blocks[skillsH2Idx + 1];
assert(skillsList.kind === "list" && skillsList.items.length === 3, `skills list items = ${skillsList.kind === "list" ? skillsList.items.length : "n/a"}`);
assert(skillsList.kind === "list" && skillsList.items[0].startsWith("Languages:"), "first skills line should begin with Languages:");

// Malformed / empty inputs must not throw.
const junk = parseResumeMarkdown("plain text with no structure at all\nmore text");
assert(Array.isArray(junk.blocks), "malformed input should produce blocks array");

const empty = parseResumeMarkdown("");
assert(empty.blocks.length === 0, "empty input should yield no blocks");

console.log("OK — parser smoke test passed");
console.log(`  total blocks: ${blocks.length}`);
console.log(`  ## headings: ${level2.join(", ")}`);
