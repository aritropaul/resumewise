// Smoke test for the markdown resume parser. Run with: npm run test:md
//
// Checks that SAMPLE_MARKDOWN parses into the expected shape — right number of
// sections, header name, a few representative items and bullets. Fails loud
// with process.exit(1) on any mismatch.

import { parseResumeMarkdown, SAMPLE_MARKDOWN } from "../src/lib/resume-md";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
}

const ast = parseResumeMarkdown(SAMPLE_MARKDOWN);

assert(ast.header.name === "Jane Doe", `header.name = "${ast.header.name}"`);
assert(ast.header.label === "Senior Product Engineer", `header.label = "${ast.header.label}"`);
assert(ast.header.contacts.length >= 4, `contacts.length = ${ast.header.contacts.length}`);
assert(ast.header.contacts.includes("jane@doe.com"), "missing email contact");

const keys = ast.sections.map((s) => s.key);
assert(keys.includes("summary"), "missing summary section");
assert(keys.includes("experience"), "missing experience section");
assert(keys.includes("education"), "missing education section");
assert(keys.includes("skills"), "missing skills section");
assert(keys.includes("projects"), "missing projects section");
assert(keys.includes("awards"), "missing awards section");

const summary = ast.sections.find((s) => s.key === "summary");
assert(summary !== undefined, "summary not found");
assert((summary!.paragraphs?.length ?? 0) >= 1, "summary should have a paragraph");

const experience = ast.sections.find((s) => s.key === "experience")!;
assert(experience.items.length === 3, `experience items = ${experience.items.length}`);

const first = experience.items[0];
assert(first.title === "Acme Corp", `first.title = "${first.title}"`);
assert(first.subtitle === "Staff Engineer", `first.subtitle = "${first.subtitle}"`);
assert(first.dates === "Jan 2023 – Present", `first.dates = "${first.dates}"`);
assert(first.location === "Remote", `first.location = "${first.location}"`);
assert(first.bullets.length === 3, `first.bullets.length = ${first.bullets.length}`);
assert(first.bullets[0].startsWith("Led the rewrite"), `first bullet = "${first.bullets[0]}"`);

const skills = ast.sections.find((s) => s.key === "skills")!;
assert(skills.items.length === 3, `skills items = ${skills.items.length}`);
const langs = skills.items.find((i) => i.title === "Languages");
assert(langs !== undefined, "skills: Languages group missing");
assert(langs!.bullets.includes("TypeScript"), "TypeScript missing from Languages");
assert(langs!.bullets.includes("Rust"), "Rust missing from Languages");

// Malformed input should not throw.
const junk = parseResumeMarkdown("plain text with no structure at all\nmore text");
assert(typeof junk.header.name === "string", "malformed input yielded non-string name");
assert(Array.isArray(junk.sections), "malformed input yielded non-array sections");

// Empty string should not throw.
const empty = parseResumeMarkdown("");
assert(empty.header.name === "", "empty input should yield empty name");
assert(empty.sections.length === 0, "empty input should yield no sections");

console.log("OK — parser smoke test passed");
console.log(`  sections: ${keys.join(", ")}`);
console.log(`  experience items: ${experience.items.length}`);
console.log(`  skills groups: ${skills.items.length}`);
