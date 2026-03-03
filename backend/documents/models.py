from __future__ import annotations

import uuid

from django.db import models


class Document(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handbook_id = models.CharField(max_length=128, db_index=True)
    name = models.CharField(max_length=255)
    relative_path = models.TextField()
    original_file_path = models.TextField()
    mime_type = models.CharField(max_length=255)
    size_bytes = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "documents_document"
        indexes = [
            models.Index(fields=["handbook_id", "deleted_at"], name="documents_d_handboo_56b9ce_idx"),
            models.Index(fields=["handbook_id", "updated_at"], name="documents_d_handboo_9a469e_idx"),
        ]


class DocumentVariable(models.Model):
    class Source(models.TextChoices):
        USER_INPUT = "user_input", "User Input"
        SYSTEM = "system", "System"
        AI_GENERATED = "ai_generated", "AI Generated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="variables",
    )
    variable_name = models.CharField(max_length=255)
    required = models.BooleanField(default=False)
    source = models.CharField(max_length=32, choices=Source.choices, default=Source.USER_INPUT)
    type = models.CharField(max_length=32, default="string")
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "documents_document_variable"
        constraints = [
            models.UniqueConstraint(
                fields=["document", "variable_name"],
                name="documents_doc_variable_unique",
            )
        ]
        indexes = [models.Index(fields=["document", "source"], name="documents_d_documen_50a15c_idx")]


class DocumentVersion(models.Model):
    class CreatedBy(models.TextChoices):
        USER = "user", "User"
        SYSTEM = "system", "System"
        AI = "ai", "AI"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version_number = models.IntegerField()
    file_path = models.TextField()
    mime_type = models.CharField(max_length=255)
    size_bytes = models.BigIntegerField(default=0)
    created_by = models.CharField(max_length=16, choices=CreatedBy.choices)
    ai_prompt = models.TextField(null=True, blank=True)
    ai_model = models.CharField(max_length=128, null=True, blank=True)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "documents_document_version"
        constraints = [
            models.UniqueConstraint(
                fields=["document", "version_number"],
                name="documents_doc_version_unique",
            )
        ]
        indexes = [
            models.Index(fields=["document", "-version_number"], name="documents_d_documen_d7b063_idx"),
            models.Index(fields=["created_by", "created_at"], name="documents_d_created_dfd06e_idx"),
        ]


class WorkspaceAsset(models.Model):
    class AssetType(models.TextChoices):
        LOGO = "logo", "Logo"
        SIGNATURE = "signature", "Signature"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handbook_id = models.CharField(max_length=128, db_index=True)
    asset_type = models.CharField(max_length=32, choices=AssetType.choices)
    file_path = models.TextField()
    mime_type = models.CharField(max_length=255)
    sha256 = models.CharField(max_length=64, blank=True, default="")
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "documents_workspace_asset"
        indexes = [
            models.Index(fields=["handbook_id", "asset_type", "deleted_at"], name="documents_w_handboo_7944f3_idx"),
        ]


class RewriteAudit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="rewrite_audits",
    )
    source_version = models.ForeignKey(
        DocumentVersion,
        on_delete=models.SET_NULL,
        related_name="rewrite_sources",
        null=True,
        blank=True,
    )
    instruction = models.TextField()
    ai_model = models.CharField(max_length=128)
    success = models.BooleanField(default=False)
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "documents_rewrite_audit"
        indexes = [models.Index(fields=["document", "created_at"], name="documents_r_documen_6f152d_idx")]
