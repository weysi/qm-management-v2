from __future__ import annotations

from rag.models import RagManual, RagTenant


DEFAULT_PACKAGE_CODE = "ISO9001"
DEFAULT_PACKAGE_VERSION = "v1"


def ensure_manual(
    *,
    manual_id: str,
    tenant_id: str,
    package_code: str = DEFAULT_PACKAGE_CODE,
    package_version: str = DEFAULT_PACKAGE_VERSION,
) -> RagManual:
    tenant, _ = RagTenant.objects.get_or_create(
        id=tenant_id,
        defaults={"name": tenant_id},
    )

    manual, created = RagManual.objects.get_or_create(
        id=manual_id,
        defaults={
            "tenant": tenant,
            "package_code": package_code,
            "package_version": package_version,
            "status": RagManual.Status.DRAFT,
        },
    )

    if created:
        return manual

    changed = False
    if manual.tenant_id != tenant_id:
        manual.tenant = tenant
        changed = True
    if manual.package_code != package_code:
        manual.package_code = package_code
        changed = True
    if manual.package_version != package_version:
        manual.package_version = package_version
        changed = True

    if changed:
        manual.save(update_fields=["tenant", "package_code", "package_version"])
    return manual
