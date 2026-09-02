import { consumeLoginToken,sessionCookie } from './_auth.mjs';
import { json } from './_http.mjs';
export default async request=>{if(request.method!=='POST')return json(405,{ok:false,error:'Method not allowed.'});let body;try{body=await request.json()}catch{return json(400,{ok:false,error:'Invalid request.'})}try{const{user,sessionToken,next}=await consumeLoginToken(body.token);return json(200,{ok:true,user:{id:user.id,email:user.email},next},{'set-cookie':sessionCookie(sessionToken)})}catch(error){return json(400,{ok:false,error:error.message})}};
