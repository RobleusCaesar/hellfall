// Parse GLB files: meshes, triangle counts, bounds (from accessor min/max after node transforms ignored -> report raw), skins, animations, images, materials
import fs from 'node:fs'; import path from 'node:path';
const root = process.argv[2];
function walk(d){ let out=[]; for(const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); if(e.isDirectory()) out=out.concat(walk(p)); else if(e.name.toLowerCase().endsWith('.glb')) out.push(p);} return out; }
const COMP = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const NUM = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function mat4mulVec(m,v){ return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }
function mat4mul(a,b){ const r=new Array(16).fill(0); for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++) r[j*4+i]+=a[k*4+i]*b[j*4+k]; return r; }
function trs(n){ if(n.matrix) return n.matrix; const t=n.translation||[0,0,0], q=n.rotation||[0,0,0,1], s=n.scale||[1,1,1]; const [x,y,z,w]=q; const m=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0, 2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0, 2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0, t[0],t[1],t[2],1]; m[0]*=s[0];m[1]*=s[0];m[2]*=s[0]; m[4]*=s[1];m[5]*=s[1];m[6]*=s[1]; m[8]*=s[2];m[9]*=s[2];m[10]*=s[2]; return m; }
for(const f of walk(root)){
  const buf=fs.readFileSync(f); const len=buf.readUInt32LE(8); const jlen=buf.readUInt32LE(12); const json=JSON.parse(buf.toString('utf8',20,20+jlen));
  const meshes=json.meshes||[]; let tris=0, verts=0; const prims=[];
  for(const m of meshes) for(const p of m.primitives||[]){ const pos=json.accessors[p.attributes.POSITION]; verts+=pos.count; const n = p.indices!=null ? json.accessors[p.indices].count : pos.count; const mode=p.mode??4; const t = mode===4? n/3 : mode===5||mode===6 ? n-2 : 0; tris+=t; prims.push({mesh:m.name, tris:t, mat:p.material}); }
  // world bounds via node traversal
  let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
  const scene=json.scenes?.[json.scene??0]; const visit=(ni,parent)=>{ const n=json.nodes[ni]; const M=mat4mul(parent,trs(n)); if(n.mesh!=null){ for(const p of json.meshes[n.mesh].primitives){ const a=json.accessors[p.attributes.POSITION]; if(a.min&&a.max){ for(const cx of [a.min[0],a.max[0]]) for(const cy of [a.min[1],a.max[1]]) for(const cz of [a.min[2],a.max[2]]){ const w=mat4mulVec(M,[cx,cy,cz]); for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],w[i]); mx[i]=Math.max(mx[i],w[i]);} } } } } for(const c of n.children||[]) visit(c,M); };
  const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]; if(scene) for(const ni of scene.nodes) visit(ni,I);
  const size=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]];
  const anims=(json.animations||[]).map(a=>a.name||'(unnamed)');
  const skins=(json.skins||[]).length; const joints=(json.skins||[]).reduce((s,k)=>s+(k.joints?.length||0),0);
  const images=(json.images||[]).length; const mats=(json.materials||[]).length; const nodes=(json.nodes||[]).length;
  const gen=json.asset?.generator||'';
  console.log(JSON.stringify({file:path.relative(root,f).split(path.sep).join('/'), bytes:buf.length, generator:gen, meshes:meshes.length, nodes, tris, verts, sizeXYZ_m:size.map(v=>+v.toFixed(3)), min:mn.map(v=>+v.toFixed(3)), max:mx.map(v=>+v.toFixed(3)), skins, joints, anims, images, mats, extUsed:json.extensionsUsed||[]}));
}
