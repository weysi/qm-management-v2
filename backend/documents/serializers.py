from __future__ import annotations

from pathlib import Path

from rest_framework import serializers

from .models import (
    DocumentTextExtractionCache,
    Document,
    DocumentVariable,
    DocumentVersion,
    Handbook,
    HandbookFile,
    Placeholder,
    PlaceholderGenerationAudit,
    PlaceholderValue,
    ReferenceChunk,
    ReferenceDocument,
    ReferenceDocumentLink,
    VersionSnapshot,
    WorkspaceAsset,
)
from .services.asset_service import (
    asset_download_url,
    asset_filename,
    asset_size_bytes,
    asset_status,
    is_previewable_image,
)


class DocumentVariableSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentVariable
        fields = [
            "id",
            "variable_name",
            "required",
            "source",
            "type",
            "metadata",
            "created_at",
        ]


class DocumentVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentVersion
        fields = [
            "id",
            "version_number",
            "file_path",
            "mime_type",
            "size_bytes",
            "created_by",
            "ai_prompt",
            "ai_model",
            "metadata",
            "created_at",
        ]


class DocumentSerializer(serializers.ModelSerializer):
    variables = DocumentVariableSerializer(many=True, read_only=True)
    versions = DocumentVersionSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "handbook_id",
            "name",
            "relative_path",
            "original_file_path",
            "mime_type",
            "size_bytes",
            "created_at",
            "updated_at",
            "deleted_at",
            "variables",
            "versions",
        ]


class WorkspaceAssetSerializer(serializers.ModelSerializer):
    kind = serializers.SerializerMethodField()
    filename = serializers.SerializerMethodField()
    size_bytes = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceAsset
        fields = [
            "id",
            "handbook_id",
            "kind",
            "asset_type",
            "filename",
            "file_path",
            "mime_type",
            "size_bytes",
            "status",
            "preview_url",
            "download_url",
            "created_at",
            "updated_at",
        ]

    def get_kind(self, obj: WorkspaceAsset) -> str:
        return obj.asset_type

    def get_filename(self, obj: WorkspaceAsset) -> str:
        return asset_filename(obj)

    def get_size_bytes(self, obj: WorkspaceAsset) -> int:
        return asset_size_bytes(obj)

    def get_status(self, obj: WorkspaceAsset) -> str:
        return asset_status(obj)

    def get_preview_url(self, obj: WorkspaceAsset) -> str | None:
        if not is_previewable_image(obj):
            return None
        return asset_download_url(obj.handbook_id, obj.asset_type)

    def get_download_url(self, obj: WorkspaceAsset) -> str:
        return asset_download_url(obj.handbook_id, obj.asset_type)


class HandbookSerializer(serializers.ModelSerializer):
    customer_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Handbook
        fields = [
            "id",
            "customer_id",
            "type",
            "status",
            "root_storage_path",
            "created_at",
            "updated_at",
        ]


class HandbookFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = HandbookFile
        fields = [
            "id",
            "handbook_id",
            "path_in_handbook",
            "file_type",
            "original_blob_ref",
            "working_blob_ref",
            "parse_status",
            "checksum",
            "size",
            "mime",
            "placeholder_total",
            "placeholder_resolved",
            "parse_error",
            "created_at",
            "updated_at",
        ]


class PlaceholderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Placeholder
        fields = [
            "id",
            "handbook_file_id",
            "key",
            "kind",
            "required",
            "occurrences",
            "meta",
            "created_at",
        ]


class PlaceholderValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlaceholderValue
        fields = [
            "id",
            "handbook_id",
            "key",
            "value_text",
            "asset_id",
            "last_generation_audit_id",
            "source",
            "updated_at",
        ]


class ReferenceDocumentLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReferenceDocumentLink
        fields = [
            "id",
            "reference_document_id",
            "scope",
            "handbook_file_id",
            "placeholder_id",
            "created_at",
        ]


class ReferenceChunkSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReferenceChunk
        fields = [
            "id",
            "reference_document_id",
            "ordinal",
            "chunk_type",
            "title",
            "locator",
            "content",
            "content_hash",
            "estimated_tokens",
            "created_at",
        ]


class ReferenceDocumentSerializer(serializers.ModelSerializer):
    links = serializers.SerializerMethodField()

    class Meta:
        model = ReferenceDocument
        fields = [
            "id",
            "handbook_id",
            "original_filename",
            "file_type",
            "mime_type",
            "storage_path",
            "normalized_storage_path",
            "checksum",
            "size_bytes",
            "parse_status",
            "parse_error",
            "summary",
            "section_count",
            "created_at",
            "updated_at",
            "links",
        ]

    def get_links(self, obj: ReferenceDocument) -> list[dict[str, object]]:
        links = getattr(obj, "links", None)
        if links is None:
            return []
        return ReferenceDocumentLinkSerializer(links.all(), many=True).data


class PlaceholderGenerationAuditSerializer(serializers.ModelSerializer):
    usage = serializers.SerializerMethodField()

    class Meta:
        model = PlaceholderGenerationAudit
        fields = [
            "id",
            "handbook_id",
            "handbook_file_id",
            "placeholder_id",
            "mode",
            "instruction",
            "output_style",
            "language",
            "model",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "usage",
            "references_used",
            "file_context_used",
            "fallback_path",
            "trace",
            "success",
            "error_message",
            "created_at",
        ]

    def get_usage(self, obj: PlaceholderGenerationAudit) -> dict[str, int]:
        return {
            "prompt_tokens": obj.prompt_tokens,
            "completion_tokens": obj.completion_tokens,
            "total_tokens": obj.total_tokens,
        }


class VersionSnapshotSerializer(serializers.ModelSerializer):
    downloadable = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = VersionSnapshot
        fields = [
            "id",
            "handbook_id",
            "version_number",
            "manifest",
            "downloadable",
            "download_url",
            "created_at",
        ]

    def get_downloadable(self, obj: VersionSnapshot) -> bool:
        manifest = obj.manifest if isinstance(obj.manifest, dict) else {}
        if manifest.get("reason") != "export":
            return False

        root = Path(obj.handbook.root_storage_path or "")
        if root.exists():
            fallback = root / "exports" / f"handbook-{obj.handbook_id}-v{obj.version_number}.zip"
            if fallback.exists() and fallback.is_file():
                return True

        export_path = manifest.get("export_zip_path")
        if not isinstance(export_path, str) or not export_path.strip():
            return False
        candidate = Path(export_path)
        if not candidate.is_absolute():
            candidate = (root / candidate).resolve()
        return candidate.exists() and candidate.is_file()

    def get_download_url(self, obj: VersionSnapshot) -> str | None:
        if not self.get_downloadable(obj):
            return None
        return f"/api/v1/handbooks/{obj.handbook_id}/versions/{obj.version_number}/download"
