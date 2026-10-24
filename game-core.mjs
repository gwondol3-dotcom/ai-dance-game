function classifyPose(points) {
  if (!points || points.length < 17) return 'unknown';
  const ids = [11,12,13,14,15,16];
  if (ids.some(i => !points[i] || (points[i].visibility ?? 1) < .55)) return 'unknown';
  const [ls,rs,lw,rw] = [11,12,15,16].map(i=>points[i]);
  const span = Math.hypot(ls.x-rs.x,ls.y-rs.y);
  if (span < .035) return 'unknown';
  const margin = Math.max(.025,span*.22);
  const lUp=lw.y<ls.y-margin, rUp=rw.y<rs.y-margin;
  const lDown=lw.y>ls.y+margin, rDown=rw.y>rs.y+margin;
  if(lUp&&rUp) return 'both';
  if(lUp&&rDown) return 'left';
  if(rUp&&lDown) return 'right';
  if(lDown&&rDown) return 'neutral';
  return 'unknown';
}

const FRUIT_BPM=112,FRUIT_BEAT=60/FRUIT_BPM,FRUIT_BARS=84,FRUIT_DURATION=180;
const FRUIT_LABELS={left:'왼손으로 받아요!',right:'오른손으로 받아요!',both:'양손으로 받아요!',neutral:'팔을 편하게 내려요',unknown:'손과 상체를 보여 주세요'};
function fruitSection(bar){
 if(bar<4)return {name:'준비 운동',hint:'네 박자를 듣고, 과일이 손에 오면 팔을 올려요.',color:'#fff1bd'};
 if(bar<16)return {name:'하나만, 챡!',hint:'하나 · 둘 · 셋 · 챡! 마지막 박자에 받아요.',color:'#ffe8b5'};
 if(bar<36)return {name:'쉬고, 챡! 쉬고, 챡!',hint:'네 박자에 한두 개씩, 새로 팔을 올려요.',color:'#fbd9d6'};
 if(bar<44)return {name:'한숨 돌리기',hint:'팔을 내리고 리듬을 느껴 봐요.',color:'#d7ede0'};
 if(bar<64)return {name:'챡! 챡! 과일 접시',hint:'쉬고 · 쉬고 · 챡 · 챡! 양쪽을 번갈아 받아요.',color:'#ffe8b5'};
 if(bar<80)return {name:'함께하는 과일 파티',hint:'많이보다 정확하게! 과일마다 팔을 새로 올려요.',color:'#eadcf1'};
 return {name:'마지막 한 접시',hint:'끝까지 함께! 잘하고 있어요.',color:'#fff1bd'};
}
function makeFruitChart({bpm=FRUIT_BPM,early=.28,late=.30,difficulty='easy'}={}){
 const beat=60/bpm,notes=[];
 const fruits=['apple','orange','pear','strawberry'];
 function add(bar,position,pose,count=1,division=3){
  const group='bar'+bar+'-at'+position;
  for(let i=0;i<count;i++)notes.push({
   id:group+'-'+i,group,bar,beat:bar*4+position+i/division,time:(bar*4+position+i/division)*beat,
   pose:i%2?(pose==='left'?'right':'left'):pose,side:i%2?(pose==='left'?'right':'left'):pose,fruit:fruits[(bar+i+Math.floor(position))%fruits.length],
   burst:count>1,division,groupSize:count,groupIndex:i,weight:pose==='both'?2:1,result:null
  });
 }
 const side=n=>n%2?'right':'left';
 const hard=difficulty==='hard',burstBars=new Set([19,25,31,43,49,55,61,67,73,79]);
 let sequence=0;
 for(let bar=4;bar<83;bar++){
  if(bar>=36&&bar<40)continue;
  if(hard&&burstBars.has(bar)){add(bar,2,side(sequence++),3);continue;}
  if(hard){
   // Phrase variations mix on-beats, off-beats, pauses and short runs.
   const variations=[[1,3],[0,2],[.5,2.5],[1.5,3],[0,1.5,3],[2,3],[.5,3],[0,2.5]];
   const positions=bar<12?[3]:bar>=80?[1,3]:variations[(bar+Math.floor(bar/4))%variations.length];
   positions.forEach(position=>add(bar,position,side(sequence++)));continue;
  }
  let positions;
  if(bar<16||bar>=80||(bar>=40&&bar<48))positions=[3];
  else if(bar<32)positions=bar%2?[1,3]:[3];
  else if(bar<36)positions=[2,3];
  else positions=bar%4===0?[3]:[[1,3],[2,3],[0,2]][bar%3];
  positions.forEach((position,i)=>add(bar,position,side(bar+i)));
 }
 notes.sort((a,b)=>a.time-b.time);
 // Normal notes keep their windows; triplets allow +/- 0.24 seconds per fruit.
 notes.forEach((n,i)=>{
  const prev=notes.slice(0,i).reverse().find(p=>p.pose===n.pose);
  const next=notes.slice(i+1).find(p=>p.pose===n.pose);
  const gap=Math.min(prev?n.time-prev.time:Infinity,next?next.time-n.time:Infinity);
  n.early=n.burst?.24:Math.min(early,gap*.43);n.late=n.burst?.24:Math.min(late,gap*.43);
 });
 return notes;
}
class FruitPoseTracker{
 constructor(holdMs=40){this.holdMs=holdMs;this.reset();}
 reset(){this.candidate='unknown';this.since=0;this.stable='unknown';this.initialized=false;this.up={left:false,right:false};this.rise={left:-Infinity,right:-Infinity};}
 update(pose,timeMs){
  if(this.candidate!==pose){this.candidate=pose;this.since=timeMs;}
  let edge=null;
  if(timeMs-this.since>=this.holdMs&&this.stable!==pose){
   this.stable=pose;
   if(pose!=='unknown'){
    const up={left:pose==='left'||pose==='both',right:pose==='right'||pose==='both'};
    const rising=this.initialized?['left','right'].filter(side=>up[side]&&!this.up[side]):[];
    this.initialized=true;
    for(const side of rising)this.rise[side]=this.since;
    if(rising.length){
     const together=up.left&&up.right&&Math.abs(this.rise.left-this.rise.right)<=120;
     edge={pose:together?'both':rising[0],timeMs:this.since};
    }
    this.up=up;
   }
  }
  return {pose:this.stable,edge};
 }
}
class FruitGame{
 constructor(options={}){
  this.bpm=options.bpm||FRUIT_BPM;this.beat=60/this.bpm;this.duration=FRUIT_BARS*4*this.beat;
  this.notes=makeFruitChart(options);this.bestCombo=0;this.combo=0;
 }
 observe(pose,time,{edge=false,at=time}={}){
  if(!edge||!['left','right','both'].includes(pose))return null;
  const candidates=this.notes.filter(n=>!n.result&&n.pose===pose&&time>=n.time-n.early-1e-7&&time<=n.time+n.late+1e-7);
  candidates.sort((a,b)=>a.burst&&b.burst&&a.group===b.group?a.time-b.time:Math.abs(a.time-time)-Math.abs(b.time-time));
  const n=candidates[0];if(!n)return null;
  const delta=time-n.time;
  n.result={kind:Math.abs(delta)<=Math.min(.12,n.early*.7)?'perfect':'good',delta,judgedAt:time,at};
  this.combo++;this.bestCombo=Math.max(this.bestCombo,this.combo);return n;
 }
 expire(time){
  const missed=[];
  for(const n of this.notes)if(!n.result&&time>n.time+n.late+.35){
   n.result={kind:'miss',at:time};this.combo=0;missed.push(n);
  }
  return missed;
 }
 stats(){
  const hits=this.notes.filter(n=>n.result&&n.result.kind!=='miss');
  return {hits:hits.length,total:this.notes.length,
   fruit:hits.reduce((s,n)=>s+n.weight,0),totalFruit:this.notes.reduce((s,n)=>s+n.weight,0),
   perfect:hits.filter(n=>n.result.kind==='perfect').length,bestCombo:this.bestCombo};
 }
}


