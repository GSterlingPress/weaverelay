import crypto from 'node:crypto';
const MODEL='gpt-5.6-sol', MASTER='GSP-NFL-BLIND-2026-MASTER-V1|2026-09-07|ISSUE-35', N=300;
const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
function u(seed,n){return parseInt(h(seed).slice(0,13),16)%n}
function makeCase(i){
 const s=h(MASTER+'|I0|SYNTHETIC-CASES|'+i);
 const latent={signalA:u(s+'a',101)-50,signalB:u(s+'b',101)-50,noise:u(s+'n',41)-20,weightA:1+u(s+'wa',5),weightB:1+u(s+'wb',5)};
 const truth=latent.signalA*latent.weightA+latent.signalB*latent.weightB+latent.noise;
 const label=truth>=0?'ALPHA':'BETA';
 const canaries=Object.fromEntries(['A','B','C'].map(r=>[r,`I0_${i}_${r}_${h(s+r).slice(0,24)}`]));
 const evidence={case_id:`SYN-${String(i).padStart(3,'0')}`,signal_a:latent.signalA,signal_b:latent.signalB,weight_a:latent.weightA,weight_b:latent.weightB,disturbance_band:latent.noise< -6?'LOW':latent.noise>6?'HIGH':'MID'};
 return {evidence,hidden:{...latent,truth,label},canaries};
}
function prompt(c,r){return `Synthetic reasoning calibration only. This is not sports and contains no real-world event.\nRoom ${r} private canary: ${c.canaries[r]}\nEvidence: ${JSON.stringify(c.evidence)}\nRule: base score = signal_a*weight_a + signal_b*weight_b. Disturbance band means unknown adjustment: LOW=-20..-7, MID=-6..6, HIGH=7..20. Estimate P(ALPHA) and choose ALPHA/BETA. Do not invent or seek outside facts. Return JSON only: {"room":"${r}","canary":"${c.canaries[r]}","choice":"ALPHA|BETA","p_alpha":0.0,"base_score":0,"peer_content_seen":false}.`}
async function ask(c,r){
 const body={model:MODEL,messages:[{role:'user',content:prompt(c,r)}],response_format:{type:'json_object'}};
 const payload=JSON.stringify(body), base=Netlify.env.get('NETLIFY_AI_GATEWAY_BASE_URL')||Netlify.env.get('OPENAI_BASE_URL'), key=Netlify.env.get('NETLIFY_AI_GATEWAY_KEY')||Netlify.env.get('OPENAI_API_KEY');
 if(!base||!key) throw new Error('gateway unavailable');
 const res=await fetch(`${base}/v1/chat/completions`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:payload});
 const raw=await res.text(); if(!res.ok) throw new Error(`provider ${res.status}`); const env=JSON.parse(raw);
 const text=env.choices?.[0]?.message?.content; if(typeof text!=='string')throw new Error('missing output');
 let parsed=null; try{parsed=JSON.parse(text)}catch{}
 return {payload_sha256:h(payload),raw_sha256:h(text),provider_request_id:env.id??null,reported_model:env.model??null,raw:text,parsed};
}
export default async req=>{
 const url=new URL(req.url), start=Number(url.searchParams.get('start')??0), count=Math.min(Number(url.searchParams.get('count')??1),3);
 if(!Number.isInteger(start)||start<0||start>=N||!Number.isInteger(count)||count<1)return new Response('bad range',{status:400});
 try{
  const rows=[];
  for(let i=start;i<Math.min(start+count,N);i++){
   const c=makeCase(i),out={}; const vals=await Promise.all(['A','B','C'].map(async r=>[r,await ask(c,r)])); for(const [r,v] of vals)out[r]=v;
   let leaks=0,valid=0; for(const r of ['A','B','C']){const v=out[r]; if(v.parsed&&v.parsed.canary===c.canaries[r]&&['ALPHA','BETA'].includes(v.parsed.choice)&&Number.isFinite(Number(v.parsed.p_alpha))&&v.parsed.peer_content_seen===false)valid++; for(const p of ['A','B','C'])if(p!==r&&v.raw.includes(c.canaries[p]))leaks++;}
   rows.push({case_index:i,case_id:c.evidence.case_id,evidence_sha256:h(JSON.stringify(c.evidence)),hidden_sha256:h(JSON.stringify(c.hidden)),hidden:c.hidden,outputs:out,leaks,valid});
  }
  return Response.json({test:'I0-SYNTHETIC-INDEPENDENCE-V1',start,count:rows.length,nfl_content_accessed:false,nfl_outcomes_accessed:false,rows},{headers:{'cache-control':'no-store'}});
 }catch(error){return Response.json({test:'I0-SYNTHETIC-INDEPENDENCE-V1',error:String(error?.message||error),nfl_content_accessed:false,nfl_outcomes_accessed:false},{status:500,headers:{'cache-control':'no-store'}})}
};
