#!/usr/bin/env python3
"""
ollama_proxy.py — Thin Ollama streaming proxy for electron-ai-sdlc chat.

Reads a JSON messages array from a file, streams the Ollama response to
stdout token-by-token, and exits with code 1 on any connection error.

Usage:
    python ollama_proxy.py --messages-file <path> --model <name> [--base-url <url>]
"""
import argparse
import json
import sys

import ollama


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--messages-file', required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--base-url', default='http://localhost:11434')
    args = parser.parse_args()

    # Force UTF-8 on Windows terminals that default to cp1252
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1, closefd=False)

    with open(args.messages_file, encoding='utf-8') as f:
        messages = json.load(f)

    client = ollama.Client(host=args.base_url)
    try:
        for chunk in client.chat(model=args.model, messages=messages, stream=True):
            token = chunk.message.content or ''
            if token:
                print(token, end='', flush=True)
    except ollama.ResponseError as e:
        print(f'\n[ERROR] Ollama error: {e.error}', file=sys.stderr, flush=True)
        sys.exit(1)
    except Exception as e:
        print(
            f'\n[ERROR] Failed to connect to Ollama at {args.base_url}: {e}\n'
            'Make sure Ollama is running: ollama serve',
            file=sys.stderr, flush=True,
        )
        sys.exit(1)


if __name__ == '__main__':
    main()
