"use client";

import * as React from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ResumePreview } from "@/components/resume-preview";
import { SelectionPopover } from "@/components/selection-popover";
import type { ResumeTheme } from "@/lib/resume-theme";
import type { SavedDocument } from "@/lib/storage";

export type CenterTab = "edit" | "preview";

interface CenterTabsProps {
  tab: CenterTab;
  onTabChange: (tab: CenterTab) => void;
  markdown: string;
  onMarkdownChange: (md: string) => void;
  theme: ResumeTheme;
  template: string;
  onEnsureAiFork: () => Promise<SavedDocument | null>;
  onOpenAiTab: () => void;
}

// The Edit panel and the Preview panel stay mounted together — we toggle
// visibility with `hidden` so the PDF render state survives tab switches.
export function CenterTabs({
  tab,
  onTabChange,
  markdown,
  onMarkdownChange,
  theme,
  template,
  onEnsureAiFork,
  onOpenAiTab,
}: CenterTabsProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-0 border-b border-border bg-background px-4">
        <TabButton active={tab === "edit"} onClick={() => onTabChange("edit")}>
          Edit
        </TabButton>
        <TabButton active={tab === "preview"} onClick={() => onTabChange("preview")}>
          Preview
        </TabButton>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className={`absolute inset-0 flex justify-center transition-opacity duration-150 ease-[var(--ease-ios)] ${tab === "edit" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          aria-hidden={tab !== "edit"}
        >
          <div className="h-full w-full max-w-[720px]">
            <MarkdownEditor
              ref={textareaRef}
              value={markdown}
              onChange={onMarkdownChange}
              placeholder="# Your Name&#10;Label&#10;email · phone · location&#10;&#10;## Experience&#10;&#10;### Company — Role&#10;Dates · Location&#10;- Bullet"
            />
          </div>
          {tab === "edit" ? (
            <SelectionPopover
              textareaRef={textareaRef}
              onEnsureAiFork={onEnsureAiFork}
              onOpenAiTab={onOpenAiTab}
            />
          ) : null}
        </div>
        <div
          className={`absolute inset-0 transition-opacity duration-150 ease-[var(--ease-ios)] ${tab === "preview" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          aria-hidden={tab !== "preview"}
        >
          <ResumePreview markdown={markdown} theme={theme} template={template} />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative px-3 py-2.5 text-[11px] font-mono uppercase tracking-[0.14em] " +
        (active
          ? "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-px after:bg-foreground"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}