// One performance-clock -> audible audio-clock mapping for visuals and input.
// A completed inference must never be timestamped with its delivery time.
function audioTimeAt(audio, performanceMs, nowMs=performanceMs){
 if(!audio)return 0;
 const current=audio.currentTime;
 if(audio.state!=='running')return current;
 try{
  const stamp=audio.getOutputTimestamp?.();
  if(stamp&&stamp.contextTime>0&&stamp.contextTime<=current&&stamp.performanceTime>0&&nowMs-stamp.performanceTime<2000&&stamp.performanceTime<=nowMs+100){
   return Math.min(current,stamp.contextTime+(performanceMs-stamp.performanceTime)/1000);
  }
 }catch{}
 const delay=[audio.baseLatency,audio.outputLatency].reduce((sum,n)=>sum+(Number.isFinite(n)&&n>0?n:0),0);
 return current-Math.min(.7,delay)+(performanceMs-nowMs)/1000;
}

function cameraFrameTime(metadata,nowMs){
 for(const value of [metadata?.captureTime,metadata?.presentationTime]){
  if(Number.isFinite(value)&&value>0&&value<=nowMs&&nowMs-value<2000)return value;
 }
 return nowMs;
}

function frameEventTime(frame,eventMs,startTime,offset=0){
 return frame.audioTime-(frame.timestamp-eventMs)/1000-startTime+offset;
}

function calibrationOffset(samples){
 const values=samples.filter(n=>Number.isFinite(n)&&Math.abs(n)<=.3).sort((a,b)=>a-b);
 if(values.length<6)return null;
 const median=list=>list.length%2?list[(list.length-1)/2]:(list[list.length/2-1]+list[list.length/2])/2;
 const center=median(values),deviations=values.map(n=>Math.abs(n-center)).sort((a,b)=>a-b),mad=median(deviations);
 if(mad>.08)return null;
 const kept=values.filter(n=>Math.abs(n-center)<=Math.max(.035,mad*3));
 if(kept.length<6)return null;
 // Negative measured deltas ("early") need a positive judgement correction.
 return Math.round(-median(kept)*1000)/1000;
}

export { classifyPose, FRUIT_BPM, FRUIT_BEAT, FRUIT_BARS, FRUIT_DURATION, FRUIT_LABELS, fruitSection, makeFruitChart, FruitPoseTracker, FruitGame, audioTimeAt, cameraFrameTime, frameEventTime, calibrationOffset };
