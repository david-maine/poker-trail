// Development-only smoke test. Credentials stay in memory; free fixtures are removed.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const { environmentFor } = require('./start-environment.cjs');

async function main() {
  const env = environmentFor('development');
  const ref = 'cjqxoubluqpupfsofjch';
  assert.equal(fs.readFileSync('supabase/.temp/project-ref','utf8').trim(),ref);
  const keys = JSON.parse(execFileSync(path.resolve('node_modules/supabase/bin',process.platform==='win32'?'supabase.exe':'supabase'),
    ['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const service = keys.find(k=>k.name==='service_role')?.api_key;
  assert.ok(service);
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(env.EXPO_PUBLIC_SUPABASE_URL,service,options);
  const client=createClient(env.EXPO_PUBLIC_SUPABASE_URL,env.EXPO_PUBLIC_SUPABASE_ANON_KEY,options);
  const checked=result=>{if(result.error)throw Error(result.error.message);return result.data;};
  if(process.argv.includes('--cleanup-ui-draft')) {
    const rows=checked(await admin.from('events').select('id,created_by').eq('name','Temporary Draft Flow Verification').eq('status','draft').is('first_published_at',null));
    let removed=0;
    for(const row of rows) {
      const user=checked(await admin.auth.admin.getUserById(row.created_by)).user;
      if(!/^paid-billing-.*@example\.invalid$/.test(user.email)) continue;
      checked(await admin.from('events').delete().eq('id',row.id));removed++;
    }
    console.log('Removed '+removed+' synthetic browser draft fixture(s).');return;
  }
  let userId,eventId;
  try {
    const email=`billing-verification-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
    userId=checked(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;
    checked(await client.auth.signInWithPassword({email,password}));
    checked(await client.from('organizer_profiles').upsert({user_id:userId,display_name:'Development Billing Verification'}));
    const tiers=checked(await client.from('event_capacity_tiers').select('*').order('capacity'));
    assert.deepEqual(tiers.map(t=>[t.capacity,t.amount_cents]),[[25,0],[50,2900],[100,4900],[250,9900]]);
    console.log('PASS: deployed capacity catalogue and authenticated access');
    const event=checked(await client.rpc('create_organiser_event_draft',{
      p_name:'Temporary Development Billing Verification',
      p_waypoints:[], p_capacity:100,
    }));
    eventId=event.id;
    assert.equal(event.status,'draft');assert.equal(event.first_published_at,null);assert.equal(event.player_capacity,25);
    assert.equal(event.requested_capacity,100);
    assert.ok((await client.from('events').update({status:'active'}).eq('id',eventId)).error);
    checked(await client.from('waypoints').insert(Array.from({length:5},(_,i)=>({event_id:eventId,code:'wp'+(i+1),name:'Waypoint '+(i+1),latitude:0,longitude:i/10000,radius_meters:30,sort_order:i,proof_type:'gps',is_active:true}))));
    const unpaid=await client.from('events').update({status:'active'}).eq('id',eventId);assert.match(unpaid.error.message,/payment/);
    checked(await client.from('events').update({requested_capacity:25}).eq('id',eventId));
    console.log('PASS: name-only paid-size draft persists its size; incomplete/unpaid publication blocked; free size can be selected');
    const billing=checked(await client.functions.invoke('event-billing',{body:{eventId}}));
    assert.equal(billing.event.player_capacity,25);assert.equal(billing.testMode,true);
    console.log(`PASS: billing endpoint responds; paid checkout ${billing.enabled?'enabled':'disabled'}`);
    const anonymous=await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/event-checkout`,{
      method:'POST',headers:{'content-type':'application/json',apikey:env.EXPO_PUBLIC_SUPABASE_ANON_KEY},body:JSON.stringify({eventId,targetCapacity:250}),
    });
    assert.equal(anonymous.ok,false);
    assert.match((await anonymous.json()).error,/Sign in/);
    console.log('PASS: unauthenticated checkout rejected');
    assert.ok((await client.from('events').update({player_capacity:250}).eq('id',eventId)).error);
    checked(await client.from('events').update({status:'active'}).eq('id',eventId));
    const active=checked(await client.from('events').select('*').eq('id',eventId).single());
    assert.equal(Date.parse(active.expires_at)-Date.parse(active.first_published_at),30*86400000);
    checked(await client.from('events').update({status:'closed'}).eq('id',eventId));
    checked(await client.from('events').update({status:'active'}).eq('id',eventId));
    assert.equal(checked(await client.from('events').select('expires_at').eq('id',eventId).single()).expires_at,active.expires_at);
    console.log('PASS: protected capacity, publication and non-resetting 30-day window');
    if(!billing.enabled) {
      const checkout=await client.functions.invoke('event-checkout',{body:{eventId,targetCapacity:50}});
      assert.ok(checkout.error);
      const detail=await checkout.error.context.json();assert.match(detail.error,/not configured/);
      assert.equal(checked(await client.from('event_purchases').select('id').eq('event_id',eventId)).length,0);
      console.log('PASS: unconfigured checkout fails clearly without reserving a purchase');
    }
    const webhook=await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stripe-webhook`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'checkout.session.completed'}),
    });
    assert.equal(webhook.status,400);
    console.log('PASS: unsigned webhook rejected');
  } finally {
    if(eventId) checked(await admin.from('events').delete().eq('id',eventId));
    if(userId) checked(await admin.auth.admin.deleteUser(userId));
    await client.auth.signOut();
    console.log('Removed temporary free event and verification account.');
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
