import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

type Outcome = 'success' | 'exception' | 'error';
type Counts = Record<Outcome, number>;
type NodeId = 'App' | 'WAF' | 'Gateway' | 'Auth' | 'Savings' | 'KYC' | 'Onboarding' | 'DL' | 'CBS' | 'CEFT';
type Packet = { id: number; from: NodeId; to: NodeId; outcome: Outcome; start: number; duration: number; journey: number };
type Event = { at: number; node: NodeId; outcome: Outcome };
type NodePosition = [number, number];
type GraphPositions = Record<NodeId, NodePosition>;
type Theme = 'dark'|'light';
type ScenePalette = {edge:string;node:string;selectedNode:string;nodeRing:string;selectedNodeRing:string;label:string;labelMuted:string};
const COLORS: Record<Outcome, string> = { success: '#a982e3', exception: '#d5a648', error: '#930610' };
const SCENE_PALETTES: Record<Theme,ScenePalette> = {
  dark:{edge:'#52687a',node:'#10272d',selectedNode:'#164447',nodeRing:'#79bfff',selectedNodeRing:'#c4eaff',label:'#f0f8ff',labelMuted:'#9fb8c8'},
  light:{edge:'#9aabba',node:'#f7fbff',selectedNode:'#e1edf9',nodeRing:'#527db4',selectedNodeRing:'#2f5e99',label:'#1d3044',labelMuted:'#60758b'}
};
const INITIAL_POSITIONS: GraphPositions = {
  App: [0, 4.8], WAF: [0, 3.45], Gateway: [0, 1.95], Auth: [-4.35, 0.15],
  Savings: [-1.55, 0.15], KYC: [1.45, 0.15], Onboarding: [4.35, 0.15],
  DL: [-1.55, -1.8], CBS: [-3.15, -3.65], CEFT: [0.1, -3.65]
};
const DEFAULT_ZOOM=54;
const MIN_ZOOM=30;
const MAX_ZOOM=108;
const EDGES: [NodeId, NodeId][] = [
  ['App','WAF'],['WAF','Gateway'],['Gateway','Auth'],['Gateway','Savings'],
  ['Gateway','KYC'],['Gateway','Onboarding'],['Savings','DL'],['DL','CBS'],['DL','CEFT']
];
const ROUTES: NodeId[][] = [
  ['App','WAF','Gateway','Auth'], ['App','WAF','Gateway','KYC'],
  ['App','WAF','Gateway','Onboarding'], ['App','WAF','Gateway','Savings','DL','CBS'],
  ['App','WAF','Gateway','Savings','DL','CEFT']
];
const empty = (): Counts => ({ success: 0, exception: 0, error: 0 });
const emptyNodeCounts = (): Record<NodeId,Counts> => Object.fromEntries((Object.keys(INITIAL_POSITIONS) as NodeId[]).map(id=>[id,empty()])) as Record<NodeId,Counts>;
const displayName = (id:NodeId):string => id==='WAF'?'WEB ALB':id;
const randOutcome = (exceptionPct: number, errorPct: number): Outcome => {
  const r = Math.random() * 100;
  return r < errorPct ? 'error' : r < errorPct + exceptionPct ? 'exception' : 'success';
};
const offset = (from:NodeId,to:NodeId,fraction:number,positions:GraphPositions):NodePosition => {
  const a=positions[from],b=positions[to];
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  const padding=0.52/length;
  const t=padding+fraction*(1-2*padding);
  return [a[0]+dx*t,a[1]+dy*t];
};

function Edge({from,to,positions,color}: {from:NodeId;to:NodeId;positions:GraphPositions;color:string}) {
  const a=offset(from,to,0,positions),b=offset(from,to,1,positions);
  const points=useMemo(()=>new Float32Array([a[0],a[1],-0.15,b[0],b[1],-0.15]),[a[0],a[1],b[0],b[1]]);
  return <line><bufferGeometry><bufferAttribute attach="attributes-position" args={[points,3]}/></bufferGeometry><lineBasicMaterial color={color} transparent opacity={0.52}/></line>;
}

function CameraZoom({zoom}: {zoom:number}) {
  const camera=useThree(state=>state.camera);
  useEffect(()=>{
    camera.zoom=zoom;
    camera.updateProjectionMatrix();
  },[camera,zoom]);
  return null;
}

