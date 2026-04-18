'use strict';

const { ipcMain } = require('electron');

let _activeStream = null;

const TECH_LABELS = {
  'html':           'Plain HTML5 + CSS3',
  'react-tailwind': 'React + Tailwind CSS',
  'vue-tailwind':   'Vue 3 + Tailwind CSS',
  'flutter':        'Flutter (Dart)',
  'react-native':   'React Native',
};

const MOBILE_STACKS = ['flutter', 'react-native'];

function buildScreenSystem(techStack) {
  const tech = TECH_LABELS[techStack] || techStack;
  if (MOBILE_STACKS.includes(techStack)) {
    return `You are an expert mobile UI developer. Generate complete, production-quality ${tech} code for the described screen. Output ONLY the code — no explanation, no markdown fences.`;
  }
  return `You are an expert UI/UX developer. Generate a complete, self-contained HTML file for the described screen using ${tech}.
Rules:
- Output ONLY valid HTML starting with <!DOCTYPE html>
- All CSS goes in a <style> tag; CDN links (e.g. Tailwind CDN) are allowed
- Visually polished, modern design with realistic placeholder content
- Fully responsive layout
- No explanation, no markdown — raw HTML only`;
}

function registerClaudeHandlers() {
  ipcMain.handle('claude:generate-screen', async (event, { api_key, model_name, description, tech_stack, project_description }) => {
    let Anthropic;
    try { Anthropic = require('@anthropic-ai/sdk'); }
    catch { return { error: 'Anthropic SDK not found. Run: npm install @anthropic-ai/sdk' }; }

    if (!api_key) return { error: 'No API key. Add a "Claude (Anthropic API)" model config with your API key.' };

    const client    = new Anthropic({ apiKey: api_key });
    const techLabel = TECH_LABELS[tech_stack] || tech_stack;
    const ctxLine   = project_description ? `\nProject context: ${project_description}` : '';
    const userMsg   = `Tech stack: ${techLabel}${ctxLine}\n\nDesign this screen:\n${description}`;

    try {
      _activeStream = client.messages.stream({
        model:      model_name || 'claude-sonnet-4-6',
        max_tokens: 8192,
        system:     buildScreenSystem(tech_stack),
        messages:   [{ role: 'user', content: userMsg }],
      });

      for await (const chunk of _activeStream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          event.sender.send('claude:token', chunk.delta.text);
        }
      }

      const final = await _activeStream.finalMessage();
      _activeStream = null;
      event.sender.send('claude:done', { usage: final.usage });
      return { success: true };
    } catch (err) {
      _activeStream = null;
      event.sender.send('claude:error', err.message);
      return { error: err.message };
    }
  });

  ipcMain.handle('claude:extract-stories', async (_event, { api_key, model_name, html_content, tech_stack, screen_title }) => {
    let Anthropic;
    try { Anthropic = require('@anthropic-ai/sdk'); }
    catch { return { error: 'Anthropic SDK not found.' }; }

    if (!api_key) return { error: 'No API key configured.' };

    const client    = new Anthropic({ apiKey: api_key });
    const techLabel = TECH_LABELS[tech_stack] || tech_stack;

    const prompt = `You are an expert product manager. Analyze this UI screen and extract user stories.

Screen: "${screen_title}"
Tech stack: ${techLabel}

UI code:
\`\`\`
${html_content.slice(0, 8000)}
\`\`\`

Extract every distinct user action, form, state, or interaction visible in this screen as a separate user story.

Return ONLY a valid JSON array — no markdown, no explanation:
[
  {
    "title": "Short action-oriented title",
    "description": "As a user, I want to [action] so that [benefit].",
    "acceptance_criteria": "- Criterion 1\\n- Criterion 2\\n- Criterion 3\\n- Criterion 4",
    "prompts": [
      { "tag": "implementation", "prompt": "Implement [specific component] using ${techLabel}. Include [specific details from the screen]..." },
      { "tag": "test", "prompt": "Write tests for [specific story]: test [case 1], test [case 2], test [case 3]..." }
    ]
  }
]`;

    try {
      const response = await client.messages.create({
        model:      model_name || 'claude-sonnet-4-6',
        max_tokens: 6000,
        messages:   [{ role: 'user', content: prompt }],
      });

      let text = response.content[0]?.text?.trim() || '';
      const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (mdMatch) text = mdMatch[1].trim();

      const stories = JSON.parse(text);
      return { stories };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('claude:cancel', () => {
    try { _activeStream?.controller?.abort(); } catch { /* ignore */ }
    _activeStream = null;
  });
}

module.exports = { registerClaudeHandlers };
