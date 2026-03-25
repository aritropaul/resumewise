"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { pxToPt, ptToPx } from "@/lib/tiptap-extensions";
import { fetchAllGoogleFonts, loadFont } from "@/lib/google-fonts";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  ChevronDown,
  Link as LinkIcon,
  Unlink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const SYSTEM_FONTS = [
  "Helvetica", "Arial", "Georgia", "Times New Roman",
  "Garamond", "Courier New", "Verdana", "Cambria", "Calibri",
  "Helvetica Neue", "Trebuchet MS",
];

const WEIGHTS = [
  { label: "Thin", value: "100" },
  { label: "ExtraLight", value: "200" },
  { label: "Light", value: "300" },
  { label: "Regular", value: "400" },
  { label: "Medium", value: "500" },
  { label: "SemiBold", value: "600" },
  { label: "Bold", value: "700" },
  { label: "ExtraBold", value: "800" },
  { label: "Black", value: "900" },
];

const SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 24, 36];

const COLOR_PRESETS = [
  "#000000", "#333333", "#555555", "#919191",
  "#007aff", "#0091ff", "#2563eb",
  "#166534", "#991b1b", "#7c2d12",
];

interface Props {
  editor: Editor | null;
  allEditors?: Editor[];
}

export function TextPanel({ editor, allEditors = [] }: Props) {
  const [fontSearch, setFontSearch] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [allFonts, setAllFonts] = useState<string[]>(SYSTEM_FONTS);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAllGoogleFonts().then((fonts) => {
      if (fonts.length > 0) {
        setAllFonts([...SYSTEM_FONTS, ...fonts]);
      }
    });
  }, []);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      return {
        fontFamily: (e.getAttributes("textStyle").fontFamily as string) || "",
        fontSize: (e.getAttributes("textStyle").fontSize as string) || "",
        fontWeight: (e.getAttributes("textStyle").fontWeight as string) || "",
        color: (e.getAttributes("textStyle").color as string) || "#000000",
        isBold: e.isActive("bold"),
        isItalic: e.isActive("italic"),
        isUnderline: e.isActive("underline"),
        isStrike: e.isActive("strike"),
        isLink: e.isActive("link"),
        linkHref: (e.getAttributes("link").href as string) || "",
        textAlign: (e.getAttributes("paragraph").textAlign as string) || "left",
        lineHeight: (e.getAttributes("paragraph").lineHeight as string) || "",
      };
    },
  });

  const filteredFonts = fontSearch
    ? allFonts.filter((f) => f.toLowerCase().includes(fontSearch.toLowerCase())).slice(0, 200)
    : allFonts.slice(0, 200);

  const cmd = useCallback(
    (fn: (e: Editor) => void) => {
      // Apply to all editors that have a non-collapsed selection
      const editorsWithSelection = allEditors.filter((e) => {
        const { from, to } = e.state.selection;
        return from !== to;
      });
      if (editorsWithSelection.length > 1) {
        editorsWithSelection.forEach((e) => fn(e));
      } else if (editor) {
        fn(editor);
      }
    },
    [editor, allEditors]
  );

  if (!editor || !state) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-[11px] text-muted-foreground">Select text to edit properties</p>
      </div>
    );
  }

  const currentPt = pxToPt(state.fontSize) || 12;

  return (
    <TooltipProvider delay={300}>
      <div className="overflow-y-auto text-[11px]">
        {/* ─── Text Section ─── */}
        <div className="px-3 py-2.5">
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-2">Text</div>

          {/* Font Picker Popover */}
          <Popover open={fontPickerOpen} onOpenChange={setFontPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between text-[11px] md:text-[11px] font-normal mb-2"
                />
              }
            >
              <span
                className="truncate"
                style={state.fontFamily ? { fontFamily: `"${state.fontFamily}", sans-serif` } : undefined}
              >
                {state.fontFamily || "Select font..."}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
            </PopoverTrigger>
            <PopoverContent side="left" sideOffset={8} className="w-[268px] p-0">
              <Input
                placeholder="Search fonts..."
                value={fontSearch}
                onChange={(e) => setFontSearch(e.target.value)}
                className="h-8 text-[11px] md:text-[11px] border-0 border-b border-input rounded-none focus-visible:ring-0 px-2.5"
              />
              <ScrollArea className="h-[240px]">
                <div ref={scrollContainerRef}>
                  {filteredFonts.map((font) => (
                    <FontItem
                      key={font}
                      font={font}
                      active={state.fontFamily.includes(font)}
                      scrollRoot={scrollContainerRef}
                      onSelect={() => {
                        loadFont(font);
                        cmd((e) => e.chain().focus().setFontFamily(font).run());
                        setFontPickerOpen(false);
                      }}
                    />
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* Weight + Size */}
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <div>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Weight</span>
              <Select
                value={state.fontWeight || (state.isBold ? "700" : "400")}
                onValueChange={(val) => {
                  cmd((ed) => ed.chain().focus().setMark("textStyle", { fontWeight: val }).run());
                }}
              >
                <SelectTrigger size="sm" className="w-full text-[11px] md:text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEIGHTS.map((w) => (
                    <SelectItem key={w.value} value={w.value} className="text-[11px]">
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Size</span>
              <div className="relative">
                <Input
                  type="number"
                  min={6}
                  max={72}
                  step={0.5}
                  value={currentPt}
                  onChange={(e) => {
                    const pt = parseFloat(e.target.value);
                    if (pt > 0) cmd((ed) => ed.chain().setFontSize(ptToPx(pt)).run());
                  }}
                  className="h-7 text-[11px] md:text-[11px] pr-6 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">pt</span>
              </div>
            </div>
          </div>

          {/* Size Presets */}
          <div className="flex flex-wrap gap-1 mb-2">
            {SIZE_PRESETS.map((s) => (
              <Button
                key={s}
                variant={Math.abs(currentPt - s) < 0.5 ? "default" : "outline"}
                size="xs"
                className="min-w-0 px-1.5 h-5 text-[10px]"
                onClick={() => cmd((e) => e.chain().focus().setFontSize(ptToPx(s)).run())}
              >
                {s}
              </Button>
            ))}
          </div>

          {/* Line Height + Letter Spacing */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Line Height</span>
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Auto"
                  value={state.lineHeight ? parseFloat(state.lineHeight) : ""}
                  onChange={(e) => {
                    const num = e.target.value;
                    cmd((ed) =>
                      ed.chain().updateAttributes("paragraph", { lineHeight: num ? `${num}px` : null }).run()
                    );
                  }}
                  className="h-7 text-[11px] md:text-[11px] pr-6 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">px</span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Spacing</span>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="0"
                  className="h-7 text-[11px] md:text-[11px] pr-6"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">px</span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* ─── Style (Alignment + Decoration merged) ─── */}
        <div className="px-3 py-2.5">
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">Style</div>
          <div className="flex items-center">
            {[
              { align: "left", icon: AlignLeft, label: "Align left" },
              { align: "center", icon: AlignCenter, label: "Align center" },
              { align: "right", icon: AlignRight, label: "Align right" },
              { align: "justify", icon: AlignJustify, label: "Justify" },
            ].map(({ align, icon: Icon, label }) => (
              <Tooltip key={align}>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={state.textAlign === align ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : ""}
                      onClick={() => cmd((e) => e.chain().focus().setTextAlign(align).run())}
                    />
                  }
                >
                  <Icon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            ))}

            <Separator orientation="vertical" className="h-4 mx-1.5" />

            {[
              { active: state.isBold, icon: Bold, label: "Bold", action: (e: Editor) => e.chain().focus().toggleBold().run() },
              { active: state.isItalic, icon: Italic, label: "Italic", action: (e: Editor) => e.chain().focus().toggleItalic().run() },
              { active: state.isUnderline, icon: Underline, label: "Underline", action: (e: Editor) => e.chain().focus().toggleUnderline().run() },
              { active: state.isStrike, icon: Strikethrough, label: "Strikethrough", action: (e: Editor) => e.chain().focus().toggleStrike().run() },
            ].map(({ active, icon: Icon, label, action }) => (
              <Tooltip key={label}>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={active ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : ""}
                      onClick={() => cmd(action)}
                    />
                  }
                >
                  <Icon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            ))}

            <Separator orientation="vertical" className="h-4 mx-1.5" />

            {/* Link */}
            <Popover onOpenChange={(open) => {
              if (open && state.isLink) setLinkUrl(state.linkHref);
              else if (open) setLinkUrl("");
            }}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <PopoverTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className={state.isLink ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : ""}
                        />
                      }
                    />
                  }
                >
                  <LinkIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Link</TooltipContent>
              </Tooltip>
              <PopoverContent side="bottom" sideOffset={4} className="w-[240px] p-2">
                <div className="flex flex-col gap-1.5">
                  <Input
                    placeholder="https://..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && linkUrl) {
                        cmd((ed) => ed.chain().focus().setLink({ href: linkUrl }).run());
                      }
                    }}
                    className="h-7 text-[11px] md:text-[11px]"
                  />
                  <div className="flex gap-1">
                    <Button
                      size="xs"
                      className="flex-1 text-[10px]"
                      onClick={() => {
                        if (linkUrl) cmd((ed) => ed.chain().focus().setLink({ href: linkUrl }).run());
                      }}
                    >
                      Apply
                    </Button>
                    {state.isLink && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="outline"
                              size="icon-xs"
                              onClick={() => cmd((ed) => ed.chain().focus().unsetLink().run())}
                            />
                          }
                        >
                          <Unlink className="size-3" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Remove link</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <Separator />

        {/* ─── Fill (Color) ─── */}
        <div className="px-3 py-2.5">
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">Fill</div>
          <div className="flex items-center gap-1.5 mb-2">
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    className="size-7 rounded-md border border-input shrink-0 cursor-pointer transition-shadow hover:ring-2 hover:ring-ring/20"
                    style={{ backgroundColor: state.color }}
                  />
                }
              />
              <PopoverContent side="left" sideOffset={8} className="w-[220px] p-2">
                <input
                  type="color"
                  value={state.color}
                  onChange={(e) => cmd((ed) => ed.chain().setColor(e.target.value).run())}
                  className="w-full h-[150px] rounded-md border-0 cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0"
                />
              </PopoverContent>
            </Popover>
            <Input
              value={state.color}
              onChange={(e) => cmd((ed) => ed.chain().setColor(e.target.value).run())}
              className="h-7 flex-1 text-[11px] md:text-[11px] font-mono"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => cmd((e) => e.chain().focus().setColor(c).run())}
                className={`size-[18px] rounded-full border transition-all cursor-pointer ${
                  state.color === c ? "ring-2 ring-primary ring-offset-1" : "border-border hover:ring-2 hover:ring-ring/20"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// Lazy-loads font CSS when the item scrolls into view
function FontItem({
  font,
  active,
  onSelect,
  scrollRoot,
}: {
  font: string;
  active: boolean;
  onSelect: () => void;
  scrollRoot?: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loaded) {
          loadFont(font);
          setLoaded(true);
          obs.disconnect();
        }
      },
      { root: scrollRoot?.current, rootMargin: "100px" }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [font, loaded, scrollRoot]);

  return (
    <button
      ref={ref}
      onClick={onSelect}
      className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-sm cursor-default transition-colors hover:bg-accent ${
        active ? "bg-accent font-medium" : ""
      }`}
      style={{ fontFamily: loaded ? `"${font}", sans-serif` : undefined }}
    >
      {font}
    </button>
  );
}