function CanvasResize() {
  const gl=useThree(state=>state.gl);
  const setSize=useThree(state=>state.setSize);
  useEffect(()=>{
    const wrapper=gl.domElement.parentElement;
    if(!wrapper)return;
    const resize=()=>{
      const bounds=wrapper.getBoundingClientRect();
      if(bounds.width&&bounds.height)setSize(bounds.width,bounds.height);
    };
    const observer=new ResizeObserver(resize);
    observer.observe(wrapper);
    resize();
    return ()=>observer.disconnect();
  },[gl,setSize]);
  return null;
}

function GraphPan() {
  const {camera,gl,raycaster,scene}=useThree();
  useEffect(()=>{
    const canvas=gl.domElement;
    const pointer=new THREE.Vector2();
    let drag:{pointerId:number;x:number;y:number;cameraX:number;cameraY:number}|null=null;
    const hitsNode=(event:PointerEvent)=>{
      const bounds=canvas.getBoundingClientRect();
      pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      return raycaster.intersectObjects(scene.children,true).some(({object})=>{
        let current:THREE.Object3D|null=object;
        while(current){
          if(current.userData.graphNode)return true;
          current=current.parent;
        }
        return false;
      });
    };
    const onPointerDown=(event:PointerEvent)=>{
      if(event.button!==0||hitsNode(event))return;
      drag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,cameraX:camera.position.x,cameraY:camera.position.y};
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor='grabbing';
      event.preventDefault();
    };
    const onPointerMove=(event:PointerEvent)=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      camera.position.x=drag.cameraX-(event.clientX-drag.x)/camera.zoom;
      camera.position.y=drag.cameraY+(event.clientY-drag.y)/camera.zoom;
      camera.updateMatrixWorld();
    };
    const onPointerUp=(event:PointerEvent)=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      drag=null;
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor='grab';
    };
    canvas.addEventListener('pointerdown',onPointerDown);
    canvas.addEventListener('pointermove',onPointerMove);
    canvas.addEventListener('pointerup',onPointerUp);
    canvas.addEventListener('pointercancel',onPointerUp);
    return ()=>{
      canvas.removeEventListener('pointerdown',onPointerDown);
      canvas.removeEventListener('pointermove',onPointerMove);
      canvas.removeEventListener('pointerup',onPointerUp);
      canvas.removeEventListener('pointercancel',onPointerUp);
    };
  },[camera,gl,raycaster,scene]);
  return null;
}

function Donut({counts,colors}: {counts:Counts;colors:Record<Outcome,string>}) {
  const total=Math.max(1,counts.success+counts.exception+counts.error);
  let start=Math.PI/2;
  return <group>{(['success','exception','error'] as Outcome[]).map(outcome=>{
    const angle=Math.PI*2*counts[outcome]/total;
    const segment=angle>0?<mesh key={outcome} position={[0,0,0.12]}><ringGeometry args={[0.38,0.49,40,1,start,angle]}/><meshBasicMaterial color={colors[outcome]} side={THREE.DoubleSide}/></mesh>:null;
    start+=angle;
    return segment;
  })}</group>;
}

function NodeLabel({name,total,palette}: {name:NodeId;total:number;palette:ScenePalette}) {
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
    const context=canvas.getContext('2d')!;
    context.fillStyle=palette.label;context.textAlign='center';context.textBaseline='middle';
    context.font=`bold ${name==='Onboarding'?26:name==='WAF'?30:36}px Arial`;context.fillText(displayName(name),128,49);
    context.fillStyle=palette.labelMuted;context.font='20px Arial';context.fillText(total.toLocaleString(),128,87);
    const result=new THREE.CanvasTexture(canvas);result.colorSpace=THREE.SRGBColorSpace;return result;
  },[name,total,palette]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <sprite position={[0,0,0.32]} scale={[0.98,0.45,1]}><spriteMaterial map={texture} transparent depthTest={false}/></sprite>;
}

