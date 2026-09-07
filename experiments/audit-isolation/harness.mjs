import { createHash, randomUUID } from 'node:crypto';

const ROLES = Object.freeze(['A1','A2','A3','B1','B2','B3','C1','C2','C3','RA','RB','RC','RM']);
const ANALYZERS = new Set(ROLES.slice(0,9));
const RECONCILERS = new Set(['RA','RB','RC']);
const ARM_ROLES = Object.freeze({
  SINGLE:new Set(['A1']),
  THREE:new Set(['A1','A2','A3','RA']),
  NINE:new Set(ROLES),
  ADAPTIVE:new Set(ROLES)
});

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function sha256(value) { return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex'); }
function deepFreeze(value){ if(value && typeof value==='object' && !Object.isFrozen(value)){ Object.freeze(value); for(const v of Object.values(value)) deepFreeze(v); } return value; }
export class AccessDenied extends Error { constructor(message){ super(message); this.name='AccessDenied'; } }

export class AuditIsolationHarness {
  constructor({experimentId='audit-issue-36',clock=()=>new Date().toISOString(),modelVersion='LOCK-BEFORE-RUN',runtimeVersion=process.version,promptSpecVersion='v1'}={}){
    this.experimentId=experimentId; this.clock=clock; this.modelVersion=modelVersion; this.runtimeVersion=runtimeVersion; this.promptSpecVersion=promptSpecVersion;
    this.jobs=new Map(); this.commits=new Map(); this.goldVault=new Map(); this.scoringSessions=new Map(); this.destroyedJobs=new Set();
  }
  createCase({caseId,sourceManifest}){
    if(!caseId||!sourceManifest) throw new Error('caseId and sourceManifest required');
    const frozen=deepFreeze(structuredClone(sourceManifest));
    return deepFreeze({caseId,sourceManifest:frozen,manifestHash:sha256(frozen)});
  }
  createWorker({caseRecord,role,arm='NINE',taskSpec='v1'}){
    if(!ARM_ROLES[arm]) throw new Error(`unknown arm ${arm}`);
    if(!ARM_ROLES[arm].has(role)) throw new Error(`role ${role} not allowed in arm ${arm}`);
    const jobId=`${caseRecord.caseId}:${arm}:${role}:${randomUUID()}`;
    const job={jobId,caseId:caseRecord.caseId,arm,role,taskSpec,manifestHash:caseRecord.manifestHash,local:new Map(),sealed:false};
    this.jobs.set(jobId,job);
    return deepFreeze({jobId,caseId:job.caseId,arm,role,manifestHash:job.manifestHash,taskSpec});
  }
  createScoringSession({caseRecord,arm}){
    if(!ARM_ROLES[arm]) throw new Error(`unknown arm ${arm}`);
    const id=`score:${caseRecord.caseId}:${arm}:${randomUUID()}`;
    this.scoringSessions.set(id,{caseId:caseRecord.caseId,arm,manifestHash:caseRecord.manifestHash});
    return deepFreeze({scoringSessionId:id,caseId:caseRecord.caseId,arm,manifestHash:caseRecord.manifestHash});
  }
  writeLocal(jobId,key,value){ const j=this.#job(jobId); this.#assertLive(j); j.local.set(key,structuredClone(value)); }
  readLocal(requestingJobId,targetJobId,key){ const r=this.#job(requestingJobId),t=this.#job(targetJobId); this.#assertLive(r); this.#assertLive(t); if(requestingJobId!==targetJobId) throw new AccessDenied('job-local state is private'); return structuredClone(t.local.get(key)); }
  commitOutput(jobId,payload){
    const j=this.#job(jobId); this.#assertLive(j); if(j.sealed) throw new Error('output already committed'); this.#assertPrerequisites(j);
    const frozenPayload=deepFreeze(structuredClone(payload));
    const envelope=deepFreeze({experimentId:this.experimentId,caseId:j.caseId,arm:j.arm,jobId,role:j.role,taskSpec:j.taskSpec,promptSpecVersion:this.promptSpecVersion,modelVersion:this.modelVersion,runtimeVersion:this.runtimeVersion,manifestHash:j.manifestHash,committedAt:this.clock(),payload:frozenPayload});
    const commit=deepFreeze({...envelope,commitHash:sha256(envelope)}); j.sealed=true; this.commits.set(jobId,commit); return structuredClone(commit);
  }
  readCommitted(requestingJobId,targetJobId){
    const r=this.#job(requestingJobId); this.#assertLive(r); const c=this.commits.get(targetJobId); if(!c) throw new AccessDenied('target output is not committed');
    if(r.caseId!==c.caseId||r.arm!==c.arm||!this.#mayReadCommit(r.role,c.role)) throw new AccessDenied('ACL denies committed output');
    return structuredClone(c);
  }
  putGold(caseId,gold){ this.goldVault.set(caseId,deepFreeze({gold:deepFreeze(structuredClone(gold)),hash:sha256(gold)})); }
  readGold({scoringSessionId,finalCommitHash}){
    const s=this.scoringSessions.get(scoringSessionId); if(!s) throw new AccessDenied('valid scoring session required');
    const gold=this.goldVault.get(s.caseId); if(!gold) throw new AccessDenied('no gold available');
    const final=[...this.commits.values()].find(c=>c.caseId===s.caseId&&c.arm===s.arm&&c.commitHash===finalCommitHash&&this.#isFinalRole(s.arm,c.role));
    if(!final) throw new AccessDenied('gold locked until valid final arm commitment is proven');
    return structuredClone(gold);
  }
  destroyJob(jobId){ const j=this.#job(jobId); j.local.clear(); this.destroyedJobs.add(jobId); this.jobs.delete(jobId); }
  #assertPrerequisites(j){
    const same=(role)=>[...this.commits.values()].some(c=>c.caseId===j.caseId&&c.arm===j.arm&&c.role===role);
    if(j.role==='RA'&&!['A1','A2','A3'].every(same)) throw new AccessDenied('RA requires committed A1/A2/A3');
    if(j.role==='RB'&&!['B1','B2','B3'].every(same)) throw new AccessDenied('RB requires committed B1/B2/B3');
    if(j.role==='RC'&&!['C1','C2','C3'].every(same)) throw new AccessDenied('RC requires committed C1/C2/C3');
    if(j.role==='RM'&&!['RA','RB','RC'].every(same)) throw new AccessDenied('RM requires committed RA/RB/RC');
  }
  #isFinalRole(arm,role){ return (arm==='SINGLE'&&role==='A1')||(arm==='THREE'&&role==='RA')||((arm==='NINE'||arm==='ADAPTIVE')&&role==='RM'); }
  #mayReadCommit(requester,target){ if(requester==='RA') return ['A1','A2','A3'].includes(target); if(requester==='RB') return ['B1','B2','B3'].includes(target); if(requester==='RC') return ['C1','C2','C3'].includes(target); if(requester==='RM') return ['RA','RB','RC'].includes(target); return false; }
  #job(id){ const j=this.jobs.get(id); if(!j) throw new AccessDenied('unknown or destroyed job'); return j; }
  #assertLive(j){ if(this.destroyedJobs.has(j.jobId)) throw new AccessDenied('job destroyed'); }
}

export const schemas=Object.freeze({
  finding:Object.freeze(['finding_id','finding_type','entity_refs','amount_cents','currency','source_refs','governing_rule','calculation','counter_evidence','uncertainties','recommended_disposition','reason_codes','analyzer_output_hash']),
  trioReconciliation:Object.freeze(['canonical_finding_id','member_findings','agreement','first_divergence','amount_cents','status','reason_codes','reconciliation_hash']),
  masterReconciliation:Object.freeze(['case_id','globally_corroborated_dollars','review_required_dollars','rejected_suppressed_dollars','unresolved_finding_count','first_divergences','findings'])
});
export function validateShape(name,value){ const required=schemas[name]; if(!required) throw new Error(`unknown schema ${name}`); const missing=required.filter(k=>!(k in value)); return {ok:missing.length===0,missing}; }
