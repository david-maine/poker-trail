const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loader}=require('./support.cjs');

function find(node,predicate) {
 if(Array.isArray(node)) return node.map(child=>find(child,predicate)).find(Boolean);
 if(!node||typeof node!=='object') return;
 return predicate(node)?node:find(node.props?.children,predicate);
}

function form({create=async()=>({id:'created'}),refresh=async()=>{},publish=async()=>{},setup=false,overview=false,settings=false,pause=async()=>{},remove=async()=>{},rename=async()=>{},initialSlot='1',event,waypoints=[],save=async input=>({...event,name:input.name,requestedCapacity:input.capacity})}={}) {
 const states=[],refs=[],routes=[],publications=[],paramChanges=[];
 const params={eventId:event?.id,slot:initialSlot};
 let cursor=0,refCursor=0,effectStarted=false;
 const portal=loader({
  react:{createContext:()=>({}),useContext:()=>({refresh,dashboard:event?{events:[event],waypoints,summaries:{}}:null}),useState:initial=>{
   const index=cursor++;
   if(!(index in states))states[index]=typeof initial==='function'?initial():initial;
   return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];
  },useRef:initial=>{const index=refCursor++;return refs[index]??(refs[index]={current:initial});},useEffect(effect){if(!effectStarted){effectStarted=true;effect();}}},
  'react-native':{Image:'Image',Modal:'Modal',Platform:{OS:'web'},Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:styles=>styles},useWindowDimensions:()=>({width:1200})},
  'expo-router':{usePathname:()=>'/organiser/events/'+event?.id,useLocalSearchParams:()=>params,useRouter:()=>({replace:route=>routes.push(route),push:route=>routes.push(route),setParams:values=>{paramChanges.push(values);Object.assign(params,values);}})},
  '@expo/vector-icons/Feather':{default:'Icon'},
  '@expo-google-fonts/roboto-slab/800ExtraBold':{},
  '@expo-google-fonts/roboto-slab/400Regular':{},
  '@expo-google-fonts/roboto-slab/600SemiBold':{},
  '@expo-google-fonts/roboto-slab/700Bold':{},
  '@expo-google-fonts/montserrat/500Medium_Italic':{},
  'expo-font':{useFonts:()=>[true]},
  './OrganiserWaypointEditor':{default:'WaypointEditor'},
  './OrganiserLeaderboard':{default:'Leaderboard'},
  './EventBillingPanel':{default:'BillingPanel'},
  '../../lib/eventBilling':{loadCapacityTiers:async()=>[{capacity:25,amount_cents:0},{capacity:50,amount_cents:2900},{capacity:100,amount_cents:4900},{capacity:250,amount_cents:9900}],money:c=>String(c),eventExpired:()=>false,openEventCheckout:async(id,capacity)=>{routes.push('checkout:'+id+':'+capacity);}},
  '../../lib/organiserSupabase':{},
  '../../lib/organiser':{setOrganiserRegistrationsPaused:pause,deleteOrganiserEvent:remove,saveOrganiserEvent:rename,createOrganiserDraft:create,saveOrganiserDraft:save,publishOrganiserEvent:async id=>{publications.push(id);await publish(id);}},
 })('src/components/organiser/OrganiserPortal.tsx','\nmodule.exports.EventFrame = EventFrame;');
 const component=settings?portal.EventFrame:(overview?portal.OverviewPage():setup?portal.WaypointsPage():portal.NewEventPage()).type;
 const render=()=>{cursor=0;refCursor=0;return component({event,waypoints});};
 const editor=()=>find(render(),node=>node.type==='WaypointEditor').props;
 const button=()=>find(render(),node=>node.type?.name==='Button'&&['Publish event','Pay & publish','Please wait…'].includes(node.props.title)).props;
 const draftButton=()=>find(render(),node=>node.type?.name==='Button'&&['Save draft','Saving draft…'].includes(node.props.title)).props;
 const size=()=>{const option=find(render(),node=>node.props?.accessibilityRole==='radio'&&node.props.accessibilityState.checked).props;return {...option,value:Number(option.testID.split('-').at(-1))};};
 const chooseSize=capacity=>find(render(),node=>node.props?.testID==='event-capacity-'+capacity).props.onPress();
 const setName=name=>find(render(),node=>node.type?.name==='Field'&&node.props.label==='Event name').props.onChangeText(name);
 const setAll=()=>{setName('Trail');for(let i=0;i<5;i++){editor().onSelect(i);editor().onChange({latitude:String(i),longitude:'0',radius:'20'});}};
 return {render,editor,button,draftButton,size,chooseSize,setName,setAll,routes,publications,paramChanges};
}

test('visible event sizes default to free and allow selecting the loaded catalogue',async()=>{
 const ui=form(),size=ui.size();
 assert.equal(size.value,25);assert.equal(size.disabled,false);
 assert.ok(find(ui.render(),node=>node.props?.accessibilityRole==='radiogroup'&&node.props.accessibilityLabel==='Event size'));
 await new Promise(done=>setImmediate(done));
 ui.chooseSize(100);assert.equal(ui.size().value,100);assert.equal(ui.size().accessibilityState.checked,true);
});

