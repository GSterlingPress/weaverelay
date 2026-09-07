import { createHash } from 'node:crypto';

const FORBIDDEN_CONTENT_KEYS=new Set(['content','text','snippet','body','pages','extracted_text','ocr','outcome','gold','findings','result']);
const GOLD_NAME=/(audit[-_ ]?report|final[-_ ]?report|settlement|recovery|credit|adjudicat|outcome|gold|finding|results?)/i;
const SOURCE_NAME=/(contract|invoice|purchase[-_ ]?order|\bpo\b|work[-_ ]?order|timesheet|crew|equipment|ticket|backup|spreadsheet|email|statement)/i;

export function assertMetadataOnly(record){
  if(!record||typeof record!=='object') throw new Error('metadata record required');
  for(const key of Object.keys(record)) if(FORBIDDEN_CONTENT_KEYS.has(key.toLowerCase())) throw new Error(`forbidden content-bearing field: ${key}`);
}
export function stableMetadataHash(records){
  const safe=records.map(r=>{assertMetadataOnly(r); return {file_id:r.file_id??null,name:r.name??null,path:r.path??null,mime_type:r.mime_type??null,size_bytes:r.size_bytes??null,created_at_utc:r.created_at_utc??null,modified_at_utc:r.modified_at_utc??null};});
  const canonical=JSON.stringify(safe.sort((a,b)=>`${a.path??''}/${a.name??''}`.localeCompare(`${b.path??''}/${b.name??''}`)));
  return createHash('sha256').update(canonical).digest('hex');
}
export function classifyMetadata(record){
  assertMetadataOnly(record);
  const label=`${record.path??''}/${record.name??''}`;
  return Object.freeze({
    file_id:record.file_id??null,name:record.name??null,path:record.path??null,mime_type:record.mime_type??null,size_bytes:record.size_bytes??null,
    source_candidate:SOURCE_NAME.test(label),
    outcome_bearing_candidate:GOLD_NAME.test(label),
    safe_to_open_for_preparation:false
  });
}
export function discoverCaseCandidates(records){
  const classified=records.map(classifyMetadata);
  const sourceCandidates=classified.filter(x=>x.source_candidate&&!x.outcome_bearing_candidate);
  const quarantined=classified.filter(x=>x.outcome_bearing_candidate);
  return Object.freeze({
    procedure_version:'audit36-metadata-only-v1',
    metadata_manifest_hash:stableMetadataHash(records),
    total_metadata_records:classified.length,
    source_candidates:sourceCandidates,
    quarantined_outcome_candidates:quarantined,
    verified_eligible_cases:0,
    rule:'Metadata can nominate files/case folders only. Eligibility requires a complete source boundary and separable gold provenance; no candidate file is opened during discovery.'
  });
}