function Node({id,position,counts,colors,palette,selected,onSelect,onHover,onMove}: {id:NodeId;position:NodePosition;counts:Counts;colors:Record<Outcome,string>;palette:ScenePalette;selected:boolean;onSelect:(id:NodeId)=>void;onHover:(id:NodeId|null,position?:[number,number])=>void;onMove:(id:NodeId,position:NodePosition)=>void}) {
  const [x,y]=position;
  const total=counts.success+counts.exception+counts.error;
  const dragOffset=useRef<NodePosition|null>(null);
  const dragPlane=useMemo(()=>new THREE.Plane(new THREE.Vector3(0,0,1),0),[]);
  const intersection=useMemo(()=>new THREE.Vector3(),[]);
  return <group position={[x,y,0]} userData={{graphNode:true}}>
    <mesh
      onClick={event=>{event.stopPropagation();onSelect(id)}}
      onPointerDown={event=>{event.stopPropagation();dragOffset.current=[event.point.x-x,event.point.y-y];(event.target as HTMLElement).setPointerCapture(event.pointerId)}}
      onPointerMove={event=>{if(!dragOffset.current)return;const point=event.ray.intersectPlane(dragPlane,intersection);if(point)onMove(id,[point.x-dragOffset.current[0],point.y-dragOffset.current[1]])}}
      onPointerUp={event=>{dragOffset.current=null;(event.target as HTMLElement).releasePointerCapture(event.pointerId)}}
      onPointerEnter={event=>{event.stopPropagation();onHover(id,[event.nativeEvent.offsetX,event.nativeEvent.offsetY])}}
      onPointerLeave={()=>onHover(null)}
    >
      <circleGeometry args={[0.56,48]}/><meshBasicMaterial color={selected?palette.selectedNode:palette.node}/>
    </mesh>
    <mesh position={[0,0,0.035]}><ringGeometry args={[0.51,0.65,48]}/><meshBasicMaterial color={palette.nodeRing} transparent opacity={selected?0.2:0.11} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide}/></mesh>
    <mesh position={[0,0,0.08]}><ringGeometry args={[0.53,0.56,48]}/><meshBasicMaterial color={selected?palette.selectedNodeRing:palette.nodeRing} side={THREE.DoubleSide}/></mesh>
    {total>0&&<Donut counts={counts} colors={colors}/>}
    <group position={[0,0,0.22]}><mesh><circleGeometry args={[0.33,32]}/><meshBasicMaterial color={selected?palette.selectedNode:palette.node}/></mesh></group>
    <NodeLabel name={id} total={total} palette={palette}/>
  </group>;
}

function Traffic({packets,clock,positions,colors,particleDiameter}: {packets:Packet[];clock:React.RefObject<number>;positions:GraphPositions;colors:Record<Outcome,string>;particleDiameter:number}) {
  const mesh=useRef<THREE.InstancedMesh>(null);
  const glowMesh=useRef<THREE.InstancedMesh>(null);
  const object=useMemo(()=>new THREE.Object3D(),[]);
  const color=useMemo(()=>new THREE.Color(),[]);
  useFrame(()=>{
    if(!mesh.current||!glowMesh.current)return;
    const now=clock.current;let count=0;
    const loads=new Map<string,number>();
    for(const packet of packets){
      if(packet.start>now||packet.start+packet.duration<=now)continue;
      const key=`${packet.from}-${packet.to}`;
      loads.set(key,(loads.get(key)??0)+1);
    }
    for(const packet of packets){
      const progress=(now-packet.start)/packet.duration;
      if(progress<0||progress>1)continue;
      const start=positions[packet.from],end=positions[packet.to];
      const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);
      const normalX=-dy/length,normalY=dx/length;
      const load=loads.get(`${packet.from}-${packet.to}`)??1;
      const spread=0.06+Math.min(load,12)*0.022;
      const coreScale=particleDiameter/108;
      color.set(colors[packet.outcome]);
      for(let speck=0;speck<12;speck++){
        const seed=packet.id*12+speck;
        const across=Math.sin(seed*12.9898)*0.5*spread;
        const along=(speck/11-0.5)*0.82+Math.sin(seed*78.233)*0.035;
        const t=THREE.MathUtils.clamp(progress+along,0,1);
        const [px,py]=offset(packet.from,packet.to,t,positions);
        object.position.set(px+normalX*across,py+normalY*across,0.275+(speck%3)*0.003);
        object.scale.setScalar(coreScale*(packet.outcome==='error'?1.2:1.8));
        object.updateMatrix();glowMesh.current.setMatrixAt(count,object.matrix);glowMesh.current.setColorAt(count,color);
        object.position.z+=0.01;
        object.scale.setScalar(coreScale*(packet.outcome==='error'?1.1:1));
        object.updateMatrix();mesh.current.setMatrixAt(count,object.matrix);mesh.current.setColorAt(count,color);
        count++;if(count>=1500)break;
      }
      if(count>=1500)break;
    }
    mesh.current.count=count;mesh.current.instanceMatrix.needsUpdate=true;
    if(mesh.current.instanceColor)mesh.current.instanceColor.needsUpdate=true;
    glowMesh.current.count=count;glowMesh.current.instanceMatrix.needsUpdate=true;
    if(glowMesh.current.instanceColor)glowMesh.current.instanceColor.needsUpdate=true;
  });
  return <>
    <instancedMesh ref={glowMesh} args={[undefined,undefined,1500]} frustumCulled={false}><sphereGeometry args={[1,10,10]}/><meshBasicMaterial toneMapped={false} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false}/></instancedMesh>
    <instancedMesh ref={mesh} args={[undefined,undefined,1500]} frustumCulled={false}><sphereGeometry args={[1,8,8]}/><meshBasicMaterial toneMapped={false}/></instancedMesh>
  </>;
}

