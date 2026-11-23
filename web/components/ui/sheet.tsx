"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/** Боковая панель (drawer) на базе Radix Dialog — для мобильной навигации. */
export const Sheet = DialogPrimitive.Root;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(function SheetContent({ className, children, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn("fixed inset-y-0 left-0 z-50 flex w-[min(86vw,var(--sidebar-w))] flex-col border-r border-border bg-card text-foreground shadow-pop", className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
