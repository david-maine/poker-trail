// One-use localhost login for the synthetic billing fixture only; no tokens are logged.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {createServer}=require('node:http'),{randomUUID}=require('node:crypto');
const assert=require('node:assert/strict'),{createClient}=require('@supabase/supabase-js');
const {environmentFor}=require('./start-environment.cjs');
async function main(){
 const ref='cjqxoubluqpupfsofjch',env=environmentFor('development'),eventId=process.argv[2];
 assert.equal(fs.readFileSync('supabase/.temp/project-ref','utf8').trim(),ref);
 const cli=path.resolve('node_modules/supabase/bin',process.platform==='win32'?'supabase.exe':'supabase');
 const keys=JSON.parse(execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(env.EXPO_PUBLIC_SUPABASE_URL,keys.find(k=>k.name==='service_role').api_key,options);
 const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};
 const event=checked(await admin.from('events').select('created_by,name').eq('id',eventId).single());
 assert.ok(event.name.startsWith('Paid Billing Verification '));
 const user=checked(await admin.auth.admin.getUserById(event.created_by)).user;
 assert.match(user.email,/^paid-billing-.*@example\.invalid$/);
 const link=checked(await admin.auth.admin.generateLink({type:'magiclink',email:user.email}));
 const client=createClient(env.EXPO_PUBLIC_SUPABASE_URL,env.EXPO_PUBLIC_SUPABASE_ANON_KEY,options);
 const {session}=checked(await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'}));
 const fragment=new URLSearchParams({access_token:session.access_token,refresh_token:session.refresh_token,token_type:'bearer',expires_in:String(session.expires_in),type:'magiclink'});
 const route='/'+randomUUID();let used=false;
 const server=createServer((req,res)=>{
  if(req.url!==route||used){res.writeHead(404);res.end();return;}
  used=true;res.writeHead(302,{'Location':`http://localhost:8081/organiser/events/${eventId}/billing#${fragment}`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
  server.close();
 });
 server.listen(0,'127.0.0.1',()=>console.log('One-use fixture portal: http://127.0.0.1:'+server.address().port+route));
 setTimeout(()=>server.close(),300000).unref();
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
