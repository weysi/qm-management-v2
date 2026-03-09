# Production deployment

This repository now includes a production stack for Hetzner or any Linux VM.

## Services

- `caddy`: TLS termination and reverse proxy on ports `80/443`
- `frontend`: Next.js standalone server on the internal Docker network
- `backend`: Django + Gunicorn on the internal Docker network
- `postgres`: PostgreSQL with `pgvector`

Only `caddy` is exposed publicly. PostgreSQL and Django stay private.

## Required files on the server

1. Copy the repository to a deployment directory such as `/opt/qm-management-v2`.
2. Create `.env.production` from `.env.production.example`.
3. Start the stack:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## Useful commands

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
