#!/usr/bin/env python3
"""Validate whether a pull request satisfies its linked GitHub issue."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Iterable
from urllib import error as urllib_error
from urllib import request as urllib_request

GITHUB_API_URL = "https://api.github.com"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare a GitHub issue against a pull request and ask an OpenAI-compatible API if they align."
    )
    parser.add_argument("--issue-number", type=int, required=True, help="GitHub issue number to validate")
    parser.add_argument("--pr-number", type=int, required=True, help="GitHub pull request number to validate")
    parser.add_argument(
        "--repo",
        default=os.environ.get("GITHUB_REPOSITORY"),
        help="Repository in owner/name format. Defaults to GITHUB_REPOSITORY.",
    )
    return parser.parse_args()


def resolve_repo(repo: str | None) -> str:
    if repo:
        return repo
    raise RuntimeError("Repository not provided. Set GITHUB_REPOSITORY or pass --repo owner/name.")


def github_headers() -> dict[str, str]:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        raise RuntimeError("GITHUB_TOKEN or GH_TOKEN is required to fetch GitHub issue and PR data.")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "dtap-drift-check",
    }


def github_get(path: str, repo: str) -> dict[str, Any]:
    url = f"{GITHUB_API_URL}/repos/{repo}/{path}"
    req = urllib_request.Request(url, headers=github_headers())
    with urllib_request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_issue(issue_number: int, repo: str) -> dict[str, Any]:
    return github_get(f"issues/{issue_number}", repo)


def fetch_pr(pr_number: int, repo: str) -> dict[str, Any]:
    return github_get(f"pulls/{pr_number}", repo)


def fetch_pr_files(pr_number: int, repo: str) -> list[dict[str, Any]]:
    return github_get(f"pulls/{pr_number}/files", repo)


def to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(to_text(item) for item in value)
    if isinstance(value, dict):
        return "\n".join(f"{k}: {to_text(v)}" for k, v in value.items())
    return str(value)


def build_prompt(issue: dict[str, Any], pr: dict[str, Any], files: Iterable[dict[str, Any]]) -> str:
    issue_body = to_text(issue.get("body") or "No issue body provided.")
    issue_title = to_text(issue.get("title") or "No issue title provided.")
    pr_body = to_text(pr.get("body") or "No PR body provided.")
    pr_title = to_text(pr.get("title") or "No PR title provided.")

    file_sections: list[str] = []
    for file_info in files:
        filename = to_text(file_info.get("filename") or "unknown")
        patch = to_text(file_info.get("patch") or "")
        status = to_text(file_info.get("status") or "")
        file_sections.append(f"File: {filename}\nStatus: {status}\nPatch:\n{patch or 'No patch available.'}\n")

    file_summary = "\n\n".join(file_sections) if file_sections else "No changed files were returned by the GitHub API."

    return f"""You review whether a pull request implements the linked GitHub issue.

Return JSON only with this shape:
{{
  "aligned": true,
  "missing": ["string"],
  "summary": "string"
}}

Rules:
- Use the issue title and body as the acceptance criteria.
- Use the PR title, body, and changed-file patches as evidence.
- Do not invent requirements. Only judge what is explicitly described or implied by the issue.
- If the PR fully satisfies the issue, set aligned=true and missing=[].
- If the PR is missing work, set aligned=false and list the concrete missing items.
- Keep summary brief but specific.

Issue title:
{issue_title}

Issue body:
{issue_body}

PR title:
{pr_title}

PR body:
{pr_body}

PR changed files:
{file_summary}
"""


def call_openai(prompt: str, model: str, api_url: str, api_key: str) -> dict[str, Any]:
    payload = {
        "model": model,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You review whether a pull request implements its linked GitHub issue. "
                    "Return JSON only with keys aligned (boolean), missing (array of strings), summary (string)."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
    }

    data = json.dumps(payload).encode("utf-8")
    request = urllib_request.Request(
        url=api_url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI request failed with HTTP {exc.code}: {response_body}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"Could not reach the OpenAI-compatible endpoint: {exc}") from exc

    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected OpenAI response payload: {payload}") from exc

    if isinstance(content, list):
        content = "".join(item.get("text", "") for item in content if isinstance(item, dict))

    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise RuntimeError(f"OpenAI returned a non-object JSON value: {parsed!r}")
    return parsed


def validate_environment() -> tuple[str, str, str]:
    api_key = os.environ.get("OPENAI_API_KEY")
    api_url = os.environ.get("OPENAI_API_URL")
    model = os.environ.get("OPENAI_MODEL")

    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    if not api_url:
        raise RuntimeError("OPENAI_API_URL is not set.")
    if not model:
        raise RuntimeError("OPENAI_MODEL is not set.")
    return api_key, api_url, model


def main() -> int:
    args = parse_args()
    repo = resolve_repo(args.repo)

    try:
        api_key, api_url, model = validate_environment()
        issue = fetch_issue(args.issue_number, repo)
        pr = fetch_pr(args.pr_number, repo)
        files = fetch_pr_files(args.pr_number, repo)
        prompt = build_prompt(issue, pr, files)
        result = call_openai(prompt, model, api_url, api_key)
    except Exception as exc:  # pragma: no cover - runtime guard for CLI usage
        print(f"error: {exc}", file=sys.stderr)
        return 1

    aligned = bool(result.get("aligned", False))
    missing = result.get("missing", []) or []
    summary = result.get("summary", "No summary returned.")

    print(json.dumps({"aligned": aligned, "missing": missing, "summary": summary}, indent=2))
    return 0 if aligned else 1


if __name__ == "__main__":
    sys.exit(main())
