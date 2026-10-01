# Putting Siraat tul Jannah online

This guide takes the academy from "runs on my laptop" to a live server at your own
domain, plus the Android/iPhone app (the only way students, teachers and admins use it). Follow it top to bottom the first time; later
updates are one command (section 8).

**What runs where:** one small rented server runs three pieces, each in its own Docker container:

```
 the app ──https──▶  Caddy  ──/api/*──▶  API (Node)  ──▶  PostgreSQL (db)
                                          uploads folder
```

- **Caddy** gets the HTTPS padlock certificate automatically and passes requests to the API.
- **API** is the backend; it keeps uploaded screenshots and voice notes in a private folder.
- **PostgreSQL** is the database.
- The phone app talks to the same address (`https://your-domain/api/v1`).

Everything is described in `deploy/docker-compose.yml`; you rarely need to touch it.

---

## 1. What you need
| Thing | Suggestion | Cost (approx.) |
|---|---|---|
| A domain name | e.g. `siraattuljannah.com` from Namecheap, Cloudflare or a Pakistani registrar | ~$10–15 / year |
| A server (VPS) | **Ubuntu 24.04**, 2 GB RAM, 1–2 CPUs — Hetzner CX22, DigitalOcean "Basic 2 GB", or Contabo | ~$5–12 / month |
| Your computer | a terminal with `ssh` (built into Windows 10+, macOS, Linux) | — |

> **Alternative:** a "platform" like Render or Railway runs the app without you managing a
> server. It's less work, but it costs more per month, and uploaded files need extra paid
> storage there. A single VPS keeps everything (database, files, backups) in one place you control.

## 2. Point the domain at the server
In your domain registrar's DNS settings, add an **A record**:
- Name: `@` (the bare domain), Value: your server's IP address.

It can take from a few minutes to a few hours to work everywhere. Check with `ping your-domain`.

## 3. Prepare the server (once)
Log in with the details your VPS provider gave you, then run each line:

```bash
ssh root@YOUR_SERVER_IP

# Updates and a firewall that only allows SSH and HTTPS
apt update && apt upgrade -y
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Docker (the official installer)
curl -fsSL https://get.docker.com | sh
```

## 4. Get the code and fill in the settings
```bash
git clone https://github.com/Minal329/Siraat-tul-Jannah.git /opt/siraat
cd /opt/siraat/deploy
cp .env.example .env
nano .env        # fill in the values, then Ctrl+O, Enter, Ctrl+X to save
```

In `.env`:
- `DOMAIN` — your domain, without `https://` (e.g. `siraattuljannah.com`).
- `POSTGRES_PASSWORD` — run `openssl rand -hex 24` and paste the result.
- `JWT_SECRET` — run `openssl rand -base64 48` and paste the result. **Never share it.**
- `ZOOM_*` — leave empty for now (section 9).

> 🔒 `deploy/.env` holds your secrets. It is ignored by git — never copy it into the repository,
> a chat or a screenshot.

## 5. Start everything
```bash
cd /opt/siraat/deploy
docker compose up -d --build
docker compose ps        # db, api and caddy "Up"; migrate "Exited (0)" (it ran the database setup)
```

The first build takes a few minutes. Then open `https://your-domain/api/v1/health` in a browser — you
should see `"status":"ok"` with a padlock in the address bar. If not, see Troubleshooting.

## 6. Create the first admin (the owner's account)
```bash
cd /opt/siraat/deploy
docker compose exec api node dist/src/scripts/create-admin.js --email you@example.com --name "Hafiza Aqsa Jamil"
```
A strong password is generated and **printed once** — save it in a password manager, log in, and
change it on the **Account** page if you like. Then, log in to the **app** as the admin:
1. **Payment accounts** — the ⚙ on the admin dashboard: the Easypaisa / JazzCash numbers students pay to.
2. **Courses, teachers and class groups** — their admin screens are being added to the app next
   (see `docs/roadmap.md`).

