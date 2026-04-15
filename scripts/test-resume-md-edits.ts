// Smoke test for wrap/unwrap/toggle helpers.

import {
  toggleOrReplace,
  describeState,
  wrapSelection,
} from "../src/lib/resume-md-edits";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
}

// Plain wrap
{
  const md = "hello world";
  const r = wrapSelection(md, 6, 11, { name: "bold" });
  assert(r.md === "hello {bold}world{/bold}", `wrap: "${r.md}"`);
  assert(r.selection.start === 12 && r.selection.end === 17, "wrap selection");
}

// toggleOrReplace wraps when not wrapped
{
  const md = "hello world";
  const r = toggleOrReplace(md, 6, 11, { name: "bold" });
  assert(r !== null && r.md === "hello {bold}world{/bold}", "toggle wraps");
}

// toggleOrReplace unwraps when already wrapped (same directive)
{
  const md = "hello {bold}world{/bold}";
  const r = toggleOrReplace(md, 12, 17, { name: "bold" });
  assert(r !== null, "toggle should produce a result");
  assert(r!.md === "hello world", `unwrap got "${r!.md}"`);
  assert(r!.selection.start === 6 && r!.selection.end === 11, "unwrap selection");
}

// toggleOrReplace replaces value when name matches but value differs
{
  const md = "hi {weight:500}mid{/weight}";
  const r = toggleOrReplace(md, 15, 18, { name: "weight", value: "700" });
  assert(r !== null && r.md === "hi {weight:700}mid{/weight}", `replace got "${r?.md}"`);
}

// toggleOrReplace unwraps value-ful directive when same value
{
  const md = "hi {size:14}big{/size}";
  const r = toggleOrReplace(md, 12, 15, { name: "size", value: "14" });
  assert(r !== null && r.md === "hi big", `same-value unwrap "${r?.md}"`);
}

// describeState detects wrapped bold
{
  const md = "hi {bold}x{/bold}";
  const s = describeState(md, 9, 10, "bold");
  assert(s.active === true, "bold active detected");
}

// describeState: not wrapped → inactive
{
  const md = "plain text";
  const s = describeState(md, 0, 5, "bold");
  assert(s.active === false, "plain not active");
}

// describeState: wrapped with value
{
  const md = "{color:#ff0000}red{/color}";
  const s = describeState(md, 15, 18, "color");
  assert(s.active === true && s.value === "#ff0000", `color value: ${s.value}`);
}

// Empty selection returns null
{
  const md = "hello";
  const r = toggleOrReplace(md, 2, 2, { name: "bold" });
  assert(r === null, "empty selection returns null");
}

// Nested wrap inside existing wrapper (selection not wrapped at boundary)
{
  const md = "{bold}hello world{/bold}";
  // Select "world" inside the bold block; boundary check: char before start is 'o', not '}'.
  const r = toggleOrReplace(md, 12, 17, { name: "italic" });
  assert(r !== null && r.md === "{bold}hello {italic}world{/italic}{/bold}", `nested: "${r?.md}"`);
}

console.log("OK — md-edits smoke test passed");
