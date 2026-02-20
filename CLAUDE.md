# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**QM Management v2** — A consulting management platform for generating and editing ISO audit manual packages. The core workflow is:

1. Gather client data (name, address, field of work, etc.)
2. Store that data as named placeholder values (e.g. `{{FIRMA_NAME}}`)
3. AI (OpenAI API) auto-fills ISO manual templates by replacing placeholders and generating contextually appropriate content per section
4. Reference/form files (Formblätter, e.g. `FB_4_1_0`) are auto-generated based on company structure

## Tech Stack

- **Framework**: Next.js (App Router)
- **UI**: React + Tailwind CSS + ShadcnUI
- **State / Server State**: TanStack Query (data fetching) + TanStack Table (tabular views)
- **Validation**: Zod (schemas for client data, placeholder maps, form definitions)
- **AI**: OpenAI API (ChatGPT) for template content generation
- **Language**: TypeScript throughout

## Commands

```bash
# Development
npm run dev          # Start Next.js dev server

# Build & lint
npm run build        # Production build
npm run lint         # ESLint check
npm run type-check   # tsc --noEmit

# Tests
npm test             # Run all tests (Jest / Vitest)
npm test -- --testPathPattern=<path>  # Run a single test file
```

## Planned Architecture

### Directory Structure

```
src/
  app/                        # Next.js App Router pages & layouts
    (dashboard)/
      clients/                # Client list & detail pages
      manuals/                # Manual editor pages
      templates/              # Template management
    api/
      ai/generate/            # Route: POST — AI content generation
      clients/                # CRUD routes for clients
      manuals/                # CRUD routes for manuals
  components/
    client-form/              # Multi-step client intake form
    manual-editor/            # Split-pane: rendered manual + sidebar
    placeholder-sidebar/      # Key-value panel for {{PLACEHOLDER}} vars
    reference-files/          # Auto-generated Formblatt viewer/editor
    ui/                       # Shared primitives (Button, Input, Badge…)
  lib/
    ai/                       # OpenAI client & prompt builders
    placeholders/             # Regex engine: find/replace {{VAR}} tokens
    schemas/                  # Zod schemas (client, placeholder, manual)
    mock-data/                # Mock clients, templates, placeholder maps
  hooks/                      # TanStack Query hooks (useClients, useManual…)
  types/                      # Shared TypeScript types
```

### Key Data Models (Zod-validated)

```ts
// Client / company data — source of truth for placeholder values
ClientSchema: { id, name, address, zipCity, ceo, qmManager, employeeCount, products, services, industry }

// A named placeholder and its resolved value
PlaceholderSchema: { key: string  // e.g. "FIRMA_NAME"
                     value: string
                     autoFilled: boolean }

// A manual section that may contain placeholder tokens
ManualSectionSchema: { id, chapterNumber, title, content, placeholders: PlaceholderKey[], aiGenerated: boolean }

// Reference/form file auto-generated per ISO chapter
ReferenceFileSchema: { id, code, title, linkedChapters, content, generatedAt }
```

### Placeholder Engine (`lib/placeholders/`)

- `extractPlaceholders(text)` — returns all `{{KEY}}` tokens found in a template
- `resolvePlaceholders(text, map)` — replaces tokens with client values
- Sidebar lists all unresolved keys highlighted in orange; resolved keys in green

### AI Generation Flow (`app/api/ai/generate/`)

1. Receive: `{ sectionId, clientData, existingContent }`
2. Build prompt: inject client context + ISO chapter requirements
3. Call OpenAI Chat Completions
4. Return: generated markdown content with placeholders already resolved
5. Save result; mark section `aiGenerated: true`

### Manual Editor (split-pane layout)

- **Left pane**: rendered manual with highlighted `{{PLACEHOLDER}}` tokens (clickable)
- **Right sidebar**: Placeholder panel — grouped by chapter, shows key, current value, edit in-place
- AI "Fill Section" button triggers generation per chapter
- "Fill All" bulk-generates the entire manual

## Design Principles

- **SOLID**: each module has a single responsibility; AI layer, placeholder engine, and UI are fully decoupled
- **DRY**: placeholder resolution and Zod schemas are defined once and reused everywhere
- **KISS**: forms collect only what is needed; AI fills the rest; no unnecessary abstractions

## Environment Variables

```bash
OPENAI_API_KEY=sk-...    # Required for AI generation — set in .env.local, never commit
NEXT_PUBLIC_APP_URL=      # Base URL (used in meta & API calls)
```

## Mock Data

During development, all data is driven from `src/lib/mock-data/`. Use mock clients, placeholder maps, and template sections before wiring real persistence. TanStack Query hooks accept a `useMock` flag that short-circuits the API call and returns mock fixtures.
