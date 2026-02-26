# Personal AI Agent DevBots and DevTainers

This guide is a practical blueprint for running multiple self-hosted Personal AI Agent DevBots/DevTainers on Dokku with shared networking, event-driven deploys, and centralized secrets handling.

## Target Architecture

Use one Dokku host as the control plane for all repositories and workloads:

- **DevBots**: one Dokku app per autonomous AI worker (code review, CI remediation, deploy orchestration, snippet generation, wasm tooling).
- **DevTainers**: one Dokku app per isolated toolchain/runtime (node, python, go, android/cloud build helpers, npm build workers).
- **Shared services**: queue bus (Redis/NATS), artifact/object storage, registry, and optional model gateway.
- **Ingress/domain layer**: Dokku domain + proxy management for APIs, webapps, and internal dashboards.

All apps run on the same Dokku Docker network by default and can communicate by container DNS name or service alias.

## Repository and Deployment Strategy

For simple multi-repository management:

1. Create one Dokku app per repository or per bot role.
2. Use git-based deploys (`git push dokku`) for source workflows.
3. Use image deploys for prebuilt agent images (`dokku tags:deploy`).
4. Use deploy hooks and release tasks for event-driven actions:
   - `app.json` scripts
   - `Procfile` workers
   - `deployment tasks` for pre/post deploy orchestration

This supports server apps, webapps, static sites, snippet services, and wasm-backed tools.

## DevBot/DevTainer Baseline

For each bot/container:

- configure build/runtime with existing Dokku builders (`dockerfile`, `buildpacks`, `nixpacks`, or image deploy),
- set per-app resource limits with `resource:*`,
- mount persistent state with `storage:*`,
- register domains and TLS via `domains:*` and `certs:*`,
- emit activity logs with `logs:*` + `events`.

## Hot Reloading

Use a development-only app process type for hot reloading (for example, `npm run dev`, `uvicorn --reload`, or watcher-based worker loops) and keep production process types immutable/reproducible.

Recommended pattern:

- `web`/`worker` for production,
- `dev` process for iterative bot development,
- separate Dokku app names for `-dev` and `-prod`.

## Secrets Management (Drive-Synced)

Dokku stores runtime config via `config:set`, but Drive synchronization should be handled by a dedicated secrets sidecar/service:

1. Use encrypted secrets source files (for example, SOPS + age/GPG).
2. Sync encrypted blobs with Google Drive or Microsoft OneDrive using a sync client such as `rclone`.
3. On deploy or schedule, decrypt and push values into Dokku using `dokku config:set --no-restart`.
4. Trigger controlled restarts/releases after secret rotation.

This keeps cloud-drive storage as a transport layer while preserving encrypted-at-rest secret material.

## CI/CD + Agent Deploy Automation

Use existing CI integrations (such as GitHub Actions) to:

- build/publish agent images,
- run tests and policy checks,
- trigger Dokku deploys and canary flows,
- dispatch bot jobs to queue consumers after deploy success.

For event-driven flows, wire CI events + repository webhooks to a lightweight orchestrator app that calls Dokku commands through audited automation users.

## Toolchain Requirements (git, npm, Android/cloud tooling)

If you need git, npm, and Android/cloud build tooling in self-hosted containers:

- build dedicated DevTainer images with required SDK/CLI layers,
- deploy those images as worker apps,
- isolate heavy toolchains from user-facing API containers,
- pass data between containers over internal network + queue/object storage.

## Operational Notes

- Prefer least-privilege deploy users/keys per repository.
- Keep agent containers stateless where possible; store durable state in external services/volumes.
- Use rolling/zero-downtime settings for API bots and web frontends.
- Keep plugin usage minimal and documented to simplify upgrades.
