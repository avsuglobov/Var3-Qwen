"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Command = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof CommandPrimitive>>(function Command({ className, ...props }, ref) {
  return <CommandPrimitive ref={ref} className={cn("flex w-full flex-col overflow-hidden rounded-card bg-popover text-foreground", className)} {...props} />;
});

export const CommandInput = React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>>(function CommandInput({ className, ...props }, ref) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <CommandPrimitive.Input
        ref={ref}
        className={cn("h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground", className)}
        {...props}
      />
    </div>
  );
});

export const CommandList = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>>(function CommandList({ className, ...props }, ref) {
  return <CommandPrimitive.List ref={ref} className={cn("max-h-[min(60vh,360px)] overflow-y-auto overflow-x-hidden p-2", className)} {...props} />;
});

export const CommandEmpty = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>>(function CommandEmpty({ className, ...props }, ref) {
  return <CommandPrimitive.Empty ref={ref} className={cn("py-6 text-center text-sm text-muted-foreground", className)} {...props} />;
});

export const CommandGroup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>>(function CommandGroup({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(className)}
      {...props}
    />
  );
});

export const CommandItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>>(function CommandItem({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-3 rounded-sm px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground",
        className
      )}
      {...props}
    />
  );
});
