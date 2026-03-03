from rest_framework import serializers

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
