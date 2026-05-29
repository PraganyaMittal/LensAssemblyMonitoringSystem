# Swagger / QC API Cleanup Tasks

## Pending
- [ ] Run the full pre-QC automation set after restarting the API: `Run-SwaggerSmoke.ps1`, `Run-PreQCApiSmoke.ps1`, and optional `Run-PreQCMutationFlows.ps1 -EnableMutations`.
- [ ] Manually test destructive Swagger flows with dev/test data: upload, delete, purge, restore, rollback, revert, command timeout, and invalid-file cases.
- [ ] Add Swagger request/response examples for high-use endpoints: agent registration, heartbeat, schedule creation, model upload/apply, Bundle/LAI register, and log analyzer requests.
- [ ] Continue deleting old API/UI/schema only when repo usage proves it is unused or all callers are updated in the same change.

## To Do Later
- [ ] Add a fake-agent simulator for full queued command completion, model upload callback, log upload callback, and image callback flows.
- [ ] Add a saved Swagger baseline and automated Swagger diff check.
- [ ] Add Swagger auth/security definitions when authentication is introduced.
- [ ] Standardize remaining error shapes so every active endpoint uses the same `success`/`message`/`error` contract.
