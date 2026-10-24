let model;
let cropCanvas;
const ASSET_ROOT = new URL('./', self.location.href);
async function readLocal(path){
  const response=await fetch(new URL(path,ASSET_ROOT));
  if(!response.ok)throw Error('AI 파일을 불러오지 못했어요: '+response.status);
  return response.arrayBuffer();
}
async function loadParts(folder){
  const manifest=JSON.parse(new TextDecoder().decode(await readLocal(folder+'/manifest.json')));
  const pieces=Array(manifest.parts.length);let cursor=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(cursor<manifest.parts.length){const index=cursor++;pieces[index]=new Uint8Array(await readLocal(folder+'/'+manifest.parts[index]));}
  }));
  const bytes=new Uint8Array(manifest.bytes);let offset=0;
  for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(offset!==manifest.bytes||digest!==manifest.sha256)throw Error('AI 파일이 손상됐어요. 전체 폴더를 다시 복사해 주세요.');
  return bytes;
}
self.onmessage=async({data})=>{
  if(data.type==='init'){
    try{
      self.postMessage({type:'progress',message:'AI 라이브러리 준비 중'});
      self.exports={};
      const library=URL.createObjectURL(new Blob([await readLocal('./assets/vision/vision.js')],{type:'text/javascript'}));
      importScripts(library);
      URL.revokeObjectURL(library);
      const {FilesetResolver,PoseLandmarker}=self.exports;
      self.postMessage({type:'progress',message:'AI 실행 환경 준비 중'});
      const loader=await readLocal('./assets/vision/wasm/vision_wasm_internal.js');
      const wasm=await loadParts('./assets/wasm');
      const files={
        wasmLoaderPath:URL.createObjectURL(new Blob([loader],{type:'text/javascript'})),
        wasmBinaryPath:URL.createObjectURL(new Blob([wasm],{type:'application/wasm'}))
      };
      self.postMessage({type:'progress',message:'자세 인식 모델 준비 중'});
      const bytes=await loadParts('./assets/model');
      model=await PoseLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetBuffer:bytes,delegate:'CPU'},
        runningMode:'IMAGE',numPoses:1,minPoseDetectionConfidence:.50,minPosePresenceConfidence:.50,minTrackingConfidence:.50
      });
      self.postMessage({type:'ready'});
    }catch(e){self.postMessage({type:'error',message:String(e.message||e)});}
  }
  if(data.type==='frame'){
    try{
      // Infer each fixed player lane separately. This keeps small players
      // detectable and prevents the detector from reordering identities.
      const count=Math.max(1,Math.min(4,data.players||1)),poses=[],lanes=[];
      const width=Math.round(data.bitmap.width/count),height=data.bitmap.height;
      if(!cropCanvas)cropCanvas=new OffscreenCanvas(width,height);
      if(cropCanvas.width!==width||cropCanvas.height!==height){cropCanvas.width=width;cropCanvas.height=height;}
      const ctx=cropCanvas.getContext('2d');
      for(let lane=0;lane<count;lane++){
        ctx.drawImage(data.bitmap,lane*data.bitmap.width/count,0,data.bitmap.width/count,height,0,0,width,height);
        // IMAGE mode avoids sharing video tracker state between children.
        const result=model.detect(cropCanvas);
        if(result.landmarks[0]){
          const mapped=result.landmarks[0].map(p=>({...p,x:(p.x+lane)/count}));
          poses.push(mapped);lanes.push(mapped);
        }else lanes.push(null);
      }
      self.postMessage({type:'pose',points:poses[0]||null,poses,lanes,timestamp:data.timestamp,audioTime:data.audioTime,frameId:data.frameId,epoch:data.epoch,session:data.session});
    }catch(e){self.postMessage({type:'frameError',message:String(e.message||e),frameId:data.frameId,epoch:data.epoch,session:data.session});}
    finally{data.bitmap.close();}
  }
};
