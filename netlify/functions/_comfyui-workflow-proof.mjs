const clean=v=>String(v??'').trim();
const uniq=a=>[...new Set((a||[]).filter(Boolean))];
const MODEL_KEYS=new Set(['ckpt_name','unet_name','clip_name','vae_name','lora_name','control_net_name','model_name']);

export function extractComfyWorkflowRequirements(workflow={}){
  const nodes=[];const models=[];
  for(const [id,node] of Object.entries(workflow||{})){
    if(id.startsWith('_')||!node||typeof node!=='object')continue;
    const type=clean(node.class_type);if(!type)continue;
    nodes.push(type);
    for(const [key,value] of Object.entries(node.inputs||{}))if(MODEL_KEYS.has(key)&&typeof value==='string'&&value&&!value.includes('{{'))models.push({nodeType:type,input:key,name:value});
  }
  return{nodeTypes:uniq(nodes),models:models.filter((m,i,a)=>a.findIndex(x=>x.nodeType===m.nodeType&&x.input===m.input&&x.name===m.name)===i),vaceRequired:nodes.some(x=>/vace/i.test(x)),workflowNodeCount:nodes.length};
}

function choices(def,key){
  const field=def?.input?.required?.[key]??def?.input?.optional?.[key];
  if(!Array.isArray(field)||!Array.isArray(field[0]))return null;
  return field[0].filter(x=>typeof x==='string');
}

export function compareComfyWorkflowRequirements(requirements={},objectInfo={}){
  const requiredNodes=uniq(requirements.nodeTypes||[]),available=new Set(Object.keys(objectInfo||{}));
  const missingNodes=requiredNodes.filter(x=>!available.has(x));
  const missingModels=[];const unprovenModels=[];
  for(const model of requirements.models||[]){
    if(!available.has(model.nodeType))continue;
    const options=choices(objectInfo[model.nodeType],model.input);
    if(options===null){unprovenModels.push(model.name);continue}
    if(!options.includes(model.name))missingModels.push(model.name);
  }
  const missingNodeTypes=uniq(missingNodes),missingModelNames=uniq(missingModels),unprovenModelNames=uniq(unprovenModels);
  let status='PASS',classification='compatible';
  if(missingNodeTypes.length){status='FAIL';classification='missing-node'}
  else if(missingModelNames.length){status='FAIL';classification='missing-model'}
  else if(unprovenModelNames.length){status='WARN';classification='model-inventory-unproven'}
  const vaceNodeRequired=Boolean(requirements.vaceRequired),vaceRuntimePresent=requiredNodes.filter(x=>/vace/i.test(x)).every(x=>available.has(x));
  const detail=status==='PASS'?'The live ComfyUI runtime exposes every node type and model choice required by the selected application workflow.':classification==='missing-node'?`The selected workflow requires ${missingNodeTypes.length} ComfyUI node type${missingNodeTypes.length===1?'':'s'} that the live runtime does not expose: ${missingNodeTypes.slice(0,5).join(', ')}.`:classification==='missing-model'?`The selected workflow references ${missingModelNames.length} model file${missingModelNames.length===1?'':'s'} that the live ComfyUI loader inventory does not expose: ${missingModelNames.slice(0,5).join(', ')}.`:'All required node types are present, but ComfyUI did not expose enough loader-choice metadata to prove every referenced model file.';
  return{status,classification,detail,evidence:{source:'weaverelay-comfyui-workflow-proof',requiredNodeTypeCount:requiredNodes.length,requiredModelCount:(requirements.models||[]).length,missingNodeCount:missingNodeTypes.length,missingModelCount:missingModelNames.length,unprovenModelCount:unprovenModelNames.length,missingNodeTypes:missingNodeTypes.slice(0,5),missingModelNames:missingModelNames.slice(0,5),vaceRequired:vaceNodeRequired,vaceRuntimePresent,fullNodeInventoryRetained:false,fullModelInventoryRetained:false,responseBodiesRetained:false}};
}
