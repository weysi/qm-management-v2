from __future__ import annotations

import uuid

from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import models
from pgvector.django import HnswIndex, VectorField


EMBEDDING_DIM = 1536


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True


class RagTenant(TimestampedModel):
    id = models.CharField(max_length=64, primary_key=True)
    name = models.CharField(max_length=255)

    class Meta:
        db_table = "rag_tenant"


class RagManual(TimestampedModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        READY = "READY", "Ready"
        FAILED = "FAILED", "Failed"

    id = models.CharField(max_length=128, primary_key=True)
    tenant = models.ForeignKey(
        RagTenant, on_delete=models.CASCADE, related_name="manuals"
    )
    package_code = models.CharField(max_length=64)
    package_version = models.CharField(max_length=32)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)

    class Meta:
        db_table = "rag_manual"
        indexes = [
            models.Index(fields=["tenant", "package_code", "package_version"]),
        ]


class RagAsset(TimestampedModel):
    class Role(models.TextChoices):
        TEMPLATE = "TEMPLATE", "Template"
        REFERENCE = "REFERENCE", "Reference"
        CUSTOMER_REFERENCE = "CUSTOMER_REFERENCE", "Customer Reference"
        GENERATED_OUTPUT = "GENERATED_OUTPUT", "Generated Output"

    class Source(models.TextChoices):
        PACKAGE_VAULT = "PACKAGE_VAULT", "Package Vault"
        CUSTOMER_UPLOAD = "CUSTOMER_UPLOAD", "Customer Upload"
        AI_GENERATED = "AI_GENERATED", "AI Generated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        RagTenant, on_delete=models.CASCADE, related_name="assets"
    )
    manual = models.ForeignKey(
        RagManual, on_delete=models.CASCADE, related_name="assets"
    )
    source_asset = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_versions",
    )
    role = models.CharField(max_length=32, choices=Role.choices)
    source = models.CharField(max_length=32, choices=Source.choices)
    local_path = models.TextField()
    s3_bucket = models.TextField(blank=True, null=True)
    s3_key = models.TextField(blank=True, null=True)
    sha256 = models.CharField(max_length=64)
    mime = models.TextField()
    file_ext = models.CharField(max_length=16)
    package_rel_path = models.TextField()

    class Meta:
        db_table = "rag_asset"
        constraints = [
            models.UniqueConstraint(
                fields=["manual", "package_rel_path", "sha256"],
                name="rag_asset_manual_rel_sha256_uniq",
            )
        ]
        indexes = [
            models.Index(fields=["manual", "role"]),
            models.Index(fields=["tenant", "manual"]),
            models.Index(fields=["source_asset", "created_at"]),
        ]


class RagTemplatePlaceholder(models.Model):
    class Status(models.TextChoices):
        KNOWN = "KNOWN", "Known"
        UNKNOWN = "UNKNOWN", "Unknown"

    id = models.CharField(max_length=64, primary_key=True)
    asset = models.ForeignKey(
        RagAsset, on_delete=models.CASCADE, related_name="placeholders"
    )
    token = models.CharField(max_length=255)
    occurrences = models.IntegerField(default=0)
    sample_context = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices)

    class Meta:
        db_table = "rag_template_placeholder"
        indexes = [
            models.Index(fields=["asset", "token"], name="rag_tpl_asset_token_idx"),
        ]


