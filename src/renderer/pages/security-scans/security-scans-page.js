import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ProjectSidebar } from '../../components/project-sidebar/project-sidebar.js';

function stripAnsi(str) {
  return str
    // CSI sequences: ESC [ <params 0x30-0x3F, incl. digits ; ? < = >> <final 0x40-0x7E>
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*\x07/g, '');
}

function collapseCarriageReturns(str) {
  return str.split('\n').map(line => {
    const idx = line.lastIndexOf('\r');
    return idx === -1 ? line : line.slice(idx + 1);
  }).join('\n');
}

export class SecurityScansPage {
  constructor(container, params, router) {
    this.container  = container;
    this.router     = router;
    this._projectId = params.projectId;
    this._project   = null;
    this._layers    = [];
    this._activeLayer = null;

    this._scanCommands  = [];
    this._scanCmd       = null;
    this._scanRunning   = false;
    this._scanOutput    = '';
    this._scanDisplayBuf = '';
    this._scanResult    = null; // { critical, high, medium, low, total } | null
    this._scanDetecting = false;
    this._manualCmd     = '';

    this._scanStartTime = null;
    this._scanElapsedTimer = null;
  }

  async mount() {
    injectCss('pages/test-generator/test-generator-page.css');
    injectCss('components/project-sidebar/project-sidebar.css');
    injectCss('pages/security-scans/security-scans-page.css');
    applyStoredTheme();

    const [project, layers] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.projectLayers.list(this._projectId),
    ]);
    this._project = project;
    this._layers  = layers ?? [];

    this.container.innerHTML = this._template();
    this._bindEvents();
    this._sidebar.bindEvents(this.container);
    this._sidebar.loadCounts(this.container);

    const firstLayer = this._layers.find(l => l.folder_path);
    if (firstLayer) this._selectLayer(firstLayer);
  }

  unmount() {
    if (this._scanRunning) window.db.securityScanner.kill();
    window.db.securityScanner.removeListeners();
    this._clearElapsedTimer();
    removeCss('pages/test-generator/test-generator-page.css');
    removeCss('components/project-sidebar/project-sidebar.css');
    removeCss('pages/security-scans/security-scans-page.css');
  }

  // ─── Template ────────────────────────────────────────────────────

  _template() {
    const name    = this._project?.name ?? 'Project';
    const initial = this._project?.name?.trim()[0]?.toUpperCase() ?? '?';
    this._sidebar = new ProjectSidebar({ projectId: this._projectId, router: this.router, activeRoute: 'security-scans' });
    return `
      <div class="ph-project-shell">
        <header class="project-home__header">
          <button class="project-home__back" id="ssBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="project-home__badge">
            <div class="project-home__badge-initial">${initial}</div>
            <span class="project-home__badge-name">${escHtml(name)}</span>
          </div>
          <span class="ph-header-page-chip">Security Scans</span>
        </header>

        <div class="ph-page-with-nav">
          ${this._sidebar.html()}
          <div class="tg-body">
            <aside class="tg-sidebar">
              <div class="tg-sidebar__header">
                <span class="tg-sidebar__header-label">Project Layers</span>
              </div>
              <div class="tg-sidebar__list" id="ssSidebar">${this._sidebarHtml()}</div>
            </aside>
            <div class="tg-main-wrap">
              <div class="tg-main" id="ssMain">
                ${this._mainHtml()}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  _sidebarHtml() {
    if (!this._layers.length) {
      return `<div class="tg-sidebar-empty">No layers configured.<br>Add layers in Project Layers.</div>`;
    }
    return this._layers.map(l => {
      const active   = this._activeLayer?.id === l.id ? 'tg-layer-item--active' : '';
      const disabled = !l.folder_path ? 'tg-layer-item--disabled' : '';
      const fp = l.folder_path
        ? `<span class="tg-layer-item__path">${escHtml(l.folder_path)}</span>`
        : `<span class="tg-layer-item__path tg-layer-item__path--empty">No folder set</span>`;
      return `
        <div class="tg-layer-item ${active} ${disabled}" data-layer-id="${l.id}">
          <span class="tg-layer-item__name-row">
            <span class="tg-layer-item__id">#${l.id}</span>
            <span class="tg-layer-item__name">${escHtml(l.name)}</span>
          </span>
          ${fp}
        </div>`;
    }).join('');
  }

  _mainHtml() {
    if (!this._activeLayer) {
      return `
        <div class="tg-empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.35">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <p>${this._layers.length ? 'Select a layer to scan.' : 'No layers found. Add a layer with a folder path first.'}</p>
        </div>`;
    }
    return this._scanAreaHtml();
  }

  _scanAreaHtml() {
    const hasCmd    = this._scanCommands.length > 0;
    const detecting = this._scanDetecting;

    const cmdOptions = this._scanCommands.map(c =>
      `<option value="${escHtml(c.id)}" ${this._scanCmd?.id === c.id ? 'selected' : ''}>${escHtml(c.label)}</option>`
    ).join('');

    const fw = this._scanCmd?.tool ?? this._scanCommands[0]?.tool ?? '';

    const manualBlock = !hasCmd && !detecting ? `
      <div class="tg-exec-manual" id="ssManualWrap">
        <span class="tg-exec-manual-label">Enter scan command manually:</span>
        <div class="tg-exec-manual-row">
          <input class="tg-exec-manual-input" id="ssManualInput"
                 value="${escHtml(this._manualCmd)}"
                 placeholder="e.g. npm audit"
                 spellcheck="false"
                 ${this._scanRunning ? 'disabled' : ''}/>
          <button class="tg-btn tg-btn--sm tg-btn--primary" id="ssBtnRunManual"
            ${!this._manualCmd.trim() || this._scanRunning ? 'disabled' : ''}>▶ Scan</button>
          <button class="tg-btn tg-btn--sm tg-btn--stop" id="ssBtnStopManual"
            ${this._scanRunning ? '' : 'hidden'}>■ Stop</button>
        </div>
        <p class="tg-exec-manual-hint">No security scanner detected. Install one (e.g. <code>npm audit</code>, <code>pip-audit</code>, <code>govulncheck</code>) or enter a command above.</p>
      </div>` : '';

    return `
      <div class="tg-exec ss-scan" id="ssScanSection">
        ${detecting ? `<div class="tg-exec-detecting"><span class="tg-exec-detecting-spinner"></span>Detecting security tools…</div>` : `
        <div class="tg-exec-bar">
          ${fw ? `<span class="tg-exec-fw ss-tool-badge">${escHtml(fw)}</span>` : ''}
          ${hasCmd ? `
          <select class="tg-exec-cmd-sel" id="ssCmdSel" ${this._scanRunning ? 'disabled' : ''}>
            ${cmdOptions}
          </select>
          <button class="tg-btn tg-btn--sm tg-btn--primary" id="ssBtnRun"
            ${this._scanRunning ? 'disabled' : ''}>▶ Run Scan</button>
          <button class="tg-btn tg-btn--sm tg-btn--stop" id="ssBtnStop"
            ${this._scanRunning ? '' : 'hidden'}>■ Stop</button>
          ${this._scanRunning ? `
          <span class="ss-running" id="ssRunning">
            <span class="tg-exec-detecting-spinner"></span>Running… <span id="ssElapsed">0s</span>
          </span>` : ''}
          ` : ''}
        </div>`}
        ${manualBlock}
        <div class="tg-exec-output-wrap" id="ssOutputWrap">
          <pre class="tg-exec-output" id="ssOutput">${escHtml(this._scanOutput)}</pre>
        </div>
        ${this._bannerHtml()}
      </div>`;
  }

  _bannerHtml() {
    if (!this._scanResult) return '';
    const { total, critical, high } = this._scanResult;

    if (total === null) {
      return `
        <div class="tg-exec-banner tg-exec-banner--fail ss-banner">
          <span>Scan finished — couldn't recognize this tool's output format, review the log above</span>
          <div class="tg-exec-banner__actions">
            <button class="tg-btn tg-btn--sm tg-btn--danger" id="ssBtnCreateIssue">Create Issue</button>
            <button class="tg-btn tg-btn--sm" id="ssBtnDismiss">Dismiss</button>
          </div>
        </div>`;
    }

    if (total === 0) {
      return `
        <div class="tg-exec-banner tg-exec-banner--pass ss-banner">
          <span>✓ No vulnerabilities found</span>
          <div class="tg-exec-banner__actions">
            <button class="tg-btn tg-btn--sm" id="ssBtnCreateIssue">Create Issue</button>
            <button class="tg-btn tg-btn--sm" id="ssBtnDismiss">Dismiss</button>
          </div>
        </div>`;
    }
    const parts = [];
    if (critical) parts.push(`${critical} critical`);
    if (high)     parts.push(`${high} high`);
    const rest = total - critical - high;
    if (rest > 0) parts.push(`${rest} other`);
    return `
      <div class="tg-exec-banner tg-exec-banner--fail ss-banner">
        <span>${total} vulnerabilit${total !== 1 ? 'ies' : 'y'} found${parts.length ? ` (${parts.join(', ')})` : ''}</span>
        <div class="tg-exec-banner__actions">
          <button class="tg-btn tg-btn--sm tg-btn--danger" id="ssBtnCreateIssue">Create Issue</button>
          <button class="tg-btn tg-btn--sm" id="ssBtnDismiss">Dismiss</button>
        </div>
      </div>`;
  }

  // ─── Events ──────────────────────────────────────────────────────

  _bindEvents() {
    const $ = id => this.container.querySelector(id);

    $('#ssBtnBack')?.addEventListener('click', () =>
      this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#ssSidebar')?.addEventListener('click', e => {
      const item = e.target.closest('.tg-layer-item');
      if (!item || item.classList.contains('tg-layer-item--disabled')) return;
      this._selectLayer(this._layers.find(l => l.id === +item.dataset.layerId));
    });

    this._bindScanEvents();
  }

  _bindScanEvents() {
    const $ = id => this.container.querySelector(id);

    $('#ssCmdSel')?.addEventListener('change', e => {
      this._scanCmd = this._scanCommands.find(c => c.id === e.target.value) ?? null;
    });

    $('#ssBtnRun')?.addEventListener('click', () => {
      const cmd = this._scanCmd?.cmd ?? this._scanCommands[0]?.cmd;
      if (cmd) this._startScan(cmd);
    });

    $('#ssBtnStop')?.addEventListener('click', () => this._stopScan());

    $('#ssManualInput')?.addEventListener('input', e => {
      this._manualCmd = e.target.value;
      const btn = this.container.querySelector('#ssBtnRunManual');
      if (btn) btn.disabled = !this._manualCmd.trim() || this._scanRunning;
    });
    $('#ssBtnRunManual')?.addEventListener('click', () => {
      if (this._manualCmd.trim()) this._startScan(this._manualCmd.trim());
    });
    $('#ssBtnStopManual')?.addEventListener('click', () => this._stopScan());

    this._bindBannerEvents(this.container);
  }

  // Banner (pass/fail/unknown) is inserted piecemeal via insertAdjacentHTML
  // in _scanDone rather than through a full _rerenderMain(), so its buttons
  // need their own binding call — _bindScanEvents() alone only covers the
  // buttons present at initial render.
  _bindBannerEvents(root) {
    root.querySelector('#ssBtnCreateIssue')?.addEventListener('click', () => this._createIssue());
    root.querySelector('#ssBtnDismiss')?.addEventListener('click', () => {
      this._scanResult = null;
      this.container.querySelector('.ss-banner')?.remove();
    });
  }

  // ─── Layer selection ─────────────────────────────────────────────

  async _selectLayer(layer) {
    if (!layer) return;
    this._activeLayer   = layer;
    this._scanCommands  = [];
    this._scanCmd       = null;
    this._scanOutput    = '';
    this._scanDisplayBuf = '';
    this._scanResult    = null;
    this._rerenderSidebar();
    this._rerenderMain();
    await this._detectTools();
  }

  async _detectTools() {
    if (!this._activeLayer?.folder_path) return;
    this._scanDetecting = true;
    this._rerenderMain();

    try {
      const cmds = await window.db.securityScanner.detect(this._activeLayer.folder_path);
      this._scanCommands  = cmds ?? [];
      this._scanCmd       = this._scanCommands[0] ?? null;
    } catch {
      this._scanCommands = [];
    } finally {
      this._scanDetecting = false;
      this._rerenderMain();
    }
  }

  // ─── Scan execution ──────────────────────────────────────────────

  _startScan(command) {
    this._scanOutput = '';
    this._scanDisplayBuf = '';
    this._scanResult = null;
    this._scanRunning = true;
    this._rerenderMain();
    this._startElapsedTimer();

    const out  = this.container.querySelector('#ssOutput');
    const wrap = this.container.querySelector('#ssOutputWrap');
    if (out)  out.textContent = '';

    window.db.securityScanner.removeListeners();
    window.db.securityScanner.onData(({ text }) => this._appendOutput(text));
    window.db.securityScanner.onDone(({ exitCode }) => this._scanDone(exitCode));
    window.db.securityScanner.run({ command, cwd: this._activeLayer.folder_path });
  }

  _stopScan() {
    window.db.securityScanner.kill();
    window.db.securityScanner.removeListeners();
    this._scanRunning = false;
    this._clearElapsedTimer();
    this._rerenderMain();
  }

  _startElapsedTimer() {
    this._clearElapsedTimer();
    this._scanStartTime = Date.now();
    this._scanElapsedTimer = setInterval(() => {
      const el = this.container.querySelector('#ssElapsed');
      if (!el) return;
      const secs = Math.floor((Date.now() - this._scanStartTime) / 1000);
      el.textContent = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
    }, 1000);
  }

  _clearElapsedTimer() {
    if (this._scanElapsedTimer) { clearInterval(this._scanElapsedTimer); this._scanElapsedTimer = null; }
    this._scanStartTime = null;
  }

  _appendOutput(text) {
    const clean = stripAnsi(text);
    this._scanOutput += clean;
    this._scanDisplayBuf = (this._scanDisplayBuf || '') + clean;

    const out  = this.container.querySelector('#ssOutput');
    const wrap = this.container.querySelector('#ssOutputWrap');
    // Defensive: some tools still emit \r-based line redraws (progress ticks)
    // even when non-interactive — collapse those to their final frame instead
    // of dumping every intermediate one into the pane.
    if (out)  out.textContent = collapseCarriageReturns(this._scanDisplayBuf);
    if (wrap) wrap.scrollTop  = wrap.scrollHeight;
  }

  _scanDone(exitCode) {
    window.db.securityScanner.removeListeners();
    this._scanRunning = false;
    this._clearElapsedTimer();
    this._scanResult  = this._parseResult(this._scanOutput, exitCode)
      ?? { total: null, critical: 0, high: 0, medium: 0, low: 0 };

    const section = this.container.querySelector('#ssScanSection');
    if (section) {
      section.querySelector('.ss-banner')?.remove();
      section.insertAdjacentHTML('beforeend', this._bannerHtml());
      this._bindBannerEvents(section);
    }

    const runBtn  = this.container.querySelector('#ssBtnRun');
    const stopBtn = this.container.querySelector('#ssBtnStop');
    if (runBtn)  runBtn.disabled = false;
    if (stopBtn) stopBtn.hidden  = true;
    this.container.querySelector('#ssRunning')?.remove();

    window.db.securityScanHistory?.create({
      project_id: this._projectId,
      layer_id:   this._activeLayer?.id ?? null,
      tool:       this._scanCmd?.tool ?? null,
      command:    this._scanCmd?.cmd ?? this._manualCmd,
      critical:   this._scanResult?.critical ?? null,
      high:       this._scanResult?.high ?? null,
      medium:     this._scanResult?.medium ?? null,
      low:        this._scanResult?.low ?? null,
      total:      this._scanResult?.total ?? null,
      exit_code:  exitCode,
    }).catch(() => {});
  }

  // ─── Result parsing ───────────────────────────────────────────────

  _parseResult(output, exitCode) {
    // npm audit JSON mode: look for summary line
    // "found N vulnerabilities (X critical, Y high, Z moderate, W low)"
    const npmMatch = output.match(/found\s+(\d+)\s+vulnerabilit(?:y|ies)/i);
    if (npmMatch) {
      const total    = parseInt(npmMatch[1], 10);
      const critical = parseInt((output.match(/(\d+)\s+critical/i)  || [])[1] ?? '0', 10);
      const high     = parseInt((output.match(/(\d+)\s+high/i)      || [])[1] ?? '0', 10);
      const medium   = parseInt((output.match(/(\d+)\s+(?:moderate|medium)/i) || [])[1] ?? '0', 10);
      const low      = parseInt((output.match(/(\d+)\s+low/i)       || [])[1] ?? '0', 10);
      return { total, critical, high, medium, low };
    }

    // pip-audit / safety: "Found N known vulnerabilities"
    const pipMatch = output.match(/Found\s+(\d+)\s+known\s+vulnerabilit/i);
    if (pipMatch) {
      return { total: parseInt(pipMatch[1], 10), critical: 0, high: 0, medium: 0, low: 0 };
    }

    // govulncheck: "Vulnerability #N:"
    const goVulns = (output.match(/Vulnerability\s+#\d+:/gi) || []).length;
    if (output.includes('No vulnerabilities found')) return { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    if (goVulns > 0) return { total: goVulns, critical: 0, high: goVulns, medium: 0, low: 0 };

    // bandit: "Issue: [Bxxx" lines
    const banditIssues = (output.match(/Issue: \[B\d+/g) || []).length;
    if (banditIssues > 0) {
      const high   = (output.match(/Severity: High/gi)   || []).length;
      const medium = (output.match(/Severity: Medium/gi) || []).length;
      const low    = (output.match(/Severity: Low/gi)    || []).length;
      return { total: banditIssues, critical: 0, high, medium, low };
    }

    // bundle audit
    const bundleInsecure = (output.match(/Insecure Source/gi) || []).length +
                           (output.match(/Unpatched versions/gi) || []).length;
    if (output.includes('No vulnerabilities found') || output.match(/0 vulnerabilities found/i)) {
      return { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    }
    if (bundleInsecure > 0) return { total: bundleInsecure, critical: 0, high: bundleInsecure, medium: 0, low: 0 };

    // dotnet: "has the following vulnerable packages"
    const dotnetVulns = (output.match(/Top-level Package.*Vulnerable/gi) || []).length;
    if (dotnetVulns > 0) return { total: dotnetVulns, critical: 0, high: dotnetVulns, medium: 0, low: 0 };

    // Generic: clean exit = no vulns, non-zero = unknown vulns
    if (exitCode === 0) return { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    return null;
  }

  // ─── Issue creation ───────────────────────────────────────────────

  async _createIssue() {
    const r = this._scanResult;
    if (!r) return;
    const unknown = r.total === null;
    const title = unknown
      ? 'Security scan: needs review (unrecognized output format)'
      : `Security scan: ${r.total} vulnerabilit${r.total !== 1 ? 'ies' : 'y'} found`;
    const parts = [];
    if (r.critical) parts.push(`${r.critical} critical`);
    if (r.high)     parts.push(`${r.high} high`);
    if (r.medium)   parts.push(`${r.medium} medium`);
    if (r.low)      parts.push(`${r.low} low`);
    const desc = [
      parts.length ? `Severity breakdown: ${parts.join(', ')}.` : '',
      `Tool: ${this._scanCmd?.tool ?? 'manual'}`,
      `Command: \`${this._scanCmd?.cmd ?? this._manualCmd}\``,
      '',
      '```',
      this._scanOutput.slice(0, 3000),
      '```',
    ].filter(Boolean).join('\n');

    try {
      await window.db.issues.create({
        project_id:  this._projectId,
        layer_id:    this._activeLayer?.id ?? null,
        title,
        description: desc,
        severity:    unknown ? 'medium' : (r.critical > 0 ? 'critical' : r.high > 0 ? 'high' : 'medium'),
        type:        'security',
      });
      window.showToast?.('Issue created.');
    } catch {
      window.showToast?.('Failed to create issue.');
    }
  }

  // ─── Re-render helpers ────────────────────────────────────────────

  _rerenderSidebar() {
    const el = this.container.querySelector('#ssSidebar');
    if (el) el.innerHTML = this._sidebarHtml();
  }

  _rerenderMain() {
    const el = this.container.querySelector('#ssMain');
    if (el) {
      el.innerHTML = this._mainHtml();
      this._bindScanEvents();
      if (this._scanOutput) {
        const out = el.querySelector('#ssOutput');
        if (out) out.textContent = this._scanOutput;
      }
    }
  }
}
