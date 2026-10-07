'use strict';

// ── State ─────────────────────────────────────────────────────
let activities      = [];
let activityCounter = 0;
let originalXml     = null;   // null = new workflow; string = loaded/imported

const params = new URLSearchParams(window.location.search);
const editId = params.get('id');   // null when creating a new workflow

// ── DOM refs ──────────────────────────────────────────────────
const pageTitle      = document.getElementById('pageTitle');
const wfIdField      = document.getElementById('wfId');
const activitiesList = document.getElementById('activitiesList');
const emptyHint      = document.getElementById('emptyActivities');
const addActivityBtn = document.getElementById('addActivityBtn');
const saveBtn        = document.getElementById('saveBtn');
const cancelBtn      = document.getElementById('cancelBtn');
const exportBtn      = document.getElementById('exportBtn');
const importInput    = document.getElementById('importInput');
const toast          = document.getElementById('toast');

// ── Init ──────────────────────────────────────────────────────
addActivityBtn.addEventListener('click', () => addActivity());
saveBtn.addEventListener('click', handleSave);
cancelBtn.addEventListener('click', handleCancel);
exportBtn.addEventListener('click', handleExport);
importInput.addEventListener('change', handleImport);

if (editId) {
  pageTitle.textContent = 'Edit Workflow';
  loadFromServer(editId);
} else {
  pageTitle.textContent = 'New Workflow';
  wfIdField.value = generateId();
  updateEmptyHint();
}

// ── Load workflow from server ─────────────────────────────────
async function loadFromServer(id) {
  try {
    const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    parseAndLoad(xml);
    originalXml = xml;
    pageTitle.textContent = document.getElementById('wfName').value || 'Edit Workflow';
  } catch {
    showToast('Could not load workflow from server.', 'error');
  }
}

// ── Save ──────────────────────────────────────────────────────
async function handleSave() {
  const meta = readForm();
  if (!validateForm(meta)) return;
  const xml = buildXml(meta, activities);

  try {
    const res = await fetch('/api/workflows', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: meta.id, xml }),
    });
    if (!res.ok) throw new Error();
    originalXml = xml;
    showToast(`Saved to workflows/${meta.id}.xml`, 'success');
  } catch {
    showToast('Save failed. Is server.py running?', 'error');
  }
}

// ── Cancel ────────────────────────────────────────────────────
function handleCancel() {
  if (originalXml !== null) {
    // Revert to last loaded/imported/saved state
    parseAndLoad(originalXml);
    showToast('Changes reverted.', 'success');
  } else {
    // New workflow — clear the form
    clearForm();
    showToast('Form cleared.', 'success');
  }
}

