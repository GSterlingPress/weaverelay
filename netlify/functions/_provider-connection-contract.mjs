import { PROVIDERS } from './_provider-catalog.mjs';

export const PROVIDER_CONNECTION_CONTRACT=Object.freeze({
  github:Object.freeze({method:'oauth',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'AUTHORIZE GITHUB',probe:'github.live'}),
  netlify:Object.freeze({method:'oauth',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'AUTHORIZE NETLIFY',probe:'netlify.account'}),
  railway:Object.freeze({method:'oauth',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'SELECT PROJECT → AUTHORIZE READ-ONLY',probe:'railway.runtime'}),
  supabase:Object.freeze({method:'credential',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'CONNECT SUPABASE',probe:'supabase.live'}),
  stripe:Object.freeze({method:'credential',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'CONNECT STRIPE',probe:'stripe.live'}),
  runpod:Object.freeze({method:'credential',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'CONNECT RUNPOD',probe:'runpod.live'}),
  comfyui:Object.freeze({method:'auto-detect',customerState:'AUTO-DETECT',connectedState:'AUTO-DETECTED',failureState:'NEEDS ACTION',actionLabel:'AUTO-DETECT FROM RUNTIME',probe:'map.runpod-comfyui'}),
  vercel:Object.freeze({method:'credential',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'CONNECT VERCEL',probe:'vercel.live'}),
  render:Object.freeze({method:'credential',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'CONNECT RENDER',probe:'render.live'}),
  cloudflare:Object.freeze({method:'credential',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'CONNECT CLOUDFLARE',probe:'cloudflare.live'}),
  neon:Object.freeze({method:'credential',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'CONNECT NEON',probe:'neon.live'}),
  resend:Object.freeze({method:'credential',customerState:'CONNECT',connectedState:'CONNECTED',failureState:'NEEDS ACTION',actionLabel:'CONNECT RESEND',probe:'resend.live'})
});

export const PROVIDER_CONNECTION_IDS=Object.freeze(Object.keys(PROVIDER_CONNECTION_CONTRACT));
export const DIRECT_CREDENTIAL_PROVIDER_IDS=Object.freeze(PROVIDER_CONNECTION_IDS.filter(id=>PROVIDER_CONNECTION_CONTRACT[id].method==='credential'));
export const OAUTH_PROVIDER_IDS=Object.freeze(PROVIDER_CONNECTION_IDS.filter(id=>PROVIDER_CONNECTION_CONTRACT[id].method==='oauth'));
export const AUTO_DETECT_PROVIDER_IDS=Object.freeze(PROVIDER_CONNECTION_IDS.filter(id=>PROVIDER_CONNECTION_CONTRACT[id].method==='auto-detect'));

export function providerConnectionState(providerId,{connectionStatus,providerStatus}={}){
  const contract=PROVIDER_CONNECTION_CONTRACT[providerId];
  if(!contract||!PROVIDERS[providerId])throw new Error(`Unsupported provider connection contract: ${providerId}`);
  const status=String(connectionStatus||providerStatus||'not_connected');
  if(contract.method==='auto-detect'){
    if(status==='connected')return{state:'auto-detected',label:contract.connectedState,actionable:false};
    if(status==='error'||status==='needs_action')return{state:'needs-action',label:contract.failureState,actionable:true};
    return{state:'auto-detect',label:contract.customerState,actionable:false};
  }
  if(status==='connected')return{state:'connected',label:contract.connectedState,actionable:true};
  if(status==='error'||status==='revoked'||status==='needs_action')return{state:'needs-action',label:contract.failureState,actionable:true};
  return{state:'connect',label:contract.customerState,actionable:true};
}
