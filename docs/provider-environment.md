# Provider Environment

Provider secrets are server-side Convex environment variables. Do not add provider
secrets with a `VITE_` prefix because Vite exposes those values to the browser.

## BulkAPIs

BulkAPIs is the default provider direction for workflow AI generation and social
automation integrations.

Required:

- `BULKAPIS_API_KEY`

Optional:

- `BULKAPIS_BASE_URL`

Default base URL:

```text
https://bulkapis.com/api/v1
```

Local Convex setup:

```bash
npx convex env set BULKAPIS_API_KEY bulk_ak_your_api_key_here
npx convex env set BULKAPIS_BASE_URL https://bulkapis.com/api/v1
```

The backend helper lives at `convex/providers/bulkapisConfig.ts`. It centralizes
the base URL default and raises the same provider configuration error shape used
by the existing provider adapters when `BULKAPIS_API_KEY` is missing.
