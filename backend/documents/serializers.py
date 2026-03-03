from __future__ import annotations

from rest_framework import serializers

from .models import Document, DocumentVariable, DocumentVersion, WorkspaceAsset
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
