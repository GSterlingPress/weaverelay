import crypto from 'node:crypto';

function vaultError(code,message,cause){const error=new Error(message,{cause});error.code=code;return error}

function key(value=process.env.CONNECT_TOKEN_ENCRYPTION_KEY||process.env.WEAVERELAY_TOKEN_ENCRYPTION_KEY){
  const text=String(value||'').trim();
  if(/^[a-f0-9]{64}$/i.test(text))return Buffer.from(text,'hex');
  let b;try{b=Buffer.from(text,'base64')}catch{}
  if(b?.length===32)return b;
  throw vaultError('VAULT_KEY_INVALID','The credential-vault encryption key is missing or invalid for this deploy context.');
}

function decodeField(value,name){
  if(typeof value!=='string'||!value)return null;
  try{const b=Buffer.from(value,'base64url');return b.length?b:null}catch(error){throw vaultError('VAULT_RECORD_INVALID',`The encrypted credential record has an invalid ${name} field.`,error)}
}

export function encryptSecret(value,{keyVersion=1}={}){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(Buffer.from(`weaverelay:${keyVersion}`));
  const plaintext=Buffer.from(JSON.stringify(value)),ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return{ciphertext:ciphertext.toString('base64url'),iv:iv.toString('base64url'),authTag:cipher.getAuthTag().toString('base64url'),keyVersion,updatedAt:new Date().toISOString()};
}

export function decryptSecret(record){
  const version=Number(record?.keyVersion||1),iv=decodeField(record?.iv,'iv'),authTag=decodeField(record?.authTag,'authTag'),ciphertext=decodeField(record?.ciphertext,'ciphertext');
  if(!Number.isFinite(version)||version<1||!iv||iv.length!==12||!authTag||authTag.length!==16||!ciphertext)throw vaultError('VAULT_RECORD_INVALID','The encrypted credential record is incomplete or malformed.');
  let decipher;
  try{decipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);decipher.setAAD(Buffer.from(`weaverelay:${version}`));decipher.setAuthTag(authTag)}catch(error){if(error?.code==='VAULT_KEY_INVALID')throw error;throw vaultError('VAULT_CRYPTO_INIT_FAILED','The credential vault could not initialize decryption.',error)}
  try{return JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'))}catch(error){throw vaultError('VAULT_AUTH_FAILED','The encrypted credential could not be authenticated with this deployment context.',error)}
}
