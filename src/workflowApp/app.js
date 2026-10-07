'use strict';

// ── State ─────────────────────────────────────────────────────
let activities = [];
let activityCounter = 0;

// ── DOM refs ──────────────────────────────────────────────────
const wfIdField        = document.getElementById('wfId');
const activitiesList   = document.getElementById('activitiesList');
const emptyHint        = document.getElementById('emptyActivities');
const addActivityBtn   = document.getElementById('addActivityBtn');
const exportBtn        = document.getElementById('exportBtn');
const importInput      = document.getElementById('importInput');
const toast            = document.getElementById('toast');

// ── Init ──────────────────────────────────────────────────────
wfIdField.value = generateId();

addActivityBtn.addEventListener('click', () => addActivity());
exportBtn.addEventListener('click', exportWorkflow);
importInput.addEventListener('change', handleImport);

// ── ID generator ─────────────────────────────────────────────
function generateId() {
  return 'WF-' + Date.now().toString(36).toUpperCase();
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = 'toast ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

// ── Activity management ───────────────────────────────────────
function addActivity(data = {}) {
  activityCounter++;
  const id = 'act-' + activityCounter;
  const activity = {
    id,
    seq: activityCounter,
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
  const el = document.getElementById(id);
  if (el) el.remove();
  renumberActivities();
  updateEmptyHint();
}

function renumberActivities() {
  activities.forEach((a, i) => {
    a.seq = i + 1;
    const seqEl = document.querySelector(`#${a.id} .activity-seq`);
    if (seqEl) seqEl.textContent = a.seq;
  });
}

function updateEmptyHint() {
  emptyHint.style.display = activities.length === 0 ? 'block' : 'none';
}

function syncActivityField(id, field, value) {
  const activity = activities.find(a => a.id === id);
  if (activity) activity[field] = value;

  if (field === 'name') {
    const preview = document.querySelector(`#${id} .activity-name-preview`);
    if (preview) preview.textContent = value || '(unnamed activity)';
  }

  if (field === 'type') {
    const badge = document.querySelector(`#${id} .type-badge`);
    if (badge) {
      badge.textContent = value;
      badge.className = `type-badge type-${value}`;
    }
    const timeoutRow = document.querySelector(`#${id} .timeout-row`);
    if (timeoutRow) {
      timeoutRow.style.display = value === 'approval' ? '' : 'none';
    }
  }
}

function renderActivity(activity) {
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.id = activity.id;

  item.innerHTML = `
    <div class="activity-header">
      <span class="activity-seq">${activity.seq}</span>
      <span class="activity-name-preview">${activity.name || '(unnamed activity)'}</span>
      <span class="type-badge type-${activity.type}">${activity.type}</span>
      <button type="button" class="btn btn-danger remove-btn" data-id="${activity.id}">Remove</button>
    </div>
    <div class="activity-grid">
      <div class="field">
        <label>Activity Name <span class="required">*</span></label>
        <input type="text" class="act-name" placeholder="e.g. Manager Approval" value="${escHtml(activity.name)}" />
      </div>
      <div class="field">
        <label>Type</label>
        <select class="act-type">
          <option value="approval"     ${activity.type === 'approval'     ? 'selected' : ''}>Approval</option>
          <option value="task"         ${activity.type === 'task'         ? 'selected' : ''}>Task</option>
          <option value="notification" ${activity.type === 'notification' ? 'selected' : ''}>Notification</option>
        </select>
      </div>
      <div class="field">
        <label>Assignee / Approver</label>
        <input type="text" class="act-assignee" placeholder="e.g. manager@company.com" value="${escHtml(activity.assignee)}" />
      </div>
      <div class="field timeout-row" style="${activity.type !== 'approval' ? 'display:none' : ''}">
        <label>Timeout (days)</label>
        <input type="text" class="act-timeout" placeholder="e.g. 3" value="${escHtml(activity.timeout)}" />
      </div>
      <div class="field activity-field-full">
        <label>Description</label>
        <input type="text" class="act-desc" placeholder="Describe what this activity does..." value="${escHtml(activity.description)}" />
      </div>
    </div>
  `;

  // Wire events
  item.querySelector('.remove-btn').addEventListener('click', () => removeActivity(activity.id));
  item.querySelector('.act-name').addEventListener('input', e => syncActivityField(activity.id, 'name', e.target.value));
  item.querySelector('.act-type').addEventListener('change', e => syncActivityField(activity.id, 'type', e.target.value));
  item.querySelector('.act-assignee').addEventListener('input', e => syncActivityField(activity.id, 'assignee', e.target.value));
  item.querySelector('.act-timeout').addEventListener('input', e => syncActivityField(activity.id, 'timeout', e.target.value));
  item.querySelector('.act-desc').addEventListener('input', e => syncActivityField(activity.id, 'description', e.target.value));

  activitiesList.appendChild(item);
}

// ── Read form values ──────────────────────────────────────────
function readForm() {
  return {
    id:           document.getElementById('wfId').value.trim(),
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
  if (!meta.name) { showToast('Workflow Name is required.', 'error'); return false; }
  if (!meta.businessUnit) { showToast('Business Unit is required.', 'error'); return false; }
  return true;
}

// ── XML Export ────────────────────────────────────────────────
function exportWorkflow() {
  const meta = readForm();
  if (!validateForm(meta)) return;

  const xml = buildXml(meta, activities);
  const blob = new Blob([xml], { type: 'application/xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = sanitizeFilename(meta.name) + '.xml';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Workflow exported successfully.', 'success');
}

function buildXml(meta, acts) {
  const indent = (n) => '  '.repeat(n);

  const actLines = acts.map(a => [
    `${indent(2)}<Activity id="${escAttr(a.id)}" sequence="${a.seq}" type="${escAttr(a.type)}">`,
    `${indent(3)}<Name>${escText(a.name)}</Name>`,
    `${indent(3)}<Assignee>${escText(a.assignee)}</Assignee>`,
    a.type === 'approval' && a.timeout
      ? `${indent(3)}<TimeoutDays>${escText(a.timeout)}</TimeoutDays>`
      : null,
    a.description
      ? `${indent(3)}<Description>${escText(a.description)}</Description>`
      : null,
    `${indent(2)}</Activity>`,
  ].filter(Boolean).join('\n')).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Workflow xmlns="urn:ibm:iam:workflow" version="1.0">`,
    `${indent(1)}<Metadata>`,
    `${indent(2)}<Id>${escText(meta.id)}</Id>`,
    `${indent(2)}<Name>${escText(meta.name)}</Name>`,
    `${indent(2)}<BusinessUnit>${escText(meta.businessUnit)}</BusinessUnit>`,
    `${indent(2)}<Priority>${escText(meta.priority)}</Priority>`,
    `${indent(2)}<Description>${escText(meta.description)}</Description>`,
    `${indent(2)}<Owner>${escText(meta.owner)}</Owner>`,
    `${indent(2)}<Version>${escText(meta.version)}</Version>`,
    `${indent(2)}<CreatedDate>${escText(meta.createdDate)}</CreatedDate>`,
    `${indent(1)}</Metadata>`,
    `${indent(1)}<Activities count="${acts.length}">`,
    actLines,
    `${indent(1)}</Activities>`,
    `</Workflow>`,
  ].join('\n');
}

// ── XML Import ────────────────────────────────────────────────
function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  importInput.value = '';

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      parseAndLoad(evt.target.result);
      showToast('Workflow imported successfully.', 'success');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function parseAndLoad(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid XML file.');

  const get = (parent, tag) => {
    const el = parent.querySelector(tag);
    return el ? el.textContent.trim() : '';
  };

  const meta = doc.querySelector('Metadata');
  if (!meta) throw new Error('Missing <Metadata> element.');

  document.getElementById('wfId').value           = get(meta, 'Id') || generateId();
  document.getElementById('wfName').value          = get(meta, 'Name');
  document.getElementById('wfBusinessUnit').value  = get(meta, 'BusinessUnit');
  document.getElementById('wfDescription').value   = get(meta, 'Description');
  document.getElementById('wfOwner').value         = get(meta, 'Owner');
  document.getElementById('wfVersion').value       = get(meta, 'Version');

  const priority = get(meta, 'Priority');
  const prioritySel = document.getElementById('wfPriority');
  if (priority) prioritySel.value = priority;

  // Clear existing activities
  activities = [];
  activityCounter = 0;
  activitiesList.innerHTML = '';

  // Load activities
  const actEls = doc.querySelectorAll('Activities > Activity');
  actEls.forEach(el => {
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

// ── Helpers ───────────────────────────────────────────────────
function escText(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s)  { return escText(s).replace(/"/g,'&quot;'); }
function escHtml(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function sanitizeFilename(s) { return s.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase() || 'workflow'; }

// ── Initial state ─────────────────────────────────────────────
updateEmptyHint();
