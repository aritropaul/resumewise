"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CaretRight,
  Plus,
  UploadSimple,
  DotsThreeVertical,
  Copy,
  GitBranch,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { CircularLoader } from "@/components/ui/loader";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SavedDocument } from "@/lib/storage";
import { cn } from "@/lib/utils";

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

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  const prefersReducedMotion = useReducedMotion();
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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {bases.length === 0 && !loading && (
          <div className="px-2 py-6 text-[11px] text-muted-foreground text-center font-mono uppercase tracking-[0.12em]">
            no resumes yet
          </div>
        )}
        <AnimatePresence mode="popLayout" initial={false}>
        {bases.map((base, baseIdx) => {
          const variants = variantMap.get(base.id) || [];
          const hasVariants = variants.length > 0;
          const isCollapsed = base.collapsed ?? false;
          const isActive = activeId === base.id;
          const trimmedName = base.name.replace(/\.pdf$/i, "");

          return (
            <motion.div
              key={base.id}
              className="mb-0.5"
              layout={!prefersReducedMotion}
              initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, height: 0, overflow: "hidden" }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1], delay: Math.min(baseIdx, 10) * 0.03 }}
            >
              {/* Base row */}
              <div
                className={cn(
                  "group w-full flex items-stretch gap-0 rounded-sm transition-[background-color] duration-150 ease-[var(--ease-quart)]",
                  isActive
                    ? "bg-muted text-foreground"
                    : "hover:bg-muted/60"
                )}
              >
                {/* Active accent stripe */}
                <div
                  className={cn(
                    "w-[2px] shrink-0 transition-colors duration-150",
                    isActive ? "bg-brand" : "bg-transparent"
                  )}
                />

                <button
                  onClick={() => hasVariants && onToggleCollapse(base.id)}
                  aria-label={isCollapsed ? "expand variants" : "collapse variants"}
                  className={cn(
                    "shrink-0 px-1 flex items-center text-muted-foreground",
                    hasVariants
                      ? "hover:text-foreground"
                      : "opacity-0 pointer-events-none"
                  )}
                >
                  <CaretRight
                    weight="bold"
                    className={cn(
                      "size-3 transition-transform duration-150 ease-[var(--ease-quart)]",
                      !isCollapsed && hasVariants && "rotate-90"
                    )}
                  />
                </button>

                <button
                  onClick={() => onSelect(base.id)}
                  className="flex-1 flex items-center gap-2 min-w-0 text-left py-1.5 pr-1.5"
                >
                  <span
                    className="font-mono text-[10px] text-muted-foreground tabular shrink-0 w-5 text-right"
                    data-tabular
                  >
                    {String(baseIdx + 1).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col min-w-0 flex-1">
                    {renamingId === base.id ? (
                      <Input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        onBlur={cancelRename}
                        className="h-6 text-sm px-1.5"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="text-[13px] text-foreground truncate leading-tight" />
                          }
                        >
                          {trimmedName || "untitled"}
                        </TooltipTrigger>
                        <TooltipContent side="right">{trimmedName}</TooltipContent>
                      </Tooltip>
                    )}
                    {renamingId !== base.id && (
                      <span
                        className="font-mono text-[10px] text-muted-foreground tabular truncate"
                        data-tabular
                      >
                        {base.date}
                      </span>
                    )}
                  </div>
                </button>

                <ContextMenu
                  isBase
                  onRename={() => startRename(base)}
                  onDuplicate={() => onDuplicate(base.id, false)}
                  onCreateVariant={() => onDuplicate(base.id, true)}
                  onDelete={() => onDelete(base.id)}
                />
              </div>

              {/* Variants */}
              <AnimatePresence initial={false}>
              {!isCollapsed &&
                variants.map((variant, varIdx) => {
                  const isVarActive = activeId === variant.id;
                  const rawVariantName = variant.name.replace(/\.pdf$/i, "");
                  const variantName =
                    rawVariantName.startsWith(`${trimmedName} — `)
                      ? rawVariantName.slice(trimmedName.length + 3)
                      : rawVariantName.startsWith(`${trimmedName} `)
                      ? rawVariantName.slice(trimmedName.length + 1)
                      : rawVariantName;
                  return (
                    <motion.div
                      key={variant.id}
                      initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0, height: 0 }}
                      transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                    <div
                      className={cn(
                        "group w-full flex items-stretch gap-0 rounded-sm transition-[background-color] duration-150 ease-[var(--ease-quart)]",
                        isVarActive
                          ? "bg-muted text-foreground"
                          : "hover:bg-muted/60"
                      )}
                    >
                      <div
                        className={cn(
                          "w-[2px] shrink-0 transition-colors duration-150",
                          isVarActive ? "bg-brand" : "bg-transparent"
                        )}
                      />
                      <div className="w-4 shrink-0" aria-hidden />
                      <button
                        onClick={() => onSelect(variant.id)}
                        className="flex-1 flex items-center gap-2 min-w-0 text-left py-1 pr-1.5"
                      >
                        <span
                          className="font-mono text-[10px] text-muted-foreground/60 tabular shrink-0 w-7 text-right"
                          data-tabular
                        >
                          .{String(varIdx + 1).padStart(2, "0")}
                        </span>
                        {renamingId === variant.id ? (
                          <Input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") cancelRename();
                            }}
                            onBlur={cancelRename}
                            className="h-6 text-xs px-1.5 flex-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="text-xs text-foreground/85 truncate" />
                              }
                            >
                              {variantName || "untitled"}
                            </TooltipTrigger>
                            <TooltipContent side="right">{rawVariantName}</TooltipContent>
                          </Tooltip>
                        )}
                      </button>

                      <ContextMenu
                        isBase={false}
                        onRename={() => startRename(variant)}
                        onDuplicate={() => onDuplicate(variant.id, false)}
                        onDelete={() => onDelete(variant.id)}
                      />
                    </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>

      {/* Bottom actions — flat, mono-labeled */}
      <div className="grid grid-cols-2 border-t border-border">
        <button
          onClick={onCreateBlank}
          className="inline-flex items-center justify-center gap-1.5 h-9 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground hover:bg-muted transition-[background-color,color] duration-150 border-r border-border"
        >
          <Plus weight="bold" className="size-3" />
          new
        </button>
        <button
          onClick={onUpload}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 h-9 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground hover:bg-muted transition-[background-color,color] duration-150 disabled:opacity-60 disabled:pointer-events-none"
        >
          {loading ? (
            <CircularLoader size="sm" className="size-3" />
          ) : (
            <UploadSimple weight="bold" className="size-3" />
          )}
          {loading ? "parsing" : "import"}
        </button>
      </div>
    </div>
  );
}