test('creation requires all five points and preserves each draft when switching slots',()=>{
 const ui=form();ui.setName('Trail');
 assert.equal(ui.button().disabled,true);
 assert.equal(ui.editor().autoPickUserLocation,false);
 assert.deepEqual(ui.editor().draft,{latitude:'',longitude:'',radius:'20'});
 ui.editor().onChange({latitude:'0',longitude:'0',radius:'25'});
 ui.editor().onSelect(1);
 assert.equal(ui.editor().draft.latitude,'');
 ui.editor().onChange({latitude:'-34',longitude:'115',radius:'30'});
 ui.editor().onSelect(0);
 assert.deepEqual(ui.editor().draft,{latitude:'0',longitude:'0',radius:'25'});
 assert.equal(ui.button().disabled,true);
 ui.setAll();assert.equal(ui.button().disabled,false);
 ui.setName(' ');assert.equal(ui.button().disabled,true);ui.setName('Trail');
 ui.editor().onChange({...ui.editor().draft,radius:'0'});
 assert.equal(ui.button().disabled,true);
});

test('repeated create clicks send one request and successful creation opens the event',async()=>{
 let calls=0,resolve;
 const pending=new Promise(done=>{resolve=done;});
 const ui=form({create:async input=>{calls++;assert.equal(input.waypoints.length,5);await pending;return {id:'created'};}});
 ui.setAll();const button=ui.button();
 const first=button.onPress();button.onPress();
 assert.equal(calls,1);assert.equal(ui.button().disabled,true);assert.equal(ui.editor().disabled,true);
 assert.equal(ui.size().disabled,true);
 resolve();await first;
 // Button callbacks deliberately return void; allow its async continuation to finish.
 await new Promise(done=>setImmediate(done));
 assert.deepEqual(ui.routes,['/organiser/events/created']);
 assert.equal(ui.size().disabled,true);
});

test('failed creation retains form values and refresh retries never create a second event',async()=>{
 let calls=0,failCreation=true,failRefresh=true;
 const ui=form({create:async()=>{calls++;if(failCreation)throw Error('Offline');return {id:'created'};},refresh:async()=>{if(failRefresh)throw Error('Refresh failed');}});
 ui.setAll();ui.button().onPress();await new Promise(done=>setImmediate(done));
 assert.equal(ui.editor().draft.latitude,'4');assert.equal(ui.button().disabled,false);
 assert.equal(ui.size().disabled,false);assert.equal(ui.size().value,25);
 assert.ok(find(ui.render(),node=>node.type?.name==='Feedback'&&node.props.text==='Offline'));
 failCreation=false;ui.button().onPress();await new Promise(done=>setImmediate(done));
 assert.equal(ui.button().title,'Publish event');assert.equal(calls,2);
 assert.equal(ui.size().disabled,true);
 failRefresh=false;ui.button().onPress();await new Promise(done=>setImmediate(done));
 assert.equal(calls,2);assert.deepEqual(ui.routes,['/organiser/events/created']);
});

test('paid capacity creation routes to event billing',async()=>{const ui=form();ui.render();await new Promise(done=>setImmediate(done));ui.setAll();ui.chooseSize(100);ui.button().onPress();await new Promise(done=>setImmediate(done));assert.deepEqual(ui.routes,['checkout:created:100']);assert.deepEqual(ui.publications,[]);});

test('name-only drafts save without publishing and return to Your Events',async()=>{
 let saved;const ui=form({create:async input=>{saved=input;return {id:'draft'};}});
 assert.equal(ui.draftButton().disabled,true);ui.setName('Draft trail');assert.equal(ui.draftButton().disabled,false);assert.equal(ui.button().disabled,true);
 ui.draftButton().onPress();await new Promise(done=>setImmediate(done));
 assert.deepEqual(saved,{name:'Draft trail',waypoints:[],capacity:25});assert.deepEqual(ui.publications,[]);assert.deepEqual(ui.routes,['/organiser']);
});
test('paid incomplete drafts preserve their selected capacity and valid waypoints without checkout',async()=>{
 let saved;const ui=form({create:async input=>{saved=input;return {id:'draft'};}});ui.render();await new Promise(done=>setImmediate(done));
 ui.setName('Later');ui.chooseSize(100);ui.editor().onChange({latitude:'0',longitude:'0',radius:'20'});
 ui.draftButton().onPress();await new Promise(done=>setImmediate(done));
 assert.equal(saved.capacity,100);assert.equal(saved.waypoints.length,1);assert.deepEqual(ui.publications,[]);assert.deepEqual(ui.routes,['/organiser']);
});
test('failed publication retains the draft and retries without creating a duplicate',async()=>{
 let creates=0,fail=true;const ui=form({create:async()=>{creates++;return {id:'draft'};},publish:async()=>{if(fail)throw Error('Offline');}});
 ui.setAll();ui.button().onPress();await new Promise(done=>setImmediate(done));assert.equal(creates,1);assert.ok(find(ui.render(),node=>node.props?.text==='Your draft is saved. Offline'));
 fail=false;ui.button().onPress();await new Promise(done=>setImmediate(done));assert.equal(creates,1);assert.deepEqual(ui.routes,['/organiser/events/draft']);
});


