from __future__ import annotations

from io import BytesIO
from pathlib import Path
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from docx import Document as WordDocument

from clients.models import Client


class HandbookApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

        self.customer = Client.objects.create(
            name="Beispiel GmbH",
            address="Musterstrasse 1",
            zip_city="12345 Berlin",
            ceo="Max Mustermann",
            qm_manager="Erika Beispiel",
            employee_count=22,
            products="Produkt A",
            services="Service B",
            industry="Maschinenbau",
        )

    def _create_handbook(self) -> str:
        response = self.client.post(
            "/api/v1/handbooks",
            {
                "customer_id": str(self.customer.id),
                "type": "ISO9001",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["id"]

    @override_settings(DOCUMENTS_DATA_ROOT=Path("/tmp"))
    def test_upload_zip_skips_junk_and_unsafe_paths(self):
        handbook_id = self._create_handbook()

        archive = BytesIO()
        with ZipFile(archive, "w", compression=ZIP_DEFLATED) as bundle:
            bundle.writestr("__MACOSX/._ignored", b"ignored")
            bundle.writestr("../escape.txt", b"unsafe")
            bundle.writestr(".DS_Store", b"junk")
            bundle.writestr("folder/readme.txt", b"hello")

        upload = SimpleUploadedFile(
            "templates.zip",
            archive.getvalue(),
            content_type="application/zip",
        )
        response = self.client.post(
            f"/api/v1/handbooks/{handbook_id}/upload-zip",
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)

        body = response.json()
        files = body["files"]
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0]["path_in_handbook"], "folder/readme.txt")
        self.assertTrue(any(item["code"] == "SKIPPED_INVALID_PATH" for item in body["warnings"]))

    @override_settings(DOCUMENTS_DATA_ROOT=Path("/tmp"))
    def test_upload_zip_parses_docx_with_malformed_token_without_failing(self):
        handbook_id = self._create_handbook()

        doc = WordDocument()
        doc.add_paragraph("Header {{REVISION, Seite 2 von 11, gueltig ab {{VALIDITY_DATE}}")
        doc.add_paragraph("Firma {{COMPANY_NAME}}")
        stream = BytesIO()
        doc.save(stream)

        archive = BytesIO()
        with ZipFile(archive, "w", compression=ZIP_DEFLATED) as bundle:
            bundle.writestr("docs/test.docx", stream.getvalue())

        upload = SimpleUploadedFile(
            "templates.zip",
            archive.getvalue(),
            content_type="application/zip",
        )
        response = self.client.post(
            f"/api/v1/handbooks/{handbook_id}/upload-zip",
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        file_id = response.json()["files"][0]["id"]

        placeholders_res = self.client.get(
            f"/api/v1/handbooks/{handbook_id}/files/{file_id}/placeholders"
        )
        self.assertEqual(placeholders_res.status_code, 200)
        keys = [item["key"] for item in placeholders_res.json()["placeholders"]]
        self.assertIn("validity_date", keys)
        self.assertIn("company_name", keys)

    @override_settings(DOCUMENTS_DATA_ROOT=Path("/tmp"))
    def test_export_requires_resolved_placeholders_then_exports(self):
        handbook_id = self._create_handbook()

        doc = WordDocument()
        doc.add_paragraph("Firma {{client.name}}")
        stream = BytesIO()
        doc.save(stream)

        archive = BytesIO()
        with ZipFile(archive, "w", compression=ZIP_DEFLATED) as bundle:
            bundle.writestr("docs/template.docx", stream.getvalue())

        upload = SimpleUploadedFile("templates.zip", archive.getvalue(), content_type="application/zip")
        upload_res = self.client.post(
            f"/api/v1/handbooks/{handbook_id}/upload-zip",
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(upload_res.status_code, 201)
        file_id = upload_res.json()["files"][0]["id"]

        export_fail = self.client.post(f"/api/v1/handbooks/{handbook_id}/export", {}, format="json")
        self.assertEqual(export_fail.status_code, 400)
        self.assertTrue(export_fail.json().get("errors"))

        save_res = self.client.post(
            f"/api/v1/handbooks/{handbook_id}/placeholders/save",
            {
                "file_id": file_id,
                "values": [
                    {
                        "key": "client.name",
                        "value_text": "Test Kunde GmbH",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(save_res.status_code, 200)
        self.assertIn("snapshot", save_res.json())

        versions = self.client.get(f"/api/v1/handbooks/{handbook_id}/versions")
        self.assertEqual(versions.status_code, 200)
        self.assertEqual(len(versions.json()["versions"]), 1)
        self.assertFalse(versions.json()["versions"][0]["downloadable"])

        export_ok = self.client.post(f"/api/v1/handbooks/{handbook_id}/export", {}, format="json")
        self.assertEqual(export_ok.status_code, 200)
        self.assertEqual(export_ok["Content-Type"], "application/zip")

        versions_after = self.client.get(f"/api/v1/handbooks/{handbook_id}/versions")
        self.assertEqual(versions_after.status_code, 200)
        snapshots = versions_after.json()["versions"]
        downloadable = [item for item in snapshots if item.get("downloadable")]
        self.assertTrue(downloadable)

        download_res = self.client.get(
            f"/api/v1/handbooks/{handbook_id}/versions/{downloadable[0]['version_number']}/download"
        )
        self.assertEqual(download_res.status_code, 200)
        self.assertEqual(download_res["Content-Type"], "application/zip")

    @override_settings(DOCUMENTS_DATA_ROOT=Path("/tmp"))
    def test_snapshot_delete(self):
        handbook_id = self._create_handbook()

        doc = WordDocument()
        doc.add_paragraph("{{client.name}}")
        stream = BytesIO()
        doc.save(stream)

        archive = BytesIO()
        with ZipFile(archive, "w", compression=ZIP_DEFLATED) as bundle:
            bundle.writestr("docs/template.docx", stream.getvalue())

        upload = SimpleUploadedFile("templates.zip", archive.getvalue(), content_type="application/zip")
        upload_res = self.client.post(
            f"/api/v1/handbooks/{handbook_id}/upload-zip",
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(upload_res.status_code, 201)
        file_id = upload_res.json()["files"][0]["id"]

        save_res = self.client.post(
            f"/api/v1/handbooks/{handbook_id}/placeholders/save",
            {
                "file_id": file_id,
                "values": [{"key": "client.name", "value_text": "A"}],
            },
            format="json",
        )
        self.assertEqual(save_res.status_code, 200)

        versions = self.client.get(f"/api/v1/handbooks/{handbook_id}/versions").json()["versions"]
        self.assertEqual(len(versions), 1)
        version_number = versions[0]["version_number"]

        delete_res = self.client.delete(
            f"/api/v1/handbooks/{handbook_id}/versions/{version_number}"
        )
        self.assertEqual(delete_res.status_code, 200)

        versions_after = self.client.get(f"/api/v1/handbooks/{handbook_id}/versions").json()["versions"]
        self.assertEqual(versions_after, [])
