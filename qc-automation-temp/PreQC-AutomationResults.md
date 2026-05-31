# Pre-QC Swagger/API Automation Results

Run target: `http://127.0.0.1:5000`

## Final Status

Status: **Passed**

Open API automation issues: **0**

All automated Swagger/API gates completed successfully after rebuilding and restarting the API from the updated source.

## 1. Swagger Contract Test

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-SwaggerSmoke.ps1 -BaseUrl http://127.0.0.1:5000
```

Result: **Passed**

Validated:
- Swagger JSON loaded successfully.
- Deleted APIs were absent:
  - `GET /api/health`
  - `GET /api/agent/cachestats`
  - `GET /api/MC/GetModels`
  - `GET /api/MC/GetLatestConfig`
  - `GET /api/MC/GetMCStatus`
  - `GET /api/Updates/dashboard`
  - `POST /api/Thumbnail/uploadimage/{requestId}`
- Required active React, agent, and dynamic callback routes were present.
- Operation IDs and tags were present.
- Every operation had documented success responses.
- Mutation/action operations had documented error responses.
- Rate-limit `429` responses were documented.
- No empty object request/response schemas were detected.
- Multipart upload endpoints were represented as `multipart/form-data`.
- Download endpoints exposed expected content types.

Swagger totals:
- Paths: `92`
- Operations: `97`

## 2. Read-Only API Smoke Test

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCApiSmoke.ps1 -BaseUrl http://127.0.0.1:5000
```

Result: **Passed**

Validated:
- Swagger JSON reachable.
- `GET /api/Api/versions`
- `GET /api/Api/lines`
- `GET /api/Api/pcs`
- `GET /api/Api/stats`
- `GET /api/Updates/packages`
- `GET /api/Updates/schedules`
- `GET /api/Updates/packages/archived`
- `GET /api/ModelLibrary`
- `GET /api/Yield/summary`
- `GET /api/YieldAlert/settings`
- `GET /api/YieldAlert/active`
- `GET /api/Shift/current`
- `GET /api/Shift/summary?date=2026-05-29`
- `GET /api/Api/pc/{mcId}` using existing `MCId=2`
- `GET /api/LogAnalyzer/structure/{mcId}` using existing `MCId=2`

Issue found and fixed during this pass:
- `GET /api/Shift/summary?date=2026-05-29` originally returned HTTP 500.
- Root cause: `YieldRepository.GetConnectionAsync()` reused `DbContext.Database.GetDbConnection()`, and that runtime path had no initialized connection string.
- Fix: `YieldRepository.GetConnectionAsync()` now opens `new SqlConnection(_connectionString)`, matching the safer pattern already used elsewhere in the repository.
- Retest result: passed.

## 3. Mutation Flow Smoke Test

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\qc-automation-temp\Run-PreQCMutationFlows.ps1 -BaseUrl http://127.0.0.1:5000 -EnableMutations
```

Result: **Passed**

Validated:
- `POST /api/agent/register`
- `POST /api/agent/heartbeat`
- `POST /api/agent/syncmodels`
- `POST /api/agent/synclogs`
- `GET /api/Api/pc/{mcId}` for the registered test MC

Created dev/test data:
- Test MC ID: `3`
- Test Line: `999`
- Test MC Number: `1524`
- Test IP: `10.250.205.158`

Note:
- The mutation script intentionally leaves the Pre-QC test MC row in the dev DB for inspection.

## Build Verification

Command:

```powershell
dotnet build Server\API\LensAssemblyMonitoringWeb.csproj --no-restore -o qc-automation-temp\build-check
```

Result: **Passed**

Reason for temp output:
- The normal debug output can be locked while the API is running.
- Temp output verifies the latest source compiles without stopping the active API process.

## Conclusion

Automated pre-QC API testing currently reports **0 open issues**.

This result covers Swagger contract quality, active/deleted route checks, request/response schema checks, status-code documentation, multipart/download documentation, safe DB-backed read APIs, and a basic agent-like mutation flow.

Remaining non-automated areas still require manual or future fake-agent testing:
- Real file upload content validation with large files.
- Real C++ agent command completion callbacks.
- Real software installation/deployment behavior on machine.
- Real rollback/revert/destructive flows with test packages/models.
