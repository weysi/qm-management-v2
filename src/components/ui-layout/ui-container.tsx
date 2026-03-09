"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface UiContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  asCard?: boolean;
}

export function UiContainer({
  asCard = true,
  className,
  ...props
}: UiContainerProps) {
  const classes = cn(
    "flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-sm",
    className,
  );

  if (!asCard) {
    return <div className={classes} {...props} />;
  }

  return <Card className={classes} {...props} />;
}