function ContextMenu({
  isBase,
  onRename,
  onDuplicate,
  onCreateVariant,
  onDelete,
}: {
  isBase: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onCreateVariant?: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  const Item = (
    icon: React.ReactNode,
    label: string,
    action: () => void,
    destructive = false
  ) => (
    <button
      key={label}
      onClick={() => {
        action();
        setOpen(false);
      }}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm transition-colors duration-150",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-accent"
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            aria-label="more"
            className="shrink-0 inline-flex items-center justify-center size-6 mr-1 self-center rounded-sm opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted transition-[opacity,background-color,color] duration-150"
          />
        }
      >
        <DotsThreeVertical weight="bold" className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent side="right" sideOffset={4} className="w-[180px] p-1">
        {Item(
          <PencilSimple weight="light" className="size-3.5" />,
          "rename",
          onRename
        )}
        {Item(
          <Copy weight="light" className="size-3.5" />,
          "duplicate",
          onDuplicate
        )}
        {isBase &&
          onCreateVariant &&
          Item(
            <GitBranch weight="light" className="size-3.5" />,
            "create variant",
            onCreateVariant
          )}
        {Item(
          <Trash weight="light" className="size-3.5" />,
          "delete",
          onDelete,
          true
        )}
      </PopoverContent>
    </Popover>
  );
}
