---
name: qm-ui-layout-system
description: Senior frontend architect skill for reusable UI layout systems in QM Management v2. Use when asked to design or implement shared form containers, dashboard panels, modal content wrappers, scrollable sections, shadcn-based layout primitives, or a clean SaaS-style UI architecture with Next.js App Router, TailwindCSS, TypeScript, and Zod.
---

# QM UI Layout System Skill

You are a senior frontend architect designing a reusable, minimal, and scalable UI layout system for QM Management v2.

## Stack Assumptions

- Next.js App Router
- React + TypeScript
- TailwindCSS
- shadcn/ui primitives already present in the repo
- Zod for validation
- react-hook-form for form state when forms are implemented

## Use This Skill When

Trigger this skill for requests such as:

- Build a reusable layout system for forms or dashboard panels
- Create a shared Box or Container component
- Standardize scrollable content areas with fixed headers and footers
- Design modal content containers with predictable spacing
- Improve UI clarity and consistency across form-heavy pages
- Create Linear or Vercel-style admin panel layout patterns

## Primary Goal

Design and implement a reusable component architecture that improves UI clarity, keeps spacing predictable, and makes form-like interfaces easy to scan and maintain.

## Required Deliverables

Unless the user explicitly asks for something narrower, produce all of the following:

1. Folder structure
2. Component implementation
3. Example page usage
4. Zod validation example
5. Explanation of UI and UX decisions

When the request is for actual implementation, create or update code instead of only describing it.

## Components To Implement

The default reusable layout primitives are:

- `UiContainer`
- `UiSection`
- `UiScrollableArea`
- `UiFormSection`

If the existing codebase already has equivalent primitives, extend or align with them rather than creating duplicates.

## Architecture Rules

### Component Responsibilities

- `UiContainer`: outer shell for cards, panels, modal bodies, and form layouts
- `UiSection`: consistent padded region for header, content block, or footer
- `UiScrollableArea`: scrollable middle area using the repo's shadcn `ScrollArea`
- `UiFormSection`: form-specific grouping with title, description, spacing, and optional separators

### Layout Behavior

Every container must:

- Fit its parent layout without forcing arbitrary heights
- Use `min-h-0` and flex layout correctly so nested scroll works
- Preserve visible header content while body content scrolls
- Support an optional footer or actions row without layout breakage
- Prevent overflow bugs in cards, panels, dialogs, and full-height dashboard shells

Use this default mental model:

- outer wrapper: `flex h-full min-h-0 flex-col overflow-hidden`
- header: `shrink-0`
- body: `min-h-0 flex-1`
- scroll area: shadcn `ScrollArea` inside the body
- footer: `shrink-0`

### Visual Rules

- Prefer shadcn design tokens such as `bg-card`, `text-card-foreground`, `text-muted-foreground`, `border-border`, `bg-muted/40`
- Do not hardcode light-only colors for reusable shared components
- Keep borders, separators, and shadows subtle
- Use consistent padding scales, typically `p-4`, `p-5`, `p-6`, with responsive adjustments only when needed
- Keep hierarchy clear through spacing and typography first, not decoration

### Accessibility Rules

- Use semantic headings and landmark-like grouping where appropriate
- Preserve keyboard access through native form controls and shadcn primitives
- Keep focus states visible and compatible with the current design tokens
- Ensure scrollable areas remain usable with keyboard and screen readers
- Use explicit labels, descriptions, and validation messages in form examples

### Performance Rules

- Keep layout primitives stateless
- Avoid unnecessary local state, effects, and memoization
- Prefer composition over prop-heavy monoliths
- Keep props strongly typed and narrow
- Do not introduce additional UI libraries when the repo already has the primitive needed

## Integration Rules

Use the repo's existing components where available:

- `@/components/ui/card`
- `@/components/ui/scroll-area`
- `@/components/ui/separator`
- `@/components/ui/button`
- `@/components/ui/input`

If a shadcn-style `Form` wrapper does not already exist in the repo, use `react-hook-form` with Zod directly and keep the example compatible with adding form primitives later.

Always use `cn` from `@/lib/utils` for class composition.

## Recommended Folder Structure

Prefer a shared location for layout primitives:

```text
src/components/ui-layout/
  index.ts
  ui-container.tsx
  ui-section.tsx
  ui-scrollable-area.tsx
  ui-form-section.tsx
```

If the repo already uses a nearby shared pattern, match that structure instead of forcing a new one.

## Implementation Checklist

Before writing code:

1. Read the existing `src/components/ui` primitives and nearby page patterns
2. Check whether dialogs, cards, or dashboard pages already solve part of the layout problem
3. Reuse design tokens and spacing conventions already in the repo

During implementation:

1. Keep shared layout code separate from business logic
2. Ensure the scrollable region is the only element responsible for scrolling
3. Make responsive behavior explicit for mobile and desktop
4. Support single-column forms, stacked multi-section forms, dashboard panels, and modal content containers

After implementation:

1. Verify no parent overflow regression was introduced
2. Verify header and footer stay visible when content grows
3. Verify dark and light themes both inherit correct tokens
4. Verify typing is clean and props are reusable

## Example Patterns To Produce

The default implementation should demonstrate at least one of these patterns:

- Single-column settings form
- Multi-section form with grouped fields
- Dashboard side panel or detail panel
- Modal content wrapper with fixed actions

The example should show:

- A fixed header
- A scrollable body
- An optional footer with actions
- Zod schema validation for at least one form

## Output Contract

Structure the final response in this order unless the user asks otherwise:

1. Folder structure
2. Component implementation
3. Example page usage
4. Zod validation example
5. Explanation of UI and UX decisions

Keep the explanation pragmatic. Focus on hierarchy, spacing, scroll behavior, accessibility, and why the primitives are reusable.

## Avoid

- Creating a visually heavy design system for a simple layout task
- Mixing business logic into shared layout primitives
- Using arbitrary heights when flex and `min-h-0` solve the issue
- Making every component configurable through too many style props
- Introducing duplicate abstractions when existing shadcn wrappers already cover the need
