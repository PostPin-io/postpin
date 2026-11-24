# @postpin-io/deploy

## 0.7.0

No changes in this release.

## 0.6.1

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

### Minor Changes

- **Landing page**: With `LANDING_PAGE=true`, `/` shows the new landing page to visitors who aren't signed in. It stays off by default, so self-hosted instances keep going straight to the login.

## 0.4.0

### Minor Changes

- **Tutorial for new accounts**: The migration marks every existing user as having finished the tutorial; only new sign-ups get it.

## 0.3.0

### Minor Changes

- **Install script**: `install.sh` is attached to every release. It downloads `compose.yml` and the example configuration, asks for hostnames, admin e-mail and SMTP, generates the secrets, writes `.env` and starts PostPin. It never touches an existing `.env`.
- **`TRANSCODE_MODE`**: `plugin` (default) lets the plugins encode the review versions; the server checks them and encodes itself when a plugin can't. `server` makes the worker encode everything, as before.
- **API version**: Server and plugins check that they speak the same API version. Each release has an `api-version.json`, `GET /v1/config` reports it, and plugins with another version get a `426`. Update the plugins together with the server.
- **Landing page (preview)**: `LANDING_PAGE=true` shows a landing page at `/` to visitors who aren't signed in. Off by default.
- **License**: PostPin is MIT licensed.

## 0.2.1

### Minor Changes

- **`UPLOAD_MAX_FILE_SIZE`**: Caps the size of a single upload, for the plugins and the browser upload alike. Empty means no limit besides the storage quotas.

## 0.2.0

### Minor Changes

- **Storage quotas**: `STORAGE_DEFAULT_ORG_QUOTA` and `STORAGE_DEFAULT_USER_QUOTA` set default limits, admins override them per organization and user in `/admin`. `STORAGE_CAPACITY` sets the space PostPin may use; `compose.yml` mounts `./data/s3` read-only into the app so `/admin` can show disk size and free space. Admins can backfill the storage usage of older exports. See the self-hosting docs for the matching rustfs bucket quota.
- **Legal links**: `IMPRINT_URL`, `PRIVACY_URL`, `TERMS_URL` and `DPA_URL` add links to the footer, to share links and to the sign-up consent notice. Unset links stay hidden.
- **Daily cleanup**: The worker deletes expired sessions, device codes and verification tokens every day at 03:00 (Europe/Berlin), and invitations 30 days after they expired.
- **Desktop app and plugins**: Each release now includes PostPin Desktop (macOS, Windows), the DaVinci Resolve plugin (macOS, Windows) and the Premiere Pro plugin.

## 0.1.0

### Minor Changes

- **First release**: `compose.yml` runs app, worker, Postgres, Redis and rustfs with health checks, keeps data in `./data` and listens on localhost only, for a reverse proxy in front. Copy `env.example` to `.env` and fill in every `change-me`.
  - Images for amd64 and arm64 on GHCR (`ghcr.io/postpin-io/postpin`, `ghcr.io/postpin-io/postpin-worker`), tagged `X.Y.Z`, `X.Y`, `X` and `latest`. Pre-releases only get their exact version.
  - Database migrations run when the app container starts.
  - `S3_PUBLIC_ENDPOINT` is the S3 address browsers and plugins use, while app and worker keep talking to `S3_ENDPOINT`.
  - `/health` checks the database, for Docker and reverse proxies.
  - Users listed in `ADMIN_EMAILS` get a system page at `/admin` with service health, queue status and the version.
  - The worker finishes running jobs for up to 25 seconds when it is stopped.
