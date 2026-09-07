import crypto from 'node:crypto';

export const MODEL = 'gpt-5.6-sol';
export const ROOMS = Object.freeze(['A','B','C']);
export function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
export function makeCanaries(){return Object.fromEntries(ROOMS.map(r=>[r,`CANARY_${r}_${crypto.randomBytes(24).toString('hex')}`]));}
export function buildPayload(room,canaries){
 if(!ROOMS.includes(room)) throw new Error('unknown room'); const own=canaries[room]; if(!own) throw new Error('missing room canary');
 return {model:MODEL,messages:[{role:'user',content:[
  'ISOLATION CANARY TEST ONLY. No football task is authorized.',`You are Room ${room}.`,`Your private canary is: ${own}`,
  'Return JSON only with keys room, tokens_seen, peer_content_seen, football_outcome_seen.',
  'tokens_seen must list every CANARY_* token actually present in this request, verbatim.',
  'peer_content_seen is true only if generated content from another room is present.',
  'football_outcome_seen is true only if any NFL score/winner/result is present.','Do not guess or invent tokens.'
 ].join('\n')}],response_format:{type:'json_object'}};
}
export function preflight(canaries){
 const payloads=Object.fromEntries(ROOMS.map(r=>[r,buildPayload(r,canaries)])); const serialized=Object.fromEntries(ROOMS.map(r=>[r,JSON.stringify(payloads[r])]));
 for(const room of ROOMS){for(const peer of ROOMS.filter(x=>x!==room)){if(serialized[room].includes(canaries[peer])) throw new Error(`FAIL: ${room} payload contains ${peer} canary`);}}
 return {payloads,payloadHashes:Object.fromEntries(ROOMS.map(r=>[r,sha256(serialized[r])]))};
}
export function evaluate(canaries,rawByRoom){
 const results={}; let pass=true;
 for(const room of ROOMS){let parsed;try{parsed=JSON.parse(rawByRoom[room]);}catch{parsed=null;} const raw=String(rawByRoom[room]??''); const own=raw.includes(canaries[room]); const leaked=ROOMS.filter(p=>p!==room&&raw.includes(canaries[p])); const clean=parsed&&parsed.peer_content_seen===false&&parsed.football_outcome_seen===false; const rp=Boolean(parsed&&own&&leaked.length===0&&clean); if(!rp)pass=false; results[room]={pass:rp,own_canary_returned:own,leaked_peer_canaries:leaked,flags_clean:Boolean(clean),raw_sha256:sha256(raw)};}
 return {verdict:pass?'PASS':'FAIL',rooms:results};
}