class RagDocumentChunk(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    asset = models.ForeignKey(
        RagAsset, on_delete=models.CASCADE, related_name="chunks"
    )
    chunk_index = models.IntegerField()
    text = models.TextField()
    token_count = models.IntegerField(default=0)
    tsv = SearchVectorField(null=True)
    embedding = VectorField(dimensions=EMBEDDING_DIM, null=True)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "rag_document_chunk"
        constraints = [
            models.UniqueConstraint(
                fields=["asset", "chunk_index"],
                name="rag_chunk_asset_index_uniq",
            )
        ]
        indexes = [
            GinIndex(fields=["tsv"], name="rag_chunk_tsv_gin"),
            HnswIndex(
                name="rag_chunk_embedding_hnsw",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
            models.Index(fields=["asset"]),
        ]


class RagVariableKey(models.Model):
    class Type(models.TextChoices):
        STRING = "string", "String"
        NUMBER = "number", "Number"
        DATE = "date", "Date"
        ENUM = "enum", "Enum"
        RICH_TEXT = "rich_text", "Rich Text"

    class GenerationPolicy(models.TextChoices):
        DETERMINISTIC = "DETERMINISTIC", "Deterministic"
        AI_INFER = "AI_INFER", "AI Infer"
        AI_DRAFT = "AI_DRAFT", "AI Draft"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    package_code = models.CharField(max_length=64)
    package_version = models.CharField(max_length=32)
    token = models.CharField(max_length=255)
    type = models.CharField(max_length=32, choices=Type.choices, default=Type.STRING)
    required = models.BooleanField(default=False)
    description = models.TextField(blank=True, default="")
    examples = models.JSONField(default=list)
    default_value = models.TextField(blank=True, null=True)
    generation_policy = models.CharField(
        max_length=32,
        choices=GenerationPolicy.choices,
        default=GenerationPolicy.DETERMINISTIC,
    )

    class Meta:
        db_table = "rag_variable_key"
        constraints = [
            models.UniqueConstraint(
                fields=["package_code", "package_version", "token"],
                name="rag_var_key_pkg_ver_token_uniq",
            )
        ]


class RagVariableValue(models.Model):
    class Source(models.TextChoices):
        CUSTOMER_INPUT = "CUSTOMER_INPUT", "Customer Input"
        DEFAULT = "DEFAULT", "Default"
        AI_INFERRED = "AI_INFERRED", "AI Inferred"
        AI_DRAFTED = "AI_DRAFTED", "AI Drafted"
        HUMAN_OVERRIDE = "HUMAN_OVERRIDE", "Human Override"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    manual = models.ForeignKey(
        RagManual, on_delete=models.CASCADE, related_name="variable_values"
    )
    token = models.CharField(max_length=255)
    value = models.TextField()
    source = models.CharField(max_length=32, choices=Source.choices)
    confidence = models.FloatField(blank=True, null=True)
    provenance = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "rag_variable_value"
        constraints = [
            models.UniqueConstraint(
                fields=["manual", "token"],
                name="rag_var_value_manual_token_uniq",
            )
        ]


class RagRun(models.Model):
    class Kind(models.TextChoices):
        INGEST = "INGEST", "Ingest"
        PLAN = "PLAN", "Plan"
        GENERATE = "GENERATE", "Generate"
        CHAT = "CHAT", "Chat"

    class Status(models.TextChoices):
        QUEUED = "QUEUED", "Queued"
        RUNNING = "RUNNING", "Running"
        SUCCEEDED = "SUCCEEDED", "Succeeded"
        FAILED = "FAILED", "Failed"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    manual = models.ForeignKey(RagManual, on_delete=models.CASCADE, related_name="runs")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED)
    prompt_version = models.CharField(max_length=64, blank=True, default="")
    model = models.CharField(max_length=128, blank=True, default="")
    metrics = models.JSONField(default=dict)
    started_at = models.DateTimeField(blank=True, null=True)
    finished_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "rag_run"
        indexes = [
            models.Index(fields=["manual", "kind", "status"]),
        ]


class RagRunEvent(models.Model):
    class Level(models.TextChoices):
        DEBUG = "DEBUG", "Debug"
        INFO = "INFO", "Info"
        WARN = "WARN", "Warn"
        ERROR = "ERROR", "Error"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(RagRun, on_delete=models.CASCADE, related_name="events")
    ts = models.DateTimeField(auto_now_add=True)
    level = models.CharField(max_length=8, choices=Level.choices, default=Level.INFO)
    message = models.TextField()
    payload = models.JSONField(default=dict)

    class Meta:
        db_table = "rag_run_event"
        indexes = [
            models.Index(fields=["run", "ts"]),
        ]

    class Meta:
        db_table = "rag_run_event"
        indexes = [models.Index(fields=["run", "ts"])]
