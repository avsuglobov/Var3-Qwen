"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export const DialogOverlay = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(function DialogOverlay({ className, ...props }, ref) {
  return <DialogPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-50 bg-scrim", className)} {...props} />;
});

export const DialogContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showClose?: boolean }>(
  function DialogContent({ className, children, showClose = true, ...props }, ref) {
    return (
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn("fixed left-1/2 top-[15vh] z-50 w-[calc(100%-32px)] max-w-lg -translate-x-1/2 rounded-card border border-border bg-popover text-foreground shadow-pop", className)}
          {...props}
        >
          {children}
          {showClose ? (
            <DialogPrimitive.Close className="transition-ui absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Закрыть">
              <X className="size-4" />
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }
);
