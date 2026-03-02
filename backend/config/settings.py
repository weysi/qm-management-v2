from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent


def env(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_database_url(database_url: str) -> dict[str, object]:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError(f"Unsupported DATABASE_URL scheme: {parsed.scheme}")

    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parsed.path.lstrip("/") or "postgres",
        "USER": parsed.username or "postgres",
        "PASSWORD": parsed.password or "",
        "HOST": parsed.hostname or "localhost",
        "PORT": str(parsed.port or 5432),
        "CONN_MAX_AGE": 60,
        # Keep RAG tables isolated in rag schema while keeping public fallback.
        "OPTIONS": {"options": "-c search_path=rag,public"},
    }


SECRET_KEY = env("SECRET_KEY", "dev-only-secret-key-change-me")
DEBUG = env_bool("DEBUG", True)
ALLOWED_HOSTS = [host for host in env("ALLOWED_HOSTS", "*").split(",") if host]


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "pgvector.django",
    "drf_spectacular",
    "packages",
    "assets",
    "indexing",
    "rag",
    "generation",
    "runs",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"


DATABASE_URL = env("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/qm_rag")
DATABASES = {"default": parse_database_url(DATABASE_URL)}


AUTH_PASSWORD_VALIDATORS: list[dict[str, str]] = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "QM RAG Backend API",
    "VERSION": "1.0.0",
    "DESCRIPTION": (
        "RAG-powered backend for generating ISO compliance handbooks.\n\n"
        "## Authentication\n"
        "**No authentication required.** All endpoints are open.\n\n"
        "## Tenant Isolation\n"
        "Multi-tenancy is application-level via `tenant_id` parameters. "
        "Data is isolated per tenant in PostgreSQL (`rag` schema) and on disk "
        "(`data/tenants/<tenant_id>/`).\n\n"
        "## Pipeline Flow\n"
        "1. `start-package` → seeds variable keys + copies package files + indexes\n"
        "2. `ingest` → re-index existing assets (optional, for force refresh)\n"
        "3. `plan` → AI builds a generation plan from template placeholders\n"
        "4. `generate` → resolves variables + fills OOXML templates → output files\n"
        "5. `chat` → RAG Q&A over indexed documents\n"
    ),
    "SERVE_INCLUDE_SCHEMA": False,
    "TAGS": [
        {"name": "Health", "description": "Server health check"},
        {"name": "Assets", "description": "File upload, listing, binary retrieval, and ZIP download"},
        {"name": "Generation", "description": "Package initialization, ingestion, AI planning, and template generation"},
        {"name": "RAG Chat", "description": "Retrieval-Augmented Generation chat interface"},
        {"name": "Runs", "description": "Pipeline run tracking and event logs"},
    ],
    "COMPONENT_SPLIT_REQUEST": True,
}


OPENAI_API_KEY = env("OPENAI_API_KEY", "")
OPENAI_CHAT_MODEL = env("OPENAI_CHAT_MODEL", "gpt-4o-mini")
OPENAI_ROUTER_MODEL = env("OPENAI_ROUTER_MODEL", "gpt-4o-mini")
OPENAI_EMBED_MODEL = env("OPENAI_EMBED_MODEL", "text-embedding-3-small")
NEXTJS_INTERNAL_API_URL = env("NEXTJS_INTERNAL_API_URL", "http://localhost:3000")

RAG_DATA_ROOT = Path(env("RAG_DATA_ROOT", str(PROJECT_ROOT / "data"))).resolve()
RAG_PACKAGE_ROOT = RAG_DATA_ROOT / "packages"
RAG_TENANT_ROOT = RAG_DATA_ROOT / "tenants"

CELERY_BROKER_URL = env("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 60 * 30
CELERY_TASK_SOFT_TIME_LIMIT = 60 * 28

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}
