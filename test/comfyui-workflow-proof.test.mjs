import test from'node:test';
import assert from'node:assert/strict';
import{extractComfyWorkflowRequirements,compareComfyWorkflowRequirements}from'../netlify/functions/_comfyui-workflow-proof.mjs';

const studioOneWorkflow={
'1':{class_type:'UNETLoader',inputs:{unet_name:'wan2.1_vace_14B_fp16.safetensors'}},
'2':{class_type:'CLIPLoader',inputs:{clip_name:'umt5_xxl_fp16.safetensors'}},
'3':{class_type:'LoraLoader',inputs:{lora_name:'Wan21_CausVid_14B_T2V_lora_rank32.safetensors'}},
'6':{class_type:'VAELoader',inputs:{vae_name:'wan_2.1_vae.safetensors'}},
'7':{class_type:'WanVaceToVideo',inputs:{}},
'9':{class_type:'KSampler',inputs:{}},
'202':{class_type:'ImageStitch',inputs:{}},
'_studioOne':{workflowId:'wan-vace-14b-causvid-6ref-v1'}
};
const requirements=extractComfyWorkflowRequirements(studioOneWorkflow);
const loader=values=>({input:{required:{value:[values]}}});

test('extracts Studio One VACE node and model requirements without prompts or secrets',()=>{
 assert.equal(requirements.vaceRequired,true);assert.equal(requirements.nodeTypes.includes('WanVaceToVideo'),true);assert.equal(requirements.models.some(x=>x.name==='wan2.1_vace_14B_fp16.safetensors'),true);assert.equal(JSON.stringify(requirements).includes('workflowId'),false);
});

test('passes only when exact workflow nodes and model choices are available',()=>{
 const info={UNETLoader:{input:{required:{unet_name:[['wan2.1_vace_14B_fp16.safetensors']]}}},CLIPLoader:{input:{required:{clip_name:[['umt5_xxl_fp16.safetensors']]}}},LoraLoader:{input:{required:{lora_name:[['Wan21_CausVid_14B_T2V_lora_rank32.safetensors']]}}},VAELoader:{input:{required:{vae_name:[['wan_2.1_vae.safetensors']]}}},WanVaceToVideo:{},KSampler:{},ImageStitch:{}};
 const out=compareComfyWorkflowRequirements(requirements,info);assert.equal(out.status,'PASS');assert.equal(out.classification,'compatible');assert.equal(out.evidence.vaceRuntimePresent,true);assert.equal(out.evidence.fullNodeInventoryRetained,false);
});

test('isolates an exact missing custom node',()=>{
 const info={UNETLoader:{},CLIPLoader:{},LoraLoader:{},VAELoader:{},WanVaceToVideo:{},KSampler:{}};const out=compareComfyWorkflowRequirements(requirements,info);assert.equal(out.status,'FAIL');assert.equal(out.classification,'missing-node');assert.deepEqual(out.evidence.missingNodeTypes,['ImageStitch']);
});

test('isolates exact missing VACE model separately from missing nodes',()=>{
 const info={UNETLoader:{input:{required:{unet_name:[['some-other-model.safetensors']]}}},CLIPLoader:{input:{required:{clip_name:[['umt5_xxl_fp16.safetensors']]}}},LoraLoader:{input:{required:{lora_name:[['Wan21_CausVid_14B_T2V_lora_rank32.safetensors']]}}},VAELoader:{input:{required:{vae_name:[['wan_2.1_vae.safetensors']]}}},WanVaceToVideo:{},KSampler:{},ImageStitch:{}};
 const out=compareComfyWorkflowRequirements(requirements,info);assert.equal(out.status,'FAIL');assert.equal(out.classification,'missing-model');assert.deepEqual(out.evidence.missingModelNames,['wan2.1_vace_14B_fp16.safetensors']);
});

test('warns rather than guessing if runtime node metadata does not enumerate model choices',()=>{
 const info={UNETLoader:{},CLIPLoader:{},LoraLoader:{},VAELoader:{},WanVaceToVideo:{},KSampler:{},ImageStitch:{}};const out=compareComfyWorkflowRequirements(requirements,info);assert.equal(out.status,'WARN');assert.equal(out.classification,'model-inventory-unproven');assert.equal(out.evidence.unprovenModelCount,4);
});
