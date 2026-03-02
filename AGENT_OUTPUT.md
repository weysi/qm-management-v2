# Agent Output Contract

Every implementation run must end with the following sections in this exact order:

1. **Changed Files**
- List every changed file path.
- Include short one-line reason per file.

2. **Token Report (Per File)**
- Source of truth: `artifacts/token_report.json`.
- Include a table with:
  - `File`
  - `Tokens Before`
  - `Tokens After`
  - `Delta`

3. **Removed Canvas Surface**
- Explicitly list all removed canvas API routes, libs, schemas, hooks, and pages.
- Include verification command output summary:
  - `grep -RIn "canvas-editor\|CanvasModel\|canvasModel" src | head`

4. **Removed Dead/Unused Code**
- List removed or refactored unused modules/routes/components.
- Mention `artifacts/dead_surface_report.txt` as audit source.

5. **Artifact Download Path**
- Print the generated zip path exactly as:
  - `Artifact: artifacts/build_<timestamp>.zip`

## Required Tooling

- Token report:
  - `python scripts/token_report.py --paths <changed files...>`
  - or `python scripts/token_report.py --git-diff HEAD`
- Dead surface audit:
  - `bash scripts/dead_surface_audit.sh`
- Packaging:
  - `bash scripts/package_repo.sh`
