from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0004_handbook_handbookfile_placeholder_placeholdervalue_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlaceholderParseCache",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("checksum", models.CharField(max_length=64)),
                (
                    "file_type",
                    models.CharField(
                        choices=[("DOCX", "DOCX"), ("PPTX", "PPTX"), ("XLSX", "XLSX"), ("OTHER", "OTHER")],
                        max_length=8,
                    ),
                ),
                ("placeholders", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "documents_placeholder_parse_cache",
            },
        ),
        migrations.AddConstraint(
            model_name="placeholderparsecache",
            constraint=models.UniqueConstraint(
                fields=("checksum", "file_type"),
                name="documents_placeholder_cache_unique_checksum_type",
            ),
        ),
        migrations.AddIndex(
            model_name="placeholderparsecache",
            index=models.Index(fields=["file_type", "-updated_at"], name="docs_ppc_type_updated_idx"),
        ),
    ]
