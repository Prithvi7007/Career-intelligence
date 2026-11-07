# Scanner recovery: discovery-first mode

## Why this change exists

The expanded scan reached 99 employer sources and counted 13,911 source
postings, but its recorded run ended with status **failed** and no confirmed
new-job count. The upstream Career-Ops process collects and filters jobs
before it writes new listings to the pipeline. During its optional
`--verify` phase, API-inconclusive postings can trigger a Chromium browser
fallback. Our VPS deliberately did not install Chromium.

Missing Chromium is a **likely cause** of that failure, not yet confirmed
from a live process trace. Three recorded scan errors do not necessarily
mean three fatal failures.

## Behavior

- **Scan portals defaults to discovery-only** (`scan.mjs --quiet`).
- Discovery still filters job titles and performs URL deduplication using
  Career-Ops' existing history. It does **not** individually verify whether
  each posting is still open; verify the listing on the employer website.
- The original optional verification mode remains available to operators:
  set `CAREER_SCAN_VERIFY=true` in the existing root-owned
  `/etc/career-intelligence/config.env` **only after** installing Chromium
  support and confirming the resource cost. This adds `--verify`.
- The dashboard shows the scan mode and surfaces errors from an attempted
  run (safely as text, not executable markup). The service journal records
  failure details for future diagnostics.
- A timeout is labeled as a timeout instead of a generic exit status.
- All existing discoveries, earlier run records, source targets and personal
  data remain unchanged.

## Activate after PR merge

Use the existing reviewed updater to deploy the merged application source.
Run on the VPS (not inside ChatGPT):

```bash
REPO=/opt/crew-dev-bridge/career-source
OWNER_UID=$(stat -c '%u' "$REPO")
OWNER_GID=$(stat -c '%g' "$REPO")

sudo setpriv --reuid="$OWNER_UID" --regid="$OWNER_GID" --clear-groups \
  git -C "$REPO" checkout main
sudo setpriv --reuid="$OWNER_UID" --regid="$OWNER_GID" --clear-groups \
  git -C "$REPO" pull --ff-only origin main
sudo bash "$REPO/scripts/upgrade-discovery.sh"
```

The upgrader backs up the previous application and validates that
Career Intelligence is healthy. Because the private portal list now differs
from the old 11-company starter file, it **preserves** the existing
100-source configuration rather than rewriting it. Only the separate
Career Intelligence service is restarted. CREW Games, the wedding website,
Nginx, and login settings remain untouched.

## Validate the next scan

After deployment, open https://career.cadacrew.fun and click Scan portals.
The UI should indicate Discovery mode. Inspect the resulting scan audit:

- Last scan completed versus failed
- Postings found and filtered, duplicates and **newly added**
- Scanner errors; errors from individual sources do not necessarily mean
  the entire run failed
- The opportunity total should increase if the scanner imports new matching
  URLs that are not already in its history

To inspect failures on the VPS, without exposing credentials:

```bash
sudo journalctl -u career-intelligence -n 100 --no-pager \
  | grep -E 'scanner failed|timed out|Fatal:|Error:'
```

If the next scan still fails, share the **error message** from the new
dashboard failure section or a redacted journal excerpt. Avoid pasting
tokens, cookies, private profile files or full application records.

**Deployment scope:** PR and merge alone do not deploy the service. The
CREW Development Bridge can edit/test/push code but does not have
unrestricted host command access.
