"""
Base provider interface and shared data types.

All providers return NormalizedResponse so agent.py never touches
provider-specific response objects.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ToolCall:
    name: str
    arguments: dict
    id: str = ""   # Anthropic and OpenAI require IDs; Ollama does not


@dataclass
class NormalizedResponse:
    text: str
    tool_calls: list[ToolCall]
    prompt_tokens: int
    completion_tokens: int


class BaseProvider(ABC):
    """
    Contract every provider must fulfill.

    Internal message format the agent loop uses:
        {"role": "system",    "content": str}
        {"role": "user",      "content": str}
        {"role": "assistant", "content": str,
                              "tool_calls": [{"id": str, "name": str, "arguments": dict}]}
        {"role": "tool",      "id": str, "name": str, "content": str}

    Each provider converts this to its native wire format inside chat().
    """

    @abstractmethod
    def chat(self, messages: list[dict], tools: list[dict]) -> NormalizedResponse:
        """Call the LLM and return a normalized response."""

    def build_assistant_entry(self, response: NormalizedResponse) -> dict:
        """Build the assistant history entry from a normalized response."""
        entry: dict = {"role": "assistant", "content": response.text or ""}
        if response.tool_calls:
            entry["tool_calls"] = [
                {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                for tc in response.tool_calls
            ]
        return entry

    def build_tool_result_entry(self, tool_call: ToolCall, result: str) -> dict:
        """Build a tool result history entry."""
        return {"role": "tool", "id": tool_call.id, "name": tool_call.name, "content": result}
