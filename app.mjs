import { classifyPose, FRUIT_BPM, FRUIT_BEAT, FRUIT_BARS, FRUIT_DURATION, FRUIT_LABELS, fruitSection, makeFruitChart, FruitPoseTracker, FruitGame, audioTimeAt, cameraFrameTime, frameEventTime, calibrationOffset } from './game-core.mjs';

const bridgeArgs=new URLSearchParams(location.hash.slice(1));
const bridgePort=bridgeArgs.get('port')||'8765',bridgeToken=bridgeArgs.get('token')||'';
const originalFetch=window.fetch.bind(window);
window.fetch=(input,options={})=>{
 if(typeof input==='string'&&input.startsWith('/api/')){
  if(!bridgeToken){
   if(input==='/api/connect'||input==='/api/action')return Promise.resolve(new Response(JSON.stringify({error:'실제 레고 연결은 START.cmd로 실행해 주세요.'}),{status:400,headers:{'Content-Type':'application/json'}}));
   const body=input==='/api/status'?{bridge_ready:false,players:Array.from({length:4},()=>({status:'disconnected',message:'START.cmd로 실행하면 레고를 연결할 수 있어요.'}))}:{ok:true};
   return Promise.resolve(new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}}));
  }
  const headers=new Headers(options.headers||{});headers.set('X-Lego-Token',bridgeToken);
  const localOrigin='http://127.0.0.1:'+bridgePort;
  const target=location.origin===localOrigin?input:localOrigin+input;
  return originalFetch(target,{...options,headers,keepalive:input==='/api/stop'});
 }
 return originalFetch(input,options);
};





