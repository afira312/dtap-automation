'use strict';

const loadingState = document.getElementById('loadingState');
const errorState   = document.getElementById('errorState');
const emptyState   = document.getElementById('emptyState');
const wfTable      = document.getElementById('wfTable');
const wfTableBody  = document.getElementById('wfTableBody');
const envBadge     = document.getElementById('envBadge');

async function loadEnv() {
  // Two instances of this app run side by side (dev and prod), so the header
  // has to say which one you are looking at.
  try {
    const res = await fetch('/api/info');
    const { env } = await res.json();
    envBadge.textContent = env;
  } catch {
    envBadge.textContent = 'OFFLINE';
  }
}

async function loadWorkflows() {
  try {
    const res = await fetch('/api/workflows');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  } catch {
    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
  }
}

function render(list) {
  loadingState.classList.add('hidden');

  // Toggle both states explicitly so the result does not depend on call order.
  const empty = list.length === 0;
  emptyState.classList.toggle('hidden', !empty);
  wfTable.classList.toggle('hidden', empty);
  if (empty) return;

  wfTableBody.innerHTML = '';

  list.forEach(wf => {
    // Workflows are addressed by filename — that is the artifact that moves
    // between environments, and it is what exists on disk.
    const ref = encodeURIComponent(wf.filename);
    const tr  = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${esc(wf.name || wf.filename)}</strong>
        <br><span class="muted">${esc(wf.id)}</span>
        <br><span class="muted mono">${esc(wf.filename)}</span>
      </td>
      <td>${esc(wf.businessUnit)}</td>
      <td><span class="priority-badge priority-${esc(wf.priority || 'normal')}">${esc(wf.priority || '—')}</span></td>
      <td>${esc(wf.owner)}</td>
      <td>${esc(wf.version)}</td>
      <td>${esc(wf.createdDate)}</td>
      <td class="actions-cell">
        <a href="workflow.html?file=${ref}&mode=view" class="btn btn-sm btn-ghost">View</a>
        <a href="workflow.html?file=${ref}" class="btn btn-sm btn-secondary">Edit</a>
      </td>
    `;
    wfTableBody.appendChild(tr);
  });
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

loadEnv();
loadWorkflows();
