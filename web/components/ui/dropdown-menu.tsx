"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const DropdownMenuContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn("z-50 min-w-44 rounded-card border border-border bg-popover p-1 text-foreground shadow-pop", className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuLabel = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>>(function DropdownMenuLabel({ className, ...props }, ref) {
  return <DropdownMenuPrimitive.Label ref={ref} className={cn("section-label px-2 py-1.5", className)} {...props} />;
});

export const DropdownMenuRadioItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn("relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-muted", className)}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
});
