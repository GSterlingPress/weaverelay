import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMetadataOnly, discoverCaseCandidates } from './case-discovery.mjs';

test('rejects content-bearing records',()=>{ assert.throws(()=>assertMetadataOnly({name:'x.pdf',content:'secret'}),/forbidden content-bearing field/); assert.throws(()=>assertMetadataOnly({name:'x.pdf',snippet:'secret'}),/forbidden content-bearing field/); });
test('classifies sources without opening and quarantines outcome-looking artifacts',()=>{ const r=discoverCaseCandidates([{file_id:'1',name:'invoice-001.pdf',mime_type:'application/pdf',size_bytes:12},{file_id:'2',name:'audit-report.json',mime_type:'application/json',size_bytes:22}]); assert.equal(r.source_candidates.length,1); assert.equal(r.quarantined_outcome_candidates.length,1); assert.equal(r.verified_eligible_cases,0); assert.equal(r.source_candidates[0].safe_to_open_for_preparation,false); });
test('metadata manifest hash is deterministic',()=>{ const a=discoverCaseCandidates([{file_id:'1',name:'invoice.pdf'},{file_id:'2',name:'contract.pdf'}]); const b=discoverCaseCandidates([{file_id:'2',name:'contract.pdf'},{file_id:'1',name:'invoice.pdf'}]); assert.equal(a.metadata_manifest_hash,b.metadata_manifest_hash); });
