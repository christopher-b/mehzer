# Deployment

Mehzur runs in Docker (Node and a SQLite file). Settings are in `.env` (see `.env.example`).

## Docker Compose

Needs Docker with Compose v2.

```sh
cp .env.example .env
# edit .env: set APP_PASSWORD, and SESSION_SECRET (for example: openssl rand -hex 32)
docker compose up -d --build
```

Open `http://<host>:3000`. The first visit asks you to create the administrator account (see [First start and accounts](#first-start-and-accounts)). The SQLite database and all photos live in the `mehzur-data` Docker volume, so they survive restarts, rebuilds and `docker compose down` (but not `down -v`).

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

### First start and accounts

1. Open the site. With no accounts yet, every address redirects to **/setup**.
2. Enter the `APP_PASSWORD` as the setup password, then your name, email and a password (at least 10 characters). This creates the one administrator and signs you in. Any projects that existed before accounts were added are given to this account. `/setup` then stops working (404).
3. Open the account menu (your name in the header) > **Users** to invite people: **Create invite link**, optionally with the person's email address (and "Email them the link" when email is set up). The link works once and expires after 7 days. Send it to them; they choose a name and a password. Each person sees only their own projects. Only you (the administrator) can invite people, disable them or delete them, and there is one administrator.
4. People can change their password, sign out other devices and delete their own account (which deletes their projects) from **Account**. Passwords are reset by a link sent by email ("Forgot your password?") or, without email, by the administrator's **Reset link** button next to the person on the Users page.

Failed sign-ins are limited: 5 wrong passwords for one email address, or 50 from one visitor address, within 15 minutes blocks further attempts until the window passes.

### Email (invites and password reset)

Set `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM`. The connection must use TLS (port 587 with STARTTLS, or 465); the app refuses to send over an unencrypted connection to a remote server. Emails are plain text.

For **Proton Mail** (custom domain, paid plan): in Proton, Settings > IMAP/SMTP > SMTP tokens, create a token for the sending address, then:

```sh
APP_URL=https://mehzur.cbennell.com
SMTP_HOST=smtp.protonmail.ch
SMTP_PORT=587
SMTP_USER=mehzur@cbennell.com
SMTP_PASSWORD=<the SMTP token>
MAIL_FROM=Mehzur <mehzur@cbennell.com>
```

Without email, everything still works: invite links are copied from the Users page, and "Forgot your password?" tells people to ask the administrator for a reset link. Email send failures are logged (without the link) and never shown to the person asking, so the form cannot be used to find out which addresses have accounts.

### Settings (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `APP_PASSWORD` | required | The setup password: used once, at `/setup`, to create the administrator. It is not a login password |
| `SESSION_SECRET` | required | Keys the hashes of session cookies and of invite and reset links. Changing it signs everyone out and voids every unused link |
| `APP_URL` | empty | The public address (for example `https://mehzur.cbennell.com`), used for links in emails. Needed for email |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | empty, `587` | Outgoing email (invites, password reset). Leave `SMTP_HOST` empty to turn email off |
| `MAIL_FROM` | `Mehzur <mehzur@cbennell.com>` | Who emails come from |
| `ADDRESS_HEADER` | empty | Behind a proxy, `x-forwarded-for`: lets failed sign-ins be counted per visitor address |
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
ADDRESS_HEADER=x-forwarded-for
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
# Backup (stop first so the SQLite files are consistent). The database holds the accounts too (password hashes, invites).
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

## Troubleshooting: error ids and logs

When something unexpected fails on the server, the page says "Something went wrong on our side" and shows an
**Error id** (eight characters). The same id is in the log, on one JSON line:

```json
{"id":"a1b2c3d4","status":500,"method":"POST","path":"/p/…","route":"/p/[id]","message":"…","stack":"…"}
```

Request bodies, cookies and the password are never logged. Missing pages (404) are expected and are not logged as errors.

- **Docker:** `docker compose logs mehzur | grep a1b2c3d4` (use your service name and the id).
