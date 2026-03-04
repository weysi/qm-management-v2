from __future__ import annotations

import base64

from django.test import TestCase, override_settings
from rest_framework.test import APIClient


class ClientApiTests(TestCase):
    TRANSPARENT_PNG_BASE64 = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
    )

    def setUp(self):
        self.client = APIClient()

    def _base_payload(self) -> dict[str, object]:
        return {
            "name": "Test GmbH",
            "address": "Musterweg 1",
            "zipCity": "10000 Berlin",
            "ceo": "Max Mustermann",
            "qmManager": "Erika Musterfrau",
            "employeeCount": 12,
            "products": "Produkt A",
            "services": "Service B",
            "industry": "Industrie",
        }

    @override_settings(CLIENT_ASSET_MAX_INLINE_BYTES=32)
    def test_create_client_rejects_oversized_signature_data_url(self):
        too_large_bytes = b"x" * 64
        payload = {
            **self._base_payload(),
            "signatureUrl": f"data:image/png;base64,{base64.b64encode(too_large_bytes).decode('ascii')}",
        }
        response = self.client.post("/api/v1/clients/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("signatureUrl", response.json())

    def test_create_client_rejects_invalid_signature_data_url(self):
        payload = {
            **self._base_payload(),
            "signatureUrl": "data:image/png;base64,not-valid-base64@@",
        }
        response = self.client.post("/api/v1/clients/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("signatureUrl", response.json())

    def test_create_client_accepts_valid_signature_data_url(self):
        payload = {
            **self._base_payload(),
            "signatureUrl": f"data:image/png;base64,{self.TRANSPARENT_PNG_BASE64}",
        }
        response = self.client.post("/api/v1/clients/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["signatureUrl"], payload["signatureUrl"])
