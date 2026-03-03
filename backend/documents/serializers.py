from __future__ import annotations

from rest_framework import serializers

from .models import Document, DocumentVariable, DocumentVersion, WorkspaceAsset


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
    class Meta:
        model = WorkspaceAsset
        fields = [
            "id",
            "handbook_id",
            "asset_type",
            "file_path",
            "mime_type",
            "created_at",
            "updated_at",
        ]
