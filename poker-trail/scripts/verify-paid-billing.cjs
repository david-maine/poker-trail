// Interactive development-only hosted-checkout smoke test. Keeps paid audit records.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {parseEnv}=require('node:util');
const {createClient}=require('@supabase/supabase-js');
const {environmentFor}=require('./start-environment.cjs');
const {createInterface}=require('node:readline');
async function main(){
 const ref='cjqxoubluqpupfsofjch',env=environmentFor('development');
 assert.equal(fs.readFileSync('supabase/.temp/project-ref','utf8').trim(),ref);
 const privateEnv=parseEnv(fs.readFileSync('.env.billing.local','utf8'));
 assert.ok(privateEnv.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
 const cli=path.resolve('node_modules/supabase/bin',process.platform==='win32'?'supabase.exe':'supabase');
 const keys=JSON.parse(execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(env.EXPO_PUBLIC_SUPABASE_URL,keys.find(k=>k.name==='service_role').api_key,options);
 const owner=createClient(env.EXPO_PUBLIC_SUPABASE_URL,env.EXPO_PUBLIC_SUPABASE_ANON_KEY,options);
 const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};
 const invoke=async(name,body)=>{
  const r=await owner.functions.invoke(name,{body});
  if(r.error){const d=await r.error.context?.json().catch(()=>null);throw Error(d?.error||r.error.message);}return r.data;
 };
 const stripe=async(method,route,params)=>{
  const r=await fetch('https://api.stripe.com/v1/'+route,{method,headers:{Authorization:'Bearer '+privateEnv.STRIPE_SECRET_KEY,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(30000)});
  const data=await r.json();if(!r.ok)throw Error(data.error?.message||'Stripe request failed');return data;
 };
 const email=`paid-billing-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
 const user=checked(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
 checked(await owner.auth.signInWithPassword({email,password}));
 checked(await owner.from('organizer_profiles').upsert({user_id:user.id,display_name:'Paid Billing Test (Development)'}));
 const event=checked(await owner.rpc('create_organiser_event_with_waypoints',{p_name:'Paid Billing Verification '+new Date().toISOString(),p_waypoints:Array.from({length:5},(_,i)=>({slot_index:i,latitude:0,longitude:i/10000,radius_meters:30}))}));
 const eventId=event.id;
 console.log('Test event: '+eventId);
 const billing=await invoke('event-billing',{eventId});assert.equal(billing.enabled,true);assert.equal(billing.testMode,true);
 const first=await invoke('event-checkout',{eventId,targetCapacity:50});
 const same=await invoke('event-checkout',{eventId,targetCapacity:50});assert.equal(first.url,same.url);
 await assert.rejects(invoke('event-checkout',{eventId,targetCapacity:100}),/outstanding/);
 await invoke('event-checkout',{eventId,cancel:true});
 assert.equal(checked(await owner.from('events').select('player_capacity').eq('id',eventId).single()).player_capacity,25);
 console.log('PASS: repeat checkout reused; different tier blocked; cancellation preserved free capacity');
 const session=await invoke('event-checkout',{eventId,targetCapacity:50});
 console.log('CHECKOUT_50 '+session.url);
 console.log('Awaiting commands: verify50, upgrade100, verify100, replay, refund, finish');
 let firstExpiry;
 const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
 for await(const line of lines){
  const command=line.trim();
  try{
   if(command==='verify50'||command==='verify100'){
    const capacity=command==='verify50'?50:100;
    // Read the database directly: billing polling cannot fulfil these payments.
    let actual;
    for(let i=0;i<20;i++){
     actual=checked(await admin.from('events').select('*').eq('id',eventId).single());
     if(actual.player_capacity===capacity)break;
     await new Promise(r=>setTimeout(r,1000));
    }
    assert.equal(actual.player_capacity,capacity,'Webhook must unlock capacity without browser return or billing polling');
    const purchases=checked(await admin.from('event_purchases').select('*').eq('event_id',eventId).eq('status','paid').order('created_at'));
    const paid=purchases.at(-1);assert.equal(paid.amount_cents,capacity===50?2900:2000);assert.ok(paid.receipt_url);
    const receipt=await fetch(paid.receipt_url);assert.equal(receipt.ok,true);
    assert.equal(actual.status,'active');assert.ok(actual.first_published_at);assert.equal(Date.parse(actual.expires_at)-Date.parse(actual.first_published_at),30*86400000);
    if(capacity===100) assert.equal(actual.expires_at,firstExpiry);
    firstExpiry=actual.expires_at;
    assert.ok((await owner.from('events').delete().eq('id',eventId)).error);
    console.log('PASS: webhook-only publication/capacity '+capacity+', correct amount, reachable receipt, protected deletion');
   }else if(command==='upgrade100'){
    const checkout=await invoke('event-checkout',{eventId,targetCapacity:100});console.log('CHECKOUT_100 '+checkout.url);
   }else if(command==='replay'){
    const paid=checked(await admin.from('event_purchases').select('*').eq('event_id',eventId).eq('status','paid').order('created_at',{ascending:false})).at(0);
    const session=await stripe('GET','checkout/sessions/'+paid.stripe_session_id);
    const payload=JSON.stringify({id:'evt_verification_'+randomUUID(),object:'event',type:'checkout.session.completed',livemode:false,data:{object:session}});
    const timestamp=Math.floor(Date.now()/1000),signature=require('node:crypto').createHmac('sha256',privateEnv.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+payload).digest('hex');
    const request=()=>fetch(env.EXPO_PUBLIC_SUPABASE_URL+'/functions/v1/stripe-webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body:payload});
    assert.equal((await request()).status,200);assert.equal((await request()).status,200);
    assert.equal(checked(await admin.from('events').select('player_capacity').eq('id',eventId).single()).player_capacity,paid.target_capacity);
    console.log('PASS: signed duplicate delivery acknowledged without changing capacity or charging again');
   }else if(command==='refund'){
    const paid=checked(await admin.from('event_purchases').select('*').eq('event_id',eventId).eq('status','paid').order('created_at',{ascending:false})).at(0);
    const result=await stripe('POST','refunds',[['payment_intent',paid.stripe_payment_intent]]);assert.equal(result.status,'succeeded');
    let record;for(let i=0;i<20;i++){record=checked(await admin.from('event_purchases').select('*').eq('id',paid.id).single());if(record.review_required)break;await new Promise(r=>setTimeout(r,1000));}
    assert.equal(record.refunded_cents,paid.amount_cents);assert.equal(record.review_required,true);
    assert.equal(checked(await admin.from('events').select('player_capacity').eq('id',eventId).single()).player_capacity,paid.target_capacity);
    console.log('PASS: test refund recorded for review without interrupting capacity');
   }else if(command==='finish'){
    checked(await owner.from('events').update({status:'closed'}).eq('id',eventId));await owner.auth.signOut();
    console.log('Closed verification event; paid audit records retained in development.');lines.close();break;
   }
  }catch(error){console.error('FAIL '+command+': '+error.message);}
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
