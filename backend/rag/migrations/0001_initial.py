# Generated manually for local-first RAG bootstrap.
from __future__ import annotations

import django.contrib.postgres.indexes
import django.db.models.deletion
import pgvector.django.indexes
import pgvector.django.vector
import uuid
from django.contrib.postgres.search import SearchVectorField
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies: list[tuple[str, str]] = []

    operations = [
        migrations.RunSQL("CREATE SCHEMA IF NOT EXISTS rag"),
        migrations.RunSQL("CREATE EXTENSION IF NOT EXISTS vector"),
        migrations.CreateModel(
            name="RagTenant",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("id", models.CharField(max_length=64, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
            ],
            options={
                "db_table": "rag_tenant",
            },
        ),
        migrations.CreateModel(
            name="RagManual",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("id", models.CharField(max_length=128, primary_key=True, serialize=False)),
                (
                    "package_code",
                    models.CharField(max_length=64),
                ),
                (
                    "package_version",
                    models.CharField(max_length=32),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "Draft"),
                            ("IN_PROGRESS", "In Progress"),
                            ("READY", "Ready"),
                            ("FAILED", "Failed"),
                        ],
                        default="DRAFT",
                        max_length=32,
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="manuals",
                        to="rag.ragtenant",
                    ),
                ),
            ],
            options={
                "db_table": "rag_manual",
                "indexes": [
                    models.Index(
                        fields=["tenant", "package_code", "package_version"],
                        name="rag_manual_tenant__4be3a1_idx",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="RagRun",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("INGEST", "Ingest"),
                            ("PLAN", "Plan"),
                            ("GENERATE", "Generate"),
                            ("CHAT", "Chat"),
                        ],
                        max_length=16,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("QUEUED", "Queued"),
                            ("RUNNING", "Running"),
                            ("SUCCEEDED", "Succeeded"),
                            ("FAILED", "Failed"),
                            ("CANCELLED", "Cancelled"),
                        ],
                        default="QUEUED",
                        max_length=16,
                    ),
                ),
                ("prompt_version", models.CharField(blank=True, default="", max_length=64)),
                ("model", models.CharField(blank=True, default="", max_length=128)),
                ("metrics", models.JSONField(default=dict)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                (
                    "manual",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="runs",
                        to="rag.ragmanual",
                    ),
                ),
            ],
            options={
                "db_table": "rag_run",
                "indexes": [
                    models.Index(
                        fields=["manual", "kind", "status"],
                        name="rag_run_manual__4ed00c_idx",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="RagVariableKey",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("package_code", models.CharField(max_length=64)),
                ("package_version", models.CharField(max_length=32)),
                ("token", models.CharField(max_length=255)),
                (
                    "type",
                    models.CharField(
                        choices=[
                            ("string", "String"),
                            ("number", "Number"),
                            ("date", "Date"),
                            ("enum", "Enum"),
                            ("rich_text", "Rich Text"),
                        ],
                        default="string",
                        max_length=32,
                    ),
                ),
                ("required", models.BooleanField(default=False)),
                ("description", models.TextField(blank=True, default="")),
                ("examples", models.JSONField(default=list)),
                ("default_value", models.TextField(blank=True, null=True)),
                (
                    "generation_policy",
                    models.CharField(
                        choices=[
                            ("DETERMINISTIC", "Deterministic"),
                            ("AI_INFER", "AI Infer"),
                            ("AI_DRAFT", "AI Draft"),
                        ],
                        default="DETERMINISTIC",
                        max_length=32,
                    ),
                ),
            ],
            options={
                "db_table": "rag_variable_key",
                "constraints": [
                    models.UniqueConstraint(
                        fields=("package_code", "package_version", "token"),
                        name="rag_var_key_pkg_ver_token_uniq",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="RagAsset",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "role",
                    models.CharField(
                        choices=[
                            ("TEMPLATE", "Template"),
                            ("REFERENCE", "Reference"),
                            ("CUSTOMER_REFERENCE", "Customer Reference"),
                            ("GENERATED_OUTPUT", "Generated Output"),
                        ],
                        max_length=32,
                    ),
                ),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("PACKAGE_VAULT", "Package Vault"),
                            ("CUSTOMER_UPLOAD", "Customer Upload"),
                            ("AI_GENERATED", "AI Generated"),
                        ],
                        max_length=32,
                    ),
                ),
                ("local_path", models.TextField()),
                ("s3_bucket", models.TextField(blank=True, null=True)),
                ("s3_key", models.TextField(blank=True, null=True)),
                ("sha256", models.CharField(max_length=64)),
                ("mime", models.TextField()),
                ("file_ext", models.CharField(max_length=16)),
                ("package_rel_path", models.TextField()),
                (
                    "manual",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="assets",
                        to="rag.ragmanual",
                    ),
                ),
                (
                    "source_asset",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="generated_versions",
                        to="rag.ragasset",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="assets",
                        to="rag.ragtenant",
                    ),
                ),
            ],
            options={
                "db_table": "rag_asset",
                "indexes": [
                    models.Index(fields=["manual", "role"], name="rag_asset_manual__bda67f_idx"),
                    models.Index(fields=["tenant", "manual"], name="rag_asset_tenant__c7ec13_idx"),
                    models.Index(
                        fields=["source_asset", "created_at"],
                        name="rag_asset_source__8cd417_idx",
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("manual", "package_rel_path", "sha256"),
                        name="rag_asset_manual_rel_sha256_uniq",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="RagVariableValue",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("token", models.CharField(max_length=255)),
                ("value", models.TextField()),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("CUSTOMER_INPUT", "Customer Input"),
                            ("DEFAULT", "Default"),
                            ("AI_INFERRED", "AI Inferred"),
                            ("AI_DRAFTED", "AI Drafted"),
                            ("HUMAN_OVERRIDE", "Human Override"),
                        ],
                        max_length=32,
                    ),
                ),
                ("confidence", models.FloatField(blank=True, null=True)),
                ("provenance", models.JSONField(default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "manual",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="variable_values",
                        to="rag.ragmanual",
                    ),
                ),
            ],
            options={
                "db_table": "rag_variable_value",
                "constraints": [
                    models.UniqueConstraint(
                        fields=("manual", "token"),
                        name="rag_var_value_manual_token_uniq",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="RagTemplatePlaceholder",
            fields=[
                ("id", models.CharField(max_length=64, primary_key=True, serialize=False)),
                ("token", models.CharField(max_length=255)),
                ("occurrences", models.IntegerField(default=0)),
                ("sample_context", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[("KNOWN", "Known"), ("UNKNOWN", "Unknown")],
                        max_length=16,
                    ),
                ),
                (
                    "asset",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="placeholders",
                        to="rag.ragasset",
                    ),
                ),
            ],
            options={
                "db_table": "rag_template_placeholder",
                "indexes": [
                    models.Index(
                        fields=["asset", "token"],
                        name="rag_tpl_asset_token_idx",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="RagDocumentChunk",
            fields=[
                ("id", models.CharField(max_length=64, primary_key=True, serialize=False)),
                ("chunk_index", models.IntegerField()),
                ("text", models.TextField()),
                ("token_count", models.IntegerField(default=0)),
                ("tsv", SearchVectorField(null=True)),
                ("embedding", pgvector.django.vector.VectorField(dimensions=1536, null=True)),
                ("metadata", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "asset",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chunks",
                        to="rag.ragasset",
                    ),
                ),
            ],
            options={
                "db_table": "rag_document_chunk",
                "constraints": [
                    models.UniqueConstraint(
                        fields=("asset", "chunk_index"),
                        name="rag_chunk_asset_index_uniq",
                    )
                ],
                "indexes": [
                    django.contrib.postgres.indexes.GinIndex(
                        fields=["tsv"],
                        name="rag_chunk_tsv_gin",
                    ),
                    pgvector.django.indexes.HnswIndex(
                        fields=["embedding"],
                        m=16,
                        ef_construction=64,
                        name="rag_chunk_embedding_hnsw",
                        opclasses=["vector_cosine_ops"],
                    ),
                    models.Index(fields=["asset"], name="rag_documen_asset_i_31f331_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="RagRunEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("ts", models.DateTimeField(auto_now_add=True)),
                (
                    "level",
                    models.CharField(
                        choices=[
                            ("DEBUG", "Debug"),
                            ("INFO", "Info"),
                            ("WARN", "Warn"),
                            ("ERROR", "Error"),
                        ],
                        default="INFO",
                        max_length=8,
                    ),
                ),
                ("message", models.TextField()),
                ("payload", models.JSONField(default=dict)),
                (
                    "run",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="events",
                        to="rag.ragrun",
                    ),
                ),
            ],
            options={
                "db_table": "rag_run_event",
                "indexes": [
                    models.Index(fields=["run", "ts"], name="rag_run_eve_run_id_968180_idx")
                ],
            },
        ),
    ]
