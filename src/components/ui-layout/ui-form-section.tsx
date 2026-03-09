"use client";

import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface UiFormSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  separator?: boolean;
}

export function UiFormSection({
  title,
  description,
  separator = false,
  className,
  children,
  ...props
}: UiFormSectionProps) {
  return (
    <section className={cn("space-y-4", className)} {...props}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
      {separator ? <Separator /> : null}
    </section>
  );
}
