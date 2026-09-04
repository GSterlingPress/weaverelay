import { PROVIDER_CONNECTION_CONTRACT } from './_provider-connection-contract.mjs';

const clean=v=>String(v??'').trim();
export const OAUTH_RECONNECT_PROVIDERS=Object.freeze(['github','railway']);

export function connectionFailureStatus(provider,httpStatus){
  const status=Number(httpStatus)||null;
  if(OAUTH_RECONNECT_PROVIDERS.includes(provider)&&status===401)return'revoked';
  return'error';
}

export function safeConnectionFailureDetail(provider,httpStatus){
  const label=PROVIDER_CONNECTION_CONTRACT[provider]?.actionLabel||'Reconnect provider';
  const status=Number(httpStatus)||null;
  if(status===401||status===403)return`Provider authorization is no longer usable. ${label}.`;
  if(status===429)return'Provider rate limit prevented verification. The saved connection was not replaced; try VERIFY LIVE again later.';
  if(status&&status>=500)return'Provider service error prevented verification. The saved connection was not replaced; try VERIFY LIVE again later.';
  return'WeaveRelay could not verify this saved connection. Reconnect it before relying on provider diagnostics.';
}

export function validateProviderDisconnect(provider){
  const contract=PROVIDER_CONNECTION_CONTRACT[provider];
  if(!contract)throw Object.assign(new Error('Unsupported provider connection.'),{status:400});
  if(contract.method==='auto-detect')throw Object.assign(new Error('ComfyUI is auto-detected from its proven runtime and has no separate credential to disconnect. Disconnect or repair the runtime connection instead.'),{status:409});
  return contract;
}

export function replacementSecretId(previousConnection,newConnectionId){
  const previous=clean(previousConnection?.id);
  const next=clean(newConnectionId);
  return previous&&previous!==next?previous:null;
}
