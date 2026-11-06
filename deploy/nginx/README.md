# career.cadacrew.fun — private HTTPS access

**Status:** Hostinger DNS now has a `career` A record pointing to the same VPS
as `cadacrew.fun`. DNS alone does not expose the dashboard.

This configuration adds a separate Nginx virtual host only for
**https://career.cadacrew.fun**. The Career Intelligence Node process stays
bound to `127.0.0.1:3417`. The existing CREW Games website, wedding website,
and other Nginx virtual hosts must remain unchanged.

## Security model

- HTTPS via Let's Encrypt certificate for `career.cadacrew.fun`.
- Dedicated HTTP Basic Authentication credentials (not shared with CREW).
- Challenge-only HTTP configuration before TLS certificate issuance.
- Only after certificate and password file exist does Nginx proxy traffic.
- Backend Host set to `127.0.0.1:3417` as required by the current
  localhost-only application. Backend Origin rewritten to localhost.
- The application also enforces `X-Requested-With: CareerIntelligence`
  on mutations; cross-origin browser requests with this header are preflighted.
- This is suitable as a limited personal-access first release. For stronger
  access controls later (SSO, passkeys, MFA), integrate an identity gateway.

Do not put your password or credential hash in the GitHub repository.

## Preconditions

1. Merge the reviewed PR containing these Nginx templates.
2. Verify the app is healthy on the VPS:
   `curl -fsS http://127.0.0.1:3417/api/health`.
3. Confirm `career.cadacrew.fun` resolves to the VPS address.
4. Check there is no existing `career.cadacrew.fun` Nginx server block.
5. The existing CREW and wedding services are healthy.
6. Confirm ports 80 and 443 are reachable from the internet
   through the existing Nginx installation.

## Step 1 — Prepare certificate challenge vhost

From an SSH terminal on the VPS after this PR is merged:

```bash
REPO=/opt/crew-dev-bridge/career-source
OWNER_UID=$(stat -c '%u' "$REPO")
OWNER_GID=$(stat -c '%g' "$REPO")
sudo setpriv --reuid="$OWNER_UID" --regid="$OWNER_GID" --clear-groups \
  git -C "$REPO" checkout main
sudo setpriv --reuid="$OWNER_UID" --regid="$OWNER_GID" --clear-groups \
  git -C "$REPO" pull --ff-only origin main

# Install certbot and htpasswd utilities (not a second web server).
sudo apt-get update
sudo apt-get install -y certbot apache2-utils

# Keep issuance separate from the existing site configuration.
sudo install -d -m 0755 /var/www/letsencrypt/.well-known/acme-challenge
sudo install -m 0644 \
  "$REPO/deploy/nginx/career-acme.conf" \
  /etc/nginx/sites-available/career.cadacrew.fun
sudo ln -s \
  /etc/nginx/sites-available/career.cadacrew.fun \
  /etc/nginx/sites-enabled/career.cadacrew.fun

sudo nginx -t && sudo systemctl reload nginx
```

The HTTP-only site returns 404 for everything other than certificate
challenges. It does not proxy any application traffic.

If the symlink or file already exists, **stop and inspect** instead of
overwriting an existing virtual host.

## Step 2 — Obtain HTTPS certificate and create credentials

```bash
# Supply your actual email; certbot prompts for agreement if needed.
sudo certbot certonly --webroot \
  -w /var/www/letsencrypt \
  --cert-name career.cadacrew.fun \
  -d career.cadacrew.fun

# Select a username of your choice. The utility securely prompts for password.
sudo htpasswd -cB /etc/nginx/.career-intelligence.htpasswd careeradmin

# Nginx workers need read permission; the credentials remain outside Git.
sudo chown root:www-data /etc/nginx/.career-intelligence.htpasswd
sudo chmod 0640 /etc/nginx/.career-intelligence.htpasswd
```

If Nginx runs under a different service account, check the `user` directive
in Nginx and use its group in place of `www-data`.

Do not use `htpasswd -b` (password on command line), and do not paste
the password into ChatGPT.

## Step 3 — Activate authenticated HTTPS

Only after both the certificate and password file exist:

```bash
sudo test -s /etc/letsencrypt/live/career.cadacrew.fun/fullchain.pem
sudo test -s /etc/nginx/.career-intelligence.htpasswd

# Backup the challenge-only config before replacement.
sudo cp -a /etc/nginx/sites-available/career.cadacrew.fun \
  /etc/nginx/sites-available/career.cadacrew.fun.acme.bak
sudo install -m 0644 \
  "$REPO/deploy/nginx/career-https.conf" \
  /etc/nginx/sites-available/career.cadacrew.fun

if sudo nginx -t; then
  sudo systemctl reload nginx
else
  sudo cp -a /etc/nginx/sites-available/career.cadacrew.fun.acme.bak \
    /etc/nginx/sites-available/career.cadacrew.fun
  sudo nginx -t && sudo systemctl reload nginx
fi
```

**Manual smoke checks:**

```bash
curl -I http://career.cadacrew.fun/
curl -I https://career.cadacrew.fun/
curl -fsS http://127.0.0.1:3417/api/health
sudo systemctl is-active career-intelligence nginx
```

Expected: HTTP redirects to HTTPS, unauthenticated HTTPS responds
`401 Unauthorized`, local health endpoint reports `"status":"ok"`.
Visit `https://career.cadacrew.fun` in a browser and sign in with the
username/password chosen above. Verify adding a **non-sensitive test role**
and changing its status (these are protected POST/PATCH operations).

## Renewal and recovery

Certbot normally installs a systemd renewal timer on Ubuntu. Verify with
`systemctl list-timers | grep certbot`. Certificate renewals need Nginx
to reload afterward. Add a local deploy hook to reload Nginx only after
renewal succeeds; avoid modifying unrelated virtual hosts.

If the HTTPS site fails validation or proxying, restore
`career.cadacrew.fun.acme.bak` and reload Nginx. That disables the
Career Intelligence proxy without changing CREW Games or the wedding site.
Do not delete certificates, other virtual hosts, or shared server resources.

## Important limitations

- This is an optional operator-applied, reviewed config. Merging the PR
  **does not** change the VPS Nginx configuration.
- HTTP Basic Authentication is a temporary personal-access mechanism,
  not SSO/MFA. Use a strong unique password.
- Do not expose the unauthenticated loopback service directly.
- No AI engine, external API keys, or automated applications are configured.
