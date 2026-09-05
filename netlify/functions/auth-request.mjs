import crypto from 'node:crypto';
import { Resend } from 'resend';
import { createLoginToken } from './_auth.mjs';
import { enforceAuthRequestLimit } from './_auth-rate-limit.mjs';
import { normalizeEmail,isValidEmail } from './_token.mjs';
import { deployContext } from './_scoped-store.mjs';
import { json,publicBase } from './_http.mjs';

const PREVIEW_TESTER_EMAIL_SHA256='44c4557e395b57618c6c0664520ac6a48fb95ddcabecbef8f3a4eaf61a33ea11';
const isPreviewContext=()=>['deploy-preview','branch-deploy'].includes(deployContext());
const isPreviewTester=email=>crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex')===PREVIEW_TESTER_EMAIL_SHA256;

export default async request=>{
  if(request.method!=='POST')return json(405,{ok:false,error:'Method not allowed.'});
  let body;try{body=await request.json()}catch{return json(400,{ok:false,error:'Invalid request.'})}
  if(body.company)return json(200,{ok:true,message:'Check your email.'});
  const email=normalizeEmail(body.email);if(!isValidEmail(email))return json(400,{ok:false,error:'Enter a valid email address.'});
  try{await enforceAuthRequestLimit(request,email)}catch(error){return json(error.status||429,{ok:false,error:'Too many sign-in requests. Please wait and try again.'})}

  if(isPreviewContext()&&isPreviewTester(email)){
    let token;try{token=createLoginToken(email,{next:body.next})}catch{return json(500,{ok:false,error:'WeaveRelay could not create a preview sign-in link.'})}
    return json(200,{ok:true,message:'Opening the isolated preview test account…',previewSignInUrl:`/signin.html?t=${encodeURIComponent(token)}`});
  }

  if(!process.env.RESEND_API_KEY)return json(500,{ok:false,error:'Email sign-in is not configured yet.'});
  let token;try{token=createLoginToken(email,{next:body.next})}catch(error){return json(500,{ok:false,error:'WeaveRelay could not create a sign-in link.'})}
  const url=`${publicBase(request)}/signin.html?t=${encodeURIComponent(token)}`,resend=new Resend(process.env.RESEND_API_KEY);
  const{error}=await resend.emails.send({from:process.env.WEAVERELAY_FROM_EMAIL||'WeaveRelay <hello@weaverelay.com>',to:email,subject:'Sign in to WeaveRelay',html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px"><h1>Sign in to WeaveRelay</h1><p>This link confirms your email. On the next page, press Sign in to finish.</p><p><a href="${url}" style="display:inline-block;padding:14px 20px;border-radius:999px;background:#163b2c;color:#fff;text-decoration:none;font-weight:700">Continue to WeaveRelay</a></p><p style="color:#66756f;font-size:13px">The link expires in 30 minutes and can be used once.</p></div>`,text:`Continue to WeaveRelay: ${url}\n\nThe link expires in 30 minutes and can be used once.`});
  if(error){console.error('WeaveRelay sign-in email send failed',{name:error.name||'ResendError',message:error.message||'send failed'});return json(502,{ok:false,error:'We could not send the sign-in email.'})}
  return json(200,{ok:true,message:'Check your email for a fresh WeaveRelay sign-in link.'});
};
