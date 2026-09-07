import { MODEL, ROOMS, evaluate, makeCanaries, preflight, sha256 } from '../../experiments/nfl-isolation/canary-controller.mjs';

export default async (req) => {
  if(req.method!=='GET') return Response.json({error:'GET only'},{status:405});
  const base=Netlify.env.get('NETLIFY_AI_GATEWAY_BASE_URL')||Netlify.env.get('OPENAI_BASE_URL');
  const key=Netlify.env.get('NETLIFY_AI_GATEWAY_KEY')||Netlify.env.get('OPENAI_API_KEY');
  if(!base||!key) return Response.json({verdict:'FAIL',error:'AI Gateway unavailable',football_predictions_run:false,outcomes_accessed:false},{status:503});
  const canaries=makeCanaries(); const {payloads,payloadHashes}=preflight(canaries); const rawByRoom={}; const receipts={};
  try{
    for(const room of ROOMS){
      const started=new Date().toISOString();
      const res=await fetch(`${base}/v1/chat/completions`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`},body:JSON.stringify(payloads[room])});
      const body=await res.text(); if(!res.ok) throw new Error(`room ${room} provider HTTP ${res.status}`);
      const env=JSON.parse(body); const text=env.choices?.[0]?.message?.content; if(typeof text!=='string') throw new Error(`room ${room} missing text`);
      rawByRoom[room]=text; receipts[room]={started_at:started,finished_at:new Date().toISOString(),provider_request_id:env.id??null,reported_model:env.model??null,payload_sha256:payloadHashes[room],raw_response_sha256:sha256(text)};
    }
    const evaluation=evaluate(canaries,rawByRoom);
    return Response.json({test:'THREE-ROOM-CANARY-V1',model_requested:MODEL,football_predictions_run:false,outcomes_accessed:false,rooms:receipts,evaluation,raw_first_outputs:rawByRoom},{status:evaluation.verdict==='PASS'?200:409,headers:{'cache-control':'no-store'}});
  }catch(error){return Response.json({test:'THREE-ROOM-CANARY-V1',verdict:'FAIL',error:String(error?.message||error),football_predictions_run:false,outcomes_accessed:false,rooms:receipts},{status:500,headers:{'cache-control':'no-store'}});}
};
export const config={path:'/internal/nfl-isolation-canary'};
