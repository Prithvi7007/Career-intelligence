# Career-Ops scanner connection

This is the reviewed, one-time integration for the existing private Career
Intelligence dashboard at https://career.cadacrew.fun.

The CREW Development Bridge can create and test this installer but cannot run
arbitrary VPS commands or install software. **Merging this PR does not activate
the scanner.** One VPS operator command is required.

## What is connected

- Open-source Career-Ops scanner with no required AI token for ATS discovery.
- Pinned upstream commit 64ea4e3eeac0eaae359100136f511892410025ae.
- Separate source checkout: /opt/career-ops.
- Private data root: /var/lib/career-intelligence/career-ops.
- Editable portal configuration: private data root /portals.yml.
- Scanner output: private data root /data/pipeline.md.
- Existing dashboard imports that output and shows the new job opportunities.
- Only career-intelligence.service is restarted.

**Not included:** AI scoring, resume tailoring, automatic applications,
background scan scheduling or public port changes. No existing CREW Games,
wedding, or Nginx configuration is changed.

## Activate after merging the PR

Connect to the VPS and run:

    REPO=/opt/crew-dev-bridge/career-source
    OWNER_UID=$(stat -c '%u' "$REPO")
    OWNER_GID=$(stat -c '%g' "$REPO")

    sudo setpriv --reuid="$OWNER_UID" --regid="$OWNER_GID" --clear-groups \
      git -C "$REPO" checkout main
    sudo setpriv --reuid="$OWNER_UID" --regid="$OWNER_GID" --clear-groups \
      git -C "$REPO" pull --ff-only origin main

    sudo bash "$REPO/scripts/connect-career-ops.sh"

Run Git as the repository's owner, not as root. The installer itself validates
that the source is a clean, merged main checkout. It clones a pinned Career-Ops
revision, installs dependencies without npm lifecycle scripts or Chromium
downloads, validates portals.yml using the upstream validator as the
unprivileged service account, and updates the dedicated environment file.

Upstream Career-Ops does not include package-lock.json at this revision. The
installer therefore uses npm install with lifecycle scripts and lockfile writes
disabled rather than npm ci.

The installer does not replace a different existing /opt/career-ops checkout.
It preserves existing profile and portal data. It backs up and restores the
existing service environment when activation fails.

## Verify

    systemctl is-active career-intelligence
    curl -fsS http://127.0.0.1:3417/api/health

Expected response:

    {"status":"ok","coreConfigured":true}

This confirms configuration was loaded, not that external boards were scanned.

Sign in at https://career.cadacrew.fun and click Scan portals. The scan writes
newly discovered job URLs to the private scanner pipeline and the dashboard
can display them. The source includes 11 employers and title keywords covering
data science, marketing science, applied AI, machine learning, measurement,
optimization and experimentation. It does not impose strict location or
sponsorship filters, so manually verify eligibility before applying.

The initial dashboard invoked --verify, which can request Chromium browser
fallback on ambiguous API responses. Discovery-first scanning is available
in the subsequent SCAN_RECOVERY.md update; verification becomes optional.
Inspect the service journal and the dashboard's scan error details if an
expanded scan fails.

For diagnostics:

    sudo journalctl -u career-intelligence -n 80 --no-pager

    sudo -u career-intelligence env \
      CAREER_OPS_ROOT=/var/lib/career-intelligence/career-ops \
      node /opt/career-ops/validate-portals.mjs \
      --file /var/lib/career-intelligence/career-ops/portals.yml

The initial private profile has no name, CV, employer history or credentials.
AI evaluations will require additional profile configuration and a separate
explicitly approved model integration. Do not store private data in Git.

The service and website remain isolated from CREW Games and the wedding site.
