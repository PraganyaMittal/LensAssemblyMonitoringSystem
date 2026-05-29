# Pre-QC Automation Temp Scripts

This temporary folder contains local automation helpers for internal testing before QC.

## Strict Swagger Contract Test

Run against an already running API:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-SwaggerSmoke.ps1 -BaseUrl http://127.0.0.1:5000
```

Start the API from the script on a chosen URL:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-SwaggerSmoke.ps1 -BaseUrl http://127.0.0.1:5099 -StartApi
```

The script validates:
- Swagger JSON returns HTTP 200.
- Deleted cleanup routes are absent.
- Active React/C++/dynamic command routes are present.
- Operation IDs, tags, success responses, error responses, and 429 responses are documented.
- Request/response schemas do not expose empty object schemas.
- Multipart upload endpoints expose `multipart/form-data`.
- Download endpoints expose expected content types.

## Safe Read-Only API Smoke Test

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCApiSmoke.ps1 -BaseUrl http://127.0.0.1:5000
```

This calls safe GET/read endpoints and validates HTTP status plus key JSON fields. It does not create, edit, or delete data.

## Optional Mutation Smoke Test

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCMutationFlows.ps1 -BaseUrl http://127.0.0.1:5000 -EnableMutations
```

This registers a clearly named Pre-QC fake agent and sends heartbeat, diagnostics, model sync, and log sync payloads. It intentionally leaves the test MC row in the dev DB for inspection.

## Gated Real-Agent Flow Test

Use the connected real agent only when you intentionally want end-to-end callback, upload, deployment, or destructive flow evidence.

Preflight only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCRealAgentFlows.ps1 -BaseUrl http://127.0.0.1:5000 -MCId 2
```

Callbacks only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCRealAgentFlows.ps1 -BaseUrl http://127.0.0.1:5000 -MCId 2 -EnableRealAgentCallbacks
```

Upload validation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCRealAgentFlows.ps1 -BaseUrl http://127.0.0.1:5000 -MCId 2 -EnableUploads
```

Harmless deployment package test:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCRealAgentFlows.ps1 -BaseUrl http://127.0.0.1:5000 -MCId 2 -EnableDeployment
```

Full gated test, including rollback, archive/restore/purge, temp model revert, and temp cleanup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCRealAgentFlows.ps1 -BaseUrl http://127.0.0.1:5000 -MCId 2 -EnableUploads -EnableRealAgentCallbacks -EnableDeployment -EnableDestructive
```

Notes:
- `-EnableDestructive` is required for rollback, purge, model revert, and deleting temporary Pre-QC models.
- `-EnableLargeFiles` adds 100MB and near-limit upload fixtures and can take several minutes.
- For image callback validation, pass `-ImagePath "C:\path\to\image.bmp"` when the log structure does not expose a usable image path.
- For deployment from a remote agent, pass `-DeploymentNetworkPath` if the agent cannot access the script-generated local fixture path.
- Every run writes evidence and a markdown summary under `qc-automation-temp/artifacts`.

See `PreQC-SwaggerApiTestGuide.md` for the full testing scope and remaining Swagger improvements.