function Scene({positions,counts,packets,clock,colors,particleDiameter,zoom,theme,selected,onSelect,onHover,onMove}: {positions:GraphPositions;counts:Record<NodeId,Counts>;packets:Packet[];clock:React.RefObject<number>;colors:Record<Outcome,string>;particleDiameter:number;zoom:number;theme:Theme;selected:NodeId|null;onSelect:(id:NodeId)=>void;onHover:(id:NodeId|null,position?:[number,number])=>void;onMove:(id:NodeId,position:NodePosition)=>void}) {
  const palette=SCENE_PALETTES[theme];
  return <Canvas orthographic camera={{position:[0,0.55,20],zoom:DEFAULT_ZOOM,near:0.1,far:100}} gl={{antialias:true,alpha:true}}>
    <CanvasResize/>
    <CameraZoom zoom={zoom}/>
    <GraphPan/>
    {EDGES.map(([from,to])=><Edge key={`${from}-${to}`} from={from} to={to} positions={positions} color={palette.edge}/>)}
    <Traffic packets={packets} clock={clock} positions={positions} colors={colors} particleDiameter={particleDiameter}/>
    {(Object.keys(INITIAL_POSITIONS) as NodeId[]).map(id=><Node key={id} id={id} position={positions[id]} counts={counts[id]} colors={colors} palette={palette} selected={selected===id} onSelect={onSelect} onHover={onHover} onMove={onMove}/>)}
  </Canvas>;
}

