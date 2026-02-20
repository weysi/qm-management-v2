import * as React from "react"
import { cn } from "@/lib/utils"

// ── Base shadcn Textarea ───────────────────────────────────────────────────────
const BaseTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
BaseTextarea.displayName = "BaseTextarea"

// ── Field-level Textarea with optional label and error ─────────────────────────
interface TextareaProps extends React.ComponentProps<"textarea"> {
  label?: string
  error?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, id, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {label}
          </label>
        )}
        <BaseTextarea
          ref={ref}
          id={id}
          className={cn(error && "border-destructive focus-visible:ring-destructive", className)}
          {...props}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea, BaseTextarea }
