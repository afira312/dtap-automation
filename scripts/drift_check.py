#!/usr/bin/env python3
"""Validate whether a pull request satisfies its linked GitHub issue."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from typing import Any, Iterable
from urllib import error as urllib_error
from urllib.parse import quote, urlparse
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


def github_get(path: str, repo: str) -> Any:
    url = f"{GITHUB_API_URL}/repos/{repo}/{path}"
    req = urllib_request.Request(url, headers=github_headers())
    with urllib_request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_issue(issue_number: int, repo: str) -> dict[str, Any]:
    return github_get(f"issues/{issue_number}", repo)


def fetch_pr(pr_number: int, repo: str) -> dict[str, Any]:
    return github_get(f"pulls/{pr_number}", repo)


def fetch_pr_files(pr_number: int, repo: str) -> list[dict[str, Any]]:
    return github_get(f"pulls/{pr_number}/files?per_page=100", repo)


def fetch_file_content(filename: str, ref: str, repo: str) -> str:
    encoded_filename = quote(filename, safe="/")
    file_data = github_get(f"contents/{encoded_filename}?ref={quote(ref, safe='')}", repo)
    encoded_content = file_data.get("content")
    if not isinstance(encoded_content, str):
        raise RuntimeError(f"GitHub returned no encoded content for {filename}.")
    return base64.b64decode(encoded_content).decode("utf-8")


def fetch_changed_file_contents(
    files: Iterable[dict[str, Any]], ref: str, repo: str
) -> dict[str, str]:
    contents: dict[str, str] = {}
    for file_info in files:
        filename = file_info.get("filename")
        status = file_info.get("status")
        if not isinstance(filename, str) or status == "removed":
            continue
        contents[filename] = fetch_file_content(filename, ref, repo)
    return contents


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


def build_prompt(
    issue: dict[str, Any],
    pr: dict[str, Any],
    files: Iterable[dict[str, Any]],
    final_file_contents: dict[str, str],
) -> str:
    issue_body = to_text(issue.get("body") or "No issue body provided.")
    issue_title = to_text(issue.get("title") or "No issue title provided.")
    pr_body = to_text(pr.get("body") or "No PR body provided.")
    pr_title = to_text(pr.get("title") or "No PR title provided.")

    file_sections: list[str] = []
    for file_info in files:
        filename = to_text(file_info.get("filename") or "unknown")
        patch = to_text(file_info.get("patch") or "")
        status = to_text(file_info.get("status") or "")
        final_content = final_file_contents.get(filename)
        file_sections.append(
            f"File: {filename}\n"
            f"Status: {status}\n"
            f"Patch:\n{patch or 'No patch available.'}\n"
            f"Final file content at the PR head:\n"
            f"{final_content if final_content is not None else 'File is deleted or content is unavailable.'}\n"
        )

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
- Use the PR title, body, changed-file patches, and final file contents at the PR head as evidence.
- Evaluate the resulting repository state, not only lines newly added in the patch.
- A requirement is satisfied when it is present and enabled in the final file, even if that line was unchanged.
- Interpret ordinary issue prose semantically; do not require the issue author to prescribe exact filenames, flag names, environment-variable names, library calls, or implementation wording unless that exact detail is itself the acceptance criterion.
- Treat equivalent implementation interfaces as satisfying the requirement. For example, a script that accepts `--issue-number` and `--pr-number` and is invoked with values from `ISSUE_NUMBER` and `PR_NUMBER` satisfies a requirement to take issue and PR numbers as inputs.
- Treat a workflow requirement as satisfied when the final workflow is valid and contains the required enabled job, step, trigger, or delegation, even if the job or trigger was not newly added by the PR.
- Do not report uncertainty, lack of a newly added line, or a minor naming/interface difference as a missing requirement.
- Report a missing item only when there is strong, direct evidence that the final repository state omits, disables, or contradicts a material acceptance criterion.
- When evidence is incomplete but there is no direct contradiction, prefer aligned=true and mention any low-confidence concern in the summary rather than in missing.
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


def resolve_api_url(api_url: str) -> str:
    """Accept either a chat-completions URL or an OpenAI-compatible base URL."""
    normalized_url = api_url.rstrip("/")
    parsed_url = urlparse(normalized_url)
    path = parsed_url.path.rstrip("/")

    if path.endswith("/chat/completions"):
        return normalized_url
    if path.endswith("/v1"):
        return f"{normalized_url}/chat/completions"
    if parsed_url.hostname and parsed_url.hostname.endswith(".openai.azure.com"):
        return f"{normalized_url}/openai/v1/chat/completions"
    return f"{normalized_url}/openai/v1/chat/completions"


def api_headers(api_url: str, api_key: str) -> dict[str, str]:
    parsed_url = urlparse(api_url)
    headers = {"Content-Type": "application/json"}
    if parsed_url.hostname and parsed_url.hostname.endswith(".openai.azure.com"):
        headers["api-key"] = api_key
    else:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def call_openai(prompt: str, model: str, api_url: str, api_key: str) -> dict[str, Any]:
    payload = {
        "model": model,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You review whether a pull request implements its linked GitHub issue. "
                    "Return JSON only with keys aligned (boolean), missing (array of strings), summary (string). "
                    "Be pragmatic rather than legalistic: mark aligned=false only for clear, material omissions "
                    "or contradictions in the final repository state. Do not fail a PR because it uses an "
                    "equivalent implementation or a reasonable alternative input interface."
                ),
            },
            {"role": "user", "content": prompt},
        ],
    }

    data = json.dumps(payload).encode("utf-8")
    request_url = resolve_api_url(api_url)
    request = urllib_request.Request(
        url=request_url,
        data=data,
        headers=api_headers(request_url, api_key),
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=60) as response:
            response_body = response.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"OpenAI request failed with HTTP {exc.code} at {request_url}: {response_body or '<empty response>'}"
        ) from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"Could not reach the OpenAI-compatible endpoint {request_url}: {exc}") from exc

    try:
        payload = json.loads(response_body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"OpenAI endpoint returned non-JSON content at {request_url}: "
            f"{response_body[:500] or '<empty response>'}"
        ) from exc

    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected OpenAI response payload: {payload}") from exc

    if isinstance(content, list):
        content = "".join(item.get("text", "") for item in content if isinstance(item, dict))

    try:
        parsed = json.loads(content)
    except (TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"OpenAI returned invalid JSON in message content: {content!r}"
        ) from exc
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
        head = pr.get("head")
        head_sha = head.get("sha") if isinstance(head, dict) else None
        if not isinstance(head_sha, str) or not head_sha:
            raise RuntimeError("GitHub PR response did not include the head commit SHA.")
        final_file_contents = fetch_changed_file_contents(files, head_sha, repo)
        prompt = build_prompt(issue, pr, files, final_file_contents)
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