// ── Export ────────────────────────────────────────────────────
async function handleExport() {
  const meta = readForm();
  if (!validateForm(meta)) return;
  const xml = buildXml(meta, activities);

  // 1 — save to exports/ folder
  try {
    await fetch('/api/exports', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: meta.id, xml }),
    });
  } catch { /* server may not be running — still offer download */ }

  // 2 — download to local
  const blob = new Blob([xml], { type: 'application/xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = sanitizeFilename(meta.name) + '.xml';
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported to exports/${meta.id}.xml — download started.`, 'success');
}

// ── Import ────────────────────────────────────────────────────
async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  importInput.value = '';

  let xml;
  try {
    xml = await file.text();
  } catch {
    showToast('Could not read file.', 'error');
    return;
  }

  // 1 — save to imports/ folder
  try {
    await fetch('/api/imports', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ filename: file.name, xml }),
    });
  } catch { /* non-fatal if server is not running */ }

  // 2 — load into form
  try {
    parseAndLoad(xml);
    originalXml = xml;
    showToast('Imported into form. Review and click Save to add to workflows.', 'success');
  } catch (err) {
    showToast('Import failed: ' + err.message, 'error');
  }
}

// ── Form helpers ──────────────────────────────────────────────
function readForm() {
  return {
    id:           wfIdField.value.trim(),
    name:         document.getElementById('wfName').value.trim(),
    businessUnit: document.getElementById('wfBusinessUnit').value.trim(),
    priority:     document.getElementById('wfPriority').value,
    description:  document.getElementById('wfDescription').value.trim(),
    owner:        document.getElementById('wfOwner').value.trim(),
    version:      document.getElementById('wfVersion').value.trim() || '1.0',
    createdDate:  new Date().toISOString().slice(0, 10),
  };
}

function validateForm(meta) {
  if (!meta.name)         { showToast('Workflow Name is required.', 'error');  return false; }
  if (!meta.businessUnit) { showToast('Business Unit is required.', 'error'); return false; }
  return true;
}

function clearForm() {
  document.getElementById('wfName').value         = '';
  document.getElementById('wfBusinessUnit').value = '';
  document.getElementById('wfDescription').value  = '';
  document.getElementById('wfOwner').value         = '';
  document.getElementById('wfVersion').value       = '';
  document.getElementById('wfPriority').value      = 'normal';
  wfIdField.value = generateId();

  activities      = [];
  activityCounter = 0;
  activitiesList.innerHTML = '';
  updateEmptyHint();
  originalXml = null;
}

// ── Parse XML → populate form ─────────────────────────────────
function parseAndLoad(xmlText) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xmlText, 'application/xml');

  if (doc.querySelector('parsererror')) throw new Error('Invalid XML.');

  const get = (parent, tag) => {
    const el = parent.querySelector(tag);
    return el ? el.textContent.trim() : '';
  };

  const meta = doc.querySelector('Metadata');
  if (!meta) throw new Error('Missing <Metadata> element.');

  wfIdField.value                                      = get(meta, 'Id') || generateId();
  document.getElementById('wfName').value          = get(meta, 'Name');
  document.getElementById('wfBusinessUnit').value  = get(meta, 'BusinessUnit');
  document.getElementById('wfDescription').value   = get(meta, 'Description');
  document.getElementById('wfOwner').value         = get(meta, 'Owner');
  document.getElementById('wfVersion').value       = get(meta, 'Version');

  const priority = get(meta, 'Priority');
  if (priority) document.getElementById('wfPriority').value = priority;

  activities      = [];
  activityCounter = 0;
  activitiesList.innerHTML = '';

  doc.querySelectorAll('Activities > Activity').forEach(el => {
    addActivity({
      name:        get(el, 'Name'),
      type:        el.getAttribute('type') || 'approval',
      assignee:    get(el, 'Assignee'),
      timeout:     get(el, 'TimeoutDays'),
      description: get(el, 'Description'),
    });
  });

  updateEmptyHint();
}

// ── Activities ────────────────────────────────────────────────
function addActivity(data = {}) {
  activityCounter++;
  const id = 'act-' + activityCounter;
  const activity = {
    id,
    seq:         activityCounter,
    name:        data.name        || '',
    type:        data.type        || 'approval',
    assignee:    data.assignee    || '',
    timeout:     data.timeout     || '',
    description: data.description || '',
  };
  activities.push(activity);
  renderActivity(activity);
  updateEmptyHint();
}

function removeActivity(id) {
  activities = activities.filter(a => a.id !== id);
  document.getElementById(id)?.remove();
  activities.forEach((a, i) => {
    a.seq = i + 1;
    const seqEl = document.querySelector(`#${a.id} .activity-seq`);
    if (seqEl) seqEl.textContent = a.seq;
  });
  updateEmptyHint();
}

function syncField(id, field, value) {
  const a = activities.find(x => x.id === id);
  if (a) a[field] = value;

  if (field === 'name') {
    const el = document.querySelector(`#${id} .activity-name-preview`);
    if (el) el.textContent = value || '(unnamed activity)';
  }
  if (field === 'type') {
    const badge = document.querySelector(`#${id} .type-badge`);
    if (badge) { badge.textContent = value; badge.className = `type-badge type-${value}`; }
    const row = document.querySelector(`#${id} .timeout-row`);
    if (row) row.style.display = value === 'approval' ? '' : 'none';
  }
}

