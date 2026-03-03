# Generated manually for document template pipeline cutover.

import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Document",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("handbook_id", models.CharField(db_index=True, max_length=128)),
                ("name", models.CharField(max_length=255)),
                ("relative_path", models.TextField()),
                ("original_file_path", models.TextField()),
                ("mime_type", models.CharField(max_length=255)),
                ("size_bytes", models.BigIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "db_table": "documents_document",
            },
        ),
        migrations.CreateModel(
            name="WorkspaceAsset",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("handbook_id", models.CharField(db_index=True, max_length=128)),
                ("asset_type", models.CharField(choices=[("logo", "Logo"), ("signature", "Signature")], max_length=32)),
                ("file_path", models.TextField()),
                ("mime_type", models.CharField(max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "db_table": "documents_workspace_asset",
            },
        ),
        migrations.CreateModel(
            name="DocumentVariable",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("variable_name", models.CharField(max_length=255)),
                ("required", models.BooleanField(default=False)),
                (
                    "source",
                    models.CharField(
                        choices=[("user_input", "User Input"), ("system", "System"), ("ai_generated", "AI Generated")],
                        default="user_input",
                        max_length=32,
                    ),
                ),
                ("type", models.CharField(default="string", max_length=32)),
                ("metadata", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "document",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="variables", to="documents.document"),
                ),
            ],
            options={
                "db_table": "documents_document_variable",
            },
        ),
        migrations.CreateModel(
            name="DocumentVersion",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("version_number", models.IntegerField()),
                ("file_path", models.TextField()),
                ("mime_type", models.CharField(max_length=255)),
                ("size_bytes", models.BigIntegerField(default=0)),
                ("created_by", models.CharField(choices=[("user", "User"), ("system", "System"), ("ai", "AI")], max_length=16)),
                ("ai_prompt", models.TextField(blank=True, null=True)),
                ("ai_model", models.CharField(blank=True, max_length=128, null=True)),
                ("metadata", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "document",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="versions", to="documents.document"),
                ),
            ],
            options={
                "db_table": "documents_document_version",
            },
        ),
        migrations.CreateModel(
            name="RewriteAudit",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("instruction", models.TextField()),
                ("ai_model", models.CharField(max_length=128)),
                ("success", models.BooleanField(default=False)),
                ("error_message", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "document",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="rewrite_audits", to="documents.document"),
                ),
                (
                    "source_version",
                    models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="rewrite_sources", to="documents.documentversion"),
                ),
            ],
            options={
                "db_table": "documents_rewrite_audit",
            },
        ),
        migrations.AddIndex(model_name="document", index=models.Index(fields=["handbook_id", "deleted_at"], name="documents_d_handboo_56b9ce_idx")),
        migrations.AddIndex(model_name="document", index=models.Index(fields=["handbook_id", "updated_at"], name="documents_d_handboo_9a469e_idx")),
        migrations.AddConstraint(
            model_name="documentvariable",
            constraint=models.UniqueConstraint(fields=("document", "variable_name"), name="documents_doc_variable_unique"),
        ),
        migrations.AddIndex(model_name="documentvariable", index=models.Index(fields=["document", "source"], name="documents_d_documen_50a15c_idx")),
        migrations.AddConstraint(
            model_name="documentversion",
            constraint=models.UniqueConstraint(fields=("document", "version_number"), name="documents_doc_version_unique"),
        ),
        migrations.AddIndex(model_name="documentversion", index=models.Index(fields=["document", "-version_number"], name="documents_d_documen_d7b063_idx")),
        migrations.AddIndex(model_name="documentversion", index=models.Index(fields=["created_by", "created_at"], name="documents_d_created_dfd06e_idx")),
        migrations.AddIndex(model_name="workspaceasset", index=models.Index(fields=["handbook_id", "asset_type", "deleted_at"], name="documents_w_handboo_7944f3_idx")),
        migrations.AddIndex(model_name="rewriteaudit", index=models.Index(fields=["document", "created_at"], name="documents_r_documen_6f152d_idx")),
    ]
