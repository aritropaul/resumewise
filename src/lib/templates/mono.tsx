// mono — single column, monospace-friendly. Reads every style knob from
// theme.nodes so the Style Editor drives render 1:1. No forced content
// interpretation: bullets stay bullets, headings stay headings.

import React from "react";
import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ResumeAst, ResumeAstItem, ResumeAstSection } from "../resume-md";
import type { NodeStyleMap, ResumeTheme } from "../resume-theme";
import {
  bulletGlyph,
  headingBorderProps,
  linkProps,
  resolveNodeStyle,
  safeFontFamily,
  tokens,
  type LinkStyleProps,
  type TemplateTokens,
} from "./_theme";

export const MONO_BASELINE: NodeStyleMap = {
  name: { fontWeight: "semibold", textCase: "uppercase", letterSpacing: 2.5, color: "ink" },
  label: { color: "muted" },
  contact: { color: "muted" },
  section: { fontWeight: "medium", color: "ink" },
  role: { fontWeight: "semibold" },
  dates: { color: "muted" },
  location: { color: "muted" },
  bullet: { color: "ink" },
};
import { InlineText, contactHref, isAstEmpty } from "./_shared";

function nodeStyleObj(n: ReturnType<typeof resolveNodeStyle>) {
  return {
    fontFamily: n.fontFamily,
    fontSize: n.fontSize,
    fontWeight: n.fontWeight,
    fontStyle: n.fontStyle,
    color: n.color,
    lineHeight: n.lineHeight,
    letterSpacing: n.letterSpacing,
    textTransform: n.textTransform,
    marginBottom: n.marginBottom,
  };
}

function buildStyles(theme: ResumeTheme) {
  const t = tokens(theme);
  const fontFamily = safeFontFamily(t.font);
  const body = t.bodySize;
  const nameN = resolveNodeStyle(theme, "name", MONO_BASELINE);
  const labelN = resolveNodeStyle(theme, "label", MONO_BASELINE);
  const contactN = resolveNodeStyle(theme, "contact", MONO_BASELINE);
  const sectionN = resolveNodeStyle(theme, "section", MONO_BASELINE);
  const roleN = resolveNodeStyle(theme, "role", MONO_BASELINE);
  const datesN = resolveNodeStyle(theme, "dates", MONO_BASELINE);
  const locationN = resolveNodeStyle(theme, "location", MONO_BASELINE);
  const p = resolveNodeStyle(theme, "paragraph", MONO_BASELINE);
  const bullet = resolveNodeStyle(theme, "bullet", MONO_BASELINE);
  const linkNode = resolveNodeStyle(theme, "link", MONO_BASELINE);
  const border = headingBorderProps(t.sectionDivider, t.accent, t.rule);
  const link = linkProps(linkNode.linkStyle, t.accent, t.ink);
  return {
    t,
    glyph: bulletGlyph(bullet.bulletMarker),
    link,
    styles: StyleSheet.create({
      page: {
        paddingTop: t.margins.top,
        paddingBottom: t.margins.bottom,
        paddingLeft: t.margins.left,
        paddingRight: t.margins.right,
        fontSize: body,
        color: t.ink,
        fontFamily,
        lineHeight: t.lineHeight,
      },
      name: nodeStyleObj(nameN),
      label: { ...nodeStyleObj(labelN), marginTop: 3 },
      contactRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        marginTop: 6,
        fontSize: contactN.fontSize,
        color: contactN.color,
      },
      contactItem: {
        marginRight: 10,
        ...nodeStyleObj(contactN),
      },
      link: { ...link },
      sectionHeading: {
        ...nodeStyleObj(sectionN),
        marginTop: t.sectionSpacing,
        marginBottom: Math.max(2, t.sectionSpacing * 0.28) + sectionN.marginBottom,
        ...border,
      },
      itemHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: Math.max(4, t.sectionSpacing * 0.4),
      },
      itemTitle: nodeStyleObj(roleN),
      itemMetaRow: { flexDirection: "row", alignItems: "baseline" },
      dates: nodeStyleObj(datesN),
      location: nodeStyleObj(locationN),
      metaSep: {
        fontSize: Math.min(datesN.fontSize, locationN.fontSize),
        color: t.muted,
        marginHorizontal: 4,
      },
      bulletRow: { flexDirection: "row", marginTop: 2, paddingLeft: 2 },
      bulletDot: { width: 10, color: bullet.color },
      bulletText: { flex: 1, ...nodeStyleObj(bullet) },
      paragraph: { marginTop: 4, ...nodeStyleObj(p) },
      headingPrefix: { color: t.muted },
    }),
  };
}

