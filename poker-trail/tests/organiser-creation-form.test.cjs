const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loader}=require('./support.cjs');

function find(node,predicate) {
 if(Array.isArray(node)) return node.map(child=>find(child,predicate)).find(Boolean);
 if(!node||typeof node!=='object') return;
 return predicate(node)?node:find(node.props?.children,predicate);
}

function form({create=async()=>({id:'created'}),refresh=async()=>{}}={}) {
 const states=[],refs=[],routes=[];
 let cursor=0,refCursor=0;
 const component=loader({
  react:{createContext:()=>({}),useContext:()=>({refresh}),useState:initial=>{
   const index=cursor++;
   if(!(index in states))states[index]=typeof initial==='function'?initial():initial;
   return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];
  },useRef:initial=>{const index=refCursor++;return refs[index]??(refs[index]={current:initial});},useEffect(){}},
  'react-native':{Image:'Image',Modal:'Modal',Platform:{OS:'web'},Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:styles=>styles},useWindowDimensions:()=>({width:1200})},
  'expo-router':{useRouter:()=>({replace:route=>routes.push(route),push:route=>routes.push(route)})},
  '@expo/vector-icons/Feather':{default:'Icon'},
  '@expo-google-fonts/roboto-slab/800ExtraBold':{},
  '@expo-google-fonts/montserrat/500Medium_Italic':{},
  'expo-font':{useFonts:()=>[true]},
  './OrganiserWaypointEditor':{default:'WaypointEditor'},
  './OrganiserLeaderboard':{default:'Leaderboard'},
  '../lib/organiserSupabase':{},
  '../lib/organiser':{createOrganiserEventWithWaypoints:create},
 })('src/components/OrganiserPortal.tsx').NewEventPage;
 const render=()=>{cursor=0;refCursor=0;return component();};
 const editor=()=>find(render(),node=>node.type==='WaypointEditor').props;
 const button=()=>find(render(),node=>node.type?.name==='Button'&&['Create event','Creating…','Open event'].includes(node.props.title)).props;
 const size=()=>find(render(),node=>node.type==='select').props;
 const setName=name=>find(render(),node=>node.type?.name==='Field'&&node.props.label==='Event name').props.onChangeText(name);
 const setAll=()=>{setName('Trail');for(let i=0;i<5;i++){editor().onSelect(i);editor().onChange({latitude:String(i),longitude:'0',radius:'20'});}};
 return {render,editor,button,size,setName,setAll,routes};
}

test('event size defaults to free capacity and future tiers are unavailable',()=>{
 const ui=form(),size=ui.size();
 assert.equal(size.defaultValue,'25');assert.equal(size.disabled,false);
 assert.ok(find(ui.render(),node=>node.props?.nativeID===size['aria-labelledby']&&node.props.children==='Event size'));
 assert.deepEqual(size.children.map(option=>[option.props.value,!!option.props.disabled,option.props.children]),[
  ['25',false,'Up to 25 players · Free'],
  ['50',true,'Up to 50 players · Coming soon'],
  ['100',true,'Up to 100 players · Coming soon'],
  ['250',true,'Up to 250 players · Coming soon'],
 ]);
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
 assert.equal(ui.size().disabled,false);assert.equal(ui.size().defaultValue,'25');
 assert.ok(find(ui.render(),node=>node.type?.name==='Feedback'&&node.props.text==='Offline'));
 failCreation=false;ui.button().onPress();await new Promise(done=>setImmediate(done));
 assert.equal(ui.button().title,'Open event');assert.equal(calls,2);
 assert.equal(ui.size().disabled,true);
 failRefresh=false;ui.button().onPress();await new Promise(done=>setImmediate(done));
 assert.equal(calls,2);assert.deepEqual(ui.routes,['/organiser/events/created']);
});
