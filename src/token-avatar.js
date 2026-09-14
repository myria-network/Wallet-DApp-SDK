import {sha256} from '@noble/hashes/sha2.js';

const ASSET_ID=/^[a-f0-9]{64}$/i;
const palettes=[
  ['#a78bfa','#d8b4fe','#7c3aed'],
  ['#818cf8','#c4b5fd','#4f46e5'],
  ['#38bdf8','#a5f3fc','#2563eb'],
  ['#2dd4bf','#99f6e4','#0f766e'],
  ['#f472b6','#fbcfe8','#be185d'],
  ['#c084fc','#e9d5ff','#7e22ce'],
];

function identity(assetId,symbol='',name=''){
  if(typeof assetId!=='string'||!ASSET_ID.test(assetId))throw new TypeError('INVALID_ASSET_ID');
  if(typeof symbol!=='string'||symbol.length>12||typeof name!=='string'||name.length>64)throw new TypeError('INVALID_TOKEN_IDENTITY');
  return {assetId:assetId.toLowerCase(),symbol,name};
}

/** Returns the canonical, deterministic MYRIA token portrait instructions.
 * AssetID controls presentation only and is never proof of identity or ownership. */
export function tokenAvatarArt(assetId,symbol=''){
  ({assetId,symbol}=identity(assetId,symbol));
  let digest=sha256(new TextEncoder().encode('MYRIA|TOKEN_PORTRAIT|V1|'+assetId)),cursor=0;
  const random=()=>{if(cursor===digest.length){digest=sha256(digest);cursor=0;}return digest[cursor++]/255;};
  const palette=/^(?:T?MYR)$/i.test(symbol.trim())?palettes[0]:palettes[Math.floor(random()*palettes.length)];
  const centers=[
    {x:10+random()*44,y:10+random()*44,power:.68+random()*.2},
    {x:8+random()*48,y:8+random()*48,power:.5+random()*.18},
    {x:12+random()*40,y:12+random()*40,power:.38+random()*.18},
  ];
  const pixels=[];
  for(let row=0;row<14;row++)for(let column=0;column<14;column++){
    const x=4+column*4,y=4+row*4,cx=x+1.4,cy=y+1.4;
    let field=0;
    for(const center of centers){const distance=Math.hypot(cx-center.x,cy-center.y);field=Math.max(field,center.power-distance/42);}
    const centerPulse=Math.max(0,.48-Math.hypot(cx-32,cy-32)/45);
    if(random()+field+centerPulse<.94)continue;
    const size=random()>.82?3.15:2.6;
    pixels.push({x:x+(3.2-size)/2,y:y+(3.2-size)/2,size,opacity:.42+random()*.42,highlight:random()+field>.98});
  }
  const fragments=[];
  for(let index=0;index<5;index++)fragments.push({x:5+random()*54,y:5+random()*54,size:.7+random()*1.15,opacity:.32+random()*.42});
  return {primary:palette[0],secondary:palette[1],glow:palette[2],background:'#101529',gridOffset:Math.floor(random()*6),pixels,fragments};
}

export function tokenInitial(symbol='',name=''){
  if(typeof symbol!=='string'||typeof name!=='string')throw new TypeError('INVALID_TOKEN_IDENTITY');
  if(/^(?:T?MYR)$/i.test(symbol.trim()))return 'M';
  return (symbol.trim()||name.trim()||'?').slice(0,1).toLocaleUpperCase();
}

/** Draws the canonical portrait into a caller-owned canvas. */
export function drawTokenAvatar(canvas,{assetId,symbol='',name='',scale=2}={}){
  identity(assetId,symbol,name);if(!canvas||typeof canvas.getContext!=='function'||!Number.isInteger(scale)||scale<1||scale>4)throw new TypeError('INVALID_TOKEN_CANVAS');
  const art=tokenAvatarArt(assetId,symbol),initial=tokenInitial(symbol,name);canvas.width=64*scale;canvas.height=64*scale;
  const ctx=canvas.getContext('2d');if(!ctx)throw new TypeError('TOKEN_CANVAS_UNAVAILABLE');
  ctx.scale(scale,scale);ctx.beginPath();ctx.roundRect(.75,.75,62.5,62.5,14);ctx.clip();ctx.fillStyle=art.background;ctx.fillRect(0,0,64,64);
  ctx.strokeStyle=art.secondary;ctx.globalAlpha=.075;ctx.lineWidth=.55;
  for(let line=art.gridOffset;line<64;line+=8){ctx.beginPath();ctx.moveTo(line,0);ctx.lineTo(line,64);ctx.stroke();ctx.beginPath();ctx.moveTo(0,line);ctx.lineTo(64,line);ctx.stroke();}
  const blast=ctx.createLinearGradient(2,2,62,62);blast.addColorStop(0,art.primary);blast.addColorStop(1,art.glow);
  for(const pixel of art.pixels){ctx.globalAlpha=pixel.opacity;ctx.fillStyle=pixel.highlight?art.secondary:blast;ctx.fillRect(pixel.x,pixel.y,pixel.size,pixel.size);}
  ctx.fillStyle=art.secondary;for(const fragment of art.fragments){ctx.globalAlpha=fragment.opacity;ctx.fillRect(fragment.x,fragment.y,fragment.size,fragment.size);}
  ctx.globalAlpha=1;ctx.shadowColor=art.primary;ctx.shadowBlur=4.5;ctx.beginPath();ctx.arc(32,32,14.8,0,Math.PI*2);
  const core=ctx.createRadialGradient(29,28,2,32,32,15);core.addColorStop(0,art.secondary);core.addColorStop(1,art.glow);ctx.fillStyle=core;ctx.globalAlpha=.22;ctx.fill();
  ctx.globalAlpha=.65;ctx.strokeStyle=art.primary;ctx.lineWidth=1.2;ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=.96;ctx.fillStyle='#0c1020';ctx.beginPath();ctx.arc(32,32,10.7,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=.84;ctx.strokeStyle=art.secondary;ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=art.secondary;ctx.font='650 14px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(initial,32,32.5);
  ctx.beginPath();ctx.roundRect(.75,.75,62.5,62.5,14);ctx.strokeStyle=art.primary;ctx.globalAlpha=.42;ctx.lineWidth=1.5;ctx.stroke();ctx.globalAlpha=1;return canvas;
}

const pngCache=new Map();

/** Returns a browser-generated data:image/png;base64 URL with bounded caching. */
export function tokenAvatarPng(assetId,symbol='',name=''){
  identity(assetId,symbol,name);if(typeof document==='undefined')throw new TypeError('TOKEN_CANVAS_UNAVAILABLE');
  const initial=tokenInitial(symbol,name),cacheKey=`${assetId.toLowerCase()}|${symbol}|${initial}`,cached=pngCache.get(cacheKey);if(cached)return cached;
  const png=drawTokenAvatar(document.createElement('canvas'),{assetId,symbol,name}).toDataURL('image/png');
  if(pngCache.size>=128)pngCache.delete(pngCache.keys().next().value);pngCache.set(cacheKey,png);return png;
}
