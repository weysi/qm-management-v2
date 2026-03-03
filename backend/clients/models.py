import uuid
from django.db import models


class Client(models.Model):
    """
    Represents a consulting client whose data drives QM manual generation.

    Logo and signature are stored as base64 data URLs for now.
    TODO: Replace base64 storage with S3 presigned URL upload/download.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    address = models.TextField()
    zip_city = models.CharField(max_length=100)
    ceo = models.CharField(max_length=255)
    qm_manager = models.CharField(max_length=255)
    employee_count = models.PositiveIntegerField()
    products = models.TextField()
    services = models.TextField()
    industry = models.CharField(max_length=255)

    # Asset fields — stored as base64 data URLs.
    # TODO: Replace with S3 presigned URL upload/download in a future iteration.
    logo_url = models.TextField(blank=True, null=True)
    signature_url = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "clients_client"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name
