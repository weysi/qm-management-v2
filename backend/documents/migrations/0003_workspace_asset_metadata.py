from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0002_drop_rag_schema_objects"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspaceasset",
            name="sha256",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="workspaceasset",
            name="width",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workspaceasset",
            name="height",
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
