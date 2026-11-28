#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIRECTORY}/../.." && pwd)"
readonly DEPLOY_BRANCH="${ECOSUITABILITY_DEPLOY_BRANCH:-dev}"
readonly DEPLOY_REMOTE="${ECOSUITABILITY_DEPLOY_REMOTE:-origin}"
readonly ENV_FILE="${ECOSUITABILITY_ENV_FILE:-${SCRIPT_DIRECTORY}/.env.oracle}"
readonly STATE_DIRECTORY="${ECOSUITABILITY_STATE_DIRECTORY:-${HOME}/.local/state/ecosuitability}"
readonly DEPLOYED_REVISION_FILE="${STATE_DIRECTORY}/deployed-revision"
readonly LOCK_FILE="${STATE_DIRECTORY}/deploy.lock"
readonly -a COMPOSE_FILES=(
  "${SCRIPT_DIRECTORY}/compose.yaml"
  "${SCRIPT_DIRECTORY}/compose.production.yaml"
  "${SCRIPT_DIRECTORY}/compose.oracle.yaml"
)
readonly -a BUILD_SERVICES=(analysis-r tiles api worker)
readonly -a RUNTIME_SERVICES=(caddy api worker analysis-r tiles redis)

force_deploy=false

if [[ "${1:-}" == '--force' ]]; then
  force_deploy=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--force]" >&2
  exit 2
fi

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "Oracle environment file is missing or unreadable: ${ENV_FILE}" >&2
  exit 1
fi

if ! command -v flock >/dev/null 2>&1; then
  echo 'flock is required to serialize deployments.' >&2
  exit 1
fi

mkdir -p "${STATE_DIRECTORY}"
chmod 700 "${STATE_DIRECTORY}"

exec 9>"${LOCK_FILE}"

if ! flock -n 9; then
  echo 'Another EcoSuitability deployment is already running.'
  exit 0
fi

compose() {
  local -a arguments=(--env-file "${ENV_FILE}")
  local compose_file

  for compose_file in "${COMPOSE_FILES[@]}"; do
    arguments+=(-f "${compose_file}")
  done

  docker compose "${arguments[@]}" "$@"
}

current_branch="$(git -C "${REPOSITORY_ROOT}" branch --show-current)"

if [[ "${current_branch}" != "${DEPLOY_BRANCH}" ]]; then
  echo "Expected branch ${DEPLOY_BRANCH}, found ${current_branch:-detached HEAD}." >&2
  exit 1
fi

if [[ -n "$(git -C "${REPOSITORY_ROOT}" status --porcelain --untracked-files=no)" ]]; then
  echo 'Tracked repository changes prevent an automatic fast-forward deployment.' >&2
  exit 1
fi

echo "Fetching ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}."
git -C "${REPOSITORY_ROOT}" fetch --prune "${DEPLOY_REMOTE}" \
  "refs/heads/${DEPLOY_BRANCH}:refs/remotes/${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"

target_revision="$(git -C "${REPOSITORY_ROOT}" rev-parse "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}")"
current_revision="$(git -C "${REPOSITORY_ROOT}" rev-parse HEAD)"
deployed_revision=''

if [[ -r "${DEPLOYED_REVISION_FILE}" ]]; then
  deployed_revision="$(<"${DEPLOYED_REVISION_FILE}")"
fi

if [[ "${current_revision}" != "${target_revision}" ]]; then
  echo "Fast-forwarding ${current_revision} to ${target_revision}."
  git -C "${REPOSITORY_ROOT}" merge --ff-only "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
fi

if [[ "${force_deploy}" == false && "${deployed_revision}" == "${target_revision}" ]]; then
  echo "Revision ${target_revision} is already deployed."
  exit 0
fi

echo "Validating Compose configuration for ${target_revision}."
compose config --quiet

for service in "${BUILD_SERVICES[@]}"; do
  echo "Building ${service}."
  compose build "${service}"
done

echo 'Pulling pinned runtime images.'
compose pull redis caddy

echo "Starting revision ${target_revision}."
compose up --detach --wait --wait-timeout 180 "${RUNTIME_SERVICES[@]}"

temporary_revision_file="${DEPLOYED_REVISION_FILE}.tmp"
printf '%s\n' "${target_revision}" >"${temporary_revision_file}"
mv "${temporary_revision_file}" "${DEPLOYED_REVISION_FILE}"

echo "Successfully deployed ${target_revision}."
