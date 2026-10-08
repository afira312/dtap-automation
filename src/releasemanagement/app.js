'use strict';

const STORAGE_KEY = 'dtap-release-management-prototype-v1';
const stageSeed = [
  {
    id: 'dev', name: 'Development', short: 'DEV', kind: 'Current', purpose: 'Build and technical validation by the delivery team.', doText: 'Implement changes, run unit tests, and verify the build in an isolated development target.', avoidText: 'Do not use as a business acceptance environment or store production data.',
    entry: ['Change is merged to the approved integration branch', 'Automated build and unit checks pass', 'Release candidate and source commit are identified'],
    exit: ['Unit tests pass and results are attached', 'Developer smoke test passes', 'Known defects and exceptions are recorded'], evidence: ['Build URL and immutable artifact or commit ID', 'Unit-test report', 'Developer smoke-test result'], approver: 'Engineering lead'
  },
  {
    id: 'test', name: 'Test', short: 'TEST', kind: 'Proposed', purpose: 'Technical, integration, and system testing by the delivery team.', doText: 'Validate interfaces, integrations, deployment configuration, and non-functional technical behavior.', avoidText: 'No unreviewed changes between runs; no business sign-off is implied by a technical pass.',
    entry: ['Development exit gate is recorded as passed', 'The exact release artifact and commit are traceable', 'Test data and integration dependencies are available'],
    exit: ['Planned technical and integration tests pass', 'No open blocker or critical defects, or exception is approved', 'Test results and defect disposition are attached'], evidence: ['Automated test report and run link', 'Defect summary with severity and disposition', 'Environment/configuration notes'], approver: 'Test lead'
  },
  {
    id: 'qa', name: 'QA', short: 'QA', kind: 'Proposed', purpose: 'Independent quality validation and agreed business acceptance.', doText: 'Run regression and acceptance scenarios with QA and nominated business representatives.', avoidText: 'Do not introduce new feature changes during sign-off; defects return to the delivery team for correction.',
    entry: ['Test exit gate and defect disposition are approved', 'QA scenarios and acceptance expectations are agreed', 'Candidate is deployed from the same identified artifact'],
    exit: ['Regression and agreed acceptance scenarios pass', 'No unresolved release-blocking defects remain', 'QA and business acceptance are recorded'], evidence: ['Signed QA/regression results', 'Business acceptance record', 'Open-defect and exception list'], approver: 'QA lead / business owner'
  },
  {
    id: 'preprod', name: 'Pre-Prod', short: 'PRE-PROD', kind: 'Proposed', purpose: 'Production-like rehearsal, operational readiness, and final change approval.', doText: 'Validate deployment and rollback procedures, monitoring, access, and operational runbooks in production-like conditions.', avoidText: 'No unapproved data, configuration, or code changes after final rehearsal.',
    entry: ['QA and business acceptance are recorded', 'Change record, implementation plan, and rollback plan are ready', 'Production-like configuration and support coverage are confirmed'],
    exit: ['Deployment rehearsal and rollback check pass', 'Monitoring, support contacts, and runbook are verified', 'Change approvers authorize the production window'], evidence: ['Rehearsal and rollback results', 'Approved change record and runbook', 'Support rota and monitoring checklist'], approver: 'Change manager / service owner'
  },
  {
    id: 'prod', name: 'Production', short: 'PROD', kind: 'Current', purpose: 'Controlled production change, verification, and service handover.', doText: 'Deploy only the approved immutable artifact during the authorized window, verify service health, and communicate status.', avoidText: 'No rebuild, artifact substitution, or out-of-window change without renewed approval.',
    entry: ['Pre-production exit gate and change approval are recorded', 'Artifact identity matches the approved candidate', 'Business, technical, and rollback support are available'],
    exit: ['Post-deployment health checks pass', 'Business/service owner accepts the release or rollback is initiated', 'Outcome, incidents, and follow-up actions are recorded'], evidence: ['Deployment run and artifact identity', 'Health-check/monitoring evidence', 'Release announcement and handover record'], approver: 'Production change approver'
  }
];

