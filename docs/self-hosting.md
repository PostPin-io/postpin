# Self-Hosting PostPin

## Overview

To run PostPin on your own server, you need Docker, a containerization platform that runs Linux containers. PostPin is distributed as a set of Docker images, and the easiest way to run them is with Docker Compose. PostPin ships as two images: the app (web interface and API) and a worker that processes uploaded media, e.g. transcoding videos and creating thumbnails. In addition, PostPin needs a Postgres database, a Redis queue and S3-compatible storage for media. The easiest way to get all of these is with the bundled `docker-compose.yml`, which runs PostPin, Postgres, Redis and a small S3 server called rustfs.

## Requirements

- a linux server with Docker and Docker Compose installed (any basic VPS will do, although transcoding videos is CPU-intensive and may be slow on small instances)
- a domain name and TLS certificate (PostPin requires HTTPS for sign-in and media uploads)
- a working SMTP server for sending email verification, password reset and invitation emails (PostPin will start without it, but users can't verify their address or reset their password)

## Quickstart

## Config

PostPin is configured through environment variables, set in the `.env` file next to your
`compose.yml`. Variables without a default are required.

### App

| Variable             | Default | Description                                                                                                                    |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_URL`    |         | Public URL of your instance, e.g. `https://postpin.example.com`. Used for sign-in, links in emails and the S3 CORS rule.       |
| `BETTER_AUTH_SECRET` |         | Secret for signing sessions, at least 32 characters. Generate one with `openssl rand -hex 32`. Changing it signs everyone out. |
| `ADMIN_EMAILS`       | (empty) | Comma-separated emails that get system admin access (`/admin`). Only applies once the address is verified.                     |

### Database

| Variable            | Default | Description                                                                                                  |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `POSTGRES_USER`     |         | User the bundled Postgres container is created with.                                                         |
| `POSTGRES_PASSWORD` |         | Password for that user.                                                                                      |
| `POSTGRES_DB`       |         | Database the bundled Postgres container is created with.                                                     |
| `DATABASE_URL`      |         | Connection URL used by app and worker, e.g. `postgresql://postpin:<password>@db:5432/postpin?schema=public`. |
| `SKIP_MIGRATIONS`   |         | Set to `true` to skip database migrations on startup.                                                        |

### Storage

See [Storage & Uploads](#storage--uploads) for how the two endpoints work together.

| Variable              | Default       | Description                                                                                            |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| `S3_ENDPOINT`         | (AWS S3)      | Endpoint app and worker use for all S3 operations. Leave empty for AWS S3.                             |
| `S3_PUBLIC_ENDPOINT`  | `S3_ENDPOINT` | Endpoint in presigned URLs for browsers and plugins. Only needed if they can't reach `S3_ENDPOINT`.    |
| `S3_FORCE_PATH_STYLE` | `false`       | `true` for URLs like `endpoint/bucket/key`, which most self-hosted S3 servers (including rustfs) need. |
| `S3_ACCESS_KEY`       |               | Access key. For the bundled rustfs this also sets its admin user.                                      |
| `S3_SECRET_KEY`       |               | Secret key. For the bundled rustfs this also sets its admin password.                                  |
| `S3_BUCKET`           |               | Bucket for all media. Created on startup if it doesn't exist.                                          |
| `S3_REGION`           |               | Region, e.g. `eu-west-1`. Self-hosted servers accept any value.                                        |

### Queue

| Variable        | Default | Description                         |
| --------------- | ------- | ----------------------------------- |
| `REDIS_HOST`    |         | Redis host, `redis` inside compose. |
| `REDIS_PORT`    |         | Redis port, usually `6379`.         |
| `REDIS_USE_SSL` | `false` | `true` to connect via TLS.          |

### Email

PostPin sends email verification, password reset and invitation mails. Without a working SMTP server
the app still starts, but users can't verify their address or reset their password.

| Variable         | Default     | Description                                             |
| ---------------- | ----------- | ------------------------------------------------------- |
| `SMTP_HOST`      |             | SMTP server.                                            |
| `SMTP_PORT`      |             | Usually `587` (STARTTLS) or `465` (TLS).                |
| `SMTP_SECURE`    | `false`     | `true` for TLS from the start (port 465).               |
| `SMTP_USER`      |             | SMTP user name.                                         |
| `SMTP_PASSWORD`  |             | SMTP password.                                          |
| `SMTP_MAIL_FROM` | `SMTP_USER` | Sender address, e.g. `"PostPin <noreply@example.com>"`. |

## Reverse Proxy & TLS

## Storage & Uploads

Browsers and the editor plugins upload and download media **directly from S3**, not through the
PostPin app. The app only hands out short-lived presigned URLs. Your S3 storage therefore has to be
reachable from wherever your users are.

PostPin uses two endpoint settings:

| Variable             | Used by                                       | Example                  |
| -------------------- | --------------------------------------------- | ------------------------ |
| `S3_ENDPOINT`        | App and worker, for all S3 operations         | `http://rustfs:9000`     |
| `S3_PUBLIC_ENDPOINT` | Presigned URLs handed to browsers and plugins | `https://s3.example.com` |

`S3_PUBLIC_ENDPOINT` is optional and falls back to `S3_ENDPOINT`.

- **Bundled rustfs (default compose setup):** set `S3_ENDPOINT=http://rustfs:9000` and point
  `S3_PUBLIC_ENDPOINT` at the public URL your reverse proxy serves rustfs on. App and worker talk to
  rustfs over the internal Docker network, so they keep working while your proxy, DNS or TLS
  certificate is still being set up, and large video transfers by the worker never have to leave the host.
- **External S3 (AWS S3, Cloudflare R2, Backblaze B2, …):** set `S3_ENDPOINT` to the provider's
  endpoint (leave it empty for AWS) and leave `S3_PUBLIC_ENDPOINT` unset.

On startup PostPin creates the bucket if it does not exist and sets a CORS rule that allows
`BETTER_AUTH_URL` as origin. If your provider does not allow this via the API, create the bucket and
CORS rule manually (methods `GET, PUT, POST, DELETE, HEAD`, exposed headers
`ETag, Content-Range, Content-Length`).

> [!IMPORTANT]
> Presigned URLs are signed for a specific host. Your reverse proxy must forward the original `Host`
> header to rustfs (Caddy does this by default; for nginx add `proxy_set_header Host $host;`) and must
> allow large request bodies (uploads are sent in parts of 32 MiB or more, so set
> `client_max_body_size 0;` in nginx).

## Updates & Versions

PostPin will run database migrations automatically on startup, so you can update by pulling the new images and restarting the containers. This can be automated by Watchtower or similar tools. The app and worker images share the same version, so always update both at the same time. If you set `SKIP_MIGRATIONS` to `true`, PostPin will skip migrations and may fail to start if the database is not up-to-date.

## Backups

> [!WARNING]
> PostPin does not provide any backup or restore functionality. You are responsible for backing up your data and restoring it in case of a failure if you self-host PostPin. Alternatively, you can use our SaaS offering, where we ensure that your data is backed up and can be restored in case of a failure.

## Troubleshooting

### Health check

`GET /health` answers `200 {"status":"ok"}` when the app is running and can reach the database, and
`503 {"status":"error"}` otherwise. It needs no login, so you can use it for your reverse proxy's or
uptime monitor's health checks.
