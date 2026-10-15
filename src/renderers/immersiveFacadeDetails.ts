import * as THREE from 'three';
import type { ImmersiveLayout } from '../exploration/immersiveLayout';
import type { ImmersiveArtTier } from './immersiveArtPass';
import { sceneHash } from '../exploration/immersiveLayout';

/** World-authored surface accents on REAL Atlas structures. Not pickable, not
 * new resource sites, and never a substitute for their simulation geometry.
 * One instanced draw covers every installation of the active world. */
export function addImmersiveFacadeDetails(scene: THREE.Scene, layout: ImmersiveLayout, tier: ImmersiveArtTier) {
  const style = layout.profile.architecture;
  const urban = ['city','factory','machines','settlement','ruins'].includes(style);
  const orbital = ['orbit','signal','storm'].includes(style);
  const countPerSite = tier === 'lite' ? (urban ? 8 : 5) : (urban ? 20 : 12);
  const maxCount = Math.max(1, layout.points.length * countPerSite);
  const geometry = urban
    ? new THREE.BoxGeometry(.72,1.08,.13)
    : orbital ? new THREE.OctahedronGeometry(.36,0)
    : ['reef','forest','wilds','habitat','terraform'].includes(style)
      ? new THREE.TetrahedronGeometry(.56,0)
      : new THREE.BoxGeometry(.42,.95,.26);
  const material = new THREE.MeshBasicMaterial({
    color:0xffffff, transparent:true,
    opacity:style==='ruins'||style==='crags'||style==='cavern'?.76:.86,
    depthWrite:false, toneMapped:false,
  });
  const instanced = new THREE.InstancedMesh(geometry,material,maxCount);
  instanced.name = 'aaa-native-facade-details';
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const accent = new THREE.Color(layout.profile.accent);
  const ivory = new THREE.Color(layout.profile.celestialColor);
  const earthy = new THREE.Color(layout.profile.groundTint);
  let index = 0;
  for (const site of layout.points) {
    for (let j=0;j<countPerSite;j++) {
      const hash=sceneHash(style+':'+site.id+':facade:'+j);
      if (urban && hash % 9===0) continue; // irregular but reproducible lit windows
      if (urban) {
        const column=j%3, row=Math.floor(j/6);
        const side=Math.floor(j/3)%2;
        const x=site.x+(side===0?(column-1)*1.42:2.58);
        const z=site.z+(side===0?2.60:(column-1)*1.42);
        dummy.position.set(x,2.7+row*2.15,z);
        dummy.rotation.set(0,side===0?0:Math.PI/2,0);
        const width=style==='city'?.75:style==='ruins'?.47:.65;
        dummy.scale.set(width,style==='city'?1:.62,1);
      } else {
        const angle=(hash%6283)/1000;
        const spread=1.1+((hash>>>12)%220)/100;
        const baseHeight=style==='forest'||style==='wilds'?5.8:
          style==='orbit'||style==='signal'?10:
          style==='reef'?4.2:6.4;
        const y=baseHeight+((hash>>>21)%6)*1.18;
        dummy.position.set(site.x+Math.cos(angle)*spread,y,site.z+Math.sin(angle)*spread);
        dummy.rotation.set(angle*.16,angle,angle*.2);
        const scale=style==='forest'||style==='wilds'?1.1:
          style==='reef'?.7:style==='orbit'||style==='signal'?1.3:.84;
        dummy.scale.set(scale,scale*(.8+(hash%50)/100),scale);
      }
      dummy.updateMatrix();
      instanced.setMatrixAt(index,dummy.matrix);
      tint.copy(accent).lerp(ivory, (hash%35)/100);
      // Minerals/ruins are etched stone; instruments and windows are brighter.
      if(['crags','cavern','ruins'].includes(style))tint.lerp(earthy,.45);
      if(style==='forest'||style==='wilds')tint.lerp(earthy,.38);
      instanced.setColorAt(index,tint);
      index++;
    }
  }
  instanced.count=index;
  instanced.instanceMatrix.needsUpdate=true;
  if(instanced.instanceColor)instanced.instanceColor.needsUpdate=true;
  instanced.computeBoundingSphere();
  scene.add(instanced);
  return { materials:[material], count:index };
}
