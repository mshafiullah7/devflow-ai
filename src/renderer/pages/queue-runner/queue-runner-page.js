import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

const TECH = 'Plain HTML / CSS';

// ----------------------------------------------------------------
// Prompt builder (mirrors mockups-page.js)
// ----------------------------------------------------------------
function buildScreenPrompt(description, projectDescription, designTemplate) {
  const ctx    = projectDescription ? `\nProject context: ${projectDescription}` : '';
  const design = designTemplate
    ? `\n\nDESIGN SYSTEM — you MUST follow this for every element (colours, fonts, spacing, components):\n${designTemplate}`
    : '';

  return `You are an expert UI/UX developer. Generate a complete, self-contained HTML file for the screen described below using ${TECH}.
Rules:
- Output ONLY valid HTML starting with <!DOCTYPE html>
- All CSS goes inside a <style> tag; CDN links (e.g. Tailwind CDN) are allowed
- Visually polished, modern design with realistic placeholder content
- Fully responsive
- No explanation, no markdown — raw HTML only
- REQUIRED: Include a light/dark theme toggle button fixed in the top-right corner (position:fixed; top:1rem; right:1rem; z-index:9999). The button must toggle a "dark" class on <html> or <body> and switch all colours accordingly using CSS variables or a [data-theme] attribute. Default to light theme. The toggle must work standalone with no external dependencies.${ctx}${design}

Screen to design:
${description}`;
}

function getDesignTemplateForPrompt(raw) {
  let light = '';
  let dark  = '';
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') { light = p.light || ''; dark = p.dark || ''; }
  } catch (_) {
    dark = raw || '';
  }
  if (light && dark) return `Light theme:\n${light}\n\nDark theme:\n${dark}`;
  return dark || light || '';
}

// ----------------------------------------------------------------
// QueueRunnerPage
// ----------------------------------------------------------------
export class QueueRunnerPage {
  constructor(container) {
    this.container        = container;
    this._projectId       = null;
    this._project         = null;
    this._screens         = [];
    this._modelConfigs    = [];
    this._selectedModelId = null;
    this._queueStopped    = false;
  }

