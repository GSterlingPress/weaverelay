import { Resend } from 'resend';
import { consumeLoginToken,sessionCookie } from './_auth.mjs';
import { json } from './_http.mjs';

export function shouldNotifyFounder(isNewUser){return isNewUser===true;}

async function notifyFounder(user){
  const apiKey=process.env.RESEND_API_KEY;
  const to=process.env.WEAVERELAY_SIGNUP_NOTIFY_EMAIL;
  if(!apiKey||!to)return;
  try{
    const resend=new Resend(apiKey);
    const when=new Date().toISOString();
    const {error}=await resend.emails.send({
      from:process.env.WEAVERELAY_FROM_EMAIL||'WeaveRelay <hello@weaverelay.com>',
      to,
      subject:'New WeaveRelay signup',
      html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px"><p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#587065">WeaveRelay</p><h1 style="font-size:26px;margin:16px 0">New verified signup</h1><p><strong>Email:</strong> ${user.email}</p><p><strong>Time:</strong> ${when}</p><p><strong>Status:</strong> Verified account created</p></div>`,
      text:`New WeaveRelay signup\n\nEmail: ${user.email}\nTime: ${when}\nStatus: Verified account created`
    });
    if(error)console.error('Founder signup notification failed',error);
  }catch(error){console.error('Founder signup notification failed',error)}
}

export default async request=>{
  if(request.method!=='POST')return json(405,{ok:false,error:'Method not allowed.'});
  let body;try{body=await request.json()}catch{return json(400,{ok:false,error:'Invalid request.'})}
  try{
    const{user,sessionToken,next,isNewUser}=await consumeLoginToken(body.token);
    if(shouldNotifyFounder(isNewUser))await notifyFounder(user);
    return json(200,{ok:true,user:{id:user.id,email:user.email},next},{'set-cookie':sessionCookie(sessionToken)});
  }catch(error){return json(400,{ok:false,error:error.message})}
};
