#!/usr/bin/env python3
"""
openai_proxy.py — Thin OpenAI-compatible streaming proxy for devflow-ai-sdlc chat.

Reads a JSON messages array from a file, streams the response to stdout
token-by-token, and exits with code 1 on any error.

Usage:
    python openai_proxy.py --messages-file <path> --model <name>
                           [--api-key <key>] [--base-url <url>]
                           [--max-tokens <n>]

Works with OpenAI, Groq, Ollama /v1, and any other OpenAI-compatible endpoint.
"""
import argparse
import json
import sys


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--messages-file', required=True)
    parser.add_argument('--model',         required=True)
    parser.add_argument('--api-key',       default='',   dest='api_key')
    parser.add_argument('--base-url',      default=None, dest='base_url')
    parser.add_argument('--max-tokens',    default=None, type=int, dest='max_tokens')
    parser.add_argument('--verbose',       action='store_true')
    args = parser.parse_args()

    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1, closefd=False)
    if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
        sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1, closefd=False)

    with open(args.messages_file, encoding='utf-8') as f:
        messages = json.load(f)

    if args.verbose:
        roles = ', '.join(m['role'] for m in messages)
        print(f'[openai-proxy] model={args.model} base-url={args.base_url} messages=[{roles}]',
              file=sys.stderr, flush=True)

    from openai import OpenAI
    client = OpenAI(api_key=args.api_key or 'none', base_url=args.base_url)

    kwargs = dict(model=args.model, messages=messages, stream=True)
    if args.max_tokens:
        kwargs['max_tokens'] = args.max_tokens

    token_count = 0
    try:
        if args.verbose:
            print('[openai-proxy] connecting…', file=sys.stderr, flush=True)
        for chunk in client.chat.completions.create(**kwargs):
            token = (chunk.choices[0].delta.content or '') if chunk.choices else ''
            if token:
                token_count += 1
                if args.verbose and token_count == 1:
                    print('[openai-proxy] streaming started', file=sys.stderr, flush=True)
                print(token, end='', flush=True)
        if args.verbose:
            print(f'[openai-proxy] done — {token_count} chunks received', file=sys.stderr, flush=True)
    except Exception as e:
        print(f'[openai-proxy] ERROR: {e}', file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
