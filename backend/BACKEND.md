# QM Documents Backend

Backend now provides a document-template pipeline scoped by `handbook_id`.

## Core capabilities
- Upload documents (`.docx`, `.pptx`, `.xlsx`, `.md`, `.txt`, `.html`, `.zip`)
- Extract placeholders in canonical format `{{ path.to.var }}`
- Persist variable contracts and document versions
- Render documents with provided variables and built-in assets (`assets.logo`, `assets.signature`)
- Embed logo/signature as binary image objects for Office outputs (`.docx`, `.pptx`, `.xlsx`)
- AI rewrite to a new text version (non-destructive)
- File tree listing and soft delete for file/folder paths

## API surface
- `POST /api/v1/documents/upload`
- `GET /api/v1/documents?handbook_id=...`
- `GET /api/v1/documents/<document_id>`
- `DELETE /api/v1/documents/<document_id>`
- `POST /api/v1/documents/<document_id>/render`
  - optional `generation_policy.on_missing_asset` = `FAIL | KEEP_PLACEHOLDER` (default `FAIL`)
- `POST /api/v1/documents/<document_id>/ai-rewrite`
- `GET /api/v1/documents/<document_id>/download?version=latest|<n>`
- `GET /api/v1/files/tree?handbook_id=...`
- `DELETE /api/v1/files`
- `GET|POST /api/v1/handbooks/<handbook_id>/assets`

## Data model
- `documents_document`
- `documents_document_variable`
- `documents_document_version`
- `documents_workspace_asset`
- `documents_rewrite_audit`
