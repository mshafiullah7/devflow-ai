"""
OpenAI-compatible provider — covers OpenAI, Ollama, and Groq.

All three expose the same OpenAI chat-completions API shape, so one
provider class handles all of them by swapping base_url + api_key.

Usage:
    # Ollama (local)
    OpenAIProvider(model="qwen2.5-coder:32b", base_url="http://localhost:11434/v1", api_key="ollama")

    # Groq
    OpenAIProvider(model="llama-3.3-70b-versatile", base_url="https://api.groq.com/openai/v1", api_key=os.environ["GROQ_API_KEY"])

    # OpenAI
    OpenAIProvider(model="gpt-4o", api_key=os.environ["OPENAI_API_KEY"])

Provider-specific extra params:
    reasoning_effort  "low"|"medium"|"high" — OpenAI o-series only (o1, o3, o4-mini).
                      Ignored for standard models (gpt-4o, etc.).
    temperature       Float 0.0–2.0. Ignored for o-series (they don't support it).
    context_size      Integer — Ollama num_ctx override, passed via extra_body.
                      Ignored by OpenAI and Groq.
"""

from __future__ import annotations
import json
from .base import BaseProvider, NormalizedResponse, ToolCall

# OpenAI reasoning models — do not support temperature or tool_choice="auto"
_O_SERIES = {"o1", "o1-mini", "o1-preview", "o3", "o3-mini", "o4-mini"}


class OpenAIProvider(BaseProvider):
    def __init__(
        self,
        model: str,
        api_key: str,
        base_url: str | None = None,
        reasoning_effort: str | None = None,
        temperature: float | None = None,
        context_size: int | None = None,
    ):
        from openai import OpenAI
        self.model            = model
        self.reasoning_effort = reasoning_effort
        self.temperature      = temperature
        self.context_size     = context_size
        self.client           = OpenAI(api_key=api_key, base_url=base_url)

    def chat(self, messages: list[dict], tools: list[dict]) -> NormalizedResponse:
        native_msgs = [_to_openai_message(m) for m in messages]
        is_o_series = self.model in _O_SERIES

        kwargs: dict = dict(
            model=self.model,
            messages=native_msgs,
        )

        if tools:
            kwargs["tools"]       = tools
            kwargs["tool_choice"] = "auto"

        if is_o_series:
            # o-series: use reasoning_effort, temperature is not supported
            if self.reasoning_effort:
                kwargs["reasoning_effort"] = self.reasoning_effort
        else:
            if self.temperature is not None:
                kwargs["temperature"] = self.temperature

        # Ollama: pass num_ctx via extra_body (ignored by OpenAI/Groq)
        if self.context_size:
            kwargs["extra_body"] = {"options": {"num_ctx": self.context_size}}

        response = self.client.chat.completions.create(**kwargs)

        choice = response.choices[0]
        msg    = choice.message

        text = msg.content or ""

        tool_calls: list[ToolCall] = []
        for tc in (msg.tool_calls or []):
            try:
                args = json.loads(tc.function.arguments)
            except (json.JSONDecodeError, TypeError):
                args = {}
            tool_calls.append(ToolCall(
                name=tc.function.name,
                arguments=args,
                id=tc.id,
            ))

        usage = response.usage
        return NormalizedResponse(
            text=text,
            tool_calls=tool_calls,
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
        )


# ---------------------------------------------------------------------------
# Message conversion helpers
# ---------------------------------------------------------------------------

def _to_openai_message(msg: dict) -> dict:
    role = msg["role"]

    if role in ("system", "user"):
        return {"role": role, "content": msg["content"]}

    if role == "assistant":
        entry: dict = {"role": "assistant", "content": msg.get("content") or ""}
        tcs = msg.get("tool_calls")
        if tcs:
            entry["tool_calls"] = [
                {
                    "id":       tc["id"] or f"call_{i}",
                    "type":     "function",
                    "function": {
                        "name":      tc["name"],
                        "arguments": json.dumps(tc["arguments"]),
                    },
                }
                for i, tc in enumerate(tcs)
            ]
        return entry

    if role == "tool":
        return {
            "role":         "tool",
            "tool_call_id": msg.get("id", ""),
            "content":      msg.get("content", ""),
        }

    return msg   # passthrough for unknown roles
