"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface UiScrollableAreaProps extends React.ComponentProps<typeof ScrollArea> {
  viewportClassName?: string;
}

export function UiScrollableArea({
  className,
  viewportClassName,
  children,
  ...props
}: UiScrollableAreaProps) {
  return (
    <div className="min-h-0 flex-1">
      <ScrollArea className={cn("h-full min-h-0", className)} {...props}>
        <div className={cn("min-h-full", viewportClassName)}>{children}</div>
      </ScrollArea>
    </div>
  );
}
