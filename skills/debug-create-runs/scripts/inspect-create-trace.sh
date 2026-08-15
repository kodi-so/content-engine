#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <thread-id-or-Create-URL> [--prod]" >&2
  exit 2
fi

if [[ ! -f convex.json ]]; then
  echo "Run this script from the Content Engine repository root." >&2
  exit 2
fi

thread_input="$1"
deployment_flag="${2:-}"

if [[ -n "$deployment_flag" && "$deployment_flag" != "--prod" ]]; then
  echo "The only supported deployment flag is --prod." >&2
  exit 2
fi

thread_id="$thread_input"
if [[ "$thread_input" == *"threadId="* ]]; then
  thread_id="${thread_input#*threadId=}"
  thread_id="${thread_id%%&*}"
  thread_id="${thread_id%%#*}"
fi

if [[ ! "$thread_id" =~ ^[a-z0-9]+$ ]]; then
  echo "Could not resolve a valid Convex Create thread ID from: $thread_input" >&2
  exit 2
fi

args=(
  npx convex run
  create/observability/trace:getForDebug
  "{\"threadId\":\"$thread_id\"}"
)
if [[ "$deployment_flag" == "--prod" ]]; then
  args+=(--prod)
fi

exec "${args[@]}"
