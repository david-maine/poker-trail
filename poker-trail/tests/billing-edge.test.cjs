const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');

function moduleAt(file,mocks,env={}) {
 let handler;
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports','Deno',code)(name=>{
   if(!(name in mocks)) throw Error('Unexpected dependency '+name);
   return mocks[name];
 },module,module.exports,{env:{get:key=>env[key]},serve:fn=>{handler=fn;}});
 return {exports:module.exports,handler};
}
function shared(env={}) {
 return moduleAt('supabase/functions/_shared/billing.ts',{
  'npm:@supabase/supabase-js@2':{},'npm:stripe@18.5.0':{},
 },env).exports;
}
const dev={BILLING_ENVIRONMENT:'development',BILLING_APP_ORIGIN:'http://localhost:8081',STRIPE_SECRET_KEY:'sk_test_example'};

test('billing configuration confines test and live keys to their intended environments',()=>{
 assert.equal(shared(dev).paymentConfig().enabled,true);
 for(const patch of [{BILLING_ENVIRONMENT:'production'},{STRIPE_SECRET_KEY:'sk_live_example'},{BILLING_APP_ORIGIN:'https://example.com/evil'},{STRIPE_SECRET_KEY:''}]) assert.equal(shared({...dev,...patch}).paymentConfig().enabled,false);
 const production={BILLING_ENVIRONMENT:'production',BILLING_APP_ORIGIN:'https://example.com',STRIPE_SECRET_KEY:'sk_live_example'};
 assert.equal(shared(production).paymentConfig().enabled,false);
 assert.equal(shared({...production,BILLING_LIVE_ENABLED:'true'}).paymentConfig().enabled,true);
});

test('fulfilment refuses unpaid sessions and mismatched metadata before changing capacity',async()=>{
 const service=shared(dev);let calls=0;
 const query={select(){return this;},eq(){return this;},async single(){return {data:{id:'purchase',event_id:'event',amount_cents:2900,currency:'aud',livemode:false,stripe_session_id:'session'}};}};
 const db={from:()=>query,rpc:async(name,args)=>{calls++;assert.equal(name,'fulfil_event_purchase');assert.equal(args.p_amount,2900);return {data:null};}};
 let session={payment_status:'unpaid'};
 const stripe={checkout:{sessions:{retrieve:async()=>session}}};
 await service.fulfilSession(db,stripe,'session');assert.equal(calls,0);
 session={payment_status:'paid',id:'session',metadata:{purchase_id:'purchase',event_id:'other'},livemode:false};
 await assert.rejects(service.fulfilSession(db,stripe,'session'),/metadata/);assert.equal(calls,0);
 session={...session,metadata:{purchase_id:'purchase',event_id:'event'},amount_total:2900,currency:'aud',payment_intent:{id:'intent',latest_charge:{receipt_url:'https://pay.stripe.com/receipt'}}};
 await service.fulfilSession(db,stripe,'session');assert.equal(calls,1);
});

test('webhook rejects invalid signatures, retries failures and acknowledges duplicates',async()=>{
 let invalid=true,fail=false,duplicate=false,fulfils=0;
 const helpers={
  reply:(body,status=200)=>new Response(JSON.stringify(body),{status}),
  paymentConfig:()=>({live:false}),checked:result=>{if(result.error)throw result.error;return result.data;},
  stripeClient:()=>({webhooks:{constructEventAsync:async raw=>{
    assert.equal(raw,'raw body');if(invalid)throw Error('signature');
    return {id:'evt_test',livemode:false,type:'checkout.session.completed',data:{object:{id:'cs_test'}}};
  }}}),
  database:()=>({from:()=>({select(){return this;},eq(){return this;},async maybeSingle(){return {data:duplicate?{id:'evt_test'}:null};},async insert(){return {error:null};}})}),
  fulfilSession:async()=>{fulfils++;if(fail)throw Error('database unavailable');},
 };
 const {handler}=moduleAt('supabase/functions/stripe-webhook/index.ts',{'../_shared/billing.ts':helpers});
 const request=()=>new Request('http://localhost',{method:'POST',body:'raw body'});
 assert.equal((await handler(request())).status,400);assert.equal(fulfils,0);
 invalid=false;fail=true;assert.equal((await handler(request())).status,500);
 fail=false;assert.equal((await handler(request())).status,200);
 duplicate=true;assert.equal((await handler(request())).status,200);assert.equal(fulfils,2);
});

test('checkout authenticates before reserving a purchase or accepting client prices',async()=>{
 let stripeCalls=0;
 const helpers={cors:{},reply:(body,status=200)=>new Response(JSON.stringify(body),{status}),
 ownerContext:async()=>{throw Error('Sign in');},stripeClient:()=>{stripeCalls++;},};
 const {handler}=moduleAt('supabase/functions/event-checkout/index.ts',{'../_shared/billing.ts':helpers});
 const response=await handler(new Request('http://localhost',{method:'POST',body:JSON.stringify({eventId:'other',targetCapacity:250,amount:1})}));
 assert.equal(response.status,400);assert.equal(stripeCalls,0);
});
