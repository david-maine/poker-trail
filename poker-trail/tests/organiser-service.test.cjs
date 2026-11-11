const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loader}=require('./support.cjs');

test('closing an organiser event only updates an active event owned by the current organiser', async()=>{
 const filters=[];
 let failure=null;
 let session={user:{id:'owner'}};
 const query={select(){return this;},eq(key,value){filters.push([key,value]);return this;},update(payload){assert.deepEqual(payload,{status:'closed'});return this;},async maybeSingle(){return {data:{user_id:'owner',display_name:'Owner'}};},async single(){return {data:{id:'event'},error:failure};}};
 const service=loader({'./organiserSupabase':{organiserSupabase:{auth:{getSession:async()=>({data:{session}})},from:()=>query}}})('src/lib/organiser.ts');
 await service.closeOrganiserEvent('event');
 for(const expected of [['id','event'],['created_by','owner'],['status','active']]) assert.ok(filters.some(pair=>pair[0]===expected[0]&&pair[1]===expected[1]));
 failure={message:'Event is not active'};
 await assert.rejects(service.closeOrganiserEvent('event'),e=>e===failure);
 session=null;
 await assert.rejects(service.closeOrganiserEvent('event'),/Sign in/);
});

test('organiser deletion is scoped to the signed-in owner and reports refused deletes',async()=>{
 const filters=[];
 let result={data:{id:'event'}};
 const query={select(){return this;},eq(key,value){filters.push([key,value]);return this;},delete(){return this;},async maybeSingle(){return {data:{user_id:'owner',display_name:'Owner'}};},async single(){return result;}};
 const service=loader({'./organiserSupabase':{organiserSupabase:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},from:()=>query}}})('src/lib/organiser.ts');
 await service.deleteOrganiserEvent('event');
 assert.ok(filters.some(([key,value])=>key==='id'&&value==='event'));
 assert.ok(filters.some(([key,value])=>key==='created_by'&&value==='owner'));
 result={error:{message:'Delete refused'}};
 await assert.rejects(service.deleteOrganiserEvent('event'),e=>e.message==='Delete refused');
 result={data:null};
 await assert.rejects(service.deleteOrganiserEvent('event'),/could not be deleted/);
});

test('organiser leaderboard filters by event and loads every ranked page using the organiser client', async()=>{
 const calls=[];
 const first=Array.from({length:1000},(_,i)=>({run_id:String(i),leaderboard_rank:i+1}));
 const signal=new AbortController().signal;
 const query={
  select(){return this;},
  eq(key,value){calls.push(['filter',key,value]);return this;},
  order(key,options){calls.push(['order',key,options.ascending]);return this;},
  range(start,end){calls.push(['range',start,end]);this.start=start;return this;},
  async abortSignal(value){assert.equal(value,signal);return {data:this.start===0?first:[{run_id:'last',leaderboard_rank:1001}]};},
 };
 const service=loader({'./organiserSupabase':{organiserSupabase:{from(table){assert.equal(table,'leaderboard_entries');return query;}}}})('src/lib/organiser.ts');
 const entries=await service.loadOrganiserLeaderboard('my-event',signal);
 assert.equal(entries.length,1001);
 assert.equal(entries[1000].run_id,'last');
 assert.deepEqual(calls.filter(c=>c[0]==='filter'),[['filter','event_id','my-event'],['filter','event_id','my-event']]);
 assert.deepEqual(calls.filter(c=>c[0]==='range'),[['range',0,999],['range',1000,1999]]);
 assert.ok(calls.some(c=>c[0]==='order'&&c[1]==='leaderboard_rank'&&c[2]));
});

test('organiser leaderboard propagates read failures rather than showing an empty ranking', async()=>{
 const failure={message:'Connection lost'};
 const query={select(){return this;},eq(){return this;},order(){return this;},range(){return this;},async abortSignal(){return {error:failure};}};
 const service=loader({'./organiserSupabase':{organiserSupabase:{from:()=>query}}})('src/lib/organiser.ts');
 await assert.rejects(service.loadOrganiserLeaderboard('event',new AbortController().signal),e=>e===failure);
});
test('organiser authentication uses a separate storage key and never signs out the player client',()=>{
 let config;
 loader({
  '@supabase/supabase-js':{createClient:(url,key,options)=>{config={url,key,...options};return {}; }},
  'react-native':{Platform:{OS:'web'}},
  './safeStorage':{getSafeStorage:()=>({})},
  './supabase':{supabaseUrl:'https://dev.supabase.co',supabaseAnonKey:'public'},
 })('src/lib/organiserSupabase.ts');
 assert.equal(config.auth.storageKey,'poker-trail-organiser-auth');
 assert.equal(config.auth.detectSessionInUrl,true);
});
test('organiser event creation sends a draft and publication propagates backend validation failures',async()=>{
 const writes=[];
 const session={user:{id:'owner',email:'owner@example.test'}};
 const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:{user_id:'owner',display_name:'Owner'}};},insert(payload){writes.push(payload);return this;},update(payload){writes.push(payload);return this;},async single(){return {data:{id:'event',name:'Trail',player_capacity:25,status:'draft'}};}};
 const supabase={auth:{getSession:async()=>({data:{session}})},from:()=>query};
 const service=loader({'./organiserSupabase':{organiserSupabase:supabase}})('src/lib/organiser.ts');
 const event=await service.saveOrganiserEvent({name:'Trail'});
 assert.equal(writes[0].status,'draft');assert.equal(writes[0].created_by,'owner');assert.equal(event.playerCapacity,25);
 query.single=async()=>({error:{message:'Save five valid GPS waypoints before publishing'}});
 await assert.rejects(service.publishOrganiserEvent('event'),e=>e.message.includes('five valid'));
 assert.equal(writes[1].status,'active');
 await assert.rejects(service.saveOrganiserWaypoint({eventId:'event',slotIndex:0,latitude:91,longitude:0,radiusMeters:20}),/valid numbers/);
});
