"use client";

import { Toaster } from "sonner";
import { CheckCircle2, XCircle, Info } from "lucide-react";

export function CustomToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-white shadow-lg shadow-black/[0.08] border border-black/[0.06] text-[13px] font-medium text-black whitespace-nowrap",
          title: "text-[13px] font-medium text-black",
          icon: "shrink-0 m-0",
        },
      }}
      icons={{
        success: <CheckCircle2 className="size-4 text-emerald-500" />,
        error: <XCircle className="size-4 text-red-500" />,
        info: <Info className="size-4 text-blue-500" />,
      }}
    />
  );
}
