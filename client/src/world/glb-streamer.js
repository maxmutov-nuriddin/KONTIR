import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Optional production-asset adapter. The playable demo uses procedural ChunkWorld.
// Each GLB must own its GPU resources; shared asset caches need reference counting.
export class GLBStreamer {
  constructor(scene,{maxConcurrent=2,budgetBytes=128*1024*1024}={}){
    this.scene=scene;this.loader=new GLTFLoader();this.maxConcurrent=maxConcurrent;this.budget=budgetBytes;
    this.entries=new Map();this.queue=[];this.running=0;this.used=0;
  }
  request(meta){
    const existing=this.entries.get(meta.id);if(existing){existing.lastUsed=performance.now();return;}
    // gpuBytes is an offline estimate, NOT the compressed GLB download size.
    if(!Number.isFinite(meta.gpuBytes)||meta.gpuBytes<=0||meta.gpuBytes>this.budget)return;
    const entry={meta,state:'queued',lastUsed:performance.now(),abort:new AbortController(),root:null};
    this.entries.set(meta.id,entry);this.queue.push(entry);this.pump();
  }
  release(id){
    const e=this.entries.get(id);if(!e)return;e.abort.abort();
    if(e.root){this.scene.remove(e.root);this.disposeAsset(e.root);this.used-=e.meta.gpuBytes;}
    this.entries.delete(id);
  }
  disposeAsset(root){
    const resources=new Set();root.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m){resources.add(m);for(const value of Object.values(m))if(value?.isTexture)resources.add(value);}});resources.forEach(r=>r.dispose());
  }
  async load(e){
    try{
      const response=await fetch(e.meta.url,{signal:e.abort.signal});if(!response.ok)throw new Error(`GLB ${response.status}`);
      const bytes=await response.arrayBuffer();const base=new URL('.',new URL(e.meta.url,location.href)).href;
      const gltf=await this.loader.parseAsync(bytes,base);
      if(e.abort.signal.aborted||this.entries.get(e.meta.id)!==e){this.disposeAsset(gltf.scene);return;}
      // Enforce the budget at commit time, including concurrent completions.
      if(this.used+e.meta.gpuBytes>this.budget){this.disposeAsset(gltf.scene);this.entries.delete(e.meta.id);return;}
      e.root=gltf.scene;e.state='ready';this.used+=e.meta.gpuBytes;this.scene.add(e.root);
    }catch(error){if(error.name!=='AbortError')console.warn('Chunk load failed',e.meta.id,error);if(this.entries.get(e.meta.id)===e)this.entries.delete(e.meta.id);}
    finally{this.running--;this.pump();}
  }
  pump(){while(this.running<this.maxConcurrent&&this.queue.length){const e=this.queue.shift();if(this.entries.get(e.meta.id)!==e)continue;e.state='loading';this.running++;void this.load(e);}}
  dispose(){for(const id of [...this.entries.keys()])this.release(id);this.queue=[];}
}