const kitchenBackground=new Image();
kitchenBackground.src='./assets/backgrounds/kitchen.png';
const chefSprite=new Image();
chefSprite.src='./assets/characters/red-panda.png';
const otterSprite=new Image();
otterSprite.src='./assets/characters/otter.png';
function fruitApproach(note,time,side,dual=false){
 const direction=side==='left'?-1:1,target=640+direction*190,flight=FRUIT_BEAT*3;
 const progress=Math.max(0,Math.min(1,1-(note.time-time)/flight));
 const start=direction<0?(dual?275:-70):(dual?1005:1350);
 return {x:start+(target-start)*progress,y:328-200*Math.sin(progress*Math.PI),rotation:direction*(1-progress)*1.8};
}
function fruitMotion(note,time,side,dual=false){
 const direction=side==='left'?-1:1,target=640+direction*190;
 if(time<note.time-FRUIT_BEAT*3)return null;
 const hit=note.result&&note.result.kind!=='miss';
 if(hit&&time>=note.result.at){
  const age=time-note.result.at,duration=.64;if(age>duration)return null;
  const start=fruitApproach(note,note.result.at,side,dual);
  // A late catch starts exactly where the fruit was already falling.
  const late=Math.max(0,note.result.at-note.time);
  if(late>0){start.x=target;start.y=328+50*late+1000*late*late;}
  const t=Math.min(1,age/duration),ease=t*t*(3-2*t);
  return {phase:'caught',x:start.x+(target-start.x)*ease,y:start.y+(604-start.y)*ease-45*Math.sin(t*Math.PI),scale:1.1-.55*ease,rotation:direction*.3*Math.sin(t*Math.PI),alpha:1,progress:t};
 }
 if(time<=note.time)return {phase:'approach',...fruitApproach(note,time,side,dual),scale:1.1,alpha:1};
 // Begin gravity at arrival, without waiting for camera processing / MISS expiry.
 const age=time-note.time,y=328+50*age+1000*age*age;
 if(y>800)return null;
 return {phase:'falling',x:target,y,scale:1.1,rotation:direction*age*1.5,alpha:1};
}
function drawFruitScene(ctx,{time=0,notes=[],pose='neutral',combo=0,idle=false,player=0,dual=false}={}){
 const W=1280,H=720,beat=60/112,pulse=Math.sin(time/beat*Math.PI*2),bounce=idle?Math.sin(time*3)*3:pulse*3;
 ctx.clearRect(0,0,W,H);ctx.lineCap='round';ctx.lineJoin='round';
 function shape(fill,stroke='#31483d',width=5){ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=width;}
 function rect(x,y,w,h,r,fill,stroke='#31483d',lw=4){shape(fill,stroke,lw);ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();if(lw)ctx.stroke();}
 function ellipse(x,y,rx,ry,fill,stroke='#31483d',lw=4){shape(fill,stroke,lw);ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();if(lw)ctx.stroke();}
 function line(points,color='#31483d',width=5){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
 function text(t,x,y,size=24,color='#31483d',align='center'){ctx.font='700 '+size+'px KitchenRound,"Malgun Gothic",sans-serif';ctx.textAlign=align;ctx.fillStyle=color;ctx.strokeStyle=color;ctx.fillText(t,x,y);}
 // A toy-box kitchen: smiling clouds, a star clock and dancing pantry jars.
 const ink='#203458';
 function face(x,y,scale=1){ellipse(x-9*scale,y,2.5*scale,4*scale,ink,ink,0);ellipse(x+9*scale,y,2.5*scale,4*scale,ink,ink,0);ctx.beginPath();ctx.arc(x,y+4*scale,7*scale,0,Math.PI);ctx.strokeStyle=ink;ctx.lineWidth=2.5;ctx.stroke();}
 function star(x,y,r,fill='#ffdc45',turn=0){ctx.save();ctx.translate(x,y);ctx.rotate(turn);shape(fill,ink,3);ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.46:r;const xx=Math.cos(a)*rr,yy=Math.sin(a)*rr;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
 // AI-painted kitchen background is embedded for standalone offline play.
 if(kitchenBackground.complete&&kitchenBackground.naturalWidth)ctx.drawImage(kitchenBackground,0,0,W,H);
 else rect(0,0,W,H,0,'#e9e3cb',ink,0);
  ellipse(642,632,195,20,'#9e795b3a','#31483d',0);
 // Four illustrated animation frames: ready, left, right, both.
 const sprite=player?otterSprite:chefSprite;
 if(sprite.complete&&sprite.naturalWidth){
  const frames={neutral:[0,0],unknown:[0,0],left:[1,0],right:[0,1],both:[1,1]};
  const [col,row]=frames[pose]||frames.neutral,sw=sprite.naturalWidth/2,sh=sprite.naturalHeight/2;
  ctx.drawImage(sprite,col*sw,row*sh,sw,sh,340,90+bounce,600,600);
 }
 // Catch markers clearly show the arrival positions.
 for(const [side,x]of[['left',450],['right',830]]){const hot=notes.some(n=>!n.result&&n.pose===side&&Math.abs(n.time-time)<.18);ellipse(x,328,48+Math.max(0,pulse)*3,27,hot?'#ffdf54':'#ffffffa8',side==='left'?'#d32940':'#087bca',5);text(side==='left'?'왼팔 ↑':'오른팔 ↑',x,285,21,side==='left'?'#b51f38':'#0065ad');if(hot)text('지금!',x,378,24,'#203458');}
 // Repaint the foreground counter over the chef's lower body.
 if(kitchenBackground.complete&&kitchenBackground.naturalWidth){const cut=kitchenBackground.naturalHeight*525/H;ctx.drawImage(kitchenBackground,0,cut,kitchenBackground.naturalWidth,kitchenBackground.naturalHeight-cut,0,525,W,H-525);}
 function bowl(x,color){ellipse(x,573,93,18,color);shape(color);ctx.beginPath();ctx.moveTo(x-90,574);ctx.quadraticCurveTo(x-72,646,x,643);ctx.quadraticCurveTo(x+72,646,x+90,574);ctx.fill();ctx.stroke();ellipse(x,574,89,16,'#fff3cc');line([[x-59,610],[x+59,610]],'#ffffff65',4);}
 bowl(450,'#f2546b');bowl(830,'#47b7ee');face(450,607,.9);face(830,607,.9);
 function fruit(kind,x,y,scale=1,rotation=0){ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(scale,scale);line([[0,-24],[4,-42]],'#6d7043',6);ellipse(15,-37,14,7,'#7dab67');if(kind==='pear'){shape('#d3d96d');ctx.beginPath();ctx.moveTo(0,-29);ctx.bezierCurveTo(-24,-31,-14,-5,-28,9);ctx.bezierCurveTo(-49,47,46,47,28,9);ctx.bezierCurveTo(15,-7,22,-30,0,-29);ctx.fill();ctx.stroke();}else if(kind==='strawberry'){shape('#ed7c73');ctx.beginPath();ctx.moveTo(-30,-18);ctx.bezierCurveTo(-44,8,-6,47,0,43);ctx.bezierCurveTo(10,41,43,3,29,-19);ctx.closePath();ctx.fill();ctx.stroke();for(const[x1,y1]of[[-14,-4],[11,0],[-3,17],[15,17]])ellipse(x1,y1,2,4,'#ffe6b2','#ffe6b2',0);}else{ellipse(0,3,34,33,kind==='orange'?'#f4b148':'#e97a66');}ellipse(-12,-9,6,10,'#fff6d88a','#fff6d8',0);face(6,7,.65);ctx.restore();}
 for(const n of notes){
  const sides=n.pose==='both'?['left','right']:[n.pose];
  for(const side of sides){const motion=fruitMotion(n,time,side,dual);if(!motion)continue;
   ctx.save();
   // The bowl's front hides the caught fruit as it sinks below the rim.
   if(motion.phase==='caught'){ctx.beginPath();ctx.rect(0,0,W,579);ctx.clip();}
   fruit(n.fruit,motion.x,motion.y,motion.scale,motion.rotation);ctx.restore();
   if(n.burst&&motion.phase==='approach')text('3',motion.x,motion.y-52,20,'#9e6246');
   if(motion.phase==='caught'&&motion.progress>.75){const x=side==='left'?450:830;const sparkle=(motion.progress-.75)*4;ctx.save();ctx.globalAlpha=1-sparkle;ellipse(x,574,85+sparkle*12,17+sparkle*8,'#ffffff00','#ffcf45',4);star(x+58,548-sparkle*22,10,'#ffdc45',sparkle);ctx.restore();}
  }
 }
 // Feedback is drawn inside each player's lane, including split-screen play.
 const recent=notes.filter(n=>n.result&&time>=n.result.at&&time-n.result.at<.72).sort((a,b)=>b.result.at-a.result.at)[0];
 if(recent){const r=recent.result,age=time-r.at,hit=r.kind!=='miss',perfect=r.kind==='perfect',color=hit?(perfect?'#ffdc45':'#68dfbb'):'#e5edf7';
  const x=recent.pose==='left'?450:830,fade=Math.min(1,(.72-age)/.15);ctx.save();ctx.globalAlpha=fade;
  if(hit){for(let i=0;i<8;i++){const angle=i*Math.PI/4,dist=42+age*150;star(x+Math.cos(angle)*dist,328+Math.sin(angle)*dist,perfect?12:8,color,age*3+i);}ellipse(x,328,48+age*90,27+age*48,'#ffffff00',perfect?'#e9a000':'#008c6a',4);}
  else{line([[x-13,313],[x+13,339]],'#526887',6);line([[x+13,313],[x-13,339]],'#526887',6);}
  const offset=hit?Math.sin(Math.min(1,age/.15)*Math.PI)*7:0;
  rect(485,174-offset,310,83,22,color,ink,4);text(perfect?'정확해요! ★':hit?'촥!':'앗, 놓쳤어요!',640,210-offset,27,ink);
  text(hit?(perfect?'':r.delta<0?'조금 빨라요':'조금 늦어요'):'다음 과일을 받아요',640,239-offset,17,ink);ctx.restore();
 }
 if(idle){rect(350,172,580,68,22,'#ffffffee','#203458',4);text(dual?(player?'2P 준비!':'1P 준비!'):'준비!',640,215,29);}
 if(combo>=3){rect(566,598,148,45,15,'#fff8dc','#31483d',2);text(combo+' 연속!',640,628,20,'#ad653b');}
}

const $=id=>document.getElementById(id),ctx=$('scene').getContext('2d');
const NAMES=['레서 셰프','수달 셰프'],COLORS=['#fff2a4','#8cd8ff'];
let difficulty='easy';
let gameLength=180;try{const m=+localStorage.getItem('fruitKitchenMinutes');if([1,2,3].includes(m))gameLength=m*60;}catch{}
const clockText=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
let players=1,state='idle',mode='camera',games=[],trackers=[],poses=[],present=[],lastSeen=[],points=[],keyPoses=[],lastKeys=[],groups=[],fxCount=[];
let audio=null,master=null,musicGain=null,sfxGain=null,musicBuffer=null,chakBuffer=null,source=null,startedAt=0,runId='',launchToken=0;
let stream=null,worker=null,modelReady=false,cameraLoading=false,frameBusy=false,session=0,lastFrame=0,captureEpoch=0,frameSerial=0,pendingFrame=null,videoFrameHandle=null,captureCanvas=null,lastVideoMediaTime=-1,inputLatencyMs=0;
let legoStates=[],feedbackUntil=0,playerFeedbackUntil=[0,0],pausedClock=0;
let calibration=null,calibrationSerial=0;
const timingKey='fruit-kitchen-timing-v1';
let timingOffsets={camera:[0,0],keyboard:[0,0]};
try{const saved=JSON.parse(localStorage.getItem(timingKey));for(const input of ['camera','keyboard'])if(Array.isArray(saved?.[input]))timingOffsets[input]=[0,1].map(i=>Number.isFinite(saved[input][i])?Math.max(-.3,Math.min(.3,saved[input][i])):0);}catch{}

const profiles=Array.from({length:2},()=>({serial:'',color:10,angle:55,left_sign:1,right_sign:-1}));
window.fruitStatus=()=>({state,players,mode,time:clock(),difficulty,timing:{offsets:timingOffsets,inputLatencyMs,audioOutputLatency:audio?.outputLatency||0},music:musicBuffer?{duration:musicBuffer.duration,channels:musicBuffer.numberOfChannels}:null,sfxDuration:chakBuffer?.duration||0,fxCount:[...fxCount],stats:games[0]?.stats(),playerStats:games.map(g=>g.stats()),notes:games[0]?.notes.map(n=>({time:n.time,pose:n.pose,bar:n.bar,group:n.group,burst:n.burst,result:n.result?.kind||null})),ready:[...present],spriteReady:chefSprite.complete&&!!chefSprite.naturalWidth&&otterSprite.complete&&!!otterSprite.naturalWidth});
async function api(route,data={}){
 let r;try{r=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});}catch(e){throw Error('PC 연결 도우미에 닿지 못했어요. START.cmd 창을 열어 두고, 그때 열린 게임 화면에서 연결해 주세요.');}
 let b;try{b=await r.json();}catch(e){throw Error('연결 도우미 응답을 확인할 수 없어요. START.cmd로 게임을 다시 열어 주세요.');}
 if(!r.ok)throw Error(b.error||'연결 요청 실패');return b;
}
function stopMotors(){api('stop').catch(()=>{});}
function contextAt(performanceMs=performance.now()){return audioTimeAt(audio,performanceMs,performance.now());}
function clock(){return state==='paused'?pausedClock:audio?Math.max(0,contextAt()-startedAt):0;}
function resetInputTimeline(){captureEpoch++;trackers.forEach(t=>t.reset());lastKeys.fill('neutral');}
function releaseFrame(packet){if(pendingFrame?.frameId===packet.frameId){pendingFrame=null;frameBusy=false;return true;}return false;}
function queueCameraFrame(now,metadata={}){
 if(!stream||!worker||!modelReady||frameBusy||document.hidden||$('video').readyState<2||!$('video').videoWidth||!$('video').videoHeight)return;
 const mediaTime=Number.isFinite(metadata.mediaTime)?metadata.mediaTime:$('video').currentTime;
 if(mediaTime===lastVideoMediaTime)return;lastVideoMediaTime=mediaTime;
 const timestamp=cameraFrameTime(metadata,now),count=players,width=count===2?960:640,height=Math.round(width*$('video').videoHeight/$('video').videoWidth);
 if(!captureCanvas)captureCanvas=document.createElement('canvas');
 if(captureCanvas.width!==width||captureCanvas.height!==height){captureCanvas.width=width;captureCanvas.height=height;}
 // Freeze the actual video frame synchronously; bitmap conversion may finish later.
 captureCanvas.getContext('2d').drawImage($('video'),0,0,width,height);
 const packet={frameId:++frameSerial,epoch:captureEpoch,session,timestamp,audioTime:contextAt(timestamp),players:count};
 packet.gameTime=packet.audioTime-startedAt;pendingFrame=packet;frameBusy=true;lastFrame=now;
 createImageBitmap(captureCanvas).then(bitmap=>{
  if(packet.session!==session||packet.epoch!==captureEpoch||!worker||!stream){bitmap.close();releaseFrame(packet);return;}
  worker.postMessage({type:'frame',bitmap,...packet},[bitmap]);
 }).catch(()=>releaseFrame(packet));
}
function startVideoFrames(){
 if(videoFrameHandle!==null)$('video').cancelVideoFrameCallback?.(videoFrameHandle);
 videoFrameHandle=null;lastVideoMediaTime=-1;
 if(typeof $('video').requestVideoFrameCallback==='function'){
  const next=(now,metadata)=>{videoFrameHandle=null;if(!stream)return;queueCameraFrame(now,metadata);videoFrameHandle=$('video').requestVideoFrameCallback(next);};
  videoFrameHandle=$('video').requestVideoFrameCallback(next);
 }
}
function eventPerformanceTime(event){const now=performance.now();return Number.isFinite(event.timeStamp)&&event.timeStamp>0&&event.timeStamp<=now&&now-event.timeStamp<2000?event.timeStamp:now;}
function saveTiming(){try{localStorage.setItem(timingKey,JSON.stringify(timingOffsets));}catch{}updateTimingSummary();}
function updateTimingSummary(){
 $('timingSummary').textContent=timingOffsets[mode].slice(0,players).map((offset,i)=>(i+1)+'P '+(offset?Math.round(offset*1000)+'ms 보정':'자동 동기화')).join(' · ');
}
async function beginCalibration(){
 if(state!=='idle'){$('timingSummary').textContent='처음으로 돌아간 뒤 박자를 맞춰 주세요.';return;}
 if(mode==='camera'&&(!stream||!modelReady||!present.every(Boolean))){$('timingSummary').textContent='카메라를 켜고 참가자 모두 자리에 서 주세요.';return;}
 const ticket=++calibrationSerial;calibration={ticket,loading:true};
 $('settingsDialog').close();if(!$('timingDialog').open)$('timingDialog').showModal();$('timingBeat').textContent='준비';$('timingStatus').textContent='소리를 준비하고 있어요…';$('timingRetry').hidden=true;buttons();
 try{
  await loadAudio();if(calibration?.ticket!==ticket)return;
  if(+$('volume').value===0)throw Error('음량을 올린 뒤 다시 해 주세요.');
  resetInputTimeline();keyPoses.fill('neutral');
  const count=12,interval=.8,begin=audio.currentTime+.6,buffer=audio.createBuffer(1,Math.ceil((count*interval+.1)*audio.sampleRate),audio.sampleRate),data=buffer.getChannelData(0);
  for(let beat=0;beat<count;beat++){const offset=Math.round(beat*interval*audio.sampleRate);for(let i=0;i<audio.sampleRate*.035;i++)data[offset+i]=Math.sin(2*Math.PI*(beat<2?660:880)*i/audio.sampleRate)*Math.exp(-i/(audio.sampleRate*.009))*.7;}
  const click=audio.createBufferSource();click.buffer=buffer;click.connect(master);
  calibration={ticket,active:true,begin,count,interval,mode,players,source:click,samples:Array.from({length:players},()=>[]),seen:Array.from({length:players},()=>new Set())};
  $('timingStatus').textContent=mode==='camera'?'소리가 날 때 한 팔을 올렸다 내려요. 10번!':'소리가 날 때 왼쪽·오른쪽 키를 눌러요. 10번!';
  click.start(begin);
 }catch(e){if(calibration?.ticket===ticket){calibration.active=false;calibration.loading=false;$('timingStatus').textContent=e.message;$('timingRetry').hidden=false;buttons();}}
}
function recordCalibration(player,eventAudioTime){
 const cal=calibration;if(!cal?.active||player>=cal.players)return;
 const elapsed=eventAudioTime-cal.begin,index=Math.round(elapsed/cal.interval),delta=elapsed-index*cal.interval;
 if(index<2||index>=cal.count||Math.abs(delta)>.3||cal.seen[player].has(index))return;
 cal.seen[player].add(index);cal.samples[player].push(delta);
}
function finishCalibration(){
 const cal=calibration;if(!cal?.active)return;
 cal.active=false;const offsets=cal.samples.map(calibrationOffset);
 try{cal.source.stop();cal.source.disconnect();}catch{}
 if(offsets.every(n=>n!==null)){
  offsets.forEach((offset,i)=>timingOffsets[cal.mode][i]=offset);saveTiming();$('timingBeat').textContent='완료!';$('timingStatus').textContent='박자를 맞췄어요. 이제 소리에 맞춰 움직여 주세요.';
 }else{$('timingBeat').textContent='한 번 더';$('timingStatus').textContent='일정한 박자가 조금 더 필요해요. 소리에 맞춰 다시 해 주세요.';}
 $('timingRetry').hidden=false;resetInputTimeline();buttons();
}
function cancelCalibration(){
 if(calibration?.source){try{calibration.source.stop();calibration.source.disconnect();}catch{}}
 calibration=null;calibrationSerial++;resetInputTimeline();keyPoses.fill('neutral');buttons();
}
function tickCalibration(){
 const cal=calibration;if(!cal?.active)return;
 const elapsed=contextAt()-cal.begin,index=Math.round(elapsed/cal.interval);
 $('timingBeat').textContent=index<2?'준비':String(Math.min(10,index-1));
 $('timingBeat').classList.toggle('pulse',elapsed>=0&&Math.abs(elapsed-index*cal.interval)<.09);
 if(elapsed>(cal.count-1)*cal.interval+.65&&(!pendingFrame||elapsed>cal.count*cal.interval+1.2))finishCalibration();
}

