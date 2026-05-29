"""
Provider factory — create the right provider from CLI args.

Supported providers:
    ollama      Local Ollama server (default)
    openai      OpenAI API
    groq        Groq cloud API (OpenAI-compatible)
    anthropic   Anthropic Claude API
"""

from __future__ import annotations
import os
from .base import BaseProvider, NormalizedResponse, ToolCall


def create_provider(
    provider: str,
    model: str,
    base_url: str | None = None,
    # Anthropic
    thinking_budget: int | None = None,
    # OpenAI o-series
    reasoning_effort: str | None = None,
    # Ollama
    context_size: int | None = None,
    # All providers
    temperature: float | None = None,
) -> BaseProvider:
    p = provider.lower()

    if p == "ollama":
        from .openai import OpenAIProvider
        url = base_url or "http://localhost:11434/v1"
        return OpenAIProvider(
            model=model, api_key="ollama", base_url=url,
            temperature=temperature, context_size=context_size,
        )

    if p == "openai":
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model, api_key=_require_env("OPENAI_API_KEY"),
            reasoning_effort=reasoning_effort, temperature=temperature,
        )

    if p == "groq":
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model,
            api_key=_require_env("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1",
            temperature=temperature,
        )

    if p == "anthropic":
        from .anthropic import AnthropicProvider
        return AnthropicProvider(
            model=model, api_key=_require_env("ANTHROPIC_API_KEY"),
            thinking_budget=thinking_budget, temperature=temperature,
        )

    raise ValueError(
        f'Unknown provider "{provider}". '
        'Choose from: ollama, openai, groq, anthropic'
    )


def _require_env(var: str) -> str:
    val = os.environ.get(var)
    if not val:
        raise EnvironmentError(f'Environment variable {var} is required but not set.')
    return val


__all__ = ["create_provider", "BaseProvider", "NormalizedResponse", "ToolCall"]
