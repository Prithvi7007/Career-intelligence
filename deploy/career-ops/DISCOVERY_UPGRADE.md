# Discovery expansion and scan audit

The initial scanner used 11 companies. This update expands to **100 employer
sources** from upstream Career-Ops and **43 role patterns** spanning data
science, marketing mix modeling, attribution, forecasting, optimization,
marketing measurement, applied AI, machine learning and analytics leadership.

No fixed maximum job count, location exclusion or sponsorship filter has
been added. Some boards may fail, return no jobs or serve global roles.
Additional search engine sources require a configured search adapter and
are not presented as working sources.

## What the audit measures

- Configured employer sources from the live private portals.yml.
- Upstream scan-runs.tsv: attempted employers, postings found, filtering
  events, duplicates, newly added URLs, source errors and timestamp.
- Each figure corresponds to a specific scan. Total Opportunities is the
  cumulative job feed, not the number of additions from one scan.
- A failed scan shows that status, and does not fabricate newly added jobs.
- Filters are broken down by their recorded category.

The scan command was initially configured with --verify and --quiet. An
upcoming reliability change defaults to discovery-only because browser-based
verification requires Chromium on the VPS. See SCAN_RECOVERY.md for the current
setting, validation and recovery steps. The scan timeout is configurable with
CAREER_SCAN_TIMEOUT_MS in the private systemd environment.

## Activate after merging the reviewed PR

The CREW Development Bridge can write, test and push source but cannot
install software on the host. On the VPS run:

    REPO=/opt/crew-dev-bridge/career-source
    OWNER_UID=$(stat -c '%u' "$REPO")
    OWNER_GID=$(stat -c '%g' "$REPO")

    sudo setpriv --reuid="$OWNER_UID" --regid="$OWNER_GID" --clear-groups \
      git -C "$REPO" checkout main

    sudo setpriv --reuid="$OWNER_UID" --regid="$OWNER_GID" --clear-groups \
      git -C "$REPO" pull --ff-only origin main

    sudo bash "$REPO/scripts/upgrade-discovery.sh"

The upgrade checks that the repository is clean, from the expected origin
and at updated main. It validates the new portals YAML against the installed
upstream scanner before replacing application files. It creates a separate
backup of the old application code and private portals file, and restarts
only career-intelligence.service. If health validation fails, it attempts
to restore the previous application and portals configuration.

**Preserving personal settings:** The private portals.yml is updated only
when it matches the original 11-company starter byte-for-byte. If you have
customized the private file, it is left intact, and the audit UI can still
run without overriding those settings. Existing discoveries, scan history,
local application records and personal files remain untouched.

No Nginx, HTTPS, CREW Games, wedding site or database configuration is changed.

## Verify

    curl -fsS http://127.0.0.1:3417/api/health
    systemctl is-active career-intelligence
    grep -c '^  - name:' /var/lib/career-intelligence/career-ops/portals.yml

On an unchanged starter configuration, the final command should report 100.
Otherwise compare the private config with the reviewed expanded template
at deploy/career-ops/portals.yml before modifying it.

Visit https://career.cadacrew.fun and review the new Discovery Transparency
panel. Click Scan portals to refresh the recorded counters. The scan may
take several minutes. While running, the panel continues to label metrics
as results from the previous completed or failed attempt.

The attempted-employer counter is not proof every ATS responded. Review
the scan error count and inspect the service journal for provider failures:

    sudo journalctl -u career-intelligence -n 80 --no-pager

This PR improves real discovery coverage and transparency. A separate
follow-up could add broader search-engine and job-board adapters without
misrepresenting unconfigured sources as live.