type Built = ReturnType<typeof buildStyles>;
type Styles = Built["styles"];
type Tkns = TemplateTokens;

interface Ctx {
  styles: Styles;
  tkns: Tkns;
  glyph: string;
  link: LinkStyleProps;
}

function Header({ ast, ctx }: { ast: ResumeAst; ctx: Ctx }) {
  const { name, label, contacts } = ast.header;
  const { styles, tkns, link } = ctx;
  return (
    <View>
      {name ? <InlineText text={name} style={styles.name} tkns={tkns} linkBase={link} /> : null}
      {label ? <InlineText text={label} style={styles.label} tkns={tkns} linkBase={link} /> : null}
      {contacts.length > 0 ? (
        <View style={styles.contactRow}>
          {contacts.map((atom, i) => {
            const href = contactHref(atom);
            return (
              <View key={i} style={styles.contactItem}>
                {href ? (
                  <Link style={styles.link} src={href}>{atom}</Link>
                ) : (
                  <InlineText text={atom} tkns={tkns} linkBase={link} />
                )}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Bullets({ items, ctx }: { items: string[]; ctx: Ctx }) {
  if (!items.length) return null;
  const { styles, tkns, glyph, link } = ctx;
  return (
    <>
      {items.map((b, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>{glyph}</Text>
          <InlineText text={b} style={styles.bulletText} tkns={tkns} linkBase={link} />
        </View>
      ))}
    </>
  );
}

function Item({ item, ctx }: { item: ResumeAstItem; ctx: Ctx }) {
  const { styles, tkns, link } = ctx;
  const titleText = item.title && item.subtitle
    ? `${item.title} — ${item.subtitle}`
    : item.title ?? item.subtitle ?? "";
  const hasDates = !!item.dates;
  const hasLocation = !!item.location;
  return (
    <View style={{ marginTop: 4 }}>
      <View style={styles.itemHeader}>
        <InlineText text={titleText} style={styles.itemTitle} tkns={tkns} linkBase={link} />
        {hasDates || hasLocation ? (
          <View style={styles.itemMetaRow}>
            {hasDates ? (
              <InlineText text={item.dates!} style={styles.dates} tkns={tkns} linkBase={link} />
            ) : null}
            {hasDates && hasLocation ? (
              <Text style={styles.metaSep}>·</Text>
            ) : null}
            {hasLocation ? (
              <InlineText text={item.location!} style={styles.location} tkns={tkns} linkBase={link} />
            ) : null}
          </View>
        ) : null}
      </View>
      {item.paragraphs?.map((p, i) => (
        <InlineText key={`p-${i}`} text={p} style={styles.paragraph} tkns={tkns} linkBase={link} />
      ))}
      <Bullets items={item.bullets} ctx={ctx} />
    </View>
  );
}

function SectionHeading({ text, ctx }: { text: string; ctx: Ctx }) {
  const { styles, tkns, link } = ctx;
  return (
    <Text style={styles.sectionHeading}>
      <Text style={styles.headingPrefix}>{"// "}</Text>
      <InlineText text={text} tkns={tkns} linkBase={link} />
    </Text>
  );
}

function Section({ section, ctx }: { section: ResumeAstSection; ctx: Ctx }) {
  const { styles, tkns, link } = ctx;
  const hasContent =
    section.items.length ||
    section.paragraphs?.length ||
    section.bullets?.length;
  if (!hasContent) return null;
  return (
    <View>
      <SectionHeading text={section.heading} ctx={ctx} />
      {section.paragraphs?.map((p, i) => (
        <InlineText key={`p-${i}`} text={p} style={styles.paragraph} tkns={tkns} linkBase={link} />
      ))}
      {section.bullets?.length ? <Bullets items={section.bullets} ctx={ctx} /> : null}
      {section.items.map((item, i) => (
        <Item key={i} item={item} ctx={ctx} />
      ))}
    </View>
  );
}

export function MonoTemplate({ ast, theme }: { ast: ResumeAst; theme: ResumeTheme }) {
  const { styles, t, glyph, link } = buildStyles(theme);
  const ctx: Ctx = { styles, tkns: t, glyph, link };
  if (isAstEmpty(ast)) {
    return (
      <Document>
        <Page size="LETTER" style={styles.page}>
          <Text style={{ ...styles.paragraph, color: t.muted }}>
            Start typing in the Edit tab — begin with `# Your Name`.
          </Text>
        </Page>
      </Document>
    );
  }
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Header ast={ast} ctx={ctx} />
        {ast.sections.map((section, i) => (
          <React.Fragment key={`${section.key}-${i}`}>
            <Section section={section} ctx={ctx} />
          </React.Fragment>
        ))}
      </Page>
    </Document>
  );
}
