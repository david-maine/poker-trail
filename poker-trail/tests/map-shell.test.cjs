const {test}=require('node:test');const assert=require('node:assert/strict');const {loader}=require('./support.cjs');
function screen({loading=true,error=null,hand=null,location=null}={}){
  const state=[null,[],error,loading];let cursor=0;
  const Screen=loader({
    react:{useState:()=>[state[cursor++],()=>{}],useMemo:fn=>fn(),useRef:current=>({current}),useEffect(){},useCallback:fn=>fn},
    'react-native':{Platform:{OS:'web'},View:'View',Text:'Text',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:s=>s}},
    '@react-navigation/native':{useFocusEffect(){}},
    '../../src/components/map/MapDisplay':{default:'Map'},
    '../../src/components/cards/CardRow':{default:'Cards'},
    '../../src/components/LeaveEventButton':{default:'Leave'},
    '../../src/components/HandSyncStatus':{default:'Sync'},
    '../../src/components/StatusPill':{default:'Pill'},
    '../../src/hooks/useResponsiveLayout':{default:()=>({width:390,height:844,gap:12,controlTop:44,controlSize:48})},
    '../../src/hooks/useLocation':{default:()=>({location,heading:null,errorMsg:null,retryLocation(){}})},
    '../../src/lib/eventSession':{useEventSession:()=>({registrationState:{event:{id:'event'}},hand})},
    '../../src/lib/game':{},'../../src/lib/localHand':{},'../../src/lib/connectivity':{},'../../src/lib/utils':{},
  })('app/(tabs)/index.tsx').default;
  return Screen();
}
function find(n,type){if(Array.isArray(n))return n.map(x=>find(x,type)).find(Boolean);if(!n||typeof n!=='object')return;return n.type===type?n:find(n.props?.children,type);}
test('map shell immediately shows controls and five empty slots without loading messages',()=>{
  const tree=screen();assert.ok(find(tree,'Leave'));assert.equal(find(tree,'Cards').props.total,5);assert.equal(find(tree,'Pill'),undefined);assert.equal(find(tree,'Map'),undefined);
});
test('GPS can start the map before event data and the local hand arrive',()=>{
  const tree=screen({location:{coords:{latitude:-27.47,longitude:153.02,heading:0}}});assert.ok(find(tree,'Map'));assert.equal(find(tree,'Map').props.waypoints.length,0);assert.ok(find(tree,'Cards'));
});
test('event failure retains the map shell and presents a retry pill',()=>{
  const tree=screen({loading:false,error:'Unable to load event'});assert.ok(find(tree,'Leave'));assert.ok(find(tree,'Cards'));assert.equal(find(tree,'Pill').props.message,'Unable to load event');assert.equal(find(tree,'Pill').props.retryLabel,'Retry event');
});
