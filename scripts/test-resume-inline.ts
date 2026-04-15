// Smoke test for the inline formatting parser.

import { parseInline, NAMED_COLORS } from "../src/lib/resume-inline";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
}

// Plain text
{
  const spans = parseInline("hello world");
  assert(spans.length === 1, `plain: got ${spans.length}`);
  assert(spans[0].text === "hello world", "plain text");
  assert(Object.keys(spans[0].style).length === 0, "plain has no style");
}

// **bold**
{
  const spans = parseInline("a **bold** c");
  assert(spans.length === 3, `bold: got ${spans.length}`);
  assert(spans[1].text === "bold", "bold inner");
  assert(spans[1].style.bold === true, "bold style");
}

// *italic*
{
  const spans = parseInline("plain *italic* plain");
  assert(spans.length === 3, `italic: got ${spans.length}`);
  assert(spans[1].style.italic === true, "italic style");
}

// _italic_
{
  const spans = parseInline("plain _italic_ plain");
  assert(spans[1].style.italic === true, "_italic_ style");
}

// `code`
{
  const spans = parseInline("see `npm run` here");
  assert(spans[1].text === "npm run", "code inner");
  assert(spans[1].style.code === true, "code style");
}

// {bold}...{/bold}
{
  const spans = parseInline("before {bold}shout{/bold} after");
  assert(spans.length === 3, `{bold}: got ${spans.length}`);
  assert(spans[1].style.bold === true, "bold directive");
}

// {red}...{/red}
{
  const spans = parseInline("before {red}alert{/red} after");
  assert(spans[1].style.color === NAMED_COLORS.red, "red color");
}

// Nested: {bold}{red}text{/red}{/bold}
{
  const spans = parseInline("{bold}outer {red}inner{/red} done{/bold}");
  assert(spans[0].style.bold === true, "outer bold");
  const innerRed = spans.find((s) => s.text === "inner");
  assert(innerRed?.style.bold === true, "inner kept bold");
  assert(innerRed?.style.color === NAMED_COLORS.red, "inner is red");
}

// {size:14}
{
  const spans = parseInline("{size:14}big{/size} normal");
  assert(spans[0].style.fontSize === 14, "size directive");
}

// {weight:600}
{
  const spans = parseInline("{weight:600}mid{/weight}");
  assert(spans[0].style.fontWeight === 600, "weight directive");
}

// Palette token: accent (passes through unresolved)
{
  const spans = parseInline("{accent}brand{/accent}");
  assert(spans[0].style.color === "accent", "accent token preserved");
}

// Unknown directive is treated as literal text
{
  const spans = parseInline("hello {unknownthing}world");
  const text = spans.map((s) => s.text).join("");
  assert(text === "hello {unknownthing}world", `unknown directive literal: "${text}"`);
}

// Mixed markdown + directive
{
  const spans = parseInline("**{red}bold and red{/red}**");
  const rb = spans[0];
  assert(rb.style.bold === true && rb.style.color === NAMED_COLORS.red, "bold+red");
}

// {color:#hex}
{
  const spans = parseInline("{color:#aabbcc}custom{/color}");
  assert(spans[0].style.color === "#aabbcc", `color:#hex got ${spans[0].style.color}`);
}

// {color:red} (named)
{
  const spans = parseInline("{color:red}named{/color}");
  assert(spans[0].style.color === NAMED_COLORS.red, "color:named");
}

// {font:Inter Tight}
{
  const spans = parseInline("{font:Inter Tight}branded{/font}");
  assert(spans[0].style.fontFamily === "Inter Tight", "font directive");
}

// Invalid color falls back to literal
{
  const spans = parseInline("{color:notacolor}text{/color}");
  const joined = spans.map((s) => s.text).join("");
  assert(joined.includes("{color:notacolor}"), "invalid color is literal");
}

// Basic link
{
  const spans = parseInline("see [my site](https://example.com) here");
  const linkSpans = spans.filter((s) => s.style.link);
  assert(linkSpans.length === 1, `link span count: ${linkSpans.length}`);
  assert(linkSpans[0].text === "my site", `link text: "${linkSpans[0].text}"`);
  assert(linkSpans[0].style.link === "https://example.com", "link href");
}

// Link with inline formatting inside
{
  const spans = parseInline("[**bold link**](https://x.io)");
  const link = spans.find((s) => s.style.link);
  assert(link !== undefined, "link span present");
  assert(link!.style.bold === true, "link preserves bold");
  assert(link!.style.link === "https://x.io", "link href");
}

// Link with email shorthand
{
  const spans = parseInline("[me](me@example.com)");
  const link = spans[0];
  assert(link.style.link === "me@example.com", "raw email href");
}

// Unclosed link falls back to literal text
{
  const spans = parseInline("see [broken text");
  const joined = spans.map((s) => s.text).join("");
  assert(joined === "see [broken text", `unclosed link literal: "${joined}"`);
}

console.log("OK — inline parser smoke test passed");
console.log(`  cases covered: plain, **, *, _, \`, {bold}, {red}, nested, {size}, {weight}, palette token, unknown, mixed`);
