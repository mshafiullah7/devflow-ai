"""
GitHub tools — create issues, list issues, create PRs.

Requires GITHUB_TOKEN environment variable and the 'PyGithub' package:
    pip install PyGithub
"""

from __future__ import annotations
import os
from pathlib import Path


def _client():
    from github import Github
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise EnvironmentError("GITHUB_TOKEN environment variable is not set.")
    return Github(token)


def _get_repo(args: dict):
    repo_name = args.get("repo") or os.environ.get("GITHUB_REPO")
    if not repo_name:
        raise ValueError('Provide "repo" arg (e.g. "owner/repo") or set GITHUB_REPO env var.')
    return _client().get_repo(repo_name)


def create_issue(args: dict, root: Path) -> str:
    """Create a GitHub issue. Args: repo, title, body (optional), labels (optional list)."""
    try:
        repo   = _get_repo(args)
        title  = args.get("title", "")
        body   = args.get("body", "")
        labels = args.get("labels", [])
        issue  = repo.create_issue(title=title, body=body, labels=labels)
        return f"Created issue #{issue.number}: {issue.html_url}"
    except Exception as e:
        return f"Error creating issue: {e}"


def list_issues(args: dict, root: Path) -> str:
    """List open issues. Args: repo, state (open/closed/all), limit (default 20)."""
    try:
        repo   = _get_repo(args)
        state  = args.get("state", "open")
        limit  = int(args.get("limit", 20))
        issues = list(repo.get_issues(state=state)[:limit])
        if not issues:
            return f"No {state} issues found."
        lines = [f"#{i.number} [{i.state}] {i.title}" for i in issues]
        return "\n".join(lines)
    except Exception as e:
        return f"Error listing issues: {e}"


def create_pr(args: dict, root: Path) -> str:
    """Create a pull request. Args: repo, title, body, head (branch), base (default: main)."""
    try:
        repo  = _get_repo(args)
        title = args.get("title", "")
        body  = args.get("body", "")
        head  = args.get("head", "")
        base  = args.get("base", "main")
        pr    = repo.create_pull(title=title, body=body, head=head, base=base)
        return f"Created PR #{pr.number}: {pr.html_url}"
    except Exception as e:
        return f"Error creating PR: {e}"


SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "create_issue",
            "description": "Create a GitHub issue in a repository.",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo":   {"type": "string", "description": "GitHub repo in 'owner/repo' format."},
                    "title":  {"type": "string", "description": "Issue title."},
                    "body":   {"type": "string", "description": "Issue body (markdown)."},
                    "labels": {"type": "array", "items": {"type": "string"}, "description": "Label names."},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_issues",
            "description": "List GitHub issues in a repository.",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo":  {"type": "string", "description": "GitHub repo in 'owner/repo' format."},
                    "state": {"type": "string", "enum": ["open", "closed", "all"], "description": "Filter by state."},
                    "limit": {"type": "integer", "description": "Max results (default 20)."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_pr",
            "description": "Create a GitHub pull request.",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo":  {"type": "string", "description": "GitHub repo in 'owner/repo' format."},
                    "title": {"type": "string", "description": "PR title."},
                    "body":  {"type": "string", "description": "PR description (markdown)."},
                    "head":  {"type": "string", "description": "Source branch name."},
                    "base":  {"type": "string", "description": "Target branch (default: main)."},
                },
                "required": ["title", "head"],
            },
        },
    },
]

TOOL_MAP = {
    "create_issue": create_issue,
    "list_issues":  list_issues,
    "create_pr":    create_pr,
}
