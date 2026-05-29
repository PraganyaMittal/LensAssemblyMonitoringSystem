# Private Pre-QC Swagger/API Test Guide

This guide is for internal testing before the build goes to QC. The goal is to catch Swagger contract bugs, broken routes, bad schemas, missing status codes, and obvious API logic failures early so QC receives a cleaner build.

## What The Automation Tests

### 1. Swagger Availability
`Run-SwaggerSmoke.ps1` calls `/swagger/v1/swagger.json` and fails if Swagger does not return valid JSON with paths and schemas.

Impact: if this fails, QC may not be able to open Swagger at all, or Swashbuckle is crashing because of a bad controller signature, bad `[FromForm] IFormFile` usage, or invalid schema metadata.

### 2. Route Contract
The Swagger smoke script checks that deleted APIs do not come back and that active React, C++ agent, and dynamic command/upload routes are still present with the correct HTTP method.

Covered modules:
- Agent registration, heartbeat, diagnostics, config upload, model sync, log sync, command result, model/log upload.
- Dashboard versions, lines, PC list, PC details, and stats.
- MC config/model commands.
- Software update package, schedule, cancel, rollback, archive, restore, and purge flows.
- Bundle and LAI scan/register flows.
- Model library upload, apply, download, request/receive/check, history, and revert flows.
- Model management line/model/default-model flows.
- Log analyzer structure, file, image request, and image fetch flows.
- Thumbnail upload/fetch flows.
- Yield, yield alert, and shift flows.

Impact: catches old routes accidentally left in Swagger and active routes accidentally deleted or renamed.

### 3. Request Schema
The Swagger smoke script checks request bodies are documented and rejects empty object request schemas. Multipart routes must expose `multipart/form-data` so Swagger UI shows a file picker.

Important request areas:
- `AgentRegistrationRequest`
- `HeartbeatRequest`
- schedule creation
- model upload/apply
- `MC/UpdateConfig`
- log analyzer file/image requests
- thumbnail upload

Impact: QC and developers can see what payload to send without guessing or executing the API blindly.

### 4. Response Schema
The Swagger smoke script checks that documented JSON response schemas are not empty `{}` objects and that every operation has at least one documented 2xx response.

Impact: catches anonymous/object responses that hide real fields from Swagger, and catches endpoints with incomplete success documentation.

### 5. Status Codes
The Swagger smoke script checks mutation/action endpoints have documented error responses and that operations document `429` rate limiting.

Important status codes to verify manually in Swagger UI:
- `200` success
- `400` bad request or validation failure
- `404` missing MC/package/model/file
- `408` agent timeout where applicable
- `409` duplicate/conflict flows
- `429` rate limit
- `500` unexpected server error

Impact: QC can write negative tests against known responses instead of discovering undocumented failures.

### 6. File Upload/Download
The Swagger smoke script checks known upload endpoints use `multipart/form-data` and known download endpoints expose expected content types.

Important endpoints:
- `POST /api/MC/UpdateConfig`
- `POST /api/ModelLibrary/upload`
- `POST /api/ModelLibrary/receive-upload/{requestId}`
- `POST /api/agent/uploadmodelfile`
- `POST /api/agent/uploadlog/{requestId}`
- `POST /api/Thumbnail/upload-binary/{requestId}`
- `GET /api/Updates/packages/{id}/download`
- `GET /api/ModelLibrary/download/{id}`
- `GET /api/ModelLibrary/serve-download/{requestId}`
- `GET /api/agent/download/{modelFileId}`

Impact: catches Swagger upload rendering problems and download content-type drift before QC tries those flows.

### 7. Safe Business Logic Smoke
`Run-PreQCApiSmoke.ps1` calls safe read-only endpoints and validates HTTP status plus important JSON fields.

It reads:
- Swagger JSON
- versions
- lines
- PC list
- network stats
- update packages
- update schedules
- archived packages
- model library
- yield summary
- yield alert settings and active alerts
- current shift and shift summary
- PC details and log analyzer structure when at least one PC exists

Impact: catches broken DB-backed read APIs without creating, deleting, or modifying data.

### 8. Optional Agent-Like Mutation Smoke
`Run-PreQCMutationFlows.ps1` does nothing unless `-EnableMutations` is passed.

When enabled, it registers a clearly named Pre-QC fake agent, sends heartbeat, diagnostics, model sync, and log sync payloads, then confirms the MC can be read from dashboard APIs.

Impact: verifies the core agent ingestion path without requiring the real C++ agent. Full command completion, software install, file deployment, and log/image callback behavior still need a real agent or fake-agent simulator.

## How To Run

Run against an already running API:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-SwaggerSmoke.ps1 -BaseUrl http://127.0.0.1:5000
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCApiSmoke.ps1 -BaseUrl http://127.0.0.1:5000
```

Optional mutation smoke against dev DB only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCMutationFlows.ps1 -BaseUrl http://127.0.0.1:5000 -EnableMutations
```

Run Swagger smoke with the API started by the script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-SwaggerSmoke.ps1 -BaseUrl http://127.0.0.1:5099 -StartApi
```

## Manual Swagger Tests Still Needed

Swagger automation cannot prove every real workflow by itself. Before QC, manually test these flows from Swagger UI or add them to the mutation script with dev/test data:

- Missing required body fields.
- Invalid MC/package/model IDs.
- Invalid package/model names.
- Empty file upload.
- Unsupported file type.
- Duplicate model/package registration.
- Offline MC command attempts.
- Missing schedule/package/model ID.
- Invalid date/range values.
- Invalid JSON body.
- Large file upload behavior.
- Command timeout when the agent does not respond.
- Real C++ agent callback behavior for command result, model upload, log upload, and image fetch.

## Swagger Features Still To Improve

### Request/Response Examples
Add examples for high-use endpoints like agent registration, heartbeat, schedule creation, model upload/apply, Bundle/LAI register, and log analyzer requests.

Benefit: valid payloads become visible in Swagger UI and bad test data reduces.

### Richer File Upload Schemas
The contract script checks `multipart/form-data`, but we can still add an operation filter if any endpoint does not show file fields clearly in Swagger UI.

Benefit: Swagger UI file pickers become reliable for all upload endpoints.

### Global Error Shape
The project already has `ErrorResponse`, `ErrorOnlyResponse`, `BasicResponse`, and related DTOs. The next improvement is to make every controller use a consistent error shape.

Benefit: React, agent, and QC all know exactly where to read `success`, `message`, and `error`.

### Operation IDs And Tags
Swagger now generates stable operation IDs and controller-based tags. Keep them stable because future client generation can depend on them.

Benefit: Swagger is easier to navigate and accidental action renames become visible.

### Security Scheme
Authentication is not enforced yet, so Swagger does not document Bearer/API-key auth.

Benefit later: after auth is introduced, QC can test 401/403 behavior and Swagger UI can send tokens.

### Validation Metadata
Add or verify `[Required]`, `[Range]`, `[StringLength]`, and similar validation attributes on request DTOs.

Benefit: Swagger shows constraints clearly, and invalid payload bugs are caught earlier.

### Swagger Diff Baseline
Save a known-good Swagger JSON and compare later builds against it.

Benefit: accidental route/schema/status-code breaking changes become visible before QC.
