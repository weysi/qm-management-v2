# QM Documents Backend

Backend now provides a document-template pipeline scoped by `handbook_id`.

## Core capabilities
- Upload documents (`.docx`, `.md`, `.txt`, `.html`)
- Extract placeholders in canonical format `{{ path.to.var }}`
- Persist variable contracts and document versions
- Render documents with provided variables and built-in assets (`assets.logo`, `assets.signature`)
- AI rewrite to a new text version (non-destructive)
- File tree listing and soft delete for file/folder paths

## API surface
- `POST /api/v1/documents/upload`
- `GET /api/v1/documents?handbook_id=...`
- `GET /api/v1/documents/<document_id>`
- `DELETE /api/v1/documents/<document_id>`
- `POST /api/v1/documents/<document_id>/render`
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
