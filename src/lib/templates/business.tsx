// business — serif, centered header, accent section heads.
// Baseline-driven text styles; centered-header + accent section decoration stays
// as template identity.

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
import { InlineText, contactHref, isAstEmpty } from "./_shared";

export const BUSINESS_BASELINE: NodeStyleMap = {
  name: { fontWeight: "semibold", textCase: "uppercase", letterSpacing: 2, color: "ink" },
  label: { fontStyle: "italic", color: "accent" },
  contact: { color: "muted" },
  section: { fontWeight: "medium", color: "accent" },
  role: { fontWeight: "semibold" },
  dates: { fontStyle: "italic", color: "muted" },
  location: { fontStyle: "italic", color: "muted" },
};

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
  const nameN = resolveNodeStyle(theme, "name", BUSINESS_BASELINE);
  const labelN = resolveNodeStyle(theme, "label", BUSINESS_BASELINE);
  const contactN = resolveNodeStyle(theme, "contact", BUSINESS_BASELINE);
  const sectionN = resolveNodeStyle(theme, "section", BUSINESS_BASELINE);
  const roleN = resolveNodeStyle(theme, "role", BUSINESS_BASELINE);
  const datesN = resolveNodeStyle(theme, "dates", BUSINESS_BASELINE);
  const locationN = resolveNodeStyle(theme, "location", BUSINESS_BASELINE);
  const p = resolveNodeStyle(theme, "paragraph", BUSINESS_BASELINE);
  const bullet = resolveNodeStyle(theme, "bullet", BUSINESS_BASELINE);
  const linkNode = resolveNodeStyle(theme, "link", BUSINESS_BASELINE);
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
      header: { alignItems: "center" },
      name: nodeStyleObj(nameN),
      label: { ...nodeStyleObj(labelN), marginTop: 3 },
      contactRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        marginTop: 6,
        fontSize: contactN.fontSize,
        color: contactN.color,
      },
      contactItem: { marginHorizontal: 6, ...nodeStyleObj(contactN) },
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
      itemSub: { ...nodeStyleObj(roleN), fontStyle: "italic", fontWeight: 400 },
      itemMetaRow: { flexDirection: "row", alignItems: "baseline" },
      dates: nodeStyleObj(datesN),
      location: nodeStyleObj(locationN),
      metaSep: {
        fontSize: Math.min(datesN.fontSize, locationN.fontSize),
        color: t.muted,
        marginHorizontal: 4,
      },
      bulletRow: { flexDirection: "row", marginTop: 2, paddingLeft: 4 },
      bulletDot: { width: 10, color: bullet.color },
      bulletText: { flex: 1, ...nodeStyleObj(bullet) },
      paragraph: { marginTop: 4, ...nodeStyleObj(p) },
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
    <View style={styles.header}>
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
  const hasDates = !!item.dates;
  const hasLocation = !!item.location;
  return (
    <View style={{ marginTop: 4 }}>
      <View style={styles.itemHeader}>
        <Text>
          {item.title ? (
            <InlineText text={item.title} style={styles.itemTitle} tkns={tkns} linkBase={link} />
          ) : null}
          {item.title && item.subtitle ? <Text style={styles.itemSub}>{", "}</Text> : null}
          {item.subtitle ? (
            <InlineText text={item.subtitle} style={styles.itemSub} tkns={tkns} linkBase={link} />
          ) : null}
        </Text>
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

function Section({ section, ctx }: { section: ResumeAstSection; ctx: Ctx }) {
  const { styles, tkns, link } = ctx;
  const hasContent =
    section.items.length ||
    section.paragraphs?.length ||
    section.bullets?.length;
  if (!hasContent) return null;
  return (
    <View>
      <InlineText text={section.heading} style={styles.sectionHeading} tkns={tkns} linkBase={link} />
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

export function BusinessTemplate({ ast, theme }: { ast: ResumeAst; theme: ResumeTheme }) {
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
