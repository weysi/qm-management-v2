# AGENTS.md

## Project Summary
QM Management v2 is a Next.js dashboard for generating ISO 9001 handbook content from client data and placeholders.
Primary flow:
1. create/select client
2. create handbook
3. generate chapter content with AI
4. manage reference/form files
5. upload DOCX/PPTX templates, fill placeholders, and download ZIP outputs

## Stack
- Next.js App Router + React + TypeScript
- Tailwind + shadcn-style UI primitives
- TanStack Query for client data fetching/mutations
- Zod schemas in `src/lib/schemas`
- OpenAI SDK in `src/lib/ai`
- Mock persistence via in-memory `src/lib/store.ts`

## Architecture Map
- `src/app/(dashboard)/*`: dashboard pages (`/clients`, `/manuals`, etc.)
- `src/app/api/*`: route handlers for manuals, clients, AI, reference files, template files
- `src/components/manual-editor/*`: handbook editor UI + template file section
- `src/lib/ai/*`: OpenAI client + prompts + placeholder value generation
- `src/lib/placeholders/*`: `{{PLACEHOLDER}}` extraction/replacement utilities
- `src/lib/template-files/*`: DOCX/PPTX OOXML parsing and replacement utilities
- `src/lib/mock-data/*`: seed fixtures
- `src/hooks/*`: React Query hooks

## Coding Conventions
- Keep all shared contracts in Zod schemas and export types from `src/types/index.ts`.
- Prefer extending existing query/mutation patterns over custom fetch logic in components.
- Keep API routes defensive: validate payloads, return explicit 400/404 messages.
- Preserve mock-data mode semantics: use `store` arrays; no DB assumptions.
- Keep German-facing UI copy consistent with existing handbook screens.

## AI Flow Notes
- Section generation: `POST /api/ai/generate`.
- Template placeholders: map-first with `buildPlaceholderMap(client)`, then AI fallback for unresolved keys via `generatePlaceholderValues`.
- AI fallback failures are non-fatal for template generation (continue with map-only values).

## Template File Pipeline
- Upload endpoint: `POST /api/template-files/[manualId]` with multipart fields `files` and `paths`.
- Supported formats: `.docx`, `.pptx`.
- Placeholders detected via `\{\{([A-Z0-9_]+)\}\}` in OOXML XML entries.
- Generate endpoint: `POST /api/template-files/[manualId]/generate`.
- Download endpoint: `POST /api/template-files/[manualId]/download` returns ZIP preserving original path tree.

## Commands
```bash
npm run dev
npm run build
npm run lint
npm run type-check
```

## Notes
- `AGENTS.md` is additive guidance; keep `CLAUDE.md` as project context.
- In-memory store resets on server restart.
