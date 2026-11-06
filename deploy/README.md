# Private VPS installation — Career Intelligence

This is a **first-install-only** deployment of the lightweight dashboard. It
does not install upstream Career-Ops, invoke any AI model, modify CREW Games or
the wedding website, configure Nginx, or open firewall ports.

## Preconditions

- The new deployment PR has been reviewed and **merged into** `main`.
- The CREW Development Bridge has an independent `career-source` checkout.
- Ubuntu VPS with systemd, Bash, Git, tar, curl, useradd, runuser, and a
  **system-wide Node.js 22.13+** executable accessible to an unprivileged user.
- The service name `career-intelligence.service` and directory
  `/opt/career-intelligence` are not in use. The installer stops rather than
  replace an existing installation.
- The existing CREW and wedding services should be healthy before and after.

## Initial installation

Run on the VPS after merging the deployment PR:

```bash
cd /opt/crew-dev-bridge/career-source
git status --short
git checkout main
git pull --ff-only origin main
sudo bash scripts/install-vps.sh
```

The installer validates the checkout's origin, cleanliness and match to
`origin/main`; checks system-wide Node compatibility; archives the reviewed Git
commit; installs a root-owned source tree at `/opt/career-intelligence`; and
starts a separate systemd service running as unprivileged `career-intelligence`.
It performs an HTTP health check and cleans up the new service/source if
activation fails. The dedicated account and data directory remain for inspection
after a failed install.

It **does not** configure external web access or publish any new port. The
service listens on `127.0.0.1:3417`. Its files are kept here:

| Path | Purpose |
|---|---|
| `/opt/career-intelligence` | Root-owned, reviewed application source |
| `/var/lib/career-intelligence/leads.json` | Personal tracker; private, untracked data |
| `/etc/career-intelligence/config.env` | Optional root-only settings for service |
| `/etc/systemd/system/career-intelligence.service` | Isolated service unit |

## Verify

```bash
systemctl is-active career-intelligence
curl --fail --silent http://127.0.0.1:3417/api/health
sudo journalctl -u career-intelligence -n 30 --no-pager
```

Expected: `active` and a JSON object with `"status":"ok"`.
The app will report `coreConfigured:false` until Career-Ops is separately
installed and connected.

Use an SSH tunnel from your **laptop** for browser access:

```bash
ssh -N -L 3417:127.0.0.1:3417 root@YOUR_VPS_HOST
```

Open <http://127.0.0.1:3417> on the laptop with the tunnel running.
The dashboard has **no login**. Do not connect it directly to a public domain.
For multi-device remote access, add authenticated ingress or a private network
as a separately reviewed change.

## Later: connect upstream Career-Ops

Install and configure upstream Career-Ops in a separate repository/data checkout.
Only then configure `CAREER_OPS_ROOT` and `CAREER_OPS_CODE_ROOT` in
`/etc/career-intelligence/config.env`. Grant the service account only the
read/write access needed for scanner and tracker operations. The upstream data
must remain outside public web roots and Git; do not store credentials in this
repository. Restart the new service after config changes:

```bash
sudo systemctl restart career-intelligence
```

Do not run the first-install script to upgrade the dashboard. A separately
reviewed update and rollback workflow must be created before production updates.