function freshState() {
  const stages = Object.fromEntries(stageSeed.map(stage => [stage.id, {
    entryChecks: stage.entry.map(() => false), exitChecks: stage.exit.map(() => false), evidenceText: '', approverName: '', approvalRecorded: false, completed: false
  }]));
  return {
    view: 'overview', selectedStage: 'dev', policyStage: 'dev',
    release: { name: 'Release candidate', version: 'RC-001', commit: '', owner: '' },
    stages,
    policy: {
      stages: Object.fromEntries(stageSeed.map(stage => [stage.id, { purpose: stage.purpose, doText: stage.doText, avoidText: stage.avoidText, entry: stage.entry.slice(), exit: stage.exit.slice(), evidence: stage.evidence.slice(), approver: stage.approver }])),
      roles: [
        { role: 'Release coordination', owner: '', support: 'Maintain release calendar, consolidate readiness, coordinate approvals and communications.' },
        { role: 'IBM delivery / platform', owner: '', support: 'Confirm product/platform support boundaries, deployment constraints, operational contacts, and technical escalation path.' },
        { role: 'KAD', owner: '', support: 'Confirm client-side decision makers, business acceptance, environment access, change windows, and required support coverage.' },
        { role: 'Application / QA team', owner: '', support: 'Own test evidence, defect triage, acceptance scenarios, and implementation/rollback plans.' }
      ]
    },
    comms: Object.fromEntries(stageSeed.map(stage => [stage.id, {
      audience: stage.id === 'prod' ? 'Project team, service owner, support, business stakeholders' : 'Project team, QA, release coordination',
      subject: `Release ${stage.short}: {{release}}`,
      body: `Release: {{release}}\nVersion: {{version}}\nStage: ${stage.name}\nStatus: Readiness review in progress\nEvidence: {{evidence}}\nNext step: Review the release gate and confirm the named approver.\n\nNo deployment is initiated by this prototype.`,
      prepared: false
    }]))
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.release && saved.stages && saved.policy && saved.comms) return mergeState(freshState(), saved);
  } catch (error) { console.warn('Could not read saved release prototype state.', error); }
  return freshState();
}

function mergeState(base, saved) {
  return {
    ...base, ...saved,
    release: { ...base.release, ...saved.release },
    stages: Object.fromEntries(stageSeed.map(stage => [stage.id, { ...base.stages[stage.id], ...(saved.stages[stage.id] || {}) }])),
    policy: { ...base.policy, ...saved.policy, stages: Object.fromEntries(stageSeed.map(stage => [stage.id, { ...base.policy.stages[stage.id], ...((saved.policy.stages || {})[stage.id] || {}) }])), roles: saved.policy.roles || base.policy.roles },
    comms: Object.fromEntries(stageSeed.map(stage => [stage.id, { ...base.comms[stage.id], ...((saved.comms || {})[stage.id] || {}) }]))
  };
}

let state = loadState();
const viewRoot = document.getElementById('viewRoot');
const saveStateLabel = document.getElementById('saveState');
let deploymentManifest = null;
let deploymentManifestAvailable = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function save(render = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveStateLabel.textContent = 'Saved in this browser';
  if (render) renderApp();
}

function stageById(id) { return stageSeed.find(stage => stage.id === id) || stageSeed[0]; }
function stagePolicy(id) { return state.policy.stages[id]; }
function stageProgress(id) {
  const stage = stageById(id), progress = state.stages[id];
  const count = stagePolicy(id).entry.length + stagePolicy(id).exit.length;
  const done = progress.entryChecks.slice(0, stagePolicy(id).entry.length).filter(Boolean).length + progress.exitChecks.slice(0, stagePolicy(id).exit.length).filter(Boolean).length;
  return { done, count, percent: count ? Math.round(done / count * 100) : 0 };
}
function isReady(id) {
  const policy = stagePolicy(id), progress = state.stages[id];
  const entryComplete = policy.entry.length > 0 && policy.entry.every((_, index) => progress.entryChecks[index]);
  const exitComplete = policy.exit.length > 0 && policy.exit.every((_, index) => progress.exitChecks[index]);
  const inSequence = stageSeed.findIndex(stage => stage.id === id) === currentStageIndex();
  return inSequence && !progress.completed && entryComplete && exitComplete && Boolean(progress.approverName.trim()) && progress.approvalRecorded;
}
function currentStageIndex() { return stageSeed.findIndex(stage => !state.stages[stage.id].completed); }
function stageStateLabel(id) {
  const index = stageSeed.findIndex(stage => stage.id === id), current = currentStageIndex();
  if (state.stages[id].completed) return 'Gate passed (local)';
  if (index === current) return 'Gate in review';
  return index < current ? 'Pending record' : 'Not started';
}

