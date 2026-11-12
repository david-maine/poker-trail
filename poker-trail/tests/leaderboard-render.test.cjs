const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');
test('leaderboard defers row rendering to the virtualized list', () => {
  const entries = Array.from({length: 300}, (_,i) => ({runId: 'run-'+i,userId:'user-'+i,leaderboardRank:i+1,playerLabel:'Crew '+i,bestHandCards:[],visitCount:0,startedAt:'2026-11-05T00:00:00Z',finishedAt:null}));
  const state = [entries, null, false, false, null]; let cursor=0;
  let compareRows;
  const Screen = loader({
    react: {memo:(fn, compare)=>{compareRows=compare;return fn;},useState: () => [state[cursor++],()=>{}],useRef: current=>({current}),useEffect(){},useCallback: fn=>fn},
    '../../src/components/cards/CardImage': {default:'Image',preloadCardImages(){}},
    'react-native': {Platform:{OS:'web'},View:'View',Text:'Text',Image:'Image',Pressable:'Pressable',ScrollView:'ScrollView',FlatList:'FlatList',StyleSheet:{create:s=>s}},
    '@expo/vector-icons': {Ionicons:'Icon'},
    '@react-navigation/native': {useFocusEffect(){}},
    '../../src/components/LeaveEventButton': {default:'Leave'},
    '../../src/components/LoadingStatus': {default:'Loading'},
    '../../src/components/cards/PlayingCard': {default:'Card'},
    '../../src/components/HandSyncStatus': {default:'Sync'},
    '../../src/hooks/useResponsiveLayout': {default:()=>({contentWidth:354,contentMaxWidth:720,cardHeight:100,cardGap:8,height:844,gap:12})},
    '../../src/lib/eventSession': {useEventSession:()=>({registrationState:{event:{id:'event'}}})},
    '../../src/lib/game': {}, '../../src/lib/connectivity': {}, '../../src/lib/supabase': {},
    '../../assets/images/POKER-TRAIL-trophy.png':1,'../../src/lib/cardImages': {CARD_BACK_IMAGE:2},
  })('app/(tabs)/leaderboard.tsx').default;
  function find(n){if(Array.isArray(n))return n.map(find).find(Boolean);if(!n||typeof n!=='object')return;return n.type==='FlatList'?n:find(n.props?.children);}
  const list=find(Screen());assert.ok(list);assert.equal(list.props.data.length,300);
  assert.ok(list.props.initialNumToRender<=4);assert.ok(list.props.windowSize<=5);
  assert.equal(list.props.children,undefined);
  assert.equal(list.props.keyExtractor(entries[1]),'run-1');
  assert.equal(list.props.renderItem({item:entries[0]}).key,'run-0');
  const props=list.props.renderItem({item:entries[0]}).props;
  const refreshed={...props,entry:{...props.entry,bestHandCards:[...props.entry.bestHandCards]}};
  assert.equal(compareRows(props,refreshed),true,'unchanged snapshots skip rendering');
  for (const patch of [{bestHandCards:['AS']},{leaderboardRank:2},{playerLabel:'New name'},{visitCount:1},{bestHandName:'Pair'},{finishedAt:'2026-11-05T01:00:00Z'}]) {
    assert.equal(compareRows(props,{...refreshed,entry:{...refreshed.entry,...patch}}),false,'visible changes must render');
  }
  assert.equal(compareRows(props,{...refreshed,cards:{...props.cards,width:99}}),false);
});

