# ADR 0011 — Deploy Cloud Functions in asia-southeast1

- Status: Decided
- Date: 2026-10-02
- Serves: NFR-PERF-001, NFR-REL-001

## Context

Cloud Functions 2nd gen ran in `us-central1`. A full deploy created about 90
Cloud Run services in one run and hit the Cloud Run quota "Write requests per
minute per region". The default branch was late for Vietnamese users, and the
callable latency was higher.

The Founder decision on 2026-10-02: move the compute region closer to Vietnam
and deploy in smaller batches.

## Decision

1. Deploy Cloud Functions 2nd gen in `asia-southeast1` (Singapore).
2. Keep one shared region constant, `shared/config/region.ts`, as the only
   source of truth for the backend, the frontend client, and the tests.
3. Deploy in several smaller batches to stay under the Cloud Run write quota.
4. Firestore data location is unchanged. The app has no Firestore triggers, so
   the compute region can differ from the data region.

## Consequences

- `TECH_STACK.md` §4 now names `asia-southeast1`.
- Callable URLs change to the new region; the frontend reads the same constant.
- The old `us-central1` functions remain until they are removed. Remove them
  only with explicit approval and a separate deploy.
- A multi-batch deploy becomes the normal release step.