function deploymentStageId() {
  return deploymentManifest && stageSeed.some(stage => stage.id === deploymentManifest.environment_code && stage.kind === 'Current')
    ? deploymentManifest.environment_code
    : null;
}

function deploymentRunLink(label = 'Open Actions run ↗') {
  try {
    const runUrl = new URL(deploymentManifest.workflow_run_url);
    if (runUrl.protocol === 'https:') return `<a href="${esc(runUrl.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  } catch { return ''; }
  return '';
}

function renderDeploymentSignal() {
  if (!deploymentManifestAvailable) {
    return `<section class="deployment-signal unavailable"><div class="deployment-signal-mark">?</div><div class="deployment-signal-copy"><strong>No deployed build identity found</strong><span>This local preview has no pipeline manifest. After a GitHub Actions deployment, this panel will identify the environment and build run.</span></div><span class="deployment-state">LOCAL PREVIEW</span></section>`;
  }
  const stage = stageById(deploymentManifest.environment_code);
  const commit = String(deploymentManifest.commit_sha || 'Unknown commit');
  const runLink = deploymentRunLink('Open Actions run ↗');
  return `<section class="deployment-signal"><div class="deployment-signal-mark">${esc(stage.short)}</div><div class="deployment-signal-copy"><strong>Currently served build · ${esc(deploymentManifest.environment || stage.name)}</strong><span>${esc(deploymentManifest.package_name || 'Package not recorded')} · commit <code>${esc(commit.slice(0, 12))}</code> · ref ${esc(deploymentManifest.ref || 'unknown')}</span></div><div class="deployment-signal-link">${runLink}<span class="deployment-state">IDENTITY EMBEDDED AT BUILD</span></div></section>`;
}

function heading(eyebrow, title, copy, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="heading-copy">${copy}</p></div>${action}</div>`;
}

function renderOverview() {
  const openStage = stageSeed[Math.max(0, currentStageIndex())];
  const totals = stageSeed.reduce((sum, stage) => sum + stageProgress(stage.id).done, 0);
  const max = stageSeed.reduce((sum, stage) => sum + stageProgress(stage.id).count, 0);
  const completion = max ? Math.round(totals / max * 100) : 0;
  const flow = stageSeed.map((stage, index) => {
    const progress = stageProgress(stage.id), status = stage.kind.toLowerCase();
    const deployedHere = deploymentStageId() === stage.id;
    return `<button class="stage-card ${index === currentStageIndex() ? 'current' : ''} ${status === 'proposed' ? 'proposed' : ''}" data-action="open-stage" data-stage="${stage.id}">
      <span class="stage-top"><span class="stage-index">0${index + 1}</span><span class="stage-status ${deployedHere ? 'current' : status}">${deployedHere ? 'SERVED HERE' : stage.kind === 'Current' ? 'DEPLOY TARGET' : 'PROCESS ONLY'}</span></span>
      <strong>${stage.name}</strong><p>${esc(stagePolicy(stage.id).purpose)}</p>
      <span class="stage-progress"><span>${esc(stageStateLabel(stage.id))}</span><span>${progress.done}/${progress.count}</span></span><span class="bar"><span style="width:${progress.percent}%"></span></span>
    </button>`;
  }).join('');
  const checks = stagePolicy(openStage.id).exit;
  const recent = stageSeed.filter(stage => state.stages[stage.id].completed).map((stage, index) => `<div class="activity-item"><span class="activity-no">${String(index + 1).padStart(2, '0')}</span><div><strong>${stage.name} gate recorded</strong><p>Recorded locally by ${esc(state.stages[stage.id].approverName || 'named approver')} · release ${esc(state.release.version || '—')}</p></div><span class="tag">SIMULATED</span></div>`).reverse().join('');
  return `${heading('Release workspace', 'Release board', 'A controlled route from technical validation to production, with visible evidence and accountable decisions.')}
    <div class="metric-row">
      <div class="metric"><div class="metric-label">Release gate</div><div class="metric-value">${esc(openStage.short)}</div><div class="metric-note">${esc(stageStateLabel(openStage.id))}</div></div>
      <div class="metric"><div class="metric-label">Gate evidence</div><div class="metric-value">${totals}<span style="font-size:13px;color:#869088"> / ${max}</span></div><div class="metric-note">${completion}% of configured checks recorded</div></div>
      <div class="metric"><div class="metric-label">Deployment targets</div><div class="metric-value">2<span style="font-size:13px"> / 5</span></div><div class="metric-note">Dev and Prod configured in this repository</div></div>
      <div class="metric"><div class="metric-label">Approvals recorded</div><div class="metric-value green">${stageSeed.filter(stage => state.stages[stage.id].approvalRecorded).length}</div><div class="metric-note">Prototype records only</div></div>
    </div>
    ${renderDeploymentSignal()}
    <section class="release-strip">
      <div class="release-main"><div><label>Release name</label><input class="release-name-input" data-bind="release.name" value="${esc(state.release.name)}" aria-label="Release name"></div><div><label>Version / candidate</label><input class="release-meta-input" data-bind="release.version" value="${esc(state.release.version)}" aria-label="Version or candidate identifier"></div><div><label>Commit or artifact reference</label><input class="release-meta-input" data-bind="release.commit" value="${esc(state.release.commit)}" placeholder="Add immutable reference" aria-label="Commit or artifact reference"></div><div><label>Release owner</label><input class="release-meta-input" data-bind="release.owner" value="${esc(state.release.owner)}" placeholder="Name / team" aria-label="Release owner"></div></div>
      <div class="release-status"><strong>${esc(openStage.name)} · ${esc(stageStateLabel(openStage.id))}</strong><small>Workflow gate, not deployment status</small></div>
    </section>
    <div class="stage-flow">${flow}</div>
    <div class="overview-grid">
      <section class="panel"><div class="panel-heading"><div><h2>${esc(openStage.name)} exit checks</h2><p>Recommended starting criteria · edit under Policy &amp; roles</p></div><span class="status-pill">${esc(stageStateLabel(openStage.id))}</span></div>
        <ul class="check-list">${checks.map((item, index) => `<li><input type="checkbox" data-check="${openStage.id}:exit:${index}" ${state.stages[openStage.id].exitChecks[index] ? 'checked' : ''}><span class="${state.stages[openStage.id].exitChecks[index] ? 'checked-label' : ''}">${esc(item)}</span></li>`).join('')}</ul>
        <button class="button button-small" data-action="open-stage" data-stage="${openStage.id}">Review full gate</button>
      </section>
      <section class="panel"><div class="panel-heading"><div><h2>Release activity</h2><p>Decision log for this browser prototype</p></div><span class="tag">LOCAL</span></div>
        <div class="activity-list">${recent || '<p class="empty-note">No gate decisions recorded. Complete the criteria and name an approver to exercise the flow.</p>'}</div>
      </section>
    </div>`;
}

function renderStageMenu(selected) {
  return `<div class="stage-menu">${stageSeed.map((stage, index) => `<button class="${stage.id === selected ? 'selected' : ''}" data-action="select-stage" data-stage="${stage.id}"><span>0${index + 1} &nbsp; ${stage.name}</span><small>${stage.kind.toUpperCase()}</small></button>`).join('')}</div>`;
}

function renderGate() {
  const stage = stageById(state.selectedStage), policy = stagePolicy(stage.id), progress = state.stages[stage.id];
  const criterionList = (items, type) => `<ul class="check-list">${items.map((item, index) => `<li><input type="checkbox" data-check="${stage.id}:${type}:${index}" ${progress[`${type}Checks`][index] ? 'checked' : ''}><span class="${progress[`${type}Checks`][index] ? 'checked-label' : ''}">${esc(item)}</span></li>`).join('') || '<li class="empty-note">Add criteria in Policy &amp; roles.</li>'}</ul>`;
  const ready = isReady(stage.id);
  const stageIndex = stageSeed.findIndex(item => item.id === stage.id);
  const previous = stageSeed[stageIndex - 1];
  const next = stageSeed[stageSeed.findIndex(item => item.id === stage.id) + 1];
  return `${heading('Evidence & approvals', 'Gate review', 'Check entry and exit conditions, attach evidence, and record a named decision. No deployment is triggered.')}
    <div class="section-layout">${renderStageMenu(stage.id)}<section class="panel gate-content">
      <div class="gate-intro"><span class="eyebrow">${stage.kind === 'Current' ? 'Deployment target' : 'Process-only stage'}</span><h2>${stage.name} gate</h2><p>${esc(policy.purpose)}</p><div class="gate-meta"><div class="meta-cell"><small>Deployment capability</small><strong>${stage.kind === 'Current' ? 'CONFIGURED IN REPO' : 'NO TARGET CONFIGURED'}</strong></div><div class="meta-cell"><small>Release gate</small><strong>${esc(stageStateLabel(stage.id).toUpperCase())}</strong></div><div class="meta-cell"><small>Configured approver role</small><strong>${esc(policy.approver || 'TBD')}</strong></div></div>${deploymentStageId() === stage.id ? `<div class="deployment-context"><strong>This site is serving the ${esc(deploymentManifest.environment)} package.</strong> Commit ${esc(String(deploymentManifest.commit_sha || '').slice(0, 12))} · ${esc(deploymentManifest.package_name || 'package unavailable')} ${deploymentRunLink('View deployment run ↗')}</div>` : ''}</div>
      <div class="gate-columns"><div class="gate-box"><h3>Entry criteria</h3>${criterionList(policy.entry, 'entry')}</div><div class="gate-box"><h3>Exit criteria</h3>${criterionList(policy.exit, 'exit')}</div></div>
      <div class="gate-box evidence-box"><h3>Evidence references</h3><div class="field"><label for="evidenceText">Paste links, ticket IDs, or concise evidence notes</label><textarea id="evidenceText" data-bind="stage.${stage.id}.evidenceText" placeholder="Build run, test report, change record, acceptance record…">${esc(progress.evidenceText)}</textarea></div></div>
      <div class="approval-row"><div class="field"><label for="approverName">Approver name / team</label><input id="approverName" data-bind="stage.${stage.id}.approverName" value="${esc(progress.approverName)}" placeholder="Named accountable approver"></div><div class="field"><label>Required role</label><input value="${esc(policy.approver || 'TBD')}" readonly></div><button class="button ${progress.approvalRecorded ? '' : 'button-primary'} button-small" data-action="approval" data-stage="${stage.id}">${progress.approvalRecorded ? 'Approval recorded' : 'Record approval'}</button></div>
      <div class="gate-action"><p>${ready ? `Gate criteria and approval are complete. Recording this decision advances the prototype to ${next ? next.name : 'release complete'}.` : state.stages[stage.id].completed ? 'This gate has already been recorded for the current release.' : previous && !state.stages[previous.id].completed ? `Complete and record the ${previous.name} gate before this stage can advance.` : 'To enable the simulated promotion, complete every entry and exit check and record an approval from a named person.'}${stage.kind === 'Proposed' ? ' This environment is not configured as a deployment target in the repository.' : ''}</p><button class="button button-primary" data-action="promote" data-stage="${stage.id}" ${ready ? '' : 'disabled'}>${state.stages[stage.id].completed ? 'Gate already recorded' : next ? `Record gate & move to ${next.name}` : 'Record production outcome'}</button></div>
      <div class="notice">Recording this gate changes only the local prototype state. It does not move a package, run a pipeline, update infrastructure, or constitute a production approval.</div>
    </section></div>`;
}

function substitute(text) {
  const stage = stageById(state.selectedStage), progress = state.stages[stage.id];
  return String(text).replaceAll('{{release}}', state.release.name || 'Release name TBD').replaceAll('{{version}}', state.release.version || 'Version TBD').replaceAll('{{evidence}}', progress.evidenceText || 'Evidence references TBD');
}

function renderCommunications() {
  const stage = stageById(state.selectedStage), message = state.comms[stage.id];
  return `${heading('Project communication', 'Communications', 'Prepare consistent stage updates for the project team. Drafts are not sent by this tool.')}
    <div class="section-layout">${renderStageMenu(stage.id)}<section class="panel">
      <div class="panel-heading"><div><span class="eyebrow">${stage.kind} · ${stage.name}</span><h2 style="margin-top:6px">Stage update draft</h2><p>Confirm audience, timing, and content with the client before use.</p></div><span class="draft-label">${message.prepared ? 'PREPARED LOCALLY' : 'DRAFT'}</span></div>
      <div class="two-column"><div><div class="field" style="margin-bottom:12px"><label for="audience">Audience / distribution list</label><input id="audience" data-bind="comms.${stage.id}.audience" value="${esc(message.audience)}"></div><div class="field" style="margin-bottom:12px"><label for="subject">Subject</label><input id="subject" data-bind="comms.${stage.id}.subject" value="${esc(message.subject)}"></div><div class="field"><label for="messageBody">Message body</label><textarea id="messageBody" data-bind="comms.${stage.id}.body">${esc(message.body)}</textarea></div><div class="button-row"><button class="button button-small" data-action="copy-message" data-stage="${stage.id}">Copy draft</button><button class="button button-primary button-small" data-action="prepare-message" data-stage="${stage.id}">${message.prepared ? 'Prepared' : 'Mark prepared'}</button></div></div>
      <div><div class="eyebrow" style="margin-bottom:8px">Preview · ${esc(stage.name)}</div><div class="message-preview">${esc(substitute(message.body))}</div><p class="empty-note" style="margin-top:9px">Tokens fill from the release record. Copy the preview manually into your approved project channel.</p></div></div>
    </section></div>`;
}

function renderPolicy() {
  const stage = stageById(state.policyStage), policy = stagePolicy(stage.id);
  const field = (label, key, value, placeholder = '') => `<div class="field"><label>${label}</label><textarea data-bind="policy.${stage.id}.${key}" placeholder="${esc(placeholder)}">${esc(Array.isArray(value) ? value.join('\n') : value)}</textarea></div>`;
  return `${heading('Operating model configuration', 'Policy & roles', 'Recommended defaults are editable. Replace them with client-approved criteria, ownership, and support boundaries.')}
    <div class="notice" style="margin-bottom:15px">These are proposed starting points, not agreed contractual responsibilities or final release policy. Assign accountable owners with the client and IBM/KAD before operational use.</div>
    <div class="panel" style="margin-bottom:15px"><div class="panel-heading"><div><h2>Environment policy</h2><p>One line per criterion or evidence item. Updates are saved in this browser.</p></div><span class="tag">${stage.kind.toUpperCase()} STAGE</span></div>
      <div class="policy-stage-tabs">${stageSeed.map(item => `<button class="${item.id === stage.id ? 'active' : ''}" data-action="select-policy-stage" data-stage="${item.id}">${item.name}</button>`).join('')}</div>
      <div class="policy-grid"><div class="field field-full"><label>Purpose</label><input data-bind="policy.${stage.id}.purpose" value="${esc(policy.purpose)}"></div><div class="field"><label>Recommended activities / what teams can do</label><textarea data-bind="policy.${stage.id}.doText">${esc(policy.doText)}</textarea></div><div class="field"><label>Guardrails / what teams should not do</label><textarea data-bind="policy.${stage.id}.avoidText">${esc(policy.avoidText)}</textarea></div>
        ${field('Entry criteria', 'entry', policy.entry, 'One entry criterion per line')}${field('Exit criteria', 'exit', policy.exit, 'One exit criterion per line')}${field('Evidence expected', 'evidence', policy.evidence, 'One evidence item per line')}
        <div class="field"><label>Approver role (proposed)</label><input data-bind="policy.${stage.id}.approver" value="${esc(policy.approver)}"></div></div>
    </div>
    <section class="panel"><div class="panel-heading"><div><h2>Responsibility &amp; support map</h2><p>Fill in names and validate the proposed service boundaries.</p></div><span class="tag">OWNER TBD</span></div>
      <div class="table-scroll"><table class="matrix"><thead><tr><th>Role / team</th><th>Named owner</th><th>Proposed responsibility / support</th></tr></thead><tbody>${state.policy.roles.map((role, index) => `<tr><td><input data-role="${index}:role" value="${esc(role.role)}" aria-label="Role name"></td><td><input data-role="${index}:owner" value="${esc(role.owner)}" placeholder="TBD" aria-label="${esc(role.role)} owner"></td><td><textarea data-role="${index}:support" aria-label="${esc(role.role)} support">${esc(role.support)}</textarea></td></tr>`).join('')}</tbody></table></div>
      <div class="notice" style="margin-top:13px"><strong>IBM support to confirm:</strong> product/platform responsibilities, technical escalation and incident route, environment constraints, deployment support, and service boundaries.<br><strong>KAD support to confirm:</strong> client decision makers, business acceptance, environment/access readiness, change approvals/windows, business communications, and operational coverage.</div>
    </section>`;
}

function renderApp() {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === state.view));
  viewRoot.innerHTML = state.view === 'overview' ? renderOverview() : state.view === 'gates' ? renderGate() : state.view === 'communications' ? renderCommunications() : renderPolicy();
}

