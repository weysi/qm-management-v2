from django.conf import settings
from rest_framework import serializers

from documents.services.asset_service import AssetValidationError, decode_image_data_url

from .models import Client


class ClientSerializer(serializers.ModelSerializer):
    # Expose camelCase fields to match the Next.js frontend schema.
    zipCity = serializers.CharField(source="zip_city")
    qmManager = serializers.CharField(source="qm_manager")
    employeeCount = serializers.IntegerField(source="employee_count")
    logoUrl = serializers.CharField(
        source="logo_url", allow_null=True, required=False, default=None
    )
    signatureUrl = serializers.CharField(
        source="signature_url", allow_null=True, required=False, default=None
    )
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Client
        fields = [
            "id",
            "name",
            "address",
            "zipCity",
            "ceo",
            "qmManager",
            "employeeCount",
            "products",
            "services",
            "industry",
            "logoUrl",
            "signatureUrl",
            "createdAt",
            "updatedAt",
        ]

    def _validate_inline_asset(self, value: str | None, field_name: str) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if cleaned == "":
            return None
        if not cleaned.startswith("data:"):
            return value

        max_inline_bytes = int(getattr(settings, "CLIENT_ASSET_MAX_INLINE_BYTES", 2 * 1024 * 1024))
        try:
            decode_image_data_url(data_url=cleaned, max_bytes=max_inline_bytes)
        except AssetValidationError as exc:
            raise serializers.ValidationError(f"{field_name} invalid: {exc}") from exc
        return cleaned

    def validate_logoUrl(self, value: str | None) -> str | None:
        return self._validate_inline_asset(value, "logoUrl")

    def validate_signatureUrl(self, value: str | None) -> str | None:
        return self._validate_inline_asset(value, "signatureUrl")
