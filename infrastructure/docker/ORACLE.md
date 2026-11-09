# Backend-only Oracle deployment

This deployment runs the API, worker, Redis, R runtime, and tile service on one
Oracle VM. Caddy is the only public container. The Next.js frontend continues to
run locally and uses Cloudflare R2 for direct browser uploads and downloads.

```text
http://localhost:3000
        |
        v
https://api-dev.example.com
        |
      Caddy
        |
       API ---- Redis
        |         |
      tiles     worker ---- analysis-r
        \          |          /
         \---------R2--------/
```

The Oracle overlay deliberately uses `APP_ENV=staging` because the temporary
frontend origin is HTTP localhost. Change to production only after the frontend
has an HTTPS deployment and all three origin settings use that HTTPS origin.

## 1. Create the external resources

Create an Oracle Ampere A1 VM with Ubuntu 24.04, 2 OCPUs, 12 GB RAM, and a
100 GB boot volume. Assign a reserved public IPv4 address. Allow inbound TCP 80
and 443 from the internet and restrict TCP 22 to the administrator's public IP.
Do not open any application, Redis, R, tile, or worker ports.

Create a private Cloudflare R2 bucket and an Object Read & Write token scoped to
that bucket. Record the bucket name, S3 endpoint, endpoint hostname, access key
ID, and secret access key. Keep public bucket access disabled.

Configure the R2 bucket CORS policy for the local frontend:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type", "x-amz-*"],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Type",
      "Content-Disposition",
      "ETag",
      "x-amz-checksum-sha256"
    ],
    "MaxAgeSeconds": 600
  }
]
```

Point an API hostname such as `api-dev.example.com` at the reserved Oracle IP.
Only the API hostname is required; this topology does not deploy the web app.

## 2. Install Docker on the VM

Install Git and Docker Engine from Docker's official Ubuntu repository. The
required Docker packages are:

```sh
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```sh
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

```sh
sudo apt update
sudo apt install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Log out and reconnect before using Docker without `sudo`.

## 3. Clone and configure the repository

```sh
git clone https://github.com/uroge/maxent-eco-suitability.git
cd maxent-eco-suitability
git checkout dev
cp infrastructure/docker/.env.oracle.example infrastructure/docker/.env.oracle
```

Edit `infrastructure/docker/.env.oracle`. Replace every placeholder. Generate a
different secret for each secret variable:

```sh
openssl rand -hex 32
```

The two R2 endpoint values include `https://`:

```dotenv
STORAGE_INTERNAL_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
STORAGE_PRESIGN_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
```

The GDAL endpoint is the same host without the scheme:

```dotenv
STORAGE_S3_ENDPOINT_HOST=ACCOUNT_ID.r2.cloudflarestorage.com
```

Use the same Clerk development instance for the API and local frontend. Keep
these values at localhost until the frontend is deployed:

```dotenv
APP_ENV=staging
STORAGE_CORS_ORIGINS=http://localhost:3000
CLERK_AUTHORIZED_PARTIES=http://localhost:3000
API_CORS_ORIGINS=http://localhost:3000
```

Never commit `.env.oracle`.

## 4. Validate and build

Validate the merged Compose model before downloading or building images:

```sh
docker compose \
  --env-file infrastructure/docker/.env.oracle \
  -f infrastructure/docker/compose.yaml \
  -f infrastructure/docker/compose.production.yaml \
  -f infrastructure/docker/compose.oracle.yaml \
  config --quiet
```

The Oracle VM has only two CPUs, so build the services sequentially:

```sh
docker compose \
  --env-file infrastructure/docker/.env.oracle \
  -f infrastructure/docker/compose.yaml \
  -f infrastructure/docker/compose.production.yaml \
  -f infrastructure/docker/compose.oracle.yaml \
  build analysis-r
```

Repeat the same command for `tiles`, `api`, and `worker`, in that order.

## 5. Start the backend

```sh
docker compose \
  --env-file infrastructure/docker/.env.oracle \
  -f infrastructure/docker/compose.yaml \
  -f infrastructure/docker/compose.production.yaml \
  -f infrastructure/docker/compose.oracle.yaml \
  up -d caddy api worker analysis-r tiles redis
```

The active service list must not contain `web` or `seaweedfs`:

