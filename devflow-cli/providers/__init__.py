"""
Provider factory — create the right provider from CLI args.

Supported providers:
    ollama      Local Ollama server (default)
    openai      OpenAI API
    groq        Groq cloud API (OpenAI-compatible)
    anthropic   Anthropic Claude API
    mistral     Mistral AI (OpenAI-compatible)
    together    Together AI (OpenAI-compatible)
    fireworks   Fireworks AI (OpenAI-compatible)
    xai         xAI Grok (OpenAI-compatible)
    cohere      Cohere Command (OpenAI-compatible)
    deepseek    DeepSeek (OpenAI-compatible)
    perplexity  Perplexity AI (OpenAI-compatible)
    nvidia      NVIDIA NIM (OpenAI-compatible)

Providers requiring a dedicated class (not yet wired):
    gemini      Google Gemini — native SDK or OpenAI-compat endpoint
    azure       Azure OpenAI — needs api-version header + deployment URL
    bedrock     AWS Bedrock — boto3 + SigV4 signing, no OpenAI SDK support
    vertex      Google Vertex AI — service-account auth, regional endpoints
    huggingface HuggingFace Inference Endpoints — varied tool-call support
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

    if p == "mistral":
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model,
            api_key=_require_env("MISTRAL_API_KEY"),
            base_url="https://api.mistral.ai/v1",
            temperature=temperature,
        )

    if p == "together":
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model,
            api_key=_require_env("TOGETHER_API_KEY"),
            base_url="https://api.together.xyz/v1",
            temperature=temperature,
        )

    if p == "fireworks":
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model,
            api_key=_require_env("FIREWORKS_API_KEY"),
            base_url="https://api.fireworks.ai/inference/v1",
            temperature=temperature,
        )

    if p == "xai":
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model,
            api_key=_require_env("XAI_API_KEY"),
            base_url="https://api.x.ai/v1",
            temperature=temperature,
        )

    if p == "cohere":
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model,
            api_key=_require_env("COHERE_API_KEY"),
            base_url="https://api.cohere.com/compatibility/v1",
            temperature=temperature,
        )

    if p == "deepseek":
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model,
            api_key=_require_env("DEEPSEEK_API_KEY"),
            base_url="https://api.deepseek.com/v1",
            temperature=temperature,
        )

    if p == "perplexity":
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model,
            api_key=_require_env("PERPLEXITY_API_KEY"),
            base_url="https://api.perplexity.ai",
            temperature=temperature,
        )

    if p == "nvidia":
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model,
            api_key=_require_env("NVIDIA_API_KEY"),
            base_url="https://integrate.api.nvidia.com/v1",
            temperature=temperature,
        )

    if p == "anthropic":
        from .anthropic import AnthropicProvider
        return AnthropicProvider(
            model=model, api_key=_require_env("ANTHROPIC_API_KEY"),
            thinking_budget=thinking_budget, temperature=temperature,
        )

    if p == "custom":
        # Any OpenAI-compatible endpoint: pass --base-url and set CUSTOM_API_KEY.
        # Works with vLLM, LM Studio, Jan, LocalAI, Llamafile, TabbyAPI, etc.
        from .openai import OpenAIProvider
        return OpenAIProvider(
            model=model,
            api_key=os.environ.get("CUSTOM_API_KEY", "none"),
            base_url=base_url or _require_env("CUSTOM_BASE_URL"),
            temperature=temperature,
            context_size=context_size,
        )

    raise ValueError(
        f'Unknown provider "{provider}". '
        'Choose from: ollama, openai, groq, anthropic, mistral, together, '
        'fireworks, xai, cohere, deepseek, perplexity, nvidia, custom'
    )


def _require_env(var: str) -> str:
    val = os.environ.get(var)
    if not val:
        raise EnvironmentError(f'Environment variable {var} is required but not set.')
    return val


__all__ = ["create_provider", "BaseProvider", "NormalizedResponse", "ToolCall"]
