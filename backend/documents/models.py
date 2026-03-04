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


class Handbook(models.Model):
    class HandbookType(models.TextChoices):
        ISO9001 = "ISO9001", "ISO 9001"
        ISO14001 = "ISO14001", "ISO 14001"
        ISO45001 = "ISO45001", "ISO 45001"
        SCC_STAR = "SCC_STAR", "SCC*"
        SCC_DOUBLESTAR = "SCC_DOUBLESTAR", "SCC**"
        SCCP = "SCCP", "SCCP"
        SCP = "SCP", "SCP"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        READY = "READY", "Ready"
        EXPORTED = "EXPORTED", "Exported"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        "clients.Client",
        on_delete=models.CASCADE,
        related_name="handbooks",
    )
    type = models.CharField(max_length=32, choices=HandbookType.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    root_storage_path = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "documents_handbook"
        indexes = [
            models.Index(fields=["customer", "created_at"], name="docs_h_cust_created_idx"),
            models.Index(fields=["status", "updated_at"], name="docs_h_status_updated_idx"),
        ]


class HandbookFile(models.Model):
    class FileType(models.TextChoices):
        DOCX = "DOCX", "DOCX"
        PPTX = "PPTX", "PPTX"
        XLSX = "XLSX", "XLSX"
        OTHER = "OTHER", "OTHER"

    class ParseStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PARSED = "PARSED", "Parsed"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handbook = models.ForeignKey(
        Handbook,
        on_delete=models.CASCADE,
        related_name="files",
    )
    path_in_handbook = models.TextField()
    file_type = models.CharField(max_length=8, choices=FileType.choices, default=FileType.OTHER)
    original_blob_ref = models.TextField()
    working_blob_ref = models.TextField(blank=True, default="")
    parse_status = models.CharField(max_length=16, choices=ParseStatus.choices, default=ParseStatus.PENDING)
    checksum = models.CharField(max_length=64, blank=True, default="")
    size = models.BigIntegerField(default=0)
    mime = models.CharField(max_length=255, blank=True, default="")
    placeholder_total = models.IntegerField(default=0)
    placeholder_resolved = models.IntegerField(default=0)
    parse_error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "documents_handbook_file"
        constraints = [
            models.UniqueConstraint(
                fields=["handbook", "path_in_handbook"],
                name="documents_handbook_file_unique_path",
            )
        ]
        indexes = [
            models.Index(fields=["handbook", "parse_status"], name="docs_hf_hb_parse_idx"),
            models.Index(fields=["handbook", "path_in_handbook"], name="docs_hf_hb_path_idx"),
        ]


class Placeholder(models.Model):
    class Kind(models.TextChoices):
        TEXT = "TEXT", "Text"
        ASSET = "ASSET", "Asset"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handbook_file = models.ForeignKey(
        HandbookFile,
        on_delete=models.CASCADE,
        related_name="placeholders",
    )
    key = models.CharField(max_length=255)
    kind = models.CharField(max_length=8, choices=Kind.choices)
    required = models.BooleanField(default=True)
    occurrences = models.IntegerField(default=0)
    meta = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "documents_placeholder"
        constraints = [
            models.UniqueConstraint(
                fields=["handbook_file", "key"],
                name="documents_placeholder_file_key_unique",
            )
        ]
        indexes = [
            models.Index(fields=["handbook_file", "kind"], name="docs_p_file_kind_idx"),
        ]


class PlaceholderValue(models.Model):
    class Source(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        AI = "AI", "AI"
        IMPORTED = "IMPORTED", "Imported"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handbook = models.ForeignKey(
        Handbook,
        on_delete=models.CASCADE,
        related_name="placeholder_values",
    )
    key = models.CharField(max_length=255)
    value_text = models.TextField(null=True, blank=True)
    asset_id = models.UUIDField(null=True, blank=True)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.MANUAL)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "documents_placeholder_value"
        constraints = [
            models.UniqueConstraint(
                fields=["handbook", "key"],
                name="documents_placeholder_value_unique_key",
            )
        ]
        indexes = [
            models.Index(fields=["handbook", "updated_at"], name="docs_pv_hb_updated_idx"),
        ]


class VersionSnapshot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handbook = models.ForeignKey(
        Handbook,
        on_delete=models.CASCADE,
        related_name="snapshots",
    )
    version_number = models.IntegerField()
    manifest = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "documents_version_snapshot"
        constraints = [
            models.UniqueConstraint(
                fields=["handbook", "version_number"],
                name="documents_snapshot_unique_version",
            )
        ]
        indexes = [
            models.Index(fields=["handbook", "-version_number"], name="docs_vs_hb_ver_idx"),
        ]
