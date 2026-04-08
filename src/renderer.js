'use strict';

const projectList   = document.getElementById('projectList');
const emptyState    = document.getElementById('emptyState');
const btnNewProject = document.getElementById('btnNewProject');
const modalOverlay  = document.getElementById('modalOverlay');
const btnModalClose = document.getElementById('btnModalClose');
const btnCancel     = document.getElementById('btnCancel');
const btnCreate     = document.getElementById('btnCreate');
const inputName     = document.getElementById('inputName');
const inputDesc     = document.getElementById('inputDesc');
const formError     = document.getElementById('formError');

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

// ----------------------------------------------------------------
// Render recent projects
// ----------------------------------------------------------------
async function loadRecent() {
  const projects = await window.db.projects.recent();

  // Remove existing cards (keep empty state node)
  [...projectList.querySelectorAll('.project-card')].forEach((el) => el.remove());

  if (projects.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  projects.forEach((p) => {
    const card = document.createElement('button');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card__icon">${initial(p.name)}</div>
      <div class="project-card__info">
        <div class="project-card__name">${escHtml(p.name)}</div>
        ${p.description ? `<div class="project-card__desc">${escHtml(p.description)}</div>` : ''}
      </div>
      <div class="project-card__meta">${timeAgo(p.last_opened_at)}</div>
    `;
    card.addEventListener('click', () => openProject(p.id));
    projectList.appendChild(card);
  });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function openProject(id) {
  await window.db.projects.open(id);
  // TODO: navigate to project view
  await loadRecent();
}

// ----------------------------------------------------------------
// Modal
// ----------------------------------------------------------------
function openModal() {
  inputName.value = '';
  inputDesc.value = '';
  formError.hidden = true;
  modalOverlay.hidden = false;
  inputName.focus();
}

function closeModal() {
  modalOverlay.hidden = true;
}

async function createProject() {
  const name = inputName.value.trim();
  if (!name) {
    formError.textContent = 'Project name is required.';
    formError.hidden = false;
    inputName.focus();
    return;
  }

  btnCreate.disabled = true;
  btnCreate.textContent = 'Creating…';

  try {
    const project = await window.db.projects.create({
      name,
      description: inputDesc.value.trim() || null,
    });
    await window.db.projects.open(project.id);
    closeModal();
    await loadRecent();
  } catch (err) {
    formError.textContent = err.message || 'Failed to create project.';
    formError.hidden = false;
  } finally {
    btnCreate.disabled = false;
    btnCreate.textContent = 'Create Project';
  }
}

// ----------------------------------------------------------------
// Event listeners
// ----------------------------------------------------------------
btnNewProject.addEventListener('click', openModal);
btnModalClose.addEventListener('click', closeModal);
btnCancel.addEventListener('click', closeModal);
btnCreate.addEventListener('click', createProject);

inputName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createProject();
});

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// ----------------------------------------------------------------
// Init
// ----------------------------------------------------------------
loadRecent();
