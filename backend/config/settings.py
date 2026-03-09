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
    }


def default_local_database() -> dict[str, object]:
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DATABASE_NAME", "qm-documents"),
        "USER": (
            env("DATABASE_USER")
            or env("PGUSER")
            or os.getenv("USER")
            or "postgres"
        ),
        "PASSWORD": env("DATABASE_PASSWORD") or env("PGPASSWORD") or "",
        "HOST": env("DATABASE_HOST", "localhost"),
        "PORT": env("DATABASE_PORT", "5432"),
        "CONN_MAX_AGE": 60,
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
    "drf_spectacular",
    "clients",
    "documents",
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


DATABASE_URL = env("DATABASE_URL")
DATABASES = {
    "default": parse_database_url(DATABASE_URL)
    if DATABASE_URL
    else default_local_database()
}


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
    "TITLE": "QM Documents Backend API",
    "VERSION": "1.0.0",
    "DESCRIPTION": (
        "Document template backend for handbook-scoped uploads, placeholder extraction, rendering, and AI rewrite.\n\n"
        "## Authentication\n"
        "**No authentication required.** All endpoints are open.\n\n"
        "## Scope\n"
        "All documents are scoped by `handbook_id`.\n"
    ),
    "SERVE_INCLUDE_SCHEMA": False,
    "TAGS": [
        {"name": "Health", "description": "Server health check"},
        {"name": "Documents", "description": "Document upload, render, rewrite, tree, and download"},
    ],
    "COMPONENT_SPLIT_REQUEST": True,
}


OPENAI_API_KEY = env("OPENAI_API_KEY", "")
OPENAI_CHAT_MODEL = env("OPENAI_CHAT_MODEL", "gpt-4o-mini")
OPENAI_REWRITE_MODEL = env("OPENAI_REWRITE_MODEL", "gpt-4o-mini")
OPENAI_VARIABLE_MODEL = env("OPENAI_VARIABLE_MODEL", OPENAI_REWRITE_MODEL)
OPENAI_COMPOSE_MODEL = env("OPENAI_COMPOSE_MODEL", OPENAI_VARIABLE_MODEL)
AI_REWRITE_TIMEOUT_SECONDS = int(env("AI_REWRITE_TIMEOUT_SECONDS", "60"))
AI_REWRITE_RETRIES = int(env("AI_REWRITE_RETRIES", "2"))
AI_VARIABLE_TIMEOUT_SECONDS = int(env("AI_VARIABLE_TIMEOUT_SECONDS", "45"))
AI_VARIABLE_RETRIES = int(env("AI_VARIABLE_RETRIES", "2"))
AI_COMPOSE_TIMEOUT_SECONDS = int(env("AI_COMPOSE_TIMEOUT_SECONDS", str(AI_VARIABLE_TIMEOUT_SECONDS)))
AI_COMPOSE_RETRIES = int(env("AI_COMPOSE_RETRIES", str(AI_VARIABLE_RETRIES)))
NEXTJS_INTERNAL_API_URL = env("NEXTJS_INTERNAL_API_URL", "http://localhost:3000")
OFFICE_ASSET_MAX_BUFFER_BYTES = int(env("OFFICE_ASSET_MAX_BUFFER_BYTES", str(20 * 1024 * 1024)))
ASSET_MAX_UPLOAD_BYTES = int(env("ASSET_MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))
CLIENT_ASSET_MAX_INLINE_BYTES = int(env("CLIENT_ASSET_MAX_INLINE_BYTES", str(2 * 1024 * 1024)))
REFERENCE_MAX_UPLOAD_BYTES = int(env("REFERENCE_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
COMPOSE_MAX_REFERENCE_DOCUMENTS = int(env("COMPOSE_MAX_REFERENCE_DOCUMENTS", "6"))
COMPOSE_MAX_REFERENCE_CHUNKS = int(env("COMPOSE_MAX_REFERENCE_CHUNKS", "6"))
COMPOSE_MAX_REFERENCE_TOKENS = int(env("COMPOSE_MAX_REFERENCE_TOKENS", "1800"))
OFFICE_ALLOW_SVG_RASTERIZE = env_bool("OFFICE_ALLOW_SVG_RASTERIZE", False)
OFFICE_MAX_CONCURRENT_GENERATIONS = int(env("OFFICE_MAX_CONCURRENT_GENERATIONS", "2"))

DATA_ROOT = Path(env("DATA_ROOT", str(PROJECT_ROOT / "data"))).resolve()
DOCUMENTS_DATA_ROOT = DATA_ROOT / "documents"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}
