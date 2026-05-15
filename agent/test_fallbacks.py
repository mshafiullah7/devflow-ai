#!/usr/bin/env python3
"""
Quick smoke-test for Gemini Flash and Claude Haiku fallback connections.
Sends a real build error + broken file to each API and prints the fix.

Usage:
    py test_fallbacks.py                          # uses env vars
    py test_fallbacks.py --gemini-key AIza...
    py test_fallbacks.py --claude-key sk-ant-...
    py test_fallbacks.py --gemini-key AIza... --claude-key sk-ant-...
"""

import argparse
import os
import sys

# ---------------------------------------------------------------------------
# Sample inputs — a broken C# file and the error it produces
# ---------------------------------------------------------------------------

SAMPLE_TASK = "Create a simple C# console project that prints Hello World."

SAMPLE_ERROR = """\
src/Program.csproj : error MSB4236: The SDK 'Microsoft.NET.Sdk.Console' specified could not be found.
Build FAILED.
"""

SAMPLE_FILES = """\
FILE: src/Program.csproj
```
<Project Sdk="Microsoft.NET.Sdk.Console">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
</Project>
```

FILE: src/Program.cs
```
using System;
namespace HelloWorld
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Hello, World!");
        }
    }
}
```
"""

PROMPT = f"""\
A local AI agent tried to complete this coding task but got stuck.

TASK:
{SAMPLE_TASK}

ERROR / LAST OUTPUT:
{SAMPLE_ERROR}

RELEVANT FILES (current state):
{SAMPLE_FILES}

Provide corrected file(s) in this exact format — one block per file:

FILE: <relative-path>
```
<full corrected file content>
```

Only output files that need changes. No explanations."""


# ---------------------------------------------------------------------------
# Test runners
# ---------------------------------------------------------------------------

def test_gemini(api_key: str, model: str = 'gemini-2.0-flash') -> bool:
    print(f'\n{"="*60}')
    print(f'  GEMINI TEST  —  model: {model}')
    print(f'{"="*60}')
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        print('► Sending request to Gemini...')
        response = client.models.generate_content(model=model, contents=PROMPT)
        text = response.text
        print(f'► Response received ({len(text)} chars)\n')
        print(text[:2000])
        if len(text) > 2000:
            print(f'  ... (truncated, {len(text) - 2000} more chars)')
        print('\n✓ Gemini fallback is WORKING')
        return True
    except ImportError:
        print('✗ google-genai not installed — run: pip install google-genai>=1.0.0')
        return False
    except Exception as e:
        print(f'✗ Gemini error: {e}')
        return False


def test_claude(api_key: str, model: str = 'claude-haiku-4-5-20251001') -> bool:
    print(f'\n{"="*60}')
    print(f'  CLAUDE TEST  —  model: {model}')
    print(f'{"="*60}')
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        print('► Sending request to Claude...')
        message = client.messages.create(
            model=model,
            max_tokens=2048,
            messages=[{'role': 'user', 'content': PROMPT}],
        )
        text = message.content[0].text
        print(f'► Response received ({len(text)} chars)\n')
        print(text[:2000])
        if len(text) > 2000:
            print(f'  ... (truncated, {len(text) - 2000} more chars)')
        print('\n✓ Claude fallback is WORKING')
        return True
    except ImportError:
        print('✗ anthropic not installed — run: pip install anthropic>=0.25.0')
        return False
    except Exception as e:
        print(f'✗ Claude error: {e}')
        return False


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(description='Smoke-test Gemini and Claude fallback APIs')
    p.add_argument('--gemini-key', default=os.environ.get('GEMINI_API_KEY', ''), dest='gemini_key')
    p.add_argument('--claude-key', default=os.environ.get('CLAUDE_API_KEY', ''), dest='claude_key')
    p.add_argument('--gemini-model', default='gemini-2.0-flash', dest='gemini_model')
    p.add_argument('--claude-model', default='claude-haiku-4-5-20251001', dest='claude_model')
    args = p.parse_args()

    if not args.gemini_key and not args.claude_key:
        print('No API keys provided. Set GEMINI_API_KEY / CLAUDE_API_KEY env vars or pass --gemini-key / --claude-key.')
        sys.exit(1)

    results = {}

    if args.gemini_key:
        results['Gemini'] = test_gemini(args.gemini_key, args.gemini_model)
    else:
        print('\n[Gemini] Skipped — no key provided')

    if args.claude_key:
        results['Claude'] = test_claude(args.claude_key, args.claude_model)
    else:
        print('\n[Claude] Skipped — no key provided')

    print(f'\n{"="*60}')
    print('  SUMMARY')
    print(f'{"="*60}')
    for name, ok in results.items():
        status = '✓ PASS' if ok else '✗ FAIL'
        print(f'  {status}  {name}')

    all_passed = all(results.values())
    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
