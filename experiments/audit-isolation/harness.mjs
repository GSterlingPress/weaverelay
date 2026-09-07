import { createHash, randomUUID } from 'node:crypto';

const ROLES = Object.freeze(['A1','A2','A3','B1','B2','B3','C1','C2','C3','RA','RB','RC','RM','SCORING']);
const ANALYZERS = new Set(ROLES.slice(0,9));
const RECONCILERS = new Set(['RA','RB','RC']);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  const bytes = typeof value === 'string' ? value : canonicalJson(value);
  return createHash('sha256').update(bytes).digest('hex');
}

export class AccessDenied extends Error {
  constructor(message) { super(message); this.name = 'AccessDenied'; }
}

export class AuditIsolationHarness {
  constructor({ experimentId='audit-issue-36', clock=() => new Date().toISOString() } = {}) {
    this.experimentId = experimentId;
    this.clock = clock;
    this.jobs = new Map();
    this.goldVault = new Map();
    this.commits = new Map();
    this.destroyedJobs = new Set();
  }

  createCase({ caseId, sourceManifest }) {
    if (!caseId || !sourceManifest) throw new Error('caseId and sourceManifest required');
    const manifestHash = sha256(sourceManifest);
    return Object.freeze({ caseId, sourceManifest: structuredClone(sourceManifest), manifestHash });
  }

  createWorker({ caseRecord, role, taskSpec='v1' }) {
    if (!ROLES.includes(role)) throw new Error(`unknown role ${role}`);
    if (role === 'SCORING') throw new Error('scoring is not a worker');
    const jobId = `${caseRecord.caseId}:${role}:${randomUUID()}`;
    const readable = new Set();
    if (ANALYZERS.has(role)) readable.add('SOURCE');
    if (RECONCILERS.has(role)) readable.add(role === 'RA' ? 'A' : role === 'RB' ? 'B' : 'C');
    if (role === 'RM') readable.add('RECONCILIERS');
    const job = { jobId, caseId: caseRecord.caseId, role, taskSpec, manifestHash: caseRecord.manifestHash, readable, local: new Map(), sealed:false };
    this.jobs.set(jobId, job);
    return Object.freeze({ jobId, caseId: job.caseId, role, manifestHash: job.manifestHash, taskSpec });
  }

  writeLocal(jobId, key, value) {
    const job = this.#job(jobId); this.#assertLive(job);
    job.local.set(key, structuredClone(value));
  }

  readLocal(requestingJobId, targetJobId, key) {
    const requester = this.#job(requestingJobId); this.#assertLive(requester);
    const target = this.#job(targetJobId); this.#assertLive(target);
    if (requestingJobId !== targetJobId) throw new AccessDenied('job-local state is private');
    return structuredClone(target.local.get(key));
  }

  commitOutput(jobId, payload) {
    const job = this.#job(jobId); this.#assertLive(job);
    if (job.sealed) throw new Error('output already committed');
    const envelope = Object.freeze({
      experimentId:this.experimentId, caseId:job.caseId, jobId, role:job.role,
      taskSpec:job.taskSpec, manifestHash:job.manifestHash, committedAt:this.clock(),
      payload: structuredClone(payload)
    });
    const hash = sha256(envelope);
    const commit = Object.freeze({ ...envelope, commitHash:hash });
    job.sealed = true;
    this.commits.set(jobId, commit);
    return commit;
  }

  readCommitted(requestingJobId, targetJobId) {
    const requester = this.#job(requestingJobId); this.#assertLive(requester);
    const targetCommit = this.commits.get(targetJobId);
    if (!targetCommit) throw new AccessDenied('target output is not committed');
    if (!this.#mayReadCommit(requester.role, targetCommit.role)) throw new AccessDenied('ACL denies committed output');
    return structuredClone(targetCommit);
  }

  putGold(caseId, gold) {
    this.goldVault.set(caseId, Object.freeze({ gold:structuredClone(gold), hash:sha256(gold) }));
  }

  readGold({ caseId, finalCommitHash }) {
    const gold = this.goldVault.get(caseId);
    if (!gold) throw new AccessDenied('no gold available');
    const final = [...this.commits.values()].find(c => c.caseId === caseId && c.role === 'RM' && c.commitHash === finalCommitHash);
    if (!final) throw new AccessDenied('gold locked until final RM commitment is proven');
    return structuredClone(gold);
  }

  destroyJob(jobId) {
    const job = this.#job(jobId);
    job.local.clear();
    this.destroyedJobs.add(jobId);
    this.jobs.delete(jobId);
  }

  #mayReadCommit(requesterRole, targetRole) {
    if (requesterRole === 'RA') return ['A1','A2','A3'].includes(targetRole);
    if (requesterRole === 'RB') return ['B1','B2','B3'].includes(targetRole);
    if (requesterRole === 'RC') return ['C1','C2','C3'].includes(targetRole);
    if (requesterRole === 'RM') return ['RA','RB','RC'].includes(targetRole);
    return false;
  }

  #job(id) { const j=this.jobs.get(id); if(!j) throw new AccessDenied('unknown or destroyed job'); return j; }
  #assertLive(job) { if(this.destroyedJobs.has(job.jobId)) throw new AccessDenied('job destroyed'); }
}

export const schemas = Object.freeze({
  finding: Object.freeze(['finding_id','finding_type','entity_refs','amount_cents','currency','source_refs','governing_rule','calculation','counter_evidence','uncertainties','recommended_disposition','reason_codes']),
  trioReconciliation: Object.freeze(['canonical_finding_id','member_findings','agreement','first_divergence','amount_cents','status','reason_codes']),
  masterReconciliation: Object.freeze(['case_id','globally_corroborated_dollars','review_required_dollars','rejected_suppressed_dollars','unresolved_finding_count','findings'])
});

export function validateShape(name, value) {
  const required = schemas[name];
  if (!required) throw new Error(`unknown schema ${name}`);
  const missing = required.filter(k => !(k in value));
  return { ok: missing.length === 0, missing };
}
