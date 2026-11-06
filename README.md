# Career Intelligence

A **private-first career control room** that complements the open-source [Career-Ops](https://github.com/career-ops-hq/career-ops) job-search engine. This standalone Node.js application presents saved opportunities, Career-Ops evaluations and incoming job leads in one dashboard. It is not affiliated with the upstream maintainers.

> **Phase 1:** Dashboard, local tracking, and optional Career-Ops sync. It does **not** automatically apply, email recruiters, create AI scores, or tailor resumes. These workflows must be implemented and reviewed separately.

## Features

- Responsive dark-themed dashboard with overview, opportunity feed, pipeline and insights.
- Search, stage filtering, sort by match or company.
- Manual opportunity creation, status editing and persistent JSON storage.
- Read-only import of Career-Ops's canonical `data/applications.md` tracker and pending `data/pipeline.md` inbox.
- Display **real evaluated match scores** from Career-Ops. No fabricated scores.
- Run Career-Ops's `scan.mjs --verify --quiet` command on demand, once an upstream checkout has been configured. This discovers jobs but does not evaluate or apply to them.
- A clearly marked fictional sample mode to preview the interface without writing data.
- No npm dependencies for the companion app; Node.js 22.13+ required.

## Quick start

```bash
git clone https://github.com/Prithvi7007/Career-intelligence.git
cd Career-intelligence
npm test
npm start
```

Open **http://127.0.0.1:3417** on the same machine. The server binds to loopback by default, not publicly accessible. No npm install is required.

### Connect an upstream Career-Ops installation

Follow [Career-Ops' setup guide](https://github.com/career-ops-hq/career-ops#quick-start) in a separate checkout, including its configuration and profile setup. For the companion:

```bash
export CAREER_OPS_ROOT=/absolute/path/to/career-ops
export CAREER_OPS_CODE_ROOT=/absolute/path/to/career-ops
npm start
```

`CAREER_OPS_ROOT` is the **upstream data root** containing `data/applications.md`. `CAREER_OPS_CODE_ROOT` contains `scan.mjs`; these directories may be the same checkout. The dashboard reads imported Career-Ops records but will not mutate upstream tracker rows.

Optional environment configuration:

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `127.0.0.1` | Loopback listener only |
| `PORT` | `3417` | HTTP port |
| `CAREER_OPS_ROOT` | unset | Upstream data checkout |
| `CAREER_OPS_CODE_ROOT` | same as upstream data root | Upstream source checkout |
| `CAREER_INTELLIGENCE_DATA` | `./data/leads.json` | Private local application records |

### Private VPS access

This dashboard has **no login**. Do not expose its port on a public interface or proxy to the public internet. Use an SSH tunnel (replace the host and user with your own):

```bash
ssh -N -L 3417:127.0.0.1:3417 user@your-vps
```

Then browse `http://127.0.0.1:3417` from your local machine. Before adding phone/browser remote access, place a proper authentication layer or private-network gateway in front of the service. Do not disable host and origin validation to bypass access restrictions.

For VPS supervision, prefer an unprivileged service account and a user-owned systemd service. Store local data outside any public webroot, with backed-up storage and secrets outside Git. Career Intelligence deployment is **not** part of the CREW Games or wedding production release workflow.

## Development through CREW Development Bridge

The development bridge supports this repository under the exact selector `career-intelligence`, with its own checkout and fine-grained GitHub token. Work is done on `feature/*` branches. Both offline checks must pass on the same source fingerprint before pushing:

- `career_test` → `node --test`
- `career_syntax` → `node --check server.mjs`

Draft PRs target `main`. The bridge does not merge PRs or deploy this application automatically.

## Roadmap

1. **MVP (this PR):** Local, private dashboard with real upstream tracking.
2. **End-to-end AI job evaluation:** paste a job URL, extract JD, review evidence-backed fit, skills gaps and recommendations.
3. **Human-reviewed documents:** ATS resume generation and cover letters with explicit approval.
4. **Daily job intelligence:** filtered discovery and digest with clear provenance.
5. **Production access:** isolated service, authenticated access and independently reviewed deployments.

### Security boundaries

There is no upstream AI model in this repository, no automatic form submission, and no account login. Never commit a resume, application record, token, .env file, or personal data. Avoid exposing this unauthenticated service via a public reverse proxy. Job URLs and job descriptions should always be handled as untrusted content.

### Verification

Run `npm test` for parser, persistence, URL validation, deduplication, and HTTP host-restriction tests; run `node --check server.mjs` for backend syntax