function setPath(path, value) {
  const parts = path.split('.');
  if (parts[0] === 'stage') parts[0] = 'stages';
  let cursor = state;
  for (const part of parts.slice(0, -1)) cursor = cursor[part];
  const key = parts[parts.length - 1];
  if (Array.isArray(cursor[key])) cursor[key] = value.split('\n').map(item => item.trim()).filter(Boolean);
  else if (typeof cursor[key] === 'boolean') cursor[key] = value === 'true';
  else cursor[key] = value;
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-view]');
  if (nav) { state.view = nav.dataset.view; save(); return; }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const { action: name, stage } = action.dataset;
  if (name === 'open-stage') { state.selectedStage = stage; state.view = 'gates'; }
  if (name === 'select-stage') state.selectedStage = stage;
  if (name === 'select-policy-stage') state.policyStage = stage;
  if (name === 'approval') {
    const item = state.stages[stage];
    if (!item.approverName.trim()) { alert('Enter the named approver before recording approval.'); return; }
    item.approvalRecorded = !item.approvalRecorded;
  }
  if (name === 'promote') {
    if (!isReady(stage)) return;
    state.stages[stage].completed = true;
    const next = stageSeed[stageSeed.findIndex(item => item.id === stage) + 1];
    if (next) state.selectedStage = next.id;
    state.view = 'gates';
  }
  if (name === 'prepare-message') state.comms[stage].prepared = !state.comms[stage].prepared;
  if (name === 'copy-message') {
    try { await navigator.clipboard.writeText(substitute(state.comms[stage].body)); action.textContent = 'Copied'; }
    catch { alert('Clipboard access is unavailable here. Select and copy the preview text manually.'); }
    return;
  }
  save();
});