function resetTracking(){trackers=Array.from({length:players},()=>new FruitPoseTracker());poses=Array(players).fill('neutral');present=Array(players).fill(false);lastSeen=Array(players).fill(0);points=Array(players).fill(null);keyPoses=Array(players).fill('neutral');lastKeys=Array(players).fill('neutral');}
function makeGames(){games=Array.from({length:players},()=>new FruitGame({early:+$('early').value,late:+$('late').value,difficulty}));games.forEach(g=>g.notes=g.notes.filter(n=>(n.bar+1)*4*FRUIT_BEAT<=gameLength-1));groups=Array.from({length:players},()=>new Set());fxCount=Array(players).fill(0);}
function updateScores(){games.forEach((g,i)=>{const s=g.stats();$('score'+i).innerHTML=s.fruit+'<small>과일</small>';$('combo'+i).textContent='최고 '+s.bestCombo+'연속 · '+s.totalFruit+'개 도전';$('ready'+i).classList.toggle('found',mode==='keyboard'||present[i]);});}
function buttons(){const calibrating=!!(calibration?.active||calibration?.loading);$('calibrateBtn').disabled=state!=='idle'||calibrating;$('timingReset').disabled=state!=='idle'||calibrating;const ready=mode==='keyboard'||(stream&&modelReady&&present.every(Boolean));$('startBtn').disabled=!['idle','paused'].includes(state)||!ready||calibrating;$('startBtn').textContent=state==='paused'?'▶ 계속':'▶ 시작';$('pauseBtn').disabled=state!=='playing';$('stopBtn').disabled=state==='idle';$('cameraBtn').disabled=cameraLoading||state!=='idle'||calibrating;$('keyboardBtn').disabled=state!=='idle'||calibrating;$('paused').hidden=state!=='paused';$('difficultyBtn').disabled=state!=='idle'||calibrating;$('lengthBtn').disabled=state!=='idle'||calibrating;document.body.dataset.state=state;document.querySelectorAll('[data-players]').forEach(b=>b.disabled=state!=='idle'||cameraLoading||calibrating);for(const id of['early','late'])$(id).disabled=state!=='idle';}
function choosePlayers(n){if(state!=='idle')return;players=Math.max(1,Math.min(2,n));session++;resetTracking();makeGames();document.body.dataset.players=players;
 document.querySelectorAll('[data-players]').forEach(b=>{b.classList.toggle('active',+b.dataset.players===players);b.setAttribute('aria-pressed',String(+b.dataset.players===players));});
 $('playerScores').innerHTML=NAMES.slice(0,players).map((name,i)=>'<div class="player-score"><i class="ready-dot" id="ready'+i+'"></i><div class="name">'+(i+1)+'P · '+name+'<small id="combo'+i+'">최고 0연속</small></div><span class="player-feedback" id="feedback'+i+'"></span><strong id="score'+i+'">0<small>과일</small></strong></div>').join('');
 $('cameraLanes').innerHTML=Array.from({length:players},(_,i)=>'<div>'+(i+1)+'P</div>').join('');$('standHint').textContent=players===1?'가운데 서요':'왼쪽 1P · 오른쪽 2P';$('keyboardHelp').textContent=players===1?'1P A·D 또는 ←·→':'1P A·D / 2P J·L';
 $('motorPlayer').innerHTML=NAMES.slice(0,players).map((name,i)=>'<option value="'+i+'">'+(i+1)+'P · '+name+'</option>').join('');loadProfile();density();updateTimingSummary();if(mode==='keyboard')$('recognized').textContent=$('keyboardHelp').textContent;updateScores();buttons();poll();
}
function density(){$('density').textContent=difficulty==='hard'?'어렵게 · 다양한 박자와 3연속':'쉽게 · 한 마디에 1~2개';}
async function loadAudio(){
 if(!audio){audio=new AudioContext();master=audio.createGain();const limiter=audio.createDynamicsCompressor();limiter.threshold.value=-6;limiter.knee.value=8;limiter.ratio.value=8;limiter.attack.value=.002;limiter.release.value=.08;master.connect(limiter);limiter.connect(audio.destination);musicGain=audio.createGain();musicGain.gain.value=.68;musicGain.connect(master);sfxGain=audio.createGain();sfxGain.connect(master);}
 master.gain.value=+$('volume').value/100;sfxGain.gain.value=+$('sfxVolume').value/100;await audio.resume();
 if(!musicBuffer||!chakBuffer){$('hint').textContent='음악과 촥! 효과음을 준비하고 있어요…';
  const music=await(await fetch('./assets/music/fruit-kitchen.mp3')).arrayBuffer();
  const effect=await(await fetch('./assets/music/catch.wav')).arrayBuffer();
  [musicBuffer,chakBuffer]=await Promise.all([audio.decodeAudioData(music),audio.decodeAudioData(effect)]);
 }
}
function chak(player){if(!audio||!chakBuffer)return;const s=audio.createBufferSource(),pan=audio.createStereoPanner();s.buffer=chakBuffer;s.playbackRate.value=player?1.04:.98;pan.pan.value=players===1?0:player?.4:-.4;s.connect(pan);pan.connect(sfxGain);s.onended=()=>{s.disconnect();pan.disconnect();};s.start();fxCount[player]++;}
async function start(){
 if(state==='paused'){if(mode==='camera'&&!present.every(Boolean))return;resetInputTimeline();lastSeen.fill(performance.now());await audio.resume();if(state!=='paused')return;state='playing';buttons();return;}
 if(state!=='idle'||$('startBtn').disabled)return;state='loading';const ticket=++launchToken;buttons();
 try{await loadAudio();if(ticket!==launchToken)return;makeGames();resetInputTimeline();runId=crypto.randomUUID();keyPoses.fill('neutral');lastKeys.fill('neutral');source=audio.createBufferSource();source.buffer=musicBuffer;source.connect(musicGain);startedAt=audio.currentTime+.15;source.start(startedAt);musicGain.gain.cancelScheduledValues(0);musicGain.gain.setValueAtTime(.68,startedAt);if(gameLength<FRUIT_DURATION){musicGain.gain.setValueAtTime(.68,startedAt+gameLength-2.5);musicGain.gain.linearRampToValueAtTime(0,startedAt+gameLength);}state='playing';lastSeen.fill(performance.now());updateScores();buttons();}catch(e){state='idle';$('cameraMessage').textContent='소리 준비 오류: '+e.message;buttons();}
}
function pause(){if(state!=='playing')return;pausedClock=clock();state='paused';resetInputTimeline();audio.suspend();keyPoses.fill('neutral');lastKeys.fill('neutral');trackers.forEach(t=>t.reset());stopMotors();buttons();}
function stop(){resetInputTimeline();launchToken++;source?.stop();source=null;if(musicGain){musicGain.gain.cancelScheduledValues(0);musicGain.gain.value=.68;}state='idle';audio?.resume();trackers.forEach(t=>t.reset());poses.fill('neutral');keyPoses.fill('neutral');lastKeys.fill('neutral');stopMotors();$('progress').style.width='0%';$('timer').textContent=clockText(gameLength);$('section').textContent='준비!';$('cue').textContent='하나, 둘, 셋, 챡!';$('hint').textContent='처음에는 네 박자에 한 개씩 받아요.';$('pattern').textContent='— — — 챡';document.querySelector('.rhythm-note').textContent='과일이 오면, 팔을 번쩍!';$('feedback').textContent='';buttons();}
function finish(){games.forEach(g=>g.expire(gameLength+1));const stats=games.map(g=>g.stats());stop();$('resultText').innerHTML=stats.map((s,i)=>'<div class="result-player"><b>'+(i+1)+'P · '+NAMES[i]+'</b>'+s.totalFruit+'개 중 '+s.fruit+'개 성공!<br><small>최고 '+s.bestCombo+'연속</small></div>').join('');$('resultMode').textContent=mode==='camera'?'카메라 AI로 함께 완주했어요!':'키보드 둘러보기 결과 · 카메라 AI와 실제 레고는 사용하지 않았어요.';$('resultDialog').showModal();}
function attempt(player,p,time,origin){if(state!=='playing')return;const n=games[player].observe(p,time,{edge:true,at:clock()});if(!n)return;poses[player]=p;chak(player);$('feedback'+player).textContent=n.result.kind==='perfect'?'정확해요! ★':n.result.delta<0?'조금 빨라요':'조금 늦어요';playerFeedbackUntil[player]=performance.now()+450;if(players===1){$('feedback').textContent='촥!';feedbackUntil=performance.now()+350;}updateScores();
 if(origin==='camera'&&legoStates[player]?.status==='connected'&&!groups[player].has(n.group)){groups[player].add(n.group);api('action',{player,pose:n.burst?'both':p,source:'camera',id:runId+'-p'+player+'-'+n.group}).then(()=>$('motorFeedback').textContent=(player+1)+'P 동작을 레고에 전달했어요.').catch(e=>$('motorFeedback').textContent=e.message);}return n;
}
function onPose(d){
 if(!releaseFrame(d)||d.session!==session||d.epoch!==captureEpoch||!Number.isFinite(d.audioTime))return;
 inputLatencyMs=inputLatencyMs*.8+(performance.now()-d.timestamp)*.2;
 const lanes=d.lanes||[];
 for(let i=0;i<players;i++){
  const p=lanes[players-1-i]||null;points[i]=p;present[i]=!!p&&[11,12].every(j=>(p[j]?.visibility||0)>.5);if(present[i])lastSeen[i]=performance.now();
  const tracked=trackers[i].update(p?classifyPose(p):'unknown',d.timestamp);poses[i]=tracked.pose;
  if(tracked.edge){
   const eventAudioTime=frameEventTime(d,tracked.edge.timeMs,0);
   if(calibration?.active&&calibration.mode==='camera')recordCalibration(i,eventAudioTime);
   else if(state==='playing'&&mode==='camera')attempt(i,tracked.edge.pose,eventAudioTime-startedAt+timingOffsets.camera[i],'camera');
  }
 }
 $('recognized').textContent=poses.map((p,i)=>(i+1)+'P '+(present[i]?FRUIT_LABELS[p]:'자리에 서 주세요')).join(' / ');drawSkeleton();updateScores();buttons();
}
async function camera(){
 if(stream){disableCamera();return;}mode='camera';cameraLoading=true;buttons();$('cameraMessage').textContent='카메라와 오프라인 AI를 준비하고 있어요…';
 try{stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:false});$('video').srcObject=stream;await $('video').play();startVideoFrames();$('placeholder').style.display='none';$('cameraBtn').textContent='카메라 끄기';$('keyboardBtn').textContent='키보드로 해보기';
  if(!worker){worker=new Worker(new URL('./pose-worker.js',import.meta.url));worker.onmessage=e=>{const d=e.data;if(d.type==='ready'){modelReady=true;cameraLoading=false;$('cameraChip').textContent='카메라 AI';$('cameraMessage').textContent=players===2?'번호 칸에 한 명씩, 양손이 보이게 서요.':'과일이 도착할 때 같은 쪽 팔을 올려요.';buttons();}else if(d.type==='pose')onPose(d);else if(d.type==='progress')$('cameraMessage').textContent=d.message;else if(d.type==='frameError'){releaseFrame(d);$('cameraMessage').textContent='동작을 다시 확인하고 있어요.';}else if(d.type==='error'){frameBusy=false;cameraLoading=false;$('cameraMessage').textContent='AI 준비 오류: '+d.message;buttons();}};worker.onerror=e=>{frameBusy=false;cameraLoading=false;$('cameraMessage').textContent='AI 오류: '+e.message;buttons();};worker.postMessage({type:'init'});
  }else{cameraLoading=false;buttons();}
 }catch(e){disableCamera();$('cameraMessage').textContent='카메라를 열 수 없어요: '+e.message;}
}
function disableCamera(){session++;resetInputTimeline();if(videoFrameHandle!==null)$('video').cancelVideoFrameCallback?.(videoFrameHandle);videoFrameHandle=null;pendingFrame=null;stream?.getTracks().forEach(t=>t.stop());stream=null;frameBusy=false;cameraLoading=false;resetTracking();$('video').srcObject=null;$('placeholder').style.display='flex';$('cameraBtn').textContent='카메라 켜기';$('cameraChip').textContent='꺼짐';$('recognized').textContent='카메라를 켜 주세요';drawSkeleton();updateScores();buttons();}
function drawSkeleton(){const c=$('skeleton'),v=$('video');c.width=v.videoWidth||1280;c.height=v.videoHeight||720;const c2=c.getContext('2d');points.forEach((p,i)=>{if(!p)return;c2.strokeStyle=COLORS[i];c2.lineWidth=5;for(const[a,b]of[[11,12],[11,13],[13,15],[12,14],[14,16]]){if((p[a]?.visibility||0)<.5||(p[b]?.visibility||0)<.5)continue;c2.beginPath();c2.moveTo(p[a].x*c.width,p[a].y*c.height);c2.lineTo(p[b].x*c.width,p[b].y*c.height);c2.stroke();}});}
function drawStage(now,time){
 for(let i=0;i<players;i++){ctx.save();if(players===2){ctx.beginPath();ctx.rect(i*640,0,640,720);ctx.clip();ctx.translate(i*640-320,0);}
  drawFruitScene(ctx,{time:state==='idle'||state==='loading'?now/1000:time,notes:['idle','loading'].includes(state)?[]:games[i].notes,pose:poses[i],combo:state==='idle'?0:games[i].combo,idle:['idle','loading'].includes(state),player:i,dual:players===2});ctx.restore();}
 if(players===2){ctx.fillStyle='#fff7dd';ctx.fillRect(636,0,8,720);}
}
function stageInfo(time){const bar=Math.floor(time/FRUIT_BEAT/4),section=fruitSection(gameLength<FRUIT_DURATION&&bar>=Math.floor(gameLength/FRUIT_BEAT/4)-4?80:bar),notes=games[0].notes.filter(n=>n.bar===bar);$('section').textContent=section.name;$('hint').textContent=section.hint;const slots=Array.from({length:4},(_,i)=>notes.some(n=>Math.floor(n.beat%4+1e-6)===i));document.querySelector('.rhythm-note').textContent=notes.some(n=>n.burst)?(notes.find(n=>n.burst).pose==='left'?'왼! 오른! 왼!':'오른! 왼! 오른!')+' · 팔을 번쩍!':notes.some(n=>n.beat%1!==0)?'사이 박자도, 번쩍!':'과일이 오면, 팔을 번쩍!';$('pattern').textContent=notes.some(n=>n.burst)?'— — (챡챡챡) —':slots.map(hit=>hit?'챡':'—').join(' ');$('beats').querySelectorAll('span').forEach((e,i)=>{e.classList.toggle('active',i===Math.floor(time/FRUIT_BEAT)%4);e.classList.toggle('target',slots[i]);});$('cue').textContent=bar<4?'하나, 둘, 셋, 넷! 리듬을 들어요.':notes.some(n=>n.burst)?'왼쪽! 오른쪽! 번갈아 세 개!':notes.length===1?'하나, 둘, 셋, 챡!':notes.length===2?'쉬는 박자를 듣고, 챡! 챡!':'한숨 돌리고 다음 접시를 준비해요.';const remain=Math.max(0,Math.ceil(gameLength-time));$('timer').textContent=clockText(remain);$('progress').style.width=time/gameLength*100+'%';}
function tick(now){
 if(typeof $('video').requestVideoFrameCallback!=='function'&&now-lastFrame>35)queueCameraFrame(performance.now());
 tickCalibration();
 const time=clock();if(state==='playing'){const missing=lastSeen.map((seen,i)=>now-seen>1700?i+1:null).filter(Boolean);if(mode==='camera'&&missing.length){pause();$('cameraMessage').textContent=missing.join(' · ')+'P가 번호 자리로 돌아와 이어 하기를 눌러요.';}else{if(mode==='keyboard')for(let i=0;i<players;i++){lastKeys[i]=keyPoses[i];poses[i]=keyPoses[i];}games.forEach((g,i)=>{const watermark=pendingFrame?.epoch===captureEpoch?Math.min(time,pendingFrame.gameTime):time;const missed=g.expire(watermark);if(missed.length){$('feedback'+i).textContent='놓쳤어요!';playerFeedbackUntil[i]=now+650;}});if(time>=gameLength)finish();else{stageInfo(time);updateScores();}}}
 if(now>feedbackUntil)$('feedback').textContent='';for(let i=0;i<players;i++)if(now>playerFeedbackUntil[i])$('feedback'+i).textContent='';drawStage(now,time);requestAnimationFrame(tick);
}
function saveProfile(){const i=+$('motorPlayer').value;profiles[i]={serial:$('serial').value,color:+$('color').value,angle:+$('angle').value,left_sign:+$('leftSign').value,right_sign:+$('rightSign').value};return profiles[i];}
function loadProfile(){const p=profiles[+$('motorPlayer').value];for(const[id,k]of[['serial','serial'],['color','color'],['angle','angle'],['leftSign','left_sign'],['rightSign','right_sign']])$(id).value=p[k];$('zero').checked=false;}
async function poll(){try{const data=await(await fetch('/api/status')).json();legoStates=data.players||[];const count=legoStates.slice(0,players).filter(s=>s.status==='connected').length;$('legoStatus').textContent=count?'레고 '+count+' / '+players+'대 연결':data.bridge_ready?'PC 도우미 연결됨 · 레고 연결 전':'PC 도우미 연결 필요';const s=legoStates[+$('motorPlayer').value];$('connectionMessage').textContent=s?.message||'연결 안 됨';document.querySelectorAll('[data-motor]').forEach(b=>b.disabled=s?.status!=='connected');$('connectBtn').disabled=s?.status==='connecting';}catch{legoStates=[];$('legoStatus').textContent='실행 창을 확인해 주세요';}}
function settings(){pause();$('settingsDialog').showModal();poll();}
$('startBtn').onclick=start;$('pauseBtn').onclick=pause;$('stopBtn').onclick=stop;$('cameraBtn').onclick=camera;$('settingsBtn').onclick=settings;
document.querySelectorAll('[data-players]').forEach(b=>b.onclick=()=>choosePlayers(+b.dataset.players));function showLength(){$('lengthBtn').textContent='⏱ '+gameLength/60+'분 ▾';document.querySelectorAll('[data-minutes]').forEach(x=>{const on=+x.dataset.minutes*60===gameLength;x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on));});if(state==='idle')$('timer').textContent=clockText(gameLength);}
$('lengthBtn').onclick=()=>{if(state==='idle')$('lengthDialog').showModal();};
document.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{if(state!=='idle')return;gameLength=+b.dataset.minutes*60;try{localStorage.setItem('fruitKitchenMinutes',b.dataset.minutes);}catch{}showLength();makeGames();updateScores();$('lengthDialog').close();});showLength();
$('difficultyBtn').onclick=()=>{if(state==='idle')$('difficultyDialog').showModal();};
document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{if(state!=='idle')return;difficulty=b.dataset.difficulty;$('difficultyBtn').textContent=(difficulty==='hard'?'어렵게':'쉽게')+' ▾';document.querySelectorAll('[data-difficulty]').forEach(x=>{x.classList.toggle('active',x.dataset.difficulty===difficulty);x.setAttribute('aria-pressed',String(x.dataset.difficulty===difficulty));});makeGames();density();updateScores();$('difficultyDialog').close();});
$('keyboardBtn').onclick=()=>{$('settingsDialog').close();if(mode==='camera'){disableCamera();mode='keyboard';$('keyboardBtn').textContent='카메라로 하기';$('recognized').textContent=$('keyboardHelp').textContent;$('cameraMessage').textContent='키보드 연습 중';}else{mode='camera';$('keyboardBtn').textContent='키보드로 해보기';$('recognized').textContent='카메라를 켜 주세요';}updateTimingSummary();resetInputTimeline();updateScores();buttons();};
$('fullscreenBtn').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>{});
$('againBtn').onclick=()=>{$('resultDialog').close();start();};$('resultClose').onclick=()=>$('resultDialog').close();$('volume').oninput=()=>{if(master)master.gain.value=+$('volume').value/100;};$('sfxVolume').oninput=()=>{if(sfxGain)sfxGain.gain.value=+$('sfxVolume').value/100;};
const cardColors=['빨강','노랑','파랑','청록','초록','보라','흰색','분홍','주황','하늘색'];for(let i=1;i<=10;i++)$('color').add(new Option(cardColors[i-1],i,i===10,i===10));
for(const id of['serial','color','angle','leftSign','rightSign'])$(id).onchange=saveProfile;$('motorPlayer').onchange=()=>{loadProfile();poll();};
$('connectBtn').onclick=async()=>{try{const profile=saveProfile();await api('connect',{...profile,player:+$('motorPlayer').value,zero_confirmed:$('zero').checked});poll();}catch(e){$('connectionMessage').textContent=e.message;}};
$('disconnectBtn').onclick=()=>api('disconnect',{player:+$('motorPlayer').value}).then(poll).catch(e=>$('connectionMessage').textContent=e.message);$('motorStop').onclick=()=>{pause();stopMotors();};document.querySelectorAll('[data-motor]').forEach(b=>b.onclick=()=>api('action',{player:+$('motorPlayer').value,pose:b.dataset.motor,source:'operator',id:crypto.randomUUID()}).catch(e=>$('connectionMessage').textContent=e.message));
const keyMaps=[{a:'left',d:'right',ArrowLeft:'left',ArrowRight:'right'},{j:'left',l:'right'}];
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){pause();return;}
 if(mode!=='keyboard'||(state!=='playing'&&!calibration?.active)||$('settingsDialog').open||$('difficultyDialog').open||e.repeat)return;
 for(let i=0;i<players;i++){const p=keyMaps[i][e.key]||keyMaps[i][e.key.toLowerCase()];if(!p||keyPoses[i]===p)continue;e.preventDefault();keyPoses[i]=p;
  const eventAudioTime=contextAt(eventPerformanceTime(e));
  if(calibration?.active)recordCalibration(i,eventAudioTime);else attempt(i,p,eventAudioTime-startedAt+timingOffsets.keyboard[i],'keyboard');
 }
});
document.addEventListener('keyup',e=>{for(let i=0;i<players;i++){const p=keyMaps[i][e.key]||keyMaps[i][e.key.toLowerCase()];if(p&&keyPoses[i]===p)keyPoses[i]='neutral';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();if(calibration?.active){cancelCalibration();$('timingDialog').close();}}});window.addEventListener('blur',()=>keyPoses.fill('neutral'));window.addEventListener('pagehide',()=>{cancelCalibration();stopMotors();stream?.getTracks().forEach(t=>t.stop());});
$('calibrateBtn').onclick=beginCalibration;$('timingRetry').onclick=beginCalibration;$('timingDialog').addEventListener('close',cancelCalibration);$('timingReset').onclick=()=>{timingOffsets[mode]=[0,0];saveTiming();};
setInterval(()=>{if(legoStates.some(s=>s.status==='connected'))api('heartbeat').catch(()=>{});},500);setInterval(poll,1800);document.fonts.load('700 30px KitchenRound').then(()=>{});choosePlayers(1);requestAnimationFrame(tick);
