from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


class StorageReadError(FileNotFoundError):
    pass


class LocalStorage:
    def read_bytes(self, path: Path) -> bytes:
        return path.read_bytes()

    def read_bytes_safe(self, path: Path) -> bytes:
        if not path.exists():
            raise StorageReadError(f"Storage file not found: {path}")
        try:
            return path.read_bytes()
        except OSError as exc:
            raise StorageReadError(f"Failed to read storage file: {path}") from exc

    def write_bytes(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    @contextmanager
    def open_read_stream(self, path: Path) -> Iterator[object]:
        if not path.exists():
            raise StorageReadError(f"Storage file not found: {path}")
        try:
            with path.open("rb") as handle:
                yield handle
        except OSError as exc:
            raise StorageReadError(f"Failed to read storage file: {path}") from exc
