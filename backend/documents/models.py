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
        COMPOSED = "COMPOSED", "Composed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handbook = models.ForeignKey(
        Handbook,
        on_delete=models.CASCADE,
        related_name="placeholder_values",
    )
    key = models.CharField(max_length=255)
    value_text = models.TextField(null=True, blank=True)
    asset_id = models.UUIDField(null=True, blank=True)
    last_generation_audit = models.ForeignKey(
        "PlaceholderGenerationAudit",
        on_delete=models.SET_NULL,
        related_name="applied_values",
        null=True,
        blank=True,
    )
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


class PlaceholderParseCache(models.Model):
    checksum = models.CharField(max_length=64)
    file_type = models.CharField(max_length=8, choices=HandbookFile.FileType.choices)
    placeholders = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "documents_placeholder_parse_cache"
        constraints = [
            models.UniqueConstraint(
                fields=["checksum", "file_type"],
                name="documents_placeholder_cache_unique_checksum_type",
            )
        ]
        indexes = [
            models.Index(fields=["file_type", "-updated_at"], name="docs_ppc_type_updated_idx"),
        ]


class ReferenceDocument(models.Model):
    class FileType(models.TextChoices):
        DOCX = "DOCX", "DOCX"
        PPTX = "PPTX", "PPTX"
        XLSX = "XLSX", "XLSX"
        TXT = "TXT", "TXT"
        MD = "MD", "MD"
        PDF = "PDF", "PDF"
        OTHER = "OTHER", "OTHER"

    class ParseStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PARSED = "PARSED", "Parsed"
        UNSUPPORTED = "UNSUPPORTED", "Unsupported"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handbook = models.ForeignKey(
        Handbook,
        on_delete=models.CASCADE,
        related_name="reference_documents",
    )
    original_filename = models.CharField(max_length=255)
    file_type = models.CharField(max_length=8, choices=FileType.choices, default=FileType.OTHER)
    mime_type = models.CharField(max_length=255, blank=True, default="")
    storage_path = models.TextField()
    normalized_storage_path = models.TextField(blank=True, default="")
    checksum = models.CharField(max_length=64, blank=True, default="")
    size_bytes = models.BigIntegerField(default=0)
    parse_status = models.CharField(max_length=16, choices=ParseStatus.choices, default=ParseStatus.PENDING)
    parse_error = models.TextField(blank=True, default="")
    summary = models.TextField(blank=True, default="")
    section_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "documents_reference_document"
        indexes = [
            models.Index(fields=["handbook", "-created_at"], name="docs_rd_hb_created_idx"),
            models.Index(fields=["handbook", "parse_status"], name="docs_rd_hb_parse_idx"),
        ]


class ReferenceDocumentLink(models.Model):
    class Scope(models.TextChoices):
        HANDBOOK = "handbook", "Handbook"
        FILE = "file", "File"
        PLACEHOLDER = "placeholder", "Placeholder"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference_document = models.ForeignKey(
        ReferenceDocument,
        on_delete=models.CASCADE,
        related_name="links",
    )
    handbook_file = models.ForeignKey(
        HandbookFile,
        on_delete=models.CASCADE,
        related_name="reference_links",
        null=True,
        blank=True,
    )
    placeholder = models.ForeignKey(
        Placeholder,
        on_delete=models.CASCADE,
        related_name="reference_links",
        null=True,
        blank=True,
    )
    scope = models.CharField(max_length=16, choices=Scope.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "documents_reference_document_link"
        constraints = [
            models.UniqueConstraint(
                fields=["reference_document", "scope", "handbook_file", "placeholder"],
                name="docs_reference_link_unique_target",
            )
        ]
        indexes = [
            models.Index(fields=["reference_document", "scope"], name="docs_rdl_doc_scope_idx"),
            models.Index(fields=["handbook_file", "scope"], name="docs_rdl_file_scope_idx"),
            models.Index(fields=["placeholder", "scope"], name="docs_rdl_placeholder_scope_idx"),
        ]


class ReferenceChunk(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference_document = models.ForeignKey(
        ReferenceDocument,
        on_delete=models.CASCADE,
        related_name="chunks",
    )
    ordinal = models.IntegerField()
    chunk_type = models.CharField(max_length=32)
    title = models.CharField(max_length=255, blank=True, default="")
    locator = models.JSONField(default=dict)
    content = models.TextField()
    content_hash = models.CharField(max_length=64)
    estimated_tokens = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "documents_reference_chunk"
        constraints = [
            models.UniqueConstraint(
                fields=["reference_document", "ordinal"],
                name="docs_reference_chunk_unique_ordinal",
            )
        ]
        indexes = [
            models.Index(fields=["reference_document", "ordinal"], name="docs_rc_doc_ordinal_idx"),
            models.Index(fields=["content_hash"], name="docs_rc_content_hash_idx"),
        ]


class PlaceholderGenerationAudit(models.Model):
    class Mode(models.TextChoices):
        QUICK_FILL = "quick_fill", "Quick Fill"
        COMPOSE = "compose", "Compose"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handbook = models.ForeignKey(
        Handbook,
        on_delete=models.CASCADE,
        related_name="generation_audits",
    )
    handbook_file = models.ForeignKey(
        HandbookFile,
        on_delete=models.CASCADE,
        related_name="generation_audits",
    )
    placeholder = models.ForeignKey(
        Placeholder,
        on_delete=models.CASCADE,
        related_name="generation_audits",
    )
    mode = models.CharField(max_length=16, choices=Mode.choices)
    instruction = models.TextField(blank=True, default="")
    output_style = models.CharField(max_length=64, blank=True, default="")
    language = models.CharField(max_length=16, blank=True, default="")
    model = models.CharField(max_length=128, blank=True, default="")
    prompt_tokens = models.IntegerField(default=0)
    completion_tokens = models.IntegerField(default=0)
    total_tokens = models.IntegerField(default=0)
    references_used = models.JSONField(default=list)
    file_context_used = models.JSONField(default=dict)
    fallback_path = models.CharField(max_length=64, blank=True, default="")
    trace = models.JSONField(default=dict)
    success = models.BooleanField(default=False)
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "documents_placeholder_generation_audit"
        indexes = [
            models.Index(fields=["handbook", "-created_at"], name="docs_pga_hb_created_idx"),
            models.Index(fields=["handbook_file", "-created_at"], name="docs_pga_file_created_idx"),
            models.Index(fields=["placeholder", "-created_at"], name="docs_pga_pl_created_idx"),
        ]


class DocumentTextExtractionCache(models.Model):
    checksum = models.CharField(max_length=64)
    file_type = models.CharField(max_length=8, choices=ReferenceDocument.FileType.choices)
    normalized_data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "documents_text_extraction_cache"
        constraints = [
            models.UniqueConstraint(
                fields=["checksum", "file_type"],
                name="docs_text_extract_cache_unique_checksum_type",
            )
        ]
        indexes = [
            models.Index(fields=["file_type", "-updated_at"], name="docs_tec_type_updated_idx"),
        ]
