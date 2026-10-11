import { RenderFrameData } from '../core/contracts';

/** Presentation-only bounds: never consumes RNG or mutates authoritative state. */
export function frameBounds(frame: RenderFrameData) {
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for(const item of [...frame.zones,...frame.entities]) {
    const size='size' in item?item.size:item.scale;
    item.position.forEach((v,i)=>{if(Number.isFinite(v)){min[i]=Math.min(min[i],v-Math.abs(size[i])/2);max[i]=Math.max(max[i],v+Math.abs(size[i])/2);}});
  }
  if(!Number.isFinite(min[0]))return { min:[-24,-1,-24],max:[24,1,24],center:[0,0,0],span:48,viewBox:'-28 -28 56 56' };
  const span=Math.max(12,...max.map((v,i)=>v-min[i]));const padding=Math.max(3,span*.04);
  return { min,max,center:min.map((v,i)=>(v+max[i])/2),span,viewBox:`${min[0]-padding} ${min[2]-padding} ${max[0]-min[0]+padding*2} ${max[2]-min[2]+padding*2}` };
}