function renderActivity(a) {
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.id = a.id;
  item.innerHTML = `
    <div class="activity-header">
      <span class="activity-seq">${a.seq}</span>
      <span class="activity-name-preview">${escHtml(a.name) || '(unnamed activity)'}</span>
      <span class="type-badge type-${a.type}">${a.type}</span>
      <button type="button" class="btn btn-danger remove-btn" data-id="${a.id}">Remove</button>
    </div>
    <div class="activity-grid">
      <div class="field">
        <label>Activity Name <span class="required">*</span></label>
        <input type="text" class="act-name" placeholder="e.g. Manager Approval" value="${escHtml(a.name)}" />
      </div>
      <div class="field">
        <label>Type</label>
        <select class="act-type">
          <option value="approval"     ${a.type === 'approval'     ? 'selected' : ''}>Approval</option>
          <option value="task"         ${a.type === 'task'         ? 'selected' : ''}>Task</option>
          <option value="notification" ${a.type === 'notification' ? 'selected' : ''}>Notification</option>
        </select>
      </div>
      <div class="field">
        <label>Assignee / Approver</label>
        <input type="text" class="act-assignee" placeholder="e.g. manager@company.com" value="${escHtml(a.assignee)}" />
      </div>
      <div class="field timeout-row" style="${a.type !== 'approval' ? 'display:none' : ''}">
        <label>Timeout (days)</label>
        <input type="text" class="act-timeout" placeholder="e.g. 3" value="${escHtml(a.timeout)}" />
      </div>
      <div class="field activity-field-full">
        <label>Description</label>
        <input type="text" class="act-desc" placeholder="Describe this activity…" value="${escHtml(a.description)}" />
      </div>
    </div>
  `;
  item.querySelector('.remove-btn').addEventListener('click', () => removeActivity(a.id));
  item.querySelector('.act-name').addEventListener('input',    e => syncField(a.id, 'name',        e.target.value));
  item.querySelector('.act-type').addEventListener('change',   e => syncField(a.id, 'type',        e.target.value));
  item.querySelector('.act-assignee').addEventListener('input',e => syncField(a.id, 'assignee',    e.target.value));
  item.querySelector('.act-timeout').addEventListener('input', e => syncField(a.id, 'timeout',     e.target.value));
  item.querySelector('.act-desc').addEventListener('input',    e => syncField(a.id, 'description', e.target.value));
  activitiesList.appendChild(item);
}

function updateEmptyHint() {
  emptyHint.style.display = activities.length === 0 ? '' : 'none';
}

// ── XML builder ───────────────────────────────────────────────
function buildXml(meta, acts) {
  const ind = n => '  '.repeat(n);
  const actLines = acts.map(a => [
    `${ind(2)}<Activity id="${escAttr(a.id)}" sequence="${a.seq}" type="${escAttr(a.type)}">`,
    `${ind(3)}<Name>${escText(a.name)}</Name>`,
    `${ind(3)}<Assignee>${escText(a.assignee)}</Assignee>`,
    a.type === 'approval' && a.timeout
      ? `${ind(3)}<TimeoutDays>${escText(a.timeout)}</TimeoutDays>` : null,
    a.description
      ? `${ind(3)}<Description>${escText(a.description)}</Description>` : null,
    `${ind(2)}</Activity>`,
  ].filter(Boolean).join('\n')).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Workflow xmlns="urn:ibm:iam:workflow" version="1.0">`,
    `${ind(1)}<Metadata>`,
    `${ind(2)}<Id>${escText(meta.id)}</Id>`,
    `${ind(2)}<Name>${escText(meta.name)}</Name>`,
    `${ind(2)}<BusinessUnit>${escText(meta.businessUnit)}</BusinessUnit>`,
    `${ind(2)}<Priority>${escText(meta.priority)}</Priority>`,
    `${ind(2)}<Description>${escText(meta.description)}</Description>`,
    `${ind(2)}<Owner>${escText(meta.owner)}</Owner>`,
    `${ind(2)}<Version>${escText(meta.version)}</Version>`,
    `${ind(2)}<CreatedDate>${escText(meta.createdDate)}</CreatedDate>`,
    `${ind(1)}</Metadata>`,
    `${ind(1)}<Activities count="${acts.length}">`,
    actLines,
    `${ind(1)}</Activities>`,
    `</Workflow>`,
  ].join('\n');
}

// ── Utilities ─────────────────────────────────────────────────
function generateId() { return 'WF-' + Date.now().toString(36).toUpperCase(); }
function sanitizeFilename(s) { return String(s).replace(/[^a-z0-9_\-]/gi, '_').toLowerCase() || 'workflow'; }
function escText(s)  { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s)  { return escText(s).replace(/"/g,'&quot;'); }
function escHtml(s)  { return escText(s).replace(/"/g,'&quot;'); }

let toastTimer = null;
function showToast(msg, type = 'success') {
  toast.textContent  = msg;
  toast.className    = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}
