'use strict';

const loadingState = document.getElementById('loadingState');
const errorState   = document.getElementById('errorState');
const emptyState   = document.getElementById('emptyState');
const wfTable      = document.getElementById('wfTable');
const wfTableBody  = document.getElementById('wfTableBody');

async function loadWorkflows() {
  try {
    const res = await fetch('/api/workflows');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    render(list);
  } catch {
    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
  }
}

function render(list) {
  loadingState.classList.add('hidden');

  if (list.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  wfTable.classList.remove('hidden');
  wfTableBody.innerHTML = '';

  list.forEach(wf => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${esc(wf.name || wf.filename)}</strong>
        <br><span class="muted">${esc(wf.id)}</span>
      </td>
      <td>${esc(wf.businessUnit)}</td>
      <td><span class="priority-badge priority-${esc(wf.priority || 'normal')}">${esc(wf.priority || '—')}</span></td>
      <td>${esc(wf.owner)}</td>
      <td>${esc(wf.version)}</td>
      <td>${esc(wf.createdDate)}</td>
      <td class="actions-cell">
        <a href="workflow.html?id=${encodeURIComponent(wf.id)}" class="btn btn-sm btn-secondary">Edit</a>
      </td>
    `;
    wfTableBody.appendChild(tr);
  });
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

loadWorkflows();
