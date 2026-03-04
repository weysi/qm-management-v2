from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Protocol

from django.conf import settings


class StorageReadError(FileNotFoundError):
    pass


class StorageProvider(Protocol):
    def save_bytes(self, path: str, payload: bytes) -> None: ...

    def read_bytes(self, path: str) -> bytes: ...

    def list(self, prefix: str) -> list[str]: ...

    def delete(self, path: str) -> None: ...

    def exists(self, path: str) -> bool: ...


class LocalFilesystemStorage:
    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or Path(getattr(settings, "DATA_ROOT", "/data"))).resolve()

    def _resolve(self, path: str | Path) -> Path:
        raw = Path(path)
        if raw.is_absolute():
            resolved = raw.resolve()
        else:
            resolved = (self.root / raw).resolve()
        if self.root not in resolved.parents and resolved != self.root and not raw.is_absolute():
            raise ValueError(f"Path escapes storage root: {path}")
        return resolved

    def save_bytes(self, path: str, payload: bytes) -> None:
        target = self._resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)

    def read_bytes(self, path: str) -> bytes:
        target = self._resolve(path)
        if not target.exists():
            raise StorageReadError(f"Storage file not found: {target}")
        try:
            return target.read_bytes()
        except OSError as exc:
            raise StorageReadError(f"Failed to read storage file: {target}") from exc

    def list(self, prefix: str) -> list[str]:
        base = self._resolve(prefix)
        if not base.exists():
            return []
        if base.is_file():
            return [str(base)]

        files: list[str] = []
        for item in base.rglob("*"):
            if item.is_file():
                files.append(str(item))
        files.sort()
        return files

    def delete(self, path: str) -> None:
        target = self._resolve(path)
        if not target.exists():
            return
        if target.is_dir():
            for child in sorted(target.rglob("*"), reverse=True):
                if child.is_file() or child.is_symlink():
                    child.unlink(missing_ok=True)
                elif child.is_dir():
                    child.rmdir()
            target.rmdir()
            return
        target.unlink(missing_ok=True)

    def exists(self, path: str) -> bool:
        return self._resolve(path).exists()

    @contextmanager
    def open_read_stream(self, path: str | Path) -> Iterator[object]:
        target = self._resolve(path)
        if not target.exists():
            raise StorageReadError(f"Storage file not found: {target}")
        try:
            with target.open("rb") as handle:
                yield handle
        except OSError as exc:
            raise StorageReadError(f"Failed to read storage file: {target}") from exc

    def write_bytes(self, path: Path, data: bytes) -> None:
        self.save_bytes(str(path), data)

    def read_bytes_safe(self, path: Path) -> bytes:
        return self.read_bytes(str(path))


class S3Storage:
    """S3 provider stub for future storage cutover."""

    def __init__(self, *_args, **_kwargs) -> None:
        self.enabled = False

    def save_bytes(self, path: str, payload: bytes) -> None:  # pragma: no cover - stub
        del path, payload
        raise NotImplementedError("S3Storage is not enabled")

    def read_bytes(self, path: str) -> bytes:  # pragma: no cover - stub
        del path
        raise NotImplementedError("S3Storage is not enabled")

    def list(self, prefix: str) -> list[str]:  # pragma: no cover - stub
        del prefix
        raise NotImplementedError("S3Storage is not enabled")

    def delete(self, path: str) -> None:  # pragma: no cover - stub
        del path
        raise NotImplementedError("S3Storage is not enabled")

    def exists(self, path: str) -> bool:  # pragma: no cover - stub
        del path
        raise NotImplementedError("S3Storage is not enabled")


# Backward-compatible alias used by the existing document pipeline.
LocalStorage = LocalFilesystemStorage