## 7. Backups (do this on day one)
The database and the uploaded files (payment screenshots, voice notes) can't be re-created, so back them up
every night:

```bash
crontab -e
# add this line, then save:
30 2 * * * /opt/siraat/deploy/backup.sh >> /opt/siraat/deploy/backup.log 2>&1
```

This keeps 14 days of backups in `/opt/siraat/deploy/backups/`. **A backup on the same server isn't
enough** — if the server is lost, so are they. Either turn on your VPS provider's automatic
snapshots/backups (usually ~20% of the server price), or copy the folder to your computer now and then:

```bash
# on your own computer
scp -r root@YOUR_SERVER_IP:/opt/siraat/deploy/backups ./siraat-backups
```

**Restoring** (only if something went wrong — this replaces the current data):
```bash
cd /opt/siraat/deploy
docker compose stop api
docker compose exec -T db pg_restore -U siraat -d siraat --clean --if-exists < backups/db_YYYY-MM-DD_HHMM.dump
docker compose run --rm -T --entrypoint tar api -xzf - -C /app < backups/uploads_YYYY-MM-DD_HHMM.tar.gz
docker compose start api
```

## 8. Updating to a new version
After new code is merged on GitHub:
```bash
cd /opt/siraat && git pull
cd deploy && docker compose up -d --build
```
Database changes (migrations) are applied automatically before the new API starts. Once a month, also run
`apt update && apt upgrade -y` and `docker compose pull && docker compose up -d --build` for security updates.

## 9. Optional: create Zoom meetings from the dashboard
Without this, teachers or admins paste a Zoom meeting ID into each class group (that works fine).
With it, the admin dashboard gets a **Create Zoom meeting** button.
1. Sign in to <https://marketplace.zoom.us> with the academy's Zoom account (a paid plan avoids the 40-minute limit).
2. **Develop → Build app → Server-to-Server OAuth app**. Give it a name.
3. Under **Scopes**, add `meeting:write:meeting:admin`. Activate the app.
4. Copy the **Account ID**, **Client ID** and **Client secret** into `deploy/.env` (`ZOOM_ACCOUNT_ID`, …).
5. `docker compose up -d` — the button appears in **Admin → Class groups**.

## 10. The phone app
The app is built in the cloud by Expo (EAS), so you don't need Android Studio or a Mac.

1. In `mobile/eas.json`, replace `siraattuljannah.com` with your real domain (both profiles).
2. Create a free account at <https://expo.dev>, then on your computer:
   ```bash
   npm install -g eas-cli
   cd mobile
   eas login
   eas build:configure        # links the project to your Expo account (once)
   ```
3. **Test build (Android):** `eas build -p android --profile preview` — gives a link to an `.apk`
   you can install on any Android phone. Try every screen with a real teacher and student account.
4. **Store builds:**
   - **Google Play:** a developer account costs $25 once. `eas build -p android --profile production`,
     then `eas submit -p android`, and fill in the store listing (description, screenshots, privacy policy).
   - **Apple App Store:** the Apple Developer Program costs $99/year. `eas build -p ios --profile production`
     and `eas submit -p ios`.
5. App updates later: bump `"version"` in `mobile/app.json`, build and submit again.

Both stores ask for a **privacy policy** URL: say what you collect (name, email, WhatsApp number,
payment screenshots, voice notes, attendance), why, who sees it, and how to ask for deletion.

## Troubleshooting
| Problem | What to check |
|---|---|
| No padlock / "connection refused" | DNS points to the right IP? `ufw status` shows 80 and 443? `docker compose logs caddy` |
| "Bad gateway" (502) | The API isn't running: `docker compose ps`, then `docker compose logs api` |
| API exits right after starting | `docker compose logs api` — a missing or invalid setting is named there |
| `migrate` didn't exit with 0 | `docker compose logs migrate` |
| Phone app can't connect | The domain in `mobile/eas.json` must match, and `https://your-domain/api/v1/health` must open in the phone's browser |

See also: `docs/security.md` (checklist before going live).
