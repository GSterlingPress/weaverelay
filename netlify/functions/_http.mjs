export const json=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
export function publicBase(request){return String(process.env.PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,'');}
export function safeError(error){return json(error?.status||500,{ok:false,error:error?.status?error.message:'WeaveRelay could not complete that request.'});}
