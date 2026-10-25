# Deployment

The same code deploys two ways: Docker Compose (Node and a SQLite file) or Cloudflare (Workers, D1 and R2). Settings are in `.env` (see `.env.example`).

## Docker Compose

Needs Docker with Compose v2.

```sh
cp .env.example .env
# edit .env: set APP_PASSWORD, and SESSION_SECRET (for example: openssl rand -hex 32)
docker compose up -d --build
```

Open `http://<host>:3000` and sign in. The SQLite database and all photos live in the `mehzur-data` Docker volume, so they survive restarts, rebuilds and `docker compose down` (but not `down -v`).

### From a published image (GitHub Container Registry)

Every push to `main` is checked (type check and unit tests) by GitHub Actions and then built into an image at `ghcr.io/christopher-b/mehzur` (linux/amd64), tagged `latest` and with the commit (`sha-abc1234`). A tag such as `v1.2.0` also publishes `1.2.0` and `1.2`. See `.github/workflows/docker.yml`.

On the server you only need two files, `docker-compose.ghcr.yml` and a `.env` (see the settings below):

```sh
docker compose -f docker-compose.ghcr.yml up -d
# later, to update:
docker compose -f docker-compose.ghcr.yml pull && docker compose -f docker-compose.ghcr.yml up -d
```

Set `MEHZUR_TAG` in `.env` to pin a version (default `latest`). Behind Traefik, add `-f docker-compose.traefik.yml` to those commands.

First publish: after the first successful run, open the repository's **Packages** on GitHub, open `mehzur`, and under **Package settings** make sure it is **Public** (a new package can start as private); a private package needs `docker login ghcr.io` with a token that has `read:packages` on the server. Also check **Settings > Actions > General > Workflow permissions** allow the workflow to write packages.

### Settings (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `APP_PASSWORD` | required | The login password |
| `SESSION_SECRET` | required | Signs login cookies. Changing it signs everyone out |
| `PORT` | `3000` | Port published on the host |
| `PLAIN_HTTP` | `true` | `true` when you open the site over plain `http` (home or LAN). Set `false` behind an https proxy |
| `PROTOCOL_HEADER` | empty | Behind a proxy, set to `x-forwarded-proto` |
| `HOST_HEADER` | empty | Only if your proxy changes the `Host` header, set to `x-forwarded-host` |

Uploads are limited to 15 MB per photo (the app shrinks photos long before that) and the server accepts request bodies up to 20 MB (`BODY_SIZE_LIMIT` in the Dockerfile).

### HTTPS behind a reverse proxy

Plain http is fine on a home network. For anything reachable from the internet, put the app behind an https reverse proxy and tell it so:

```sh
# .env
PLAIN_HTTP=false
PROTOCOL_HEADER=x-forwarded-proto
```

Publish the port to the proxy only: change the port mapping in `docker-compose.yml` to `"127.0.0.1:3000:3000"`. Example Caddyfile (Caddy forwards the right headers and gets certificates automatically):

```
mehzur.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

With nginx, also send `proxy_set_header Host $host;`, `proxy_set_header X-Forwarded-Proto $scheme;` and raise `client_max_body_size` to at least `20m`.

If login fails with "Cross-site POST form submissions are forbidden", the app's idea of its own address doesn't match the browser's: `PLAIN_HTTP` is wrong for how you are connecting, or the proxy isn't sending `X-Forwarded-Proto`.

### Behind Traefik

`docker-compose.traefik.yml` is an override file that puts Rooms behind [Traefik](https://traefik.io/) (which ends the https connection). It publishes no port on the host, joins the Docker network Traefik uses, and adds the Traefik labels.

```sh
# .env, in addition to APP_PASSWORD and SESSION_SECRET:
MEHZUR_HOST=mehzur.example.com          # the public host name
PLAIN_HTTP=false
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
# TRAEFIK_NETWORK=traefik             # the network Traefik is on (default: traefik)

docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
```

Assumes Traefik v3 with the Docker provider and an entry point called `websecure`. For Let's Encrypt, uncomment the `certresolver` label in the file and use your resolver's name. Traefik adds the `X-Forwarded-Proto` and `X-Forwarded-Host` headers that the app needs; without the three `.env` settings above, sign-in fails with "Cross-site POST form submissions are forbidden".

Tested with Traefik v3.6 on `https://mehzur.localhost`: sign-in and the session cookie (Secure, HttpOnly), the cross-site check (a wrong Origin is refused), creating a project and room in a browser, a 12 MB photo upload and download, the CSV and PDF exports, `/api/health`, and data surviving a restart.

### Backup, restore, update

```sh
# Backup (stop first so the SQLite files are consistent)
docker compose stop
docker run --rm -v mehzur_mehzur-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/mehzur-backup.tgz -C /data .
docker compose start

# Restore into an empty volume
docker compose down -v
docker volume create mehzur_mehzur-data
docker run --rm -v mehzur_mehzur-data:/data -v "$PWD":/backup alpine \
  sh -c "tar xzf /backup/mehzur-backup.tgz -C /data && chown -R 1000:1000 /data"
docker compose up -d

# Update to a new version of the code (database migrations run automatically on start)
git pull && docker compose up -d --build
```

The volume is named `mehzur_mehzur-data` (the compose file sets the project name to `mehzur`); run `docker volume ls` to check. Logs: `docker compose logs -f`.

## Cloudflare

Needs a Cloudflare account and Node. Everything runs on Workers (the app), D1 (database) and R2 (photos).

```sh
npx wrangler login

# 1. Create the database, and note the database_id it prints
npx wrangler d1 create mehzur
# put that id in wrangler.jsonc ("database_id")

# 2. Create the photo bucket (the name must match wrangler.jsonc)
npx wrangler r2 bucket create mehzur-photos

# 3. Create the tables
npm run db:migrate:cf

# 4. Set the secrets
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET

# 5. Build and deploy
npm run deploy:cf
```

Wrangler prints the `*.workers.dev` address; you can attach your own domain in the Cloudflare dashboard. To deploy a new version later, run `npm run db:migrate:cf` (applies any new migrations) and then `npm run deploy:cf`.

Notes:

- `npm run deploy:cf` builds with `DEPLOY_TARGET=cloudflare`; a normal `npm run build` makes the Node/Docker build.
- Sessions work the same as in Docker. For stronger access control you can also put the site behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/); the shared password then acts as a second check.
- Locally, `npm run dev:cf` runs the Cloudflare version against emulated D1 and R2. First copy `.dev.vars.example` to `.dev.vars` and apply the migrations to the local D1 with `npm run db:migrate:cf:local`.

## Troubleshooting: error ids and logs

When something unexpected fails on the server, the page says "Something went wrong on our side" and shows an
**Error id** (eight characters). The same id is in the log, on one JSON line:

```json
{"id":"a1b2c3d4","status":500,"method":"POST","path":"/p/…","route":"/p/[id]","message":"…","stack":"…"}
```

Request bodies, cookies and the password are never logged. Missing pages (404) are expected and are not logged as errors.

- **Docker:** `docker compose logs mehzur | grep a1b2c3d4` (use your service name and the id).
- **Cloudflare:** the Worker has observability enabled in `wrangler.jsonc`; open the Worker's **Logs** in the
  dashboard (or run `npx wrangler tail`) and search for the id.
