const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loader}=require('./support.cjs');

function renderMap(currentPoint, selectedSlotIndex=0) {
 const effects=[],markers=[],circles=[],bounds=[],viewportActions=[],refs=[];
 const map={setCenter(){viewportActions.push('center');},setZoom(){viewportActions.push('zoom');},fitBounds(){viewportActions.push('fit');}};
 const api={
  SymbolPath:{CIRCLE:'circle'},
  Marker:class {constructor(options){markers.push(options);}setMap(){}addListener(){}},
  Circle:class {constructor(options){circles.push(options);}setMap(){}},
  LatLngBounds:class {extend(point){bounds.push(point);}},
 };
 let cursor=0,refCursor=0;
 const states=[null,map,api,null,null,false,null];
 const component=loader({
  react:{useState:()=>[states[cursor++],()=>{}],useRef:value=>{const i=refCursor++;return refs[i]??(refs[i]={current:value});},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)},
  'react-native':{View:'View',Text:'Text',Pressable:'Pressable',StyleSheet:{create:s=>s}},
  '../../lib/googleMaps.web':{mapsApiKey:'test-key',loadGoogleMaps:async()=>api},
 })('src/components/organiser/OrganiserWaypointMap.web.tsx').default;
 const props={currentPoint,radiusMeters:45,selectedSlotIndex,onPick(){},waypoints:[
  {sortOrder:0,name:'First',latitude:-34,longitude:115,radiusMeters:20},
  {sortOrder:1,name:'Second',latitude:-35,longitude:116,radiusMeters:30},
 ]};
 function render(overrides={}) {
  cursor=0;refCursor=0;effects.length=0;
  component({...props,...overrides});
 // Run overlay and bounds effects without loading the real browser Maps API.
 effects[0]();effects[5]();effects[6]();effects[7]();
 }
 render();
 return {markers,circles,bounds,viewportActions,render};
}

test('editing a saved waypoint moves its marker, radius circle and map bounds before saving',()=>{
 const {markers,circles,bounds}=renderMap({latitude:-33,longitude:117});
 assert.equal(markers.length,2);
 assert.deepEqual(markers[0].position,{lat:-33,lng:117});
 assert.deepEqual(circles[0].center,markers[0].position);
 assert.equal(circles[0].radius,45);
 assert.deepEqual(markers[1].position,{lat:-35,lng:116});
 assert.equal(circles[1].radius,30);
 assert.deepEqual(bounds,[{lat:-35,lng:116},{lat:-33,lng:117}]);
});

test('moving a point or switching waypoints updates overlays without resetting the viewport',()=>{
 const result=renderMap({latitude:-33,longitude:117});
 assert.deepEqual(result.viewportActions,['fit']);
 result.render({currentPoint:{latitude:-32,longitude:118}});
 assert.deepEqual(result.markers.at(-2).position,{lat:-32,lng:118});
 assert.deepEqual(result.circles.at(-2).center,{lat:-32,lng:118});
 result.render({selectedSlotIndex:1,currentPoint:{latitude:-35,longitude:116}});
 assert.deepEqual(result.viewportActions,['fit']);
});

test('saved positions remain when coordinates are invalid and an unsaved slot gets one preview',()=>{
 const saved=renderMap(null);
 assert.deepEqual(saved.markers[0].position,{lat:-34,lng:115});
 assert.equal(saved.circles[0].radius,20);
 const preview=renderMap({latitude:-33,longitude:117},2);
 assert.equal(preview.markers.length,3);
 assert.deepEqual(preview.markers[2].position,{lat:-33,lng:117});
 assert.equal(preview.circles[2].radius,45);
});
