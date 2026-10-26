export function buildAlignment(points){
  const segments=[];let total=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length>1e-9){segments.push({a,b,start:total,length,tx:dx/length,ty:dy/length});total+=length}}
  return {segments,total};
}

export function pointAtStation(alignment,station){
  if(!alignment.segments.length)return null;const s=Math.max(0,Math.min(alignment.total,station));let segment=alignment.segments.at(-1);
  for(const candidate of alignment.segments)if(s<=candidate.start+candidate.length){segment=candidate;break}
  const t=Math.min(1,Math.max(0,(s-segment.start)/segment.length));
  return {x:segment.a.x+(segment.b.x-segment.a.x)*t,y:segment.a.y+(segment.b.y-segment.a.y)*t,z:segment.a.z+(segment.b.z-segment.a.z)*t,tx:segment.tx,ty:segment.ty};
}

export function stationValues(total,interval,max=20000){
  if(!(total>0&&interval>0))return [];const count=Math.floor(total/interval)+1;if(count+1>max)throw new Error(`Sampling exceeds ${max.toLocaleString()} points`);
  const values=Array.from({length:count},(_,i)=>i*interval);if(total-values.at(-1)>1e-8)values.push(total);return values;
}

const esc=value=>`"${String(value??'').replaceAll('"','""')}"`;
export function profileCsv(result){
  const rows=[['PROFILE AND CROSS SECTION REPORT'],['CRS',result.crs],['Alignment Length (m)',result.totalLength],['Profile Interval (m)',result.settings.profileInterval],['Cross Section Interval (m)',result.settings.sectionInterval],[],['Record','Station (m)','Offset (m)','Easting','Northing','Elevation']];
  result.samples.forEach(p=>rows.push(['LONG_PROFILE',p.station,'',p.easting,p.northing,p.elevation??'']));
  result.sections.forEach(section=>section.samples.forEach(p=>rows.push(['CROSS_SECTION',section.station,p.offset,p.easting,p.northing,p.elevation??''])));
  return '\uFEFF'+rows.map(row=>row.map(esc).join(',')).join('\r\n');
}

const pair=(code,value)=>`${code}\n${value}\n`,num=value=>Number(value).toFixed(4);
function layer(name,color){return pair(0,'LAYER')+pair(2,name)+pair(70,0)+pair(62,color)+pair(6,'CONTINUOUS')}
function line(layerName,x1,y1,x2,y2,z1=0,z2=0){return pair(0,'LINE')+pair(8,layerName)+pair(10,num(x1))+pair(20,num(y1))+pair(30,num(z1))+pair(11,num(x2))+pair(21,num(y2))+pair(31,num(z2))}
function text(layerName,value,x,y,height=1.5){return pair(0,'TEXT')+pair(8,layerName)+pair(10,num(x))+pair(20,num(y))+pair(30,0)+pair(40,num(height))+pair(1,value)}
function connectedLines(layerName,points,is3d=false){let out='';for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(!a||!b)continue;out+=line(layerName,a.x,a.y,b.x,b.y,is3d?a.z||0:0,is3d?b.z||0:0)}return out}

export function profileDxf(result,verticalExaggeration=1){
  const valid=result.samples.filter(p=>Number.isFinite(p.elevation));if(valid.length<2)throw new Error('At least 2 valid elevation samples are required');const minZ=Math.min(...valid.map(p=>p.elevation)),maxZ=Math.max(...valid.map(p=>p.elevation)),datum=Math.floor(minZ/5)*5,anchorX=Math.min(...valid.map(p=>p.easting)),projectMinY=Math.min(...valid.map(p=>p.northing)),textHeight=Math.max(Math.min(result.totalLength/80,2.5),.5),profileHeight=Math.max((maxZ-datum)*verticalExaggeration,5),profileBaseY=projectMinY-profileHeight-textHeight*8;
  let entities=connectedLines('ALIGNMENT_3D',valid.map(p=>({x:p.easting,y:p.northing,z:p.elevation})),true);
  const profile=result.samples.map(p=>Number.isFinite(p.elevation)?{x:anchorX+p.station,y:profileBaseY+(p.elevation-datum)*verticalExaggeration}:null);entities+=connectedLines('LONG_PROFILE',profile)+line('GRID',anchorX,profileBaseY,anchorX+result.totalLength,profileBaseY)+text('ANNOTATION',`LONG PROFILE DATUM ${datum.toFixed(3)} V.E. ${verticalExaggeration}x`,anchorX,profileBaseY-textHeight*2,textHeight);
  let rowY=profileBaseY-textHeight*8;for(const section of result.sections){const sectionValid=section.samples.filter(p=>Number.isFinite(p.elevation));if(sectionValid.length<2)continue;const sectionDatum=Math.floor(Math.min(...sectionValid.map(p=>p.elevation))/5)*5,sectionHeight=Math.max((Math.max(...sectionValid.map(p=>p.elevation))-sectionDatum)*verticalExaggeration,3),sectionPoints=section.samples.map(p=>Number.isFinite(p.elevation)?{x:anchorX+result.settings.sectionHalfWidth+p.offset,y:rowY+(p.elevation-sectionDatum)*verticalExaggeration}:null);entities+=connectedLines('CROSS_SECTIONS',sectionPoints)+line('GRID',anchorX,rowY,anchorX+result.settings.sectionHalfWidth*2,rowY)+text('ANNOTATION',`STA ${section.station.toFixed(3)} DATUM ${sectionDatum.toFixed(3)}`,anchorX,rowY-textHeight*2,textHeight);rowY-=sectionHeight+textHeight*7}
  const tables=pair(0,'SECTION')+pair(2,'TABLES')+pair(0,'TABLE')+pair(2,'LAYER')+pair(70,5)+layer('ALIGNMENT_3D',3)+layer('LONG_PROFILE',4)+layer('CROSS_SECTIONS',1)+layer('GRID',8)+layer('ANNOTATION',7)+pair(0,'ENDTAB')+pair(0,'ENDSEC');
  return pair(0,'SECTION')+pair(2,'HEADER')+pair(9,'$ACADVER')+pair(1,'AC1009')+pair(9,'$INSUNITS')+pair(70,6)+pair(0,'ENDSEC')+tables+pair(0,'SECTION')+pair(2,'ENTITIES')+entities+pair(0,'ENDSEC')+pair(0,'EOF');
}