```sh
docker compose \
  --env-file infrastructure/docker/.env.oracle \
  -f infrastructure/docker/compose.yaml \
  -f infrastructure/docker/compose.production.yaml \
  -f infrastructure/docker/compose.oracle.yaml \
  ps
```

Check startup and certificate provisioning:

```sh
docker compose \
  --env-file infrastructure/docker/.env.oracle \
  -f infrastructure/docker/compose.yaml \
  -f infrastructure/docker/compose.production.yaml \
  -f infrastructure/docker/compose.oracle.yaml \
  logs --tail=200 caddy api worker analysis-r tiles
```

From another machine, verify:

```sh
curl https://api-dev.example.com/health/live
curl https://api-dev.example.com/health/ready
```

## 6. Connect the local frontend

Create `apps/web/.env.local` on the development computer:

```dotenv
NEXT_PUBLIC_API_URL=https://api-dev.example.com
API_INTERNAL_URL=https://api-dev.example.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
CLERK_SECRET_KEY=sk_test_replace_me
APP_ENV=development
```

Use the same Clerk keys configured on Oracle, then start only the web workspace:

```sh
pnpm install
pnpm --filter @ecosuitability/web dev
```

## 7. Automatic updates from `dev`

The repository includes a `systemd` timer that checks `origin/dev` once every
five minutes. A new revision is fast-forwarded, validated, built sequentially, and
started with Compose. The last successfully deployed revision is recorded
outside the repository so a failed build is retried on the next timer run.

The service runs as `ubuntu`, uses the existing ignored `.env.oracle`, and does
not require a public webhook, GitHub deployment secret, or additional inbound
port. Install it after the initial manual deployment:

```sh
chmod +x infrastructure/docker/deploy-oracle.sh
systemd-analyze verify \
  infrastructure/docker/systemd/ecosuitability-deploy.service \
  infrastructure/docker/systemd/ecosuitability-deploy.timer
sudo install -m 0644 \
  infrastructure/docker/systemd/ecosuitability-deploy.service \
  /etc/systemd/system/ecosuitability-deploy.service
sudo install -m 0644 \
  infrastructure/docker/systemd/ecosuitability-deploy.timer \
  /etc/systemd/system/ecosuitability-deploy.timer
install -d -m 0700 "${HOME}/.local/state/ecosuitability"
git rev-parse HEAD >"${HOME}/.local/state/ecosuitability/deployed-revision"
chmod 0600 "${HOME}/.local/state/ecosuitability/deployed-revision"
sudo systemctl daemon-reload
sudo systemctl enable --now ecosuitability-deploy.timer
```

Confirm the schedule and inspect deployment logs:

```sh
systemctl list-timers ecosuitability-deploy.timer
sudo journalctl -u ecosuitability-deploy.service -n 200 --no-pager
```

Follow an active deployment:

```sh
sudo journalctl -u ecosuitability-deploy.service -f
```

The timer retries a failed revision after five minutes. To deploy immediately or
reapply an environment-only change, run:

```sh
./infrastructure/docker/deploy-oracle.sh --force
```

The script refuses to deploy from a branch other than `dev`, refuses to
overwrite tracked changes, serializes overlapping executions, and only updates
its success marker after every build and `docker compose up --wait` succeeds.
If the repository path or VM user changes, update both paths and the user in the
service unit before installing it. Reinstall the units and run `systemctl
daemon-reload` whenever their committed definitions change.

## 8. Stop and start manually

Stopping containers retains Redis, Caddy, and R workspace volumes:

```sh
docker compose \
  --env-file infrastructure/docker/.env.oracle \
  -f infrastructure/docker/compose.yaml \
  -f infrastructure/docker/compose.production.yaml \
  -f infrastructure/docker/compose.oracle.yaml \
  stop
```

Start them again with the `up -d` command from step 5. Do not add `-v` when
stopping or updating because that deletes the named volumes.

For a manual update, pull the desired branch, rebuild changed services, and run
the step 5 command again. Compose replaces changed containers without exposing
the private services.

## 9. Move the frontend to HTTPS later

After deploying the frontend, replace the three localhost origins with the
frontend HTTPS origin, update the R2 CORS policy, and set `APP_ENV=production`.
Recreate the API and worker after changing the environment.