  mount() {
    injectCss('styles/screens.css');
    injectCss('pages/mockups/mockups-page.css');
    injectCss('pages/queue-runner/queue-runner-page.css');
    applyStoredTheme();

    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                  font-family:var(--font-sans,system-ui);color:var(--text-muted,#888)">
        Loading queue…
      </div>`;

    window.app.queueWindow.onInit(({ projectId }) => this._init(projectId));
  }

  unmount() {
    removeCss('styles/screens.css');
    removeCss('pages/mockups/mockups-page.css');
    removeCss('pages/queue-runner/queue-runner-page.css');
    window.app.queueChat.offAll();
  }

  async _init(projectId) {
    this._projectId = projectId;

    const [project, screens, modelConfigs, mapping] = await Promise.all([
      window.db.projects.get(projectId),
      window.db.screenDesigns.list(projectId),
      window.db.modelConfigs.list(),
      window.db.modelMapping.get('mockups'),
    ]);

    this._project      = project;
    this._screens      = screens;
    this._modelConfigs = modelConfigs;

    const mappedId = mapping?.model_config_id ?? null;
    const defCli   = modelConfigs.find(c => c.is_default && c.type === 'cli');
    this._selectedModelId = mappedId ?? defCli?.id ?? modelConfigs[0]?.id ?? null;

    this._render();
  }

  _getSelectedModel() {
    return this._modelConfigs.find(c => c.id === this._selectedModelId)
      || this._modelConfigs.find(c => c.is_default)
      || this._modelConfigs[0]
      || null;
  }

  _render() {
    const name   = escHtml(this._project?.name || 'Project');
    const queued = this._screens.filter(s => s.queued && s.is_active !== 0);

    this.container.innerHTML = `
      <div class="scr-queue-window">
        <div class="scr-queue-window__header">
          <span class="scr-queue-window__title">${name} — Queue</span>
          <select class="scr-queue-window__model-select" id="qwModelSelect">
            ${this._modelConfigs.map(m => `
              <option value="${m.id}" ${m.id === this._selectedModelId ? 'selected' : ''}>
                ${escHtml(m.label || m.type)}
              </option>`).join('')}
          </select>
        </div>
        <div class="scr-queue-window__body" id="qwBody"></div>
      </div>`;

    this.container.querySelector('#qwModelSelect').addEventListener('change', (e) => {
      this._selectedModelId = Number(e.target.value);
    });

    this._renderQueuePanel(this.container.querySelector('#qwBody'));
  }

  async _renderQueuePanel(panel) {
    const allScreens = await window.db.screenDesigns.list(this._projectId);
    const queued     = allScreens.filter(s => s.queued && s.is_active !== 0);

    panel.innerHTML = `
      <div class="scr-queue-panel">
        <div class="scr-queue-panel__header">
          <span class="scr-queue-panel__title">Queue</span>
          <span class="scr-queue-panel__count">${queued.length} screen${queued.length !== 1 ? 's' : ''}</span>
          <div style="flex:1"></div>
          <button class="scr-btn scr-btn--sm scr-btn--danger" id="qwStopBtn" hidden>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/>
            </svg>
            Stop
          </button>
          <button class="scr-btn scr-btn--sm scr-btn--secondary" id="qwClearBtn" hidden>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M4 8h8M8 4l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Clear completed
          </button>
          <button class="scr-btn scr-btn--primary scr-btn--sm" id="qwRunBtn" ${queued.length === 0 ? 'disabled' : ''}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M4 3l9 5-9 5V3z" fill="currentColor"/>
            </svg>
            Run All
          </button>
        </div>
        <div class="scr-queue-panel__list">
          ${queued.length === 0
            ? '<p class="scr-queue-panel__empty">No screens are queued.</p>'
            : queued.map(s => `
              <div class="scr-queue-item" data-id="${s.id}">
                <div class="scr-queue-item__row">
                  <svg class="scr-queue-item__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
                  </svg>
                  <span class="scr-queue-item__title">${escHtml(s.title)}</span>
                  ${s.description ? '' : '<span class="scr-queue-item__no-desc" title="No description — will be skipped">No description</span>'}
                  ${s.description ? `<button class="scr-queue-item__prompt-btn" data-prompt-id="${s.id}" title="Show prompt">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                      <path d="M8 7v4M8 5.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                  </button>` : ''}
                  <span class="scr-queue-item__status scr-queue-item__status--pending" id="qwStatus-${s.id}">Pending</span>
                </div>
                ${s.description ? `<pre class="scr-queue-item__prompt-pre" id="qwPrompt-${s.id}" hidden></pre>` : ''}
              </div>`).join('')}
        </div>
      </div>`;

    if (queued.length === 0) return;

    const runBtn   = panel.querySelector('#qwRunBtn');
    const stopBtn  = panel.querySelector('#qwStopBtn');
    const clearBtn = panel.querySelector('#qwClearBtn');

    runBtn.addEventListener('click', () => {
      runBtn.hidden  = true;
      stopBtn.hidden = false;
      this._runQueue(queued, panel, () => {
        runBtn.hidden   = false;
        stopBtn.hidden  = true;
        clearBtn.hidden = false;
      });
    });

    stopBtn.addEventListener('click', () => {
      this._queueStopped = true;
      window.app.queueChat.cancel();
      window.app.queueChat.offAll();
      stopBtn.hidden  = true;
      runBtn.hidden   = false;
      clearBtn.hidden = false;
    });

    clearBtn.addEventListener('click', async () => {
      await this._renderQueuePanel(panel);
    });

    // Prompt preview toggles
    panel.querySelectorAll('.scr-queue-item__prompt-btn').forEach(btn => {
      const id     = Number(btn.dataset.promptId);
      const screen = queued.find(s => s.id === id);
      const pre    = panel.querySelector(`#qwPrompt-${id}`);
      if (!screen || !pre) return;
      btn.addEventListener('click', () => {
        const open = !pre.hidden;
        if (open) {
          pre.hidden = true;
          btn.classList.remove('scr-queue-item__prompt-btn--active');
        } else {
          if (!pre.dataset.built) {
            pre.textContent = buildScreenPrompt(
              screen.description,
              this._project?.description || '',
              getDesignTemplateForPrompt(this._project?.design_template || '')
            );
            pre.dataset.built = '1';
          }
          pre.hidden = false;
          btn.classList.add('scr-queue-item__prompt-btn--active');
        }
      });
    });
  }

  async _runQueue(screens, panel, onFinish) {
    this._queueStopped = false;
    const model = this._getSelectedModel();
    if (!model) { alert('No model selected.'); onFinish(); return; }

    const projectName    = this._project?.name || 'project';
    const designTemplate = getDesignTemplateForPrompt(this._project?.design_template || '');
    let doneCount  = 0;
    let errorCount = 0;

    for (const screen of screens) {
      if (this._queueStopped) break;

      const statusEl = panel.querySelector(`#qwStatus-${screen.id}`);
      if (!screen.description) {
        if (statusEl) {
          statusEl.textContent = 'Skipped';
          statusEl.className   = 'scr-queue-item__status scr-queue-item__status--skipped';
        }
        continue;
      }

      if (statusEl) {
        statusEl.textContent = 'Running…';
        statusEl.className   = 'scr-queue-item__status scr-queue-item__status--running';
      }

      const prompt = buildScreenPrompt(
        screen.description,
        this._project?.description || '',
        designTemplate
      );

      const result = await new Promise(resolve => {
        window.app.queueChat.offAll();
        window.app.queueChat.onDone(resolve);
        window.app.queueChat.generate({ prompt, model });
      });

      if (this._queueStopped) break;

      if (result.html && !result.error) {
        await window.db.screenDesigns.update({
          id:           screen.id,
          html_content: result.html,
          executed:     1,
          queued:       0,
        });
        doneCount++;
        if (statusEl) {
          statusEl.textContent = 'Done';
          statusEl.className   = 'scr-queue-item__status scr-queue-item__status--done';
        }
        this._tgNotify(`✅ *${screen.title}* generated successfully\n_Project: ${projectName}_`);
      } else {
        errorCount++;
        const errMsg = result.error || 'Unknown error';
        if (statusEl) {
          statusEl.textContent = errMsg;
          statusEl.className   = 'scr-queue-item__status scr-queue-item__status--error';
        }
        this._tgNotify(`❌ *${screen.title}* failed\n\`${errMsg}\`\n_Project: ${projectName}_`);
      }
    }

    window.app.queueChat.offAll();

    if (this._queueStopped) {
      this._tgNotify(`⏹ Queue stopped — ${doneCount} done, ${errorCount} error${errorCount !== 1 ? 's' : ''}\n_Project: ${projectName}_`);
    } else {
      this._tgNotify(`🏁 Queue finished — ${doneCount} done, ${errorCount} error${errorCount !== 1 ? 's' : ''}\n_Project: ${projectName}_`);
    }

    onFinish();
  }

  _tgNotify(text) {
    window.app.telegram.send(text).catch(() => {});
  }
}
