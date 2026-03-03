from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL("DROP TABLE IF EXISTS rag.rag_run_event CASCADE;", migrations.RunSQL.noop),
        migrations.RunSQL("DROP TABLE IF EXISTS rag.rag_run CASCADE;", migrations.RunSQL.noop),
        migrations.RunSQL("DROP TABLE IF EXISTS rag.rag_document_chunk CASCADE;", migrations.RunSQL.noop),
        migrations.RunSQL("DROP TABLE IF EXISTS rag.rag_template_placeholder CASCADE;", migrations.RunSQL.noop),
        migrations.RunSQL("DROP TABLE IF EXISTS rag.rag_variable_value CASCADE;", migrations.RunSQL.noop),
        migrations.RunSQL("DROP TABLE IF EXISTS rag.rag_variable_key CASCADE;", migrations.RunSQL.noop),
        migrations.RunSQL("DROP TABLE IF EXISTS rag.rag_asset CASCADE;", migrations.RunSQL.noop),
        migrations.RunSQL("DROP TABLE IF EXISTS rag.rag_manual CASCADE;", migrations.RunSQL.noop),
        migrations.RunSQL("DROP TABLE IF EXISTS rag.rag_tenant CASCADE;", migrations.RunSQL.noop),
        migrations.RunSQL("DROP SCHEMA IF EXISTS rag CASCADE;", migrations.RunSQL.noop),
        migrations.RunSQL("DROP EXTENSION IF EXISTS vector;", migrations.RunSQL.noop),
    ]
