import tempfile
from pathlib import Path

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile

from documents.models import Document


class DocumentApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

    @override_settings(DOCUMENTS_DATA_ROOT=Path("/tmp"))
    def test_upload_and_tree_and_soft_delete(self):
        payload = b"Hello {{user.name}} and {{assets.logo}}"
        uploaded = SimpleUploadedFile("sample.txt", payload, content_type="text/plain")
        res = self.client.post(
            "/api/v1/documents/upload",
            {"handbook_id": "hb-1", "file": uploaded, "path": "folder/sample.txt"},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201)
        doc_id = res.json()["document"]["id"]

        tree = self.client.get("/api/v1/files/tree", {"handbook_id": "hb-1"})
        self.assertEqual(tree.status_code, 200)
        self.assertTrue(tree.json()["tree"])

        delete = self.client.delete(
            "/api/v1/files",
            {"handbook_id": "hb-1", "path": "folder/sample.txt", "recursive": False},
            format="json",
        )
        self.assertEqual(delete.status_code, 200)
        self.assertEqual(Document.objects.filter(id=doc_id, deleted_at__isnull=False).count(), 1)

    @override_settings(DOCUMENTS_DATA_ROOT=Path("/tmp"))
    def test_upload_links_to_handbook_and_list_returns_document(self):
        handbook_id = "hb-link"
        uploaded = SimpleUploadedFile("linked.txt", b"Hello {{company.name}}", content_type="text/plain")
        upload_res = self.client.post(
            "/api/v1/documents/upload",
            {"handbook_id": handbook_id, "file": uploaded, "path": "linked.txt"},
            format="multipart",
        )
        self.assertEqual(upload_res.status_code, 201)
        payload = upload_res.json()
        document_id = payload["document"]["id"]
        self.assertEqual(payload["document"]["handbook_id"], handbook_id)

        doc = Document.objects.get(id=document_id)
        self.assertEqual(doc.handbook_id, handbook_id)

        list_res = self.client.get("/api/v1/documents", {"handbook_id": handbook_id})
        self.assertEqual(list_res.status_code, 200)
        listed_ids = [item["id"] for item in list_res.json()["documents"]]
        self.assertIn(document_id, listed_ids)

    @override_settings(DOCUMENTS_DATA_ROOT=Path("/tmp"))
    def test_files_tree_contract_for_file_nodes(self):
        handbook_id = "hb-tree"

        upload_one = SimpleUploadedFile("a.txt", b"Hello", content_type="text/plain")
        upload_two = SimpleUploadedFile("b.txt", b"World", content_type="text/plain")
        self.client.post(
            "/api/v1/documents/upload",
            {"handbook_id": handbook_id, "file": upload_one, "path": "a.txt"},
            format="multipart",
        )
        self.client.post(
            "/api/v1/documents/upload",
            {"handbook_id": handbook_id, "file": upload_two, "path": "folder/b.txt"},
            format="multipart",
        )

        tree_res = self.client.get("/api/v1/files/tree", {"handbook_id": handbook_id})
        self.assertEqual(tree_res.status_code, 200)
        tree = tree_res.json()["tree"]
        self.assertTrue(tree)

        def walk(nodes):
            for node in nodes:
                yield node
                children = node.get("children")
                if isinstance(children, list):
                    yield from walk(children)

        flattened = list(walk(tree))
        folder_nodes = [node for node in flattened if node["kind"] == "folder"]
        file_nodes = [node for node in flattened if node["kind"] == "file"]

        self.assertTrue(folder_nodes)
        self.assertTrue(file_nodes)
        self.assertTrue(all(isinstance(node.get("children"), list) for node in folder_nodes))
        self.assertTrue(all("children" not in node for node in file_nodes))
