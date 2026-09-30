import {test} from 'node:test';
import assert from 'node:assert/strict';
import {placement} from '../tools/screenshot/geometry.mjs';
for(const [w,h] of [[2064,2752],[2752,2064],[2048,2732],[2732,2048]]){
  for(const [iw,ih] of [[1668,2420],[3000,1000],[1000,3000],[w,h]]){
    test(`fit ${iw}x${ih} into ${w}x${h} without clipping or stretching`,()=>{const p=placement(iw,ih,w,h,'fit',3,10000,-10000);assert.ok(p.width<=w+.001&&p.height<=h+.001);assert.ok(p.left>=-.001&&p.top>=-.001);assert.ok(Math.abs(p.width/p.height-iw/ih)<1e-10);});
    test(`crop ${iw}x${ih} covers ${w}x${h} at every drag limit`,()=>{for(const zoom of [1,1.7,3])for(const x of [-1e9,0,1e9])for(const y of [-1e9,0,1e9]){const p=placement(iw,ih,w,h,'crop',zoom,x,y);assert.ok(p.left<=.001&&p.top<=.001);assert.ok(p.left+p.width>=w-.001&&p.top+p.height>=h-.001);assert.ok(Math.abs(p.width/p.height-iw/ih)<1e-10);}});
  }
}
