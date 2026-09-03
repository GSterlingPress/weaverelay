import crypto from 'node:crypto';
import { Resend } from 'resend';
import { createLoginToken } from './_auth.mjs';
import { normalizeEmail,isValidEmail } from './_token.mjs';
import { json,publicBase } from './_http.mjs';

function stagingFreshIdentity(request,email,requested){
  if(!requested)return email;
  const base=publicBase(request);
  const stagingEnabled=process.env.WEAVERELAY_ENV==='staging'&&base==='https://staging.weaverelay.com';
  const allowed=normalizeEmail(process.env.WEAVERELAY_STAGING_TEST_EMAIL||'');
  if(!stagingEnabled||!allowed||email!==allowed)throw new Error('Fresh-customer testing is available only to the configured staging tester.');
  const [local,domain]=email.split('@');
  return `${local}+wrtest-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@${domain}`;
}

export default async request=>{if(request.method!=='POST')return json(405,{ok:false,error:'Method not allowed.'});let body;try{body=await request.json()}catch{return json(400,{ok:false,error:'Invalid request.'})}if(body.company)return json(200,{ok:true,message:'Check your email.'});const email=normalizeEmail(body.email);if(!isValidEmail(email))return json(400,{ok:false,error:'Enter a valid email address.'});if(!process.env.RESEND_API_KEY)return json(500,{ok:false,error:'Email sign-in is not configured yet.'});let identityEmail;try{identityEmail=stagingFreshIdentity(request,email,body.freshTest===true)}catch(error){return json(403,{ok:false,error:error.message})}let token;try{token=createLoginToken(identityEmail,{next:body.next})}catch(error){return json(500,{ok:false,error:error.message})}const url=`${publicBase(request)}/signin.html?t=${encodeURIComponent(token)}`,resend=new Resend(process.env.RESEND_API_KEY);const{error}=await resend.emails.send({from:process.env.WEAVERELAY_FROM_EMAIL||'WeaveRelay <hello@weaverelay.com>',to:email,subject:body.freshTest===true?'WeaveRelay staging — fresh customer sign-in':'Sign in to WeaveRelay',html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px"><h1>${body.freshTest===true?'Fresh staging customer':'Sign in to WeaveRelay'}</h1><p>${body.freshTest===true?'This creates a brand-new isolated staging identity while delivering to your configured test inbox.':'This link confirms your email. On the next page, press Sign in to finish.'}</p><p><a href="${url}" style="display:inline-block;padding:14px 20px;border-radius:999px;background:#163b2c;color:#fff;text-decoration:none;font-weight:700">Continue to WeaveRelay</a></p><p style="color:#66756f;font-size:13px">The link expires in 30 minutes and can be used once.</p></div>`,text:`Continue to WeaveRelay staging: ${url}\n\nThe link expires in 30 minutes and can be used once.`});if(error){console.error(error);return json(502,{ok:false,error:'We could not send the sign-in email.'})}return json(200,{ok:true,message:body.freshTest===true?'Fresh staging customer created. Check your usual test inbox.':'Check your email for a fresh WeaveRelay sign-in link.'});};
