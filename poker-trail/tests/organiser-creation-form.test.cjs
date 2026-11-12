const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loader}=require('./support.cjs');

function find(node,predicate) {
 if(Array.isArray(node)) return node.map(child=>find(child,predicate)).find(Boolean);
 if(!node||typeof node!=='object') return;
 return predicate(node)?node:find(node.props?.children,predicate);
}

function form({create=async()=>({id:'created'}),refresh=async()=>{},publish=async()=>{}}={}) {
 const states=[],refs=[],routes=[],publications=[];
 let cursor=0,refCursor=0,effectStarted=false;
 const component=loader({
  react:{createContext:()=>({}),useContext:()=>({refresh}),useState:initial=>{
   const index=cursor++;
   if(!(index in states))states[index]=typeof initial==='function'?initial():initial;
   return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];
  },useRef:initial=>{const index=refCursor++;return refs[index]??(refs[index]={current:initial});},useEffect(effect){if(!effectStarted){effectStarted=true;effect();}}},
  'react-native':{Image:'Image',Modal:'Modal',Platform:{OS:'web'},Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:styles=>styles},useWindowDimensions:()=>({width:1200})},
  'expo-router':{useRouter:()=>({replace:route=>routes.push(route),push:route=>routes.push(route)})},
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
  '../../lib/organiser':{createOrganiserDraft:create,publishOrganiserEvent:async id=>{publications.push(id);await publish(id);}},
 })('src/components/organiser/OrganiserPortal.tsx').NewEventPage;
 const render=()=>{cursor=0;refCursor=0;return component();};
 const editor=()=>find(render(),node=>node.type==='WaypointEditor').props;
 const button=()=>find(render(),node=>node.type?.name==='Button'&&['Publish event','Pay & publish','Please wait…'].includes(node.props.title)).props;
 const draftButton=()=>find(render(),node=>node.type?.name==='Button'&&['Save as draft','Saving draft…'].includes(node.props.title)).props;
 const size=()=>{const option=find(render(),node=>node.props?.accessibilityRole==='radio'&&node.props.accessibilityState.checked).props;return {...option,value:Number(option.testID.split('-').at(-1))};};
 const chooseSize=capacity=>find(render(),node=>node.props?.testID==='event-capacity-'+capacity).props.onPress();
 const setName=name=>find(render(),node=>node.type?.name==='Field'&&node.props.label==='Event name').props.onChangeText(name);
 const setAll=()=>{setName('Trail');for(let i=0;i<5;i++){editor().onSelect(i);editor().onChange({latitude:String(i),longitude:'0',radius:'20'});}};
 return {render,editor,button,draftButton,size,chooseSize,setName,setAll,routes,publications};
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

test('name-only drafts save without publishing and open the first missing waypoint',async()=>{
 let saved;const ui=form({create:async input=>{saved=input;return {id:'draft'};}});
 assert.equal(ui.draftButton().disabled,true);ui.setName('Draft trail');assert.equal(ui.draftButton().disabled,false);assert.equal(ui.button().disabled,true);
 ui.draftButton().onPress();await new Promise(done=>setImmediate(done));
 assert.deepEqual(saved,{name:'Draft trail',waypoints:[],capacity:25});assert.deepEqual(ui.publications,[]);assert.deepEqual(ui.routes,['/organiser/events/draft/waypoints?slot=1']);
});
test('paid incomplete drafts preserve their selected capacity and valid waypoints without checkout',async()=>{
 let saved;const ui=form({create:async input=>{saved=input;return {id:'draft'};}});ui.render();await new Promise(done=>setImmediate(done));
 ui.setName('Later');ui.chooseSize(100);ui.editor().onChange({latitude:'0',longitude:'0',radius:'20'});
 ui.draftButton().onPress();await new Promise(done=>setImmediate(done));
 assert.equal(saved.capacity,100);assert.equal(saved.waypoints.length,1);assert.deepEqual(ui.publications,[]);assert.deepEqual(ui.routes,['/organiser/events/draft/waypoints?slot=2']);
});
test('failed publication retains the draft and retries without creating a duplicate',async()=>{
 let creates=0,fail=true;const ui=form({create:async()=>{creates++;return {id:'draft'};},publish:async()=>{if(fail)throw Error('Offline');}});
 ui.setAll();ui.button().onPress();await new Promise(done=>setImmediate(done));assert.equal(creates,1);assert.ok(find(ui.render(),node=>node.props?.text==='Your draft is saved. Offline'));
 fail=false;ui.button().onPress();await new Promise(done=>setImmediate(done));assert.equal(creates,1);assert.deepEqual(ui.routes,['/organiser/events/draft']);
});