function App(){
  const [theme,setTheme]=useState<Theme>(()=>localStorage.getItem('traffic-visualizer-theme')==='light'?'light':'dark');
  const [running,setRunning]=useState(true);
  const [tps,setTps]=useState(8);
  const [exceptionPct,setExceptionPct]=useState(7);
  const [errorPct,setErrorPct]=useState(3);
  const [incident,setIncident]=useState(false);
  const [selected,setSelected]=useState<NodeId|null>('Gateway');
  const [trafficColors,setTrafficColors]=useState<Record<Outcome,string>>(()=>({...COLORS}));
  const [particleDiameter,setParticleDiameter]=useState(2);
  const [zoom,setZoom]=useState(DEFAULT_ZOOM);
  const [hovered,setHovered]=useState<{id:NodeId;x:number;y:number}|null>(null);
  const [positions,setPositions]=useState<GraphPositions>(()=>({...INITIAL_POSITIONS}));
  const [packets,setPackets]=useState<Packet[]>([]);
  const [counts,setCounts]=useState<Record<NodeId,Counts>>(emptyNodeCounts);
  const [journeys,setJourneys]=useState(0);
  const clock=useRef(performance.now());
  const seq=useRef(0);
  const countMinute=useRef(Math.floor(clock.current/60000));
  const pending=useRef<Packet[]>([]);
  const events=useRef<Event[]>([]);
  const carry=useRef(0);
  const visualRef=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    localStorage.setItem('traffic-visualizer-theme',theme);
  },[theme]);
  const onNodeHover=(id:NodeId|null,position?:[number,number])=>{
    if(id===null){setHovered(null);return;}
    const bounds=visualRef.current?.getBoundingClientRect();
    const x=position?.[0]??12,y=position?.[1]??12;
    setHovered({id,x:Math.max(10,Math.min(x+14,(bounds?.width??240)-210)),y:Math.max(10,Math.min(y+14,(bounds?.height??150)-128))});
  };
  useEffect(()=>{
    const timer=setInterval(()=>{
      const now=performance.now();clock.current=now;
      const minute=Math.floor(now/60000);
      if(minute!==countMinute.current){
        countMinute.current=minute;
        setJourneys(0);
        setCounts(emptyNodeCounts());
      }
      if(running){
        carry.current+=tps*0.1;
        const toGenerate=Math.min(30,Math.floor(carry.current));carry.current-=toGenerate;
        for(let n=0;n<toGenerate;n++){
          const route=ROUTES[Math.floor(Math.random()*ROUTES.length)];
          const outcome=randOutcome(exceptionPct,errorPct);
          const failNode:NodeId = incident && route.includes('CBS') ? 'CBS' : route[Math.floor(1+Math.random()*(route.length-1))];
          const finalOutcome:Outcome=incident&&route.includes('CBS')&&Math.random()<0.7?'error':outcome;
          const path=finalOutcome==='success'?route:route.slice(0,Math.max(2,route.indexOf(failNode)+1));
          const journey=++seq.current;
          const hopMs=520;
          events.current.push({at:now,node:path[0],outcome:'success'});
          for(let i=0;i<path.length-1;i++){
            const last=i===path.length-2;
            pending.current.push({id:journey*10+i,from:path[i],to:path[i+1],outcome:last?finalOutcome:'success',start:now+i*hopMs,duration:hopMs,journey});
            events.current.push({at:now+(i+1)*hopMs,node:path[i+1],outcome:last?finalOutcome:'success'});
          }
        }
        if(toGenerate)setJourneys(j=>j+toGenerate);
      }
      const arrived=events.current.filter(e=>e.at<=now);
      events.current=events.current.filter(e=>e.at>now);
      if(arrived.length)setCounts(old=>{
        const next={...old};
        for(const e of arrived){next[e.node]={...next[e.node],[e.outcome]:next[e.node][e.outcome]+1};}
        return next;
      });
      pending.current=pending.current.filter(p=>p.start+p.duration>now);
      setPackets([...pending.current]);
    },100);
    return ()=>clearInterval(timer);
  },[running,tps,exceptionPct,errorPct,incident]);
  const chosen=selected?counts[selected]:null;
  const total=chosen?Object.values(chosen).reduce((a,b)=>a+b,0):0;
  const pct=(value:number)=>total?(value/total*100).toFixed(1):'0.0';
  const hoverCounts=hovered?counts[hovered.id]:null;
  const hoverTotal=hoverCounts?Object.values(hoverCounts).reduce((sum,value)=>sum+value,0):0;
  const hoverPct=(value:number)=>hoverTotal?(value/hoverTotal*100).toFixed(1):'0.0';
  const reset=()=>{pending.current=[];events.current=[];carry.current=0;setPackets([]);setJourneys(0);setCounts(Object.fromEntries(Object.keys(INITIAL_POSITIONS).map(k=>[k,empty()])) as Record<NodeId,Counts>)};
  return <main>
    <header><div><h1>Fintech Traffic Visualizer</h1><p>Draggable service graph · Synthetic request journeys · Live simulation</p></div><div className="header-status"><label className="theme-toggle"><input type="checkbox" checked={theme==='light'} onChange={event=>setTheme(event.target.checked?'light':'dark')}/>Light theme</label><span className="live">● {running?'SIMULATING':'PAUSED'}</span></div></header>
    <div className="workspace">
      <section className="visual" ref={visualRef}>
        <Scene positions={positions} counts={counts} packets={packets} clock={clock} colors={trafficColors} particleDiameter={particleDiameter} zoom={zoom} theme={theme} selected={selected} onSelect={setSelected} onHover={onNodeHover} onMove={(id,position)=>setPositions(current=>({...current,[id]:position}))}/>
        <div className="zoom-controls" aria-label="Graph zoom">
          <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom<=MIN_ZOOM} onClick={()=>setZoom(value=>Math.max(MIN_ZOOM,value/1.2))}>−</button>
          <span aria-live="polite">{Math.round(zoom/DEFAULT_ZOOM*100)}%</span>
          <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom>=MAX_ZOOM} onClick={()=>setZoom(value=>Math.min(MAX_ZOOM,value*1.2))}>+</button>
          <button type="button" aria-label="Reset zoom" title="Reset zoom" disabled={zoom===DEFAULT_ZOOM} onClick={()=>setZoom(DEFAULT_ZOOM)}>100%</button>
        </div>
        {hovered&&hoverCounts&&<div className="node-tooltip" style={{left:hovered.x,top:hovered.y}} role="tooltip"><strong>{displayName(hovered.id)}</strong><div className="node-tooltip-total"><span>Arrivals this minute</span><b>{hoverTotal.toLocaleString()}</b></div>{(['success','exception','error'] as Outcome[]).map(outcome=><div className="node-tooltip-row" key={outcome} style={{color:trafficColors[outcome]}}><span>{outcome}</span><b>{hoverCounts[outcome].toLocaleString()}</b><small>{hoverPct(hoverCounts[outcome])}%</small></div>)}</div>}
        <div className="legend"><span><b style={{background:trafficColors.success}}/>Success</span><span><b style={{background:trafficColors.exception}}/>Exception</span><span><b style={{background:trafficColors.error}}/>Error</span></div>
      </section>
      <aside><h2>Simulation controls</h2>
        <label>Journeys / second <strong>{tps}</strong><input type="range" min="1" max="40" value={tps} onChange={e=>setTps(+e.target.value)}/></label>
        <label>Exception rate <strong>{exceptionPct}%</strong><input type="range" min="0" max="30" value={exceptionPct} onChange={e=>setExceptionPct(+e.target.value)}/></label>
        <label>Error rate <strong>{errorPct}%</strong><input type="range" min="0" max="30" value={errorPct} onChange={e=>setErrorPct(+e.target.value)}/></label>
        <section className="appearance-controls">
          <h3>Traffic appearance</h3>
          <div className="outcome-colors">
            {(['success','exception','error'] as Outcome[]).map(outcome=><label className="color-control" key={outcome}>{outcome}<input aria-label={`${outcome} color`} type="color" value={trafficColors[outcome]} onChange={event=>setTrafficColors(current=>({...current,[outcome]:event.target.value}))}/></label>)}
          </div>
          <label className="particle-size-control">Particle diameter <strong>{particleDiameter.toFixed(1)} px</strong><input aria-label="Particle diameter" type="range" min="1" max="8" step="0.5" value={particleDiameter} onChange={event=>setParticleDiameter(Number(event.target.value))}/></label>
        </section>
        <label className="toggle"><input type="checkbox" checked={incident} onChange={e=>setIncident(e.target.checked)}/>Inject CBS incident (70% failure)</label>
        <div className="actions"><button onClick={()=>setRunning(v=>!v)}>{running?'Pause':'Resume'}</button><button className="secondary" onClick={reset}>Reset</button></div>
        <div className="stat"><span>Journeys this minute</span><strong>{journeys.toLocaleString()}</strong></div>
        <div className="stat"><span>Active particle hops</span><strong>{packets.length}</strong></div>
        <hr/>
        <h2>{selected?displayName(selected):'Select a node'}</h2>
        <p className="muted">Node arrivals this minute (not end-to-end transaction outcomes)</p>
        {chosen&&(['success','exception','error'] as Outcome[]).map(k=><div className="metric" key={k}><span style={{color:trafficColors[k]}}>{k}</span><strong>{pct(chosen[k])}%</strong><small>{chosen[k].toLocaleString()}</small></div>)}
        <p className="note">Mock semantics: each journey chooses a route. Intermediate hops are successful; exceptions/errors are assigned to the terminal reached node. CBS incident overrides some CBS-bound journeys. Node counts and outcome rates reset each minute.</p>
      </aside>
    </div>
  </main>;
}
export default App;
