# Assumptions

- The organization has already defined the teams and roles for release
  management.
- GitHub is used for the repository, issues, pull requests, automation, and
  approvals.
- Azure is the target platform. The SPA is hosted on Azure App Service.
- The delivery lifecycle has four stages: dev & test, QA, pre-prod, and prod.
- This PoC covers only the `dev -> prod` path; the other stages are future
  extensions.
- `main` is protected: no direct commits, required PR review, and required
  status checks.
- `Development` and `Production` are configured as GitHub environments.
  Production has required reviewers and is the approval gate for production
  Terraform and application deployment.
- A configured OpenAI-compatible endpoint is available for the PR drift check;
  its API key is stored as a GitHub Actions secret and its URL is stored as a
  GitHub Actions variable.
- Feature branches identify their associated issue using
  `feature/<issue-number>-<short-name>`. The drift check uses this issue
  number, the pull request metadata, changed-file patches, and final changed
  file contents at the PR head as evidence.
- The drift-check model returns JSON with `aligned`, `missing`, and `summary`;
  a non-aligned result fails the workflow.
- Terraform state is stored remotely in an Azure Storage Account and is never
  committed to the repository.
- The SPA module creates a separate application storage account with a private
  `release` container. The deployment identity has `Storage Blob Data
  Contributor` rights on that container.
- Each GitHub environment provides Azure OIDC credentials,
  `AZURE_STORAGE_ACCOUNT`, `APP_SERVICE_NAME`, and `ENVIRONMENT` variables.