test('saved drafts hydrate the shared form and update the original event',async()=>{
 let saved,creates=0;
 const event={id:'existing',status:'draft',name:'Saved trail',requestedCapacity:100,playerCapacity:25};
 const ui=form({event,waypoints:[{sortOrder:0,isActive:true,latitude:-27,longitude:153,radiusMeters:30}],create:async()=>{creates++;},save:async input=>{saved=input;return event;}});
 assert.equal(ui.editor().draft.latitude,'-27');await new Promise(done=>setImmediate(done));assert.equal(ui.size().value,100);assert.equal(ui.size().disabled,false);
 assert.equal(ui.button().disabled,true);
 ui.setName('Updated trail');ui.editor().onChange({latitude:'-28',longitude:'152',radius:'40'});
 ui.draftButton().onPress();await new Promise(done=>setImmediate(done));
 assert.deepEqual(saved,{id:'existing',name:'Updated trail',capacity:100,waypoints:[{slotIndex:0,latitude:-28,longitude:152,radiusMeters:40}]});
 assert.equal(creates,0);assert.deepEqual(ui.routes,['/organiser']);
});

test('existing draft publication saves edits before publishing and supports retry',async()=>{
 const calls=[];let fail=true;
 const event={id:'existing',status:'draft',name:'Saved trail',requestedCapacity:25,playerCapacity:25};
 const ui=form({event,save:async()=>{calls.push('save');return {...event};},publish:async()=>{calls.push('publish');if(fail)throw Error('Offline');},create:async()=>{throw Error('Must update existing draft');}});
 ui.setAll();ui.button().onPress();await new Promise(done=>setImmediate(done));
 assert.deepEqual(calls,['save','publish']);assert.equal(ui.editor().disabled,false);
 fail=false;ui.button().onPress();await new Promise(done=>setImmediate(done));
 assert.deepEqual(calls,['save','publish','save','publish']);assert.deepEqual(ui.routes,['/organiser/events/existing']);
});


test('switching published waypoints updates only slot params so the current Setup route and map stay mounted',()=>{
 const ui=form({setup:true,initialSlot:'3',event:{id:'existing',status:'active',name:'Trail'}});
 assert.equal(ui.editor().selectedSlotIndex,2);
 ui.editor().onSelect(4);
 assert.deepEqual(ui.paramChanges,[{slot:'5'}]);
 assert.equal(ui.editor().selectedSlotIndex,4);
 ui.editor().onSelect(0);
 assert.equal(ui.editor().selectedSlotIndex,0);
 assert.deepEqual(ui.routes,[], 'slot selection must not replace or push a route');
});


test('leaderboard and setup pages do not expose a navigation refresh action',()=>{
 const event={id:'existing',status:'active',name:'Trail'};
 const ui=form({overview:true,event});
 assert.equal(ui.render().props.navigationAction,undefined);
 assert.ok(find(ui.render(),node=>node.type==='Leaderboard'));
 assert.equal(form({setup:true,event}).render().props.navigationAction,undefined);
});


test('settings saves the name, pauses and resumes registrations, and confirms deletion',async()=>{
 const event={id:'event',name:'Original',status:'active',registrationsPaused:false};
 const calls=[];
 const ui=form({settings:true,event,rename:async input=>calls.push(input),pause:async(id,paused)=>{calls.push({id,paused});event.registrationsPaused=paused;},remove:async id=>calls.push({deleted:id})});
 const action=title=>find(ui.render(),node=>node.type?.name==='Button'&&node.props.title===title).props;
 const open=()=>find(ui.render(),node=>node.props?.accessibilityLabel==='Edit event settings').props.onPress();
 open();
 assert.equal(action('Save name').disabled,true);
 find(ui.render(),node=>node.type?.name==='Field'&&node.props.label==='Event name').props.onChangeText('Renamed');
 action('Save name').onPress();await new Promise(done=>setImmediate(done));
 assert.deepEqual(calls[0],{id:'event',name:'Renamed'});
 open();action('Pause registrations').onPress();await new Promise(done=>setImmediate(done));
 assert.deepEqual(calls[1],{id:'event',paused:true});
 action('Resume registrations').onPress();await new Promise(done=>setImmediate(done));
 assert.deepEqual(calls[2],{id:'event',paused:false});
 action('Delete event').onPress();
 assert.equal(calls.length,3,'delete first opens confirmation');
 action('Keep event').onPress();assert.equal(calls.length,3);
 action('Delete event').onPress();action('Delete event').onPress();await new Promise(done=>setImmediate(done));
 assert.deepEqual(calls[3],{deleted:'event'});assert.deepEqual(ui.routes,['/organiser']);
});
