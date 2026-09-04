const PASS=new Set(['PASS','pass','healthy','ok','ready','connected']);
const CONFIG_ONLY=/config|variable|secret|credential|setting|webhook-host|provider/i;
const FUNCTIONAL=/synthetic|browser|runtime|customer|delivery|dependency|production-site|functional/i;

function fresh(e={},now=Date.now(),maxAgeMs=10*60*1000){const raw=e.observedAt||e.checkedAt||e.generatedAt||e.timestamp||e.at;if(!raw)return false;const t=Date.parse(raw);return Number.isFinite(t)&&now-t>=0&&now-t<=maxAgeMs}
function passed(c){return PASS.has(c?.status)||PASS.has(c?.result)||c?.ok===true||c?.evidence?.ok===true}
function after(c,repairAt){const raw=c?.evidence?.observedAt||c?.evidence?.checkedAt||c?.evidence?.generatedAt||c?.evidence?.timestamp||c?.evidence?.at;const t=Date.parse(raw||'');const r=Date.parse(repairAt||'');return Number.isFinite(t)&&Number.isFinite(r)&&t>=r}
function functional(c){const hay=[c?.id,c?.kind,c?.evidence?.source,c?.evidence?.type,c?.evidence?.proofType].filter(Boolean).join(' ');return FUNCTIONAL.test(hay)&&!CONFIG_ONLY.test(hay)}

export function proveRepairOutcome({repair={},checks=[],now=Date.now()}={}){
  if(!repair?.completedAt)return{state:'NOT_PROVEN',fixed:false,reason:'No completed repair timestamp is available.'};
  const candidates=(checks||[]).filter(c=>passed(c)&&fresh(c?.evidence,now)&&after(c,repair.completedAt)&&functional(c));
  if(!candidates.length)return{state:'VERIFYING',fixed:false,reason:'The configuration may be corrected, but the customer-facing function has not yet been independently re-proven after the repair.'};
  const proof=candidates[0];
  return{state:'FIXED',fixed:true,reason:'A fresh independent functional check passed after the repair.',proof:{checkId:String(proof.id||'functional-proof'),source:String(proof.evidence?.source||'independent-functional-check'),observedAt:String(proof.evidence?.observedAt||proof.evidence?.checkedAt||proof.evidence?.generatedAt||'')}};
}

export function guardFixedLabel(label,proof){return String(label||'').toUpperCase()==='FIXED'&&!proof?.fixed?'VERIFYING':label}
