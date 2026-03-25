"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronRight, Plus, Upload, MoreHorizontal, Copy, GitBranch, Pencil, Trash2, FileText } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { SavedDocument } from "@/lib/storage";

interface Props {
  files: SavedDocument[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onUpload: () => void;
  onCreateBlank: () => void;
  onDuplicate: (id: string, asVariant: boolean) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

export function DocSidebar({
  files,
  activeId,
  loading,
  onSelect,
  onUpload,
  onCreateBlank,
  onDuplicate,
  onRename,
  onDelete,
  onToggleCollapse,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId) {
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [renamingId]);

  const startRename = useCallback((doc: SavedDocument) => {
    setRenamingId(doc.id);
    setRenameValue(doc.name.replace(/\.pdf$/i, ""));
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue, onRename]);

  // Build tree: bases + variants grouped by parentId
  const bases = files.filter((f) => !f.parentId);
  const variantMap = new Map<string, SavedDocument[]>();
  for (const f of files) {
    if (f.parentId) {
      const list = variantMap.get(f.parentId) || [];
      list.push(f);
      variantMap.set(f.parentId, list);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-3">
      {bases.map((base) => {
        const variants = variantMap.get(base.id) || [];
        const hasVariants = variants.length > 0;
        const isCollapsed = base.collapsed ?? false;

        return (
          <div key={base.id} className="mb-0.5">
            {/* Base document row */}
            <div
              className={`group w-full flex items-center gap-1 px-1.5 py-1.5 rounded-lg transition-colors ${
                activeId === base.id ? "bg-black/[0.05]" : "hover:bg-black/[0.02]"
              }`}
            >
              {/* Chevron */}
              <button
                onClick={() => hasVariants && onToggleCollapse(base.id)}
                className={`shrink-0 p-0.5 rounded transition-transform ${hasVariants ? "hover:bg-black/5" : "opacity-0 pointer-events-none"}`}
              >
                <ChevronRight
                  className={`size-3 text-black/40 transition-transform duration-150 ${!isCollapsed && hasVariants ? "rotate-90" : ""}`}
                />
              </button>

              {/* Preview + name */}
              <button
                onClick={() => onSelect(base.id)}
                className="flex-1 flex items-center gap-2 min-w-0 text-left"
              >
                <DocPreview html={base.htmlContent} />
                <div className="flex flex-col min-w-0">
                  {renamingId === base.id ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                      }}
                      className="text-[12px] text-black bg-transparent border-b border-black/20 outline-none w-full"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="text-[12px] text-black truncate">{base.name.replace(/\.pdf$/i, "")}</span>
                  )}
                  {renamingId !== base.id && (
                    <span className="text-[10px] text-black/30">{base.date}</span>
                  )}
                </div>
              </button>

              {/* Context menu */}
              <ContextMenu
                doc={base}
                isBase
                onRename={() => startRename(base)}
                onDuplicate={() => onDuplicate(base.id, false)}
                onCreateVariant={() => onDuplicate(base.id, true)}
                onDelete={() => onDelete(base.id)}
              />
            </div>

            {/* Variants */}
            {!isCollapsed &&
              variants.map((variant) => (
                <div
                  key={variant.id}
                  className={`group w-full flex items-center gap-1 pl-7 pr-1.5 py-1 rounded-lg transition-colors ${
                    activeId === variant.id ? "bg-black/[0.05]" : "hover:bg-black/[0.02]"
                  }`}
                >
                  <button
                    onClick={() => onSelect(variant.id)}
                    className="flex-1 flex items-center gap-2 min-w-0 text-left"
                  >
                    <FileText className="size-3.5 text-black/25 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      {renamingId === variant.id ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                          }}
                          className="text-[11px] text-black bg-transparent border-b border-black/20 outline-none w-full"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-[11px] text-black/70 truncate">{variant.name}</span>
                      )}
                    </div>
                  </button>

                  <ContextMenu
                    doc={variant}
                    isBase={false}
                    onRename={() => startRename(variant)}
                    onDuplicate={() => onDuplicate(variant.id, false)}
                    onDelete={() => onDelete(variant.id)}
                  />
                </div>
              ))}
          </div>
        );
      })}

      {/* Actions row */}
      <div className="flex gap-1 mt-1">
        <button
          onClick={onCreateBlank}
          className="flex-1 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-black/35 hover:bg-black/[0.02] transition-colors"
        >
          <Plus className="size-3.5" />
          <span className="text-[11px]">New</span>
        </button>
        <button
          onClick={onUpload}
          className="flex-1 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-black/35 hover:bg-black/[0.02] transition-colors"
        >
          <Upload className="size-3.5" />
          <span className="text-[11px]">{loading ? "Parsing..." : "Upload"}</span>
        </button>
      </div>
    </div>
  );
}

function ContextMenu({
  doc,
  isBase,
  onRename,
  onDuplicate,
  onCreateVariant,
  onDelete,
}: {
  doc: SavedDocument;
  isBase: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onCreateVariant?: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  const item = (icon: React.ReactNode, label: string, action: () => void, destructive = false) => (
    <button
      key={label}
      onClick={() => { action(); setOpen(false); }}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-md transition-colors ${
        destructive ? "text-red-600 hover:bg-red-50" : "text-black/70 hover:bg-black/[0.04]"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 transition-opacity" />
        }
      >
        <MoreHorizontal className="size-3.5 text-black/40" />
      </PopoverTrigger>
      <PopoverContent side="right" sideOffset={4} className="w-[160px] p-1">
        {item(<Pencil className="size-3" />, "Rename", onRename)}
        {item(<Copy className="size-3" />, "Duplicate", onDuplicate)}
        {isBase && onCreateVariant && item(<GitBranch className="size-3" />, "Create variant", onCreateVariant)}
        {item(<Trash2 className="size-3" />, "Delete", onDelete, true)}
      </PopoverContent>
    </Popover>
  );
}

function DocPreview({ html }: { html: string }) {
  return (
    <div className="w-7 h-9 rounded border border-black/10 bg-white shrink-0 overflow-hidden">
      <div
        className="origin-top-left pointer-events-none select-none"
        style={{ transform: "scale(0.045)", width: 612, lineHeight: 1.2 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
