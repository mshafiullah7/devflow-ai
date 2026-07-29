"""
Anthropic provider — covers all Claude models.

Anthropic's API differs from OpenAI in three important ways that are
handled entirely inside this file so agent.py never sees the differences:

  1. Tool schemas use "input_schema" instead of "parameters".
  2. System prompt is a top-level parameter, not a message.
  3. Tool results are user-role messages with typed content blocks,
     not role="tool" messages. Consecutive tool results from one turn
     must be batched into a single user message.
  4. Assistant messages with tool calls use typed content blocks
     (TextBlock + ToolUseBlock) instead of a flat tool_calls list.

Extended thinking (--thinking-budget):
  Pass thinking_budget=N to enable Claude's extended thinking mode.
  budget_tokens controls how much reasoning the model does before answering.
  Minimum: 1024. Recommended range: 5000–16000 for coding tasks.
  When enabled, temperature is forced to 1 (Anthropic requirement).
  max_tokens is automatically raised to budget_tokens + 4096 if too low.
"""

from __future__ import annotations
from .base import BaseProvider, NormalizedResponse, ToolCall


class AnthropicProvider(BaseProvider):
    def __init__(
        self,
        model: str,
        api_key: str,
        max_tokens: int = 8096,
        thinking_budget: int | None = None,
        temperature: float | None = None,
    ):
        import anthropic
        self.model           = model
        self.max_tokens      = max_tokens
        self.thinking_budget = thinking_budget
        self.temperature     = temperature
        self.client          = anthropic.Anthropic(api_key=api_key)

    def chat(self, messages: list[dict], tools: list[dict]) -> NormalizedResponse:
        system, native_msgs = _split_and_convert(messages)

        max_tokens = self.max_tokens
        if self.thinking_budget:
            # max_tokens must exceed budget_tokens
            max_tokens = max(max_tokens, self.thinking_budget + 4096)

        kwargs: dict = dict(
            model=self.model,
            max_tokens=max_tokens,
            messages=native_msgs,
            tools=_convert_tools(tools),
        )
        if system:
            kwargs["system"] = system

        if self.thinking_budget:
            # Extended thinking: temperature must be 1 (Anthropic enforces this)
            kwargs["thinking"]    = {"type": "enabled", "budget_tokens": self.thinking_budget}
            kwargs["temperature"] = 1
        elif self.temperature is not None:
            kwargs["temperature"] = self.temperature

        response = self.client.messages.create(**kwargs)

        text       = ""
        tool_calls: list[ToolCall] = []

        for block in response.content:
            if block.type == "thinking":
                pass   # internal reasoning — not shown to user
            elif block.type == "text":
                text += block.text
            elif block.type == "tool_use":
                tool_calls.append(ToolCall(
                    name=block.name,
                    arguments=block.input or {},
                    id=block.id,
                ))

        return NormalizedResponse(
            text=text,
            tool_calls=tool_calls,
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
        )

    def build_assistant_entry(self, response: NormalizedResponse) -> dict:
        content = []
        if response.text:
            content.append({"type": "text", "text": response.text})
        for tc in response.tool_calls:
            content.append({
                "type":  "tool_use",
                "id":    tc.id,
                "name":  tc.name,
                "input": tc.arguments,
            })
        # Keep normalized tag so agent.py can inspect tool_calls
        return {
            "role":       "assistant",
            "content":    response.text or "",
            "tool_calls": [{"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                           for tc in response.tool_calls],
            "_anthropic_content": content,   # used by _split_and_convert below
        }

    def build_tool_result_entry(self, tool_call: ToolCall, result: str) -> dict:
        return {"role": "tool", "id": tool_call.id, "name": tool_call.name, "content": result}


# ---------------------------------------------------------------------------
# Conversion helpers
# ---------------------------------------------------------------------------

def _convert_tools(tools: list[dict]) -> list[dict]:
    """Convert OpenAI-style tool schemas to Anthropic format."""
    out = []
    for t in tools:
        fn = t.get("function", t)
        out.append({
            "name":         fn["name"],
            "description":  fn.get("description", ""),
            "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
        })
    return out


def _split_and_convert(messages: list[dict]) -> tuple[str, list[dict]]:
    """
    Extract the system message and convert the remaining messages to
    Anthropic's native format.

    Key rules:
    - Consecutive role="tool" entries are batched into one user message
      with a tool_result content block per entry (Anthropic requires this).
    - Assistant entries that carry _anthropic_content use that directly.
    """
    system = ""
    native: list[dict] = []

    i = 0
    while i < len(messages):
        msg  = messages[i]
        role = msg["role"]

        if role == "system":
            system = msg["content"]
            i += 1
            continue

        if role == "user":
            native.append({"role": "user", "content": msg["content"]})
            i += 1
            continue

        if role == "assistant":
            # Use pre-built Anthropic content blocks if available
            anthropic_content = msg.get("_anthropic_content")
            if anthropic_content:
                native.append({"role": "assistant", "content": anthropic_content})
            else:
                # Convert from normalized format
                content = []
                if msg.get("content"):
                    content.append({"type": "text", "text": msg["content"]})
                for tc in msg.get("tool_calls", []):
                    content.append({
                        "type":  "tool_use",
                        "id":    tc.get("id", ""),
                        "name":  tc["name"],
                        "input": tc.get("arguments", {}),
                    })
                native.append({"role": "assistant", "content": content or msg.get("content", "")})
            i += 1
            continue

        if role == "tool":
            # Batch all consecutive tool-result messages into one user message
            batch = []
            while i < len(messages) and messages[i]["role"] == "tool":
                t = messages[i]
                batch.append({
                    "type":        "tool_result",
                    "tool_use_id": t.get("id", ""),
                    "content":     t.get("content", ""),
                })
                i += 1
            native.append({"role": "user", "content": batch})
            continue

        # Unknown role — passthrough
        native.append(msg)
        i += 1

    return system, native
