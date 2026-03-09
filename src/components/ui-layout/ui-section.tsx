"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface UiSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  muted?: boolean;
}

export function UiSection({
  muted,
  className,
  ...props
}: UiSectionProps) {
  return (
    <div
      className={cn(
        "shrink-0 px-5 py-5 sm:px-6",
        muted && "bg-muted/40",
        className,
      )}
      {...props}
    />
  );
}