document.addEventListener('change', event => {
  const input = event.target;
  if (input.matches('[data-bind]')) {
    setPath(input.dataset.bind, input.value);
    save(false);
    if (input.dataset.bind.startsWith('policy.')) renderApp();
    return;
  }
  if (input.matches('[data-check]')) {
    const [stage, type, index] = input.dataset.check.split(':');
    state.stages[stage][`${type}Checks`][Number(index)] = input.checked;
    if (!input.checked) state.stages[stage].approvalRecorded = false;
    save();
  }
});

document.addEventListener('input', event => {
  const input = event.target;
  if (input.matches('[data-role]')) {
    const [index, field] = input.dataset.role.split(':');
    state.policy.roles[Number(index)][field] = input.value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
});

document.getElementById('resetButton').addEventListener('click', () => {
  if (!confirm('Restore the starter release and policy? This clears locally saved prototype edits.')) return;
  state = freshState();
  save();
});

renderApp();

fetch('deployment.json', { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`Deployment manifest unavailable (${response.status})`);
    return response.json();
  })
  .then(manifest => {
    if (!manifest || !['dev', 'prod'].includes(manifest.environment_code) || !manifest.commit_sha || !manifest.workflow_run_url) throw new Error('Deployment manifest is incomplete');
    deploymentManifest = manifest;
    deploymentManifestAvailable = true;
    renderApp();
  })
  .catch(() => {
    deploymentManifestAvailable = false;
    renderApp();
  });