from __future__ import annotations

import shutil
from pathlib import Path
from typing import Iterable


class Storage:
    def list_files(self, prefix: Path) -> list[Path]:
        raise NotImplementedError

    def read_bytes(self, path: Path) -> bytes:
        raise NotImplementedError

    def write_bytes(self, path: Path, data: bytes) -> None:
        raise NotImplementedError

    def copy_tree(self, src_prefix: Path, dst_prefix: Path) -> None:
        raise NotImplementedError

    def ensure_dir(self, path: Path) -> None:
        raise NotImplementedError


class LocalStorage(Storage):
    def list_files(self, prefix: Path) -> list[Path]:
        if not prefix.exists():
            return []
        return sorted(
            [candidate for candidate in prefix.rglob("*") if candidate.is_file()],
            key=lambda item: str(item),
        )

    def read_bytes(self, path: Path) -> bytes:
        return path.read_bytes()

    def write_bytes(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def copy_tree(self, src_prefix: Path, dst_prefix: Path) -> None:
        src_prefix = src_prefix.resolve()
        dst_prefix = dst_prefix.resolve()
        dst_prefix.mkdir(parents=True, exist_ok=True)

        for src_file in self.list_files(src_prefix):
            relative = src_file.relative_to(src_prefix)
            dst_file = dst_prefix / relative
            dst_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_file, dst_file)

    def ensure_dir(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)

    def relative_tree(self, root: Path, files: Iterable[Path]) -> list[str]:
        return [str(file.relative_to(root)) for file in files]


# TODO(S3): add S3Storage implementation using boto3 and presigned URL support.
# class S3Storage(Storage):
#     ...
