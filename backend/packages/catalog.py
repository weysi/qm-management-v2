from __future__ import annotations

from pathlib import Path
from typing import Any


STANDARD_PACKAGES: dict[str, dict[str, Any]] = {
    "ISO9001": {
        "versions": {
            "v1": {
                "source_local_prefix": "./data/packages/ISO9001/v1/",
                # TODO(S3): "s3_prefix": "packages/ISO9001/v1/",
                "classification_rules": {
                    "reference_prefixes": ["01 Norm", "03 Diverse Unterlagen"],
                    "template_prefixes": ["02 Musterhandbuch"],
                },
                "languages": ["de"],
                "fts_config": "simple",
                "template_file_exts": ["docx", "pptx", "xlsx"],
                "reference_file_exts": ["pdf", "docx", "doc"],
                "variable_schema_path": "backend/packages/schemas/ISO9001_v1_variables.json",
                "playbook_path": "backend/packages/playbooks/ISO9001_v1_playbook.json",
                "chunking": {"target_chars": 2400, "overlap_chars": 300},
            }
        }
    },
    "SSCP": {
        "versions": {
            "v1": {
                "source_local_prefix": "./data/packages/SSCP/v1/",
                # TODO(S3): "s3_prefix": "packages/SSCP/v1/",
                "classification_rules": {
                    "reference_prefixes": ["01 Reference"],
                    "template_prefixes": ["02 Templates"],
                },
                "languages": ["en"],
                "fts_config": "english",
                "template_file_exts": ["docx", "pptx", "xlsx"],
                "reference_file_exts": ["pdf", "docx", "doc"],
                "variable_schema_path": "backend/packages/schemas/SSCP_v1_variables.json",
                "playbook_path": "backend/packages/playbooks/SSCP_v1_playbook.json",
                "chunking": {"target_chars": 2400, "overlap_chars": 300},
            }
        }
    },
    "ISO14007": {
        "versions": {
            "v1": {
                "source_local_prefix": "./data/packages/ISO14007/v1/",
                # TODO(S3): "s3_prefix": "packages/ISO14007/v1/",
                "classification_rules": {
                    "reference_prefixes": ["01 Norm"],
                    "template_prefixes": ["02 Templates"],
                },
                "languages": ["en"],
                "fts_config": "english",
                "template_file_exts": ["docx", "pptx", "xlsx"],
                "reference_file_exts": ["pdf", "docx", "doc"],
                "variable_schema_path": "backend/packages/schemas/ISO14007_v1_variables.json",
                "playbook_path": "backend/packages/playbooks/ISO14007_v1_playbook.json",
                "chunking": {"target_chars": 2400, "overlap_chars": 300},
            }
        }
    },
}


class PackageCatalogError(ValueError):
    pass


def get_package_config(package_code: str, package_version: str) -> dict[str, Any]:
    package = STANDARD_PACKAGES.get(package_code)
    if package is None:
        raise PackageCatalogError(f"Unsupported package code: {package_code}")

    version = package.get("versions", {}).get(package_version)
    if version is None:
        raise PackageCatalogError(
            f"Unsupported package version: {package_code}/{package_version}"
        )

    return version


def resolve_catalog_path(path: str) -> Path:
    return Path(path).resolve()
