import fs from 'node:fs/promises';
import { MODEL, ROOMS, evaluate, makeCanaries, preflight, sha256 } from './canary-controller.mjs';

const base=process.env.OPENAI_BASE_URL;
const key=process.env.OPENAI_API_KEY;
if (!base || !key) throw new Error('FAIL CLOSED: Netlify AI Gateway environment unavailable');

const canaries=makeCanaries();
const {payloads,payloadHashes}=preflight(canaries);
const rawByRoom={}; const receipts={};

// Deliberately sequential is OK: each HTTP request is stateless and its payload is constructed
// only from immutable instructions + that room's private canary. No prior response is referenced.
for (const room of ROOMS) {
  const started=new Date().toISOString();
  const res=await fetch(`${base}/v1/responses`,{
    method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`},
    body:JSON.stringify(payloads[room])
  });
  const body=await res.text();
  if (!res.ok) throw new Error(`FAIL CLOSED: room ${room} provider HTTP ${res.status}`);
  const envelope=JSON.parse(body);
  const text=envelope.output_text ?? envelope.output?.flatMap(x=>x.content??[]).find(x=>x.type==='output_text')?.text;
  if (typeof text!=='string') throw new Error(`FAIL CLOSED: room ${room} missing text output`);
  rawByRoom[room]=text;
  receipts[room]={started_at:started,finished_at:new Date().toISOString(),provider_request_id:envelope.id??null,reported_model:envelope.model??null,payload_sha256:payloadHashes[room],raw_response_sha256:sha256(text)};
}

const evaluation=evaluate(canaries,rawByRoom);
const manifest={test:'THREE-ROOM-CANARY-V1',model_requested:MODEL,outcomes_accessed:false,football_predictions_run:false,rooms:receipts,evaluation};
await fs.mkdir('experiments/nfl-isolation/artifacts',{recursive:true});
await fs.writeFile('experiments/nfl-isolation/artifacts/canary-manifest.json',JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile('experiments/nfl-isolation/artifacts/canary-raw.json',JSON.stringify(rawByRoom,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
if (evaluation.verdict!=='PASS') process.exitCode=2;
