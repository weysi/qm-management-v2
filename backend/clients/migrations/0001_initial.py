import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Client",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        primary_key=True,
                        default=uuid.uuid4,
                        editable=False,
                        serialize=False,
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("address", models.TextField()),
                ("zip_city", models.CharField(max_length=100)),
                ("ceo", models.CharField(max_length=255)),
                ("qm_manager", models.CharField(max_length=255)),
                ("employee_count", models.PositiveIntegerField()),
                ("products", models.TextField()),
                ("services", models.TextField()),
                ("industry", models.CharField(max_length=255)),
                # TODO: Replace base64 data URL storage with S3 presigned URLs.
                ("logo_url", models.TextField(blank=True, null=True)),
                ("signature_url", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "clients_client",
                "ordering": ["-created_at"],
            },
        ),
    ]
