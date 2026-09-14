# DTAP deployment POC

This repository now contains a GitHub Actions promotion pipeline for the static site.

## Promotion flow

```text
feature/*    -> pull request -> CI and security checks
main         -> Development -> Test -> Acceptance -> Production
```

The site is packaged once per commit. The same artifact is promoted to each environment; it is not rebuilt between stages.

## One-time GitHub setup

1. In **Settings > Environments**, create `Development`, `Test`, `Acceptance`, and `Production`.
2. Add required reviewers to `Acceptance` and `Production`.
3. Restrict all four environments to `main`.
4. In **Settings > Pages**, set **Source** to **GitHub Actions**.
5. Protect `main` under **Settings > Rules > Rulesets**:
   - Require pull requests
   - Require approvals
   - Require `validate` and `workflow-security` checks
   - Require CODEOWNER review
   - Block force pushes

## Demo script

1. Create a feature branch and open a pull request.
2. Show validation, JavaScript syntax checking, secret scanning, and workflow scanning.
3. Merge into `main` and show automatic Development then Test artifact promotion.
4. Approve Acceptance, then approve Production to deploy GitHub Pages.
5. Demonstrate rollback by manually redeploying a previous artifact run.

The workflow promotes one immutable artifact through the DTAP stages and uses GitHub's OIDC-based Pages deployment. No deployment credentials are stored in the repository.