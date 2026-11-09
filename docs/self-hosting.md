# Self-Hosting PostPin

## Overview

To run PostPin on your own server, you need Docker, a containerization platform that runs Linux containers. PostPin is distributed as a set of Docker images, and the easiest way to run them is with Docker Compose. PostPin ships as two images: the app (web interface and API) and a worker that processes uploaded media, e.g. transcoding videos and creating thumbnails. In addition, PostPin needs a Postgres database, a Redis queue and S3-compatible storage for media. The easiest way to get all of these is with the bundled `compose.yml` (in `deploy/` of this repository), which runs PostPin, Postgres, Redis and a small S3 server called rustfs.

## Requirements

- a linux server with Docker and Docker Compose installed (any basic VPS will do, although transcoding videos is CPU-intensive and may be slow on small instances)
- a domain name and TLS certificate (PostPin requires HTTPS for sign-in and media uploads). You need two hostnames pointing to the server: one for the app and one for media storage, e.g. `postpin.example.com` and `media.example.com`
- a reverse proxy that terminates TLS, see [Reverse Proxy & TLS](#reverse-proxy--tls)
- a working SMTP server for sending email verification, password reset and invitation emails (PostPin will start without it, but users can't verify their address or reset their password)

## Quickstart

1. Download `compose.yml` and the example configuration into a new directory:

   ```sh
   mkdir postpin && cd postpin
   curl -fsSLO https://github.com/PostPin-io/postpin/releases/latest/download/compose.yml
   curl -fsSL -o .env https://github.com/PostPin-io/postpin/releases/latest/download/.env.example
   ```

2. Edit `.env` and replace every `change-me`. Generate the secrets with:

   ```sh
   openssl rand -hex 32   # BETTER_AUTH_SECRET
   openssl rand -hex 24   # POSTGRES_PASSWORD
   openssl rand -hex 16   # S3_ACCESS_KEY
   openssl rand -hex 32   # S3_SECRET_KEY
   ```

   Set `BETTER_AUTH_URL` and `S3_PUBLIC_ENDPOINT` to the two public URLs, and fill in your SMTP
   server. Put your own email address into `ADMIN_EMAILS`.

3. Start PostPin:

   ```sh
   docker compose up -d
   docker compose ps   # wait until app, db, redis and rustfs are healthy
   curl http://localhost:3000/health   # {"status":"ok"}
   ```

   The first start applies all database migrations, which takes a few seconds. All data is stored
   in `./data` next to `compose.yml`: the database in `data/db`, the job queue in `data/redis` and
   all media in `data/s3`. Make sure the disk has room for your media.

4. Set up your [reverse proxy](#reverse-proxy--tls) for both hostnames.

5. Open `BETTER_AUTH_URL` in your browser, sign up with the address from `ADMIN_EMAILS` and verify
   it. You can then reach the admin area at `/admin`.

## Config

PostPin is configured through environment variables, set in the `.env` file next to your
`compose.yml`. Variables without a default are required. Values marked _set by compose.yml_ are
the same for every installation of the bundled stack; only set them if you run PostPin without it,
e.g. with an external database or S3 storage.

### Compose

These only configure `compose.yml` itself:

| Variable          | Default  | Description                                                                                   |
| ----------------- | -------- | --------------------------------------------------------------------------------------------- |
| `POSTPIN_VERSION` | `latest` | Image tag to run, e.g. `1.4.2`. `latest` follows every release, including new major versions. |
| `APP_PORT`        | `3000`   | Port on localhost the app listens on, for your reverse proxy.                                 |
| `S3_PORT`         | `9000`   | Port on localhost the bundled rustfs listens on, for your reverse proxy.                      |

### App

| Variable             | Default | Description                                                                                                                                                                                                               |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`    |         | Public URL of your instance, e.g. `https://postpin.example.com`. Used for sign-in, links in emails and the S3 CORS rule. `compose.yml` also passes it to the app as `ORIGIN`, which form submissions are checked against. |
| `BETTER_AUTH_SECRET` |         | Secret for signing sessions, at least 32 characters. Generate one with `openssl rand -hex 32`. Changing it signs everyone out.                                                                                            |
| `ADMIN_EMAILS`       | (empty) | Comma-separated emails that get system admin access (`/admin`). Only applies once the address is verified.                                                                                                                |

### Database

| Variable            | Default              | Description                                                                                                                                                       |
| ------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`     |                      | User the bundled Postgres container is created with.                                                                                                              |
| `POSTGRES_PASSWORD` |                      | Password for that user.                                                                                                                                           |
| `POSTGRES_DB`       |                      | Database the bundled Postgres container is created with.                                                                                                          |
| `DATABASE_URL`      | _set by compose.yml_ | Connection URL used by app and worker, built from the three values above. Because the password becomes part of this URL, avoid characters like `@ / : ? #` in it. |
| `SKIP_MIGRATIONS`   |                      | Set to `true` to skip database migrations on startup.                                                                                                             |

### Storage

See [Storage & Uploads](#storage--uploads) for how the two endpoints work together.

| Variable              | Default                                     | Description                                                                                                                            |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `S3_ENDPOINT`         | _set by compose.yml_ (`http://rustfs:9000`) | Endpoint app and worker use for all S3 operations. Leave empty for AWS S3.                                                             |
| `S3_PUBLIC_ENDPOINT`  | `S3_ENDPOINT`                               | Endpoint in presigned URLs for browsers and plugins. Required with the bundled rustfs: the public URL your reverse proxy serves it on. |
| `S3_FORCE_PATH_STYLE` | _set by compose.yml_ (`true`)               | `true` for URLs like `endpoint/bucket/key`, which most self-hosted S3 servers (including rustfs) need.                                 |
| `S3_ACCESS_KEY`       |                                             | Access key. For the bundled rustfs this also sets its admin user.                                                                      |
| `S3_SECRET_KEY`       |                                             | Secret key. For the bundled rustfs this also sets its admin password.                                                                  |
| `S3_BUCKET`           |                                             | Bucket for all media. Created on startup if it doesn't exist.                                                                          |
| `S3_REGION`           |                                             | Region, e.g. `eu-west-1`. Self-hosted servers accept any value.                                                                        |

### Queue

| Variable        | Default                        | Description                |
| --------------- | ------------------------------ | -------------------------- |
| `REDIS_HOST`    | _set by compose.yml_ (`redis`) | Redis host.                |
| `REDIS_PORT`    | _set by compose.yml_ (`6379`)  | Redis port.                |
| `REDIS_USE_SSL` | `false`                        | `true` to connect via TLS. |

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

PostPin doesn't terminate TLS itself. `compose.yml` publishes two ports on localhost only, and your
reverse proxy serves them under your two hostnames with HTTPS:

| Hostname (example)    | Proxies to       | Set as               |
| --------------------- | ---------------- | -------------------- |
| `postpin.example.com` | `localhost:3000` | `BETTER_AUTH_URL`    |
| `media.example.com`   | `localhost:9000` | `S3_PUBLIC_ENDPOINT` |

Whatever proxy you use, it must

- forward the original `Host` header to rustfs, because presigned URLs are signed for that host,
- not limit the request body size, because uploads are sent in parts of 32 MiB or more,
- not buffer uploads for a long time, so slow connections don't run into timeouts.

If your proxy runs in a container itself, `localhost` is the proxy container: add it to the
`postpin_default` network and use `app:3000` and `rustfs:9000` instead.

### Caddy

[Caddy](https://caddyserver.com) gets and renews certificates automatically and meets all of the
above by default. `/etc/caddy/Caddyfile`:

```caddyfile
postpin.example.com {
	reverse_proxy localhost:3000
}

media.example.com {
	reverse_proxy localhost:9000
}
```

### nginx

Get certificates with certbot or similar, then:

```nginx
server {
	listen 443 ssl;
	server_name postpin.example.com;
	# ssl_certificate ... / ssl_certificate_key ...

	location / {
		proxy_pass http://127.0.0.1:3000;
		proxy_set_header Host $host;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}
}

server {
	listen 443 ssl;
	server_name media.example.com;
	# ssl_certificate ... / ssl_certificate_key ...

	client_max_body_size 0;
	proxy_request_buffering off;

	location / {
		proxy_pass http://127.0.0.1:9000;
		proxy_set_header Host $host;
	}
}
```

## Storage & Uploads

Browsers and the editor plugins upload and download media **directly from S3**, not through the
PostPin app. The app only hands out short-lived presigned URLs. Your S3 storage therefore has to be
reachable from wherever your users are.

PostPin uses two endpoint settings:

| Variable             | Used by                                       | Example                     |
| -------------------- | --------------------------------------------- | --------------------------- |
| `S3_ENDPOINT`        | App and worker, for all S3 operations         | `http://rustfs:9000`        |
| `S3_PUBLIC_ENDPOINT` | Presigned URLs handed to browsers and plugins | `https://media.example.com` |

`S3_PUBLIC_ENDPOINT` is optional and falls back to `S3_ENDPOINT`.

- **Bundled rustfs (default compose setup):** `compose.yml` sets `S3_ENDPOINT=http://rustfs:9000`;
  point `S3_PUBLIC_ENDPOINT` at the public URL your reverse proxy serves rustfs on. App and worker talk to
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

PostPin will run database migrations automatically on startup, so you can update by pulling the new images and restarting the containers:

```sh
docker compose pull && docker compose up -d
```

This can be automated by Watchtower or similar tools. The app and worker images share the same version, so always update both at the same time. Pin `POSTPIN_VERSION` to a version like `1.4.2` if you want to decide yourself when to update. If you set `SKIP_MIGRATIONS` to `true`, PostPin will skip migrations and may fail to start if the database is not up-to-date.

When the worker is stopped, it stops taking new jobs and gives the ones it is working on up to 25
seconds to finish. Jobs that take longer, like transcoding a long video, are put back into the
queue and start over once the worker is running again, so nothing is lost.

## Backups

> [!WARNING]
> PostPin does not provide any backup or restore functionality. You are responsible for backing up your data and restoring it in case of a failure if you self-host PostPin. Alternatively, you can use our SaaS offering, where we ensure that your data is backed up and can be restored in case of a failure.

What to back up:

- **Database:** don't copy `data/db` while Postgres is running, the copy may be inconsistent. Dump
  it instead: `docker compose exec db pg_dump -U <POSTGRES_USER> <POSTGRES_DB> > postpin.sql`
- **Media:** `data/s3`, e.g. with restic or rsync.
- **`.env`:** it holds your secrets. Without the same `BETTER_AUTH_SECRET` and S3 keys, a restored
  instance signs everyone out or can't read its storage.

`data/redis` only holds the job queue and doesn't need a backup.

## Troubleshooting

### Health check

`GET /health` answers `200 {"status":"ok"}` when the app is running and can reach the database, and
`503 {"status":"error"}` otherwise. It needs no login, so you can use it for your reverse proxy's or
uptime monitor's health checks.

### Port is already allocated

Another service on your server uses port 3000 or 9000. Set `APP_PORT` or `S3_PORT` in `.env` to a
free port and point your reverse proxy there.

### Uploads fail with 403 Forbidden

The signature of the presigned URL doesn't match the request. Check that `S3_PUBLIC_ENDPOINT`
matches the URL your proxy serves rustfs on exactly (scheme and hostname) and that your proxy
forwards the original `Host` header.
