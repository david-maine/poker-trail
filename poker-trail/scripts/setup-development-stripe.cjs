// Installs only sandbox/test credentials. Secret values are never printed.
const fs=require('node:fs');
const path=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const ref='cjqxoubluqpupfsofjch';
async function main(){
 assert.equal(fs.readFileSync('supabase/.temp/project-ref','utf8').trim(),ref);
 const file=path.resolve('.env.billing.local');
 const env=parseEnv(fs.readFileSync(file,'utf8'));
 assert.ok(env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),'Provide a Stripe test secret key in .env.billing.local');
 const api=async(method,route,params)=>{
  const response=await fetch('https://api.stripe.com/v1/'+route,{
   method,headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
   body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(30000),
  });
  const data=await response.json();if(!response.ok)throw Error(data.error?.message||'Stripe setup failed');return data;
 };
 await api('GET','balance');console.log('Validated Stripe test credentials.');
 if(!env.STRIPE_WEBHOOK_SECRET){
  const params=[['url',`https://${ref}.supabase.co/functions/v1/stripe-webhook`],['description','Poker Trail development billing (test mode only)']];
  for(const type of ['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed'])params.push(['enabled_events[]',type]);
  const endpoint=await api('POST','webhook_endpoints',params);
  assert.equal(endpoint.livemode,false);assert.ok(endpoint.secret?.startsWith('whsec_'));
  env.STRIPE_WEBHOOK_SECRET=endpoint.secret;
  fs.appendFileSync(file,`\nSTRIPE_WEBHOOK_SECRET=${endpoint.secret}\nSTRIPE_WEBHOOK_ENDPOINT_ID=${endpoint.id}\n`);
  console.log('Registered development test webhook.');
 }
 // Upload only named credentials, including neither comments nor unrelated settings.
 const secretFile=path.resolve('.env.billing-upload.local');
 fs.writeFileSync(secretFile,`STRIPE_SECRET_KEY=${env.STRIPE_SECRET_KEY}\nSTRIPE_WEBHOOK_SECRET=${env.STRIPE_WEBHOOK_SECRET}\n`);
 try{
  execFileSync(path.resolve('node_modules/supabase/bin',process.platform==='win32'?'supabase.exe':'supabase'),
   ['secrets','set','--env-file',secretFile,'--project-ref',ref],{stdio:['ignore','pipe','pipe'],timeout:60000});
  console.log('Stored Stripe test and webhook secrets in development Supabase.');
 }finally{fs.unlinkSync(secretFile);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
