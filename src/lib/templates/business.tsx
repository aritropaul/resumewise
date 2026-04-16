// business — serif, centered name + contact row as template identity.
// Walks the block tree in source order; name / contact lines center-align;
// everything else (sections, paragraphs, lists) flows left.

import React from "react";
import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ResumeBlock, ResumeDoc } from "../resume-md";
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
import { InlineText, SplitRow, alignToJustify, contactHref, extractBlockLayout, isAstEmpty, withAlign } from "./_shared";

export const BUSINESS_BASELINE: NodeStyleMap = {
  name: { fontWeight: "semibold", textCase: "uppercase", letterSpacing: 2, color: "ink" },
  contact: { color: "muted" },
  section: { fontWeight: "medium", color: "accent" },
  role: { fontWeight: "semibold" },
  dates: { color: "muted" },
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
  const contactN = resolveNodeStyle(theme, "contact", BUSINESS_BASELINE);
  const sectionN = resolveNodeStyle(theme, "section", BUSINESS_BASELINE);
  const roleN = resolveNodeStyle(theme, "role", BUSINESS_BASELINE);
  const datesN = resolveNodeStyle(theme, "dates", BUSINESS_BASELINE);
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
      name: { ...nodeStyleObj(nameN), textAlign: "center" },
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
      roleHeading: {
        ...nodeStyleObj(roleN),
        marginTop: Math.max(4, t.sectionSpacing * 0.4),
      },
      subHeading: {
        ...nodeStyleObj(p),
        fontWeight: 600,
        marginTop: 4,
      },
      bulletRow: { flexDirection: "row", marginTop: 2, paddingLeft: 4 },
      bulletDot: { width: 10, color: bullet.color },
      bulletText: { flex: 1, ...nodeStyleObj(bullet) },
      dates: nodeStyleObj(datesN),
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

function ContactRow({ atoms, ctx }: { atoms: string[]; ctx: Ctx }) {
  const { styles, tkns, link } = ctx;
  return (
    <View style={styles.contactRow}>
      {atoms.map((atom, i) => {
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
  );
}

function BulletList({ items, ctx }: { items: string[]; ctx: Ctx }) {
  if (!items.length) return null;
  const { styles, tkns, glyph, link } = ctx;
  return (
    <>
      {items.map((b, i) => {
        const layout = extractBlockLayout(b);
        if (layout.mode === "split") {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>{glyph}</Text>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline" }}>
                <InlineText text={layout.left} style={{ ...styles.bulletText, flexGrow: 1, flexShrink: 1 }} tkns={tkns} linkBase={link} />
                <InlineText text={layout.right} style={{ ...styles.bulletText, flexShrink: 0, textAlign: "right" }} tkns={tkns} linkBase={link} />
              </View>
            </View>
          );
        }
        const { align, text } = layout.mode === "whole" ? layout : { align: null as null, text: layout.text };
        const rowStyle = align ? { ...styles.bulletRow, justifyContent: alignToJustify(align) } : styles.bulletRow;
        return (
          <View key={i} style={rowStyle}>
            <Text style={styles.bulletDot}>{glyph}</Text>
            <InlineText text={text} style={styles.bulletText} tkns={tkns} linkBase={link} />
          </View>
        );
      })}
    </>
  );
}

function renderTextBlock(
  text: string,
  style: Record<string, string | number>,
  ctx: Ctx
) {
  const layout = extractBlockLayout(text);
  const { styles, tkns, link } = ctx;
  if (layout.mode === "split") {
    return <SplitRow left={layout.left} right={layout.right} style={style} rightStyle={layout.tag === "dates" ? styles.dates : undefined} tkns={tkns} linkBase={link} />;
  }
  if (layout.mode === "whole") {
    return <InlineText text={layout.text} style={withAlign(style, layout.align)} tkns={tkns} linkBase={link} />;
  }
  return <InlineText text={layout.text} style={style} tkns={tkns} linkBase={link} />;
}

function Block({ block, ctx }: { block: ResumeBlock; ctx: Ctx }) {
  const { styles } = ctx;
  if (block.kind === "heading") {
    if (block.level === 1) return renderTextBlock(block.text, styles.name, ctx);
    if (block.level === 2) return renderTextBlock(block.text, styles.sectionHeading, ctx);
    if (block.level === 3) return renderTextBlock(block.text, styles.roleHeading, ctx);
    return renderTextBlock(block.text, styles.subHeading, ctx);
  }
  if (block.kind === "paragraph") {
    return renderTextBlock(block.text, styles.paragraph, ctx);
  }
  if (block.kind === "list") {
    return <BulletList items={block.items} ctx={ctx} />;
  }
  if (block.kind === "contacts") {
    return <ContactRow atoms={block.atoms} ctx={ctx} />;
  }
  return null;
}

export function BusinessTemplate({ ast, theme }: { ast: ResumeDoc; theme: ResumeTheme }) {
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
        {ast.blocks.map((block, i) => (
          <Block key={i} block={block} ctx={ctx} />
        ))}
      </Page>
    </Document>
  );
}
