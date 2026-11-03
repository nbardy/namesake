/* Ocean tessellations — original graphic wave studies.
 * Geometry is Ammann–Beenker cut-and-project, not a noise-painted square grid.
 * Shared boundaries are images under one ordered area-preserving plane map.
 * Material octaves use the same silver ratio as the geometric inflation.
 */
(function (root) {
  'use strict';
  var PI = Math.PI, TAU = 2 * PI, SILVER = 1 + Math.SQRT2;
  var defaults = Object.freeze({ variant: 'currents', scale: .7, detail: 1, curl: 5.4, seams: true, tileVariation: .65, structure: false, motion: false, outlines: false, seed: 17 });
  var colors = { ink: '#061e30', deep: '#07384b', blue: '#125b70', teal: '#218a93', pale: '#70b8b6', foam: '#e6f1e7' };
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function clean(o) { o = o || {}; return { variant: (o.variant || o.mode) === 'escher' ? 'escher' : 'currents', scale: clamp(Number(o.scale) || defaults.scale, .55, 1.7), detail: clamp(Number(o.detail) || 1, .25, 1.5), curl:typeof o.curl==='number'?clamp(o.curl,0,10):defaults.curl, seams:o.seams===undefined?true:!!o.seams, tileVariation:typeof o.tileVariation==='number'?clamp(o.tileVariation,0,1):defaults.tileVariation,structure:!!o.structure, motion: !!o.motion, outlines: !!o.outlines, seed: Math.round(Number(o.seed) || 17) }; }
  function hash(x, y, s) { var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
  function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function noise(x, y, s) { var a = Math.floor(x), b = Math.floor(y), u = smooth(x - a), v = smooth(y - b); var n0 = hash(a,b,s), n1 = hash(a+1,b,s), n2 = hash(a,b+1,s), n3 = hash(a+1,b+1,s); return ((n0+(n1-n0)*u)*(1-v)+(n2+(n3-n2)*u)*v)*2-1; }
  function fbm(x, y, octaves, seed) { var sum=0, a=1, norm=0, c=Math.SQRT1_2; for(var i=0;i<octaves;i++) { sum += a*noise(x,y,seed+i*23); norm += a; var xx=(x-y)*c*SILVER+13.7; y=(x+y)*c*SILVER-9.2; x=xx; a*=Math.pow(SILVER,-.82); } return sum/norm; }
  // A scalar streamfunction owns the world-current field. No per-tile noise seams.
  function potential(x,y,seed) { var s=0; for(var j=0;j<4;j++) { var a=j*PI/4; s+=Math.sin((x*Math.cos(a)+y*Math.sin(a))*.87+j*.73)*.18; } return .76*y-.25*x+s+.47*fbm(x*.74,y*.74,4,seed); }
  function flow(x,y,seed) { var e=.008; var dx=(potential(x+e,y,seed)-potential(x-e,y,seed))/(2*e), dy=(potential(x,y+e,seed)-potential(x,y-e,seed))/(2*e); var l=Math.hypot(dx,dy)||1; return { x:dy/l, y:-dx/l }; }
  function colorMix(a,b,t) { function rgb(color){return color.charAt(0)==='#'?color.slice(1).match(/[0-9a-f]{2}/gi).map(function(x){return parseInt(x,16);}):color.match(/\d+(?:\.\d+)?/g).slice(0,3).map(Number);}var ac=rgb(a),bc=rgb(b);return 'rgb('+ac.map(function(x,i){return Math.round(x+(bc[i]-x)*t);}).join(',')+')'; }
  // A finite quadrilateral-face dual has maximum degree four and exposed
  // boundary faces of degree at most three in every induced subgraph. Peeling
  // those faces, then coloring in reverse, therefore needs at most four labels.
  // Stable IDs break ties: equivalent index permutations give identical labels.
  function tileCategories(geometry) {
    var count=geometry.faces.length,neighbors=geometry.faces.map(function(){return new Set();}),removed=new Set(),order=[],labels=new Array(count),ids=geometry.faces.map(function(f,i){return String(f.id===undefined?i:f.id);});
    geometry.edges.forEach(function(e){if(e.faces.length===2){neighbors[e.faces[0]].add(e.faces[1]);neighbors[e.faces[1]].add(e.faces[0]);}});
    var degree=neighbors.map(function(n){return n.size;});
    while(order.length<count){var selected=-1;for(var i=0;i<count;i++)if(!removed.has(i)&&(selected<0||degree[i]<degree[selected]||degree[i]===degree[selected]&&ids[i]<ids[selected]))selected=i;removed.add(selected);order.push(selected);neighbors[selected].forEach(function(n){if(!removed.has(n))degree[n]--;});}
    for(var j=order.length-1;j>=0;j--){var face=order[j],used=new Set(),hashId=2166136261;neighbors[face].forEach(function(n){if(labels[n]!==undefined)used.add(labels[n]);});for(var k=0;k<ids[face].length;k++){hashId^=ids[face].charCodeAt(k);hashId=Math.imul(hashId,16777619);}var preferred=(hashId>>>0)%4,label=0;while(label<4&&used.has((preferred+label)%4))label++;labels[face]=label<4?(preferred+label)%4:4;}
    return labels;
  }
  // Compositions of compact polar twists and triangular shears are explicit
  // area-preserving homeomorphisms. Every material and boundary uses this map.
  function createDeformation(geometry,options) {
    var o=clean(options),factor=o.curl/7.6,matched=new Set(),strong=new Set(),degree=geometry.vertices.map(function(){return 0;}),vortices=[];
    geometry.edges.forEach(function(e){degree[e.a]++;degree[e.b]++;});
    geometry.edges.slice().sort(function(a,b){return a.signature-b.signature;}).forEach(function(e){if(e.faces.length===2&&!matched.has(e.faces[0])&&!matched.has(e.faces[1])){strong.add(e.id);matched.add(e.faces[0]);matched.add(e.faces[1]);}});
    geometry.vertices.map(function(v,i){return {x:v.x,y:v.y,degree:degree[i],r:Math.hypot(v.x,v.y)};}).filter(function(v){return v.degree>=5;}).sort(function(a,b){return b.degree-a.degree||a.r-b.r;}).forEach(function(v){var radius=v.degree===8?SILVER/1.6:1.02;if(vortices.every(function(q){return Math.hypot(q.x-v.x,q.y-v.y)>q.radius+radius+.1;}))vortices.push({x:v.x,y:v.y,radius:radius,angle:(v.degree===8?.85:2.6)*factor});});
    var twists=geometry.edges.filter(function(e){return strong.has(e.id);}).map(function(e,i){return {x:(e.start.x+e.end.x)/2,y:(e.start.y+e.end.y)/2,radius:.43,angle:o.curl*(e.signature%2?-1:1),index:i};});
    var grid=new Map(),bucketSize=.86;
    twists.forEach(function(v,i){for(var y=Math.floor((v.y-v.radius)/bucketSize);y<=Math.floor((v.y+v.radius)/bucketSize);y++)for(var x=Math.floor((v.x-v.radius)/bucketSize);x<=Math.floor((v.x+v.radius)/bucketSize);x++){var key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);}});
    function polar(p,v,sign){var dx=p.x-v.x,dy=p.y-v.y,r2=(dx*dx+dy*dy)/(v.radius*v.radius);if(r2>=1)return p;var a=v.angle*Math.pow(1-r2,3)*(sign||1),ca=Math.cos(a),sa=Math.sin(a);return {x:v.x+ca*dx-sa*dy,y:v.y+sa*dx+ca*dy};}
    function afterEdges(p){for(var i=0;i<vortices.length;i++)p=polar(p,vortices[i],1);var x=p.x+.23*factor*Math.sin(1.2*p.y+.4);return {x:x,y:p.y+.18*factor*Math.sin(1.05*x-.6)};}
    function beforeEdges(p){var y=p.y-.18*factor*Math.sin(1.05*p.x-.6);p={x:p.x-.23*factor*Math.sin(1.2*y+.4),y:y};for(var i=vortices.length-1;i>=0;i--)p=polar(p,vortices[i],-1);return p;}
    function edgeWarp(p,edgeIds,inverse){var cursor=inverse?twists.length-1:0;while(cursor>=0&&cursor<twists.length){var ids=grid.get(Math.floor(p.x/bucketSize)+','+Math.floor(p.y/bucketSize))||[], found=-1;for(var k=0;k<ids.length;k++){var i=ids[inverse?ids.length-1-k:k];if(inverse?i>cursor:i<cursor)continue;var v=twists[i];if((p.x-v.x)*(p.x-v.x)+(p.y-v.y)*(p.y-v.y)<v.radius*v.radius){found=i;break;}}if(found<0)break;p=polar(p,twists[found],inverse?-1:1);cursor=found+(inverse?-1:1);}return p;}
    return {forward:function(p,edgeIds){return afterEdges(edgeWarp(p,edgeIds,false));},inverse:function(p){return edgeWarp(beforeEdges(p),null,true);},edgeWarp:function(p,edgeIds){return edgeWarp(p,edgeIds,false);},afterEdges:afterEdges,edgePoint:function(e,t){return edgeWarp({x:e.start.x+t*(e.end.x-e.start.x),y:e.start.y+t*(e.end.y-e.start.y)},null,false);},isStrong:function(e){return strong.has(e.id);},strongEdges:strong.size,matchedFaces:matched.size,macroVortices:vortices.length,diagnostics:{determinant:1,inverse:'Reverse shears; reverse compact radial twists; reverse edge twists.',strongCrest:'Greedy dual-graph matching: each face owns at most one strong shared crest.',macroVortices:vortices.length}};
  }
  function createOceanMaterial(onContextLost) {
    var canvas=document.createElement('canvas'),gl;
    try {gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,preserveDrawingBuffer:true});}catch(e){return null;}if(!gl)return null;var lost=false;canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();lost=true;if(onContextLost)onContextLost();});
    var vertex='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    var fragment = `precision highp float;
uniform vec2 res;uniform float time,detail,variation;uniform sampler2D uv_map,tile_map;uniform vec2 uv_size,source_min,source_range;
vec2 decodeSource(vec4 c){vec4 b=floor(c*255.+.5);return source_min+vec2(b.r*256.+b.g,b.b*256.+b.a)/65535.*source_range;}
vec2 sourceAt(vec2 uv){vec2 pixel=uv*uv_size-.5,base=floor(pixel),f=fract(pixel);vec2 a=decodeSource(texture2D(uv_map,(base+.5)/uv_size)),b=decodeSource(texture2D(uv_map,(base+vec2(1.5,.5))/uv_size)),c=decodeSource(texture2D(uv_map,(base+vec2(.5,1.5))/uv_size)),d=decodeSource(texture2D(uv_map,(base+1.5)/uv_size));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
const float D=2.41421356237;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y)*2.-1.;}
float fbm(vec2 p){float v=0.,a=.57;for(int i=0;i<5;i++){v+=a*noise(p)*(1.-smoothstep(detail*3.+1.,detail*3.+2.,float(i)));p=mat2(.7071068,-.7071068,.7071068,.7071068)*p*D+vec2(13.1,7.7);a*=pow(D,-.82);}return v;}
float low(vec2 p){float v=0.,a=.57;for(int i=0;i<3;i++){v+=a*noise(p);p=mat2(.7071068,-.7071068,.7071068,.7071068)*p*D+vec2(13.1,7.7);a*=pow(D,-.82);}return v;}
vec2 advectLow(vec2 p){vec2 q=vec2(low(p*.67),low(p*.67+vec2(16.3,7.1)));vec2 r=vec2(low(p*.88+q*1.6+vec2(4.8,11.9)),low(p*.88+q*1.6+vec2(21.2,2.8)));return p+q*1.5+r*.9;}
vec2 advect(vec2 p){vec2 q=vec2(fbm(p*.67),fbm(p*.67+vec2(16.3,7.1)));vec2 r=vec2(fbm(p*.88+q*1.6+vec2(4.8,11.9)),fbm(p*.88+q*1.6+vec2(21.2,2.8)));return p+q*1.5+r*.9;}
float height(vec2 p){vec2 q=advectLow(p);return low(q*.78)+.035*noise(q*2.7);}
void main(){vec2 uv=vec2(gl_FragCoord.x/res.x,1.-gl_FragCoord.y/res.y);vec2 p=sourceAt(uv)*1.13;p+=vec2(.04*time,-.025*time);vec2 q=advect(p);float h=fbm(q*.78);float e=.035;vec2 slope=vec2(height(p+vec2(e,0))-height(p-vec2(e,0)),height(p+vec2(0,e))-height(p-vec2(0,e)))/(2.*e);vec3 n=normalize(vec3(-slope*.15,1.));float light=max(0.,dot(n,normalize(vec3(-.5,.7,.8))));
// Categories change fine foam and palette. Coarse advection, height, crests and normal
// lighting above are identical on both sides of every shared tile boundary.
float category=floor(texture2D(tile_map,uv).r*255./64.);vec2 fineShape=q;float frequency=1.,bubbleWeight=.56,smallWeight=.34,warpWeight=1.7;vec3 tint=vec3(1.);
if(category>.5&&category<1.5){fineShape=mat2(.48,.16,-.22,1.85)*q;frequency=.80;bubbleWeight=.72;smallWeight=.12;warpWeight=.75;tint=vec3(1.12,1.045,.97);}
else if(category>1.5&&category<2.5){frequency=1.72;bubbleWeight=.68;smallWeight=.53;warpWeight=2.1;tint=vec3(.91,1.035,1.12);}
else if(category>2.5){frequency=.64;bubbleWeight=.13;smallWeight=.055;warpWeight=1.1;tint=vec3(.80,.92,1.02);}
fineShape=mix(q,fineShape,variation);frequency=mix(1.,frequency,variation);bubbleWeight=mix(.56,bubbleWeight,variation);smallWeight=mix(.34,smallWeight,variation);warpWeight=mix(1.7,warpWeight,variation);
float crest=abs(h+.055);float shoulder=1.-smoothstep(.045,.22,crest);float ridge=1.-smoothstep(.012,.060,crest);float fine=fbm(fineShape*9.2*frequency*max(.5,detail)+vec2(fbm(q*2.1)*warpWeight,fbm(q*2.1+9.3)*warpWeight));float bubbles=1.-smoothstep(.027,.15,abs(fine));float small=1.-smoothstep(.008,.045,abs(fbm(fineShape*23.*frequency*max(.5,detail)+vec2(4.7,1.3))));
float foam=ridge*.72+shoulder*bubbles*bubbleWeight;foam=max(foam,shoulder*small*smallWeight);float breakup=smoothstep(-.38,.23,fbm(q*4.7));foam*=mix(.59,1.,breakup);foam=clamp(foam,0.,1.);
vec3 deep=vec3(.018,.11,.17),water=vec3(.025,.37,.41),bright=vec3(.14,.59,.59),white=vec3(.86,.94,.89);
float depth=smoothstep(-.52,.44,h);vec3 col=mix(deep,water,depth);col=mix(col,bright,shoulder*.32);col*=.68+.42*light;col+=vec3(.04,.11,.13)*pow(max(0.,dot(reflect(-normalize(vec3(-.4,.7,.9)),n),vec3(0,0,1))),12.)*.3;col*=mix(vec3(1.),tint,variation);col=mix(col,white,foam*.96);float grain=noise(p*180.)*.003;col+=grain;gl_FragColor=vec4(col,1.);}`;
    function shader(type,source){var s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);return null;}return s;}
    var vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);if(!vs||!fs)return null;
    var program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;
    var buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);gl.useProgram(program);var attr=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
    var uniforms={};['res','time','detail','variation','uv_map','tile_map','uv_size','source_min','source_range'].forEach(function(name){uniforms[name]=gl.getUniformLocation(program,name);});
    var texture=gl.createTexture(),tileTexture=gl.createTexture(),mapWidth=0,mapHeight=0,mapMilliseconds=0,clampedSamples=0,sourceQuantization=0;
    function updateTiles(atlas){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,tileTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);gl.useProgram(program);gl.uniform1i(uniforms.tile_map,1);}
    function update(width,height,cx,cy,scale,deformation,radius){
      var started=performance.now(),ratio=Math.min(1,1280/width,900/height);canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      var mapScale=width*height<180000?1:.5;mapWidth=Math.max(2,Math.ceil(canvas.width*mapScale));mapHeight=Math.max(2,Math.ceil(canvas.height*mapScale));
      var bytes=new Uint8Array(mapWidth*mapHeight*4),minimum=-radius-2,range=2*(radius+2);clampedSamples=0;sourceQuantization=range/65535*scale;
      for(var y=0;y<mapHeight;y++)for(var x=0;x<mapWidth;x++){var source=deformation.inverse({x:((x+.5)/mapWidth*width-cx)/scale,y:((y+.5)/mapHeight*height-cy)/scale}),sx=Math.round(clamp((source.x-minimum)/range,0,1)*65535),sy=Math.round(clamp((source.y-minimum)/range,0,1)*65535),index=(y*mapWidth+x)*4;if(source.x<minimum||source.x>minimum+range||source.y<minimum||source.y>minimum+range)clampedSamples++;bytes[index]=sx>>>8;bytes[index+1]=sx&255;bytes[index+2]=sy>>>8;bytes[index+3]=sy&255;}
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,mapWidth,mapHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      gl.useProgram(program);gl.uniform1i(uniforms.uv_map,0);gl.uniform2f(uniforms.uv_size,mapWidth,mapHeight);gl.uniform2f(uniforms.source_min,minimum,minimum);gl.uniform2f(uniforms.source_range,range,range);mapMilliseconds=performance.now()-started;
    }
    function render(seconds,detail,variation){gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);gl.uniform2f(uniforms.res,canvas.width,canvas.height);gl.uniform1f(uniforms.time,seconds);gl.uniform1f(uniforms.detail,detail);gl.uniform1f(uniforms.variation,variation);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,tileTexture);gl.drawArrays(gl.TRIANGLES,0,6);}
    return {canvas:canvas,update:update,updateTiles:updateTiles,render:render,get available(){return !lost&&!gl.isContextLost();},get diagnostics(){return {renderer:'WebGL world ocean, inverse-deformed UV map',uvWidth:mapWidth,uvHeight:mapHeight,uvEncoding:'RGBA8: 16-bit x/y, nearest texture, decoded bilinear source interpolation',tileEncoding:'Four quantized labels from exact canonical paths; nearest lookup; one-pixel boundary rasterization.',tileFamilies:['lace','ribbons','capillaries','still water'],coarseContinuity:'Shared height, current and normal field; fine foam and palette intentionally change at seams.',uvBuildMilliseconds:mapMilliseconds,clampedSourceSamples:clampedSamples,quantizationScreenPixels:sourceQuantization};},destroy:function(){gl.deleteTexture(texture);gl.deleteTexture(tileTexture);gl.deleteBuffer(buffer);gl.deleteProgram(program);var ext=gl.getExtension('WEBGL_lose_context');if(ext)ext.loseContext();}};
  }

  function create(canvas,options) {
    if(!canvas || !canvas.getContext) throw new Error('A canvas is required.');
    if(!root.OceanTilingGeometry) throw new Error('Load ocean-tiling-geometry.js before the ocean renderer.');
    var ctx=canvas.getContext('2d',{alpha:false}), state=clean(options), time=0, destroyed=false, paused=!state.motion, raf=0, epoch=performance.now(), observer,material=createOceanMaterial(function(){if(!destroyed)paint(time);}),materialKey='';
    var geometry, deformation, categories=[],cacheKey='', cellPaths=[],edgePaths=[], fieldCache=new Map(),tileAtlas=document.createElement('canvas'),tileCtx=tileAtlas.getContext('2d',{willReadFrequently:true}), scale=1, cx=0, cy=0, w=0,h=0,dpr=1,lastPaint=-1, diagnostics={};
    function xy(p) { p=deformation.afterEdges(p); return { x:cx+p.x*scale,y:cy+p.y*scale }; }
    function warp(p,face) {return deformation.edgeWarp(p,face.edges);}
    function shapeEdge(e,t) { return deformation.edgePoint(e,t); }
    function visible(face) { var b=face.screenBounds;return !b||b.maxX>=0&&b.minX<=w&&b.maxY>=0&&b.minY<=h; }
    function updateMaterial(radius,key){material.update(w,h,cx,cy,scale,deformation,radius);tileAtlas.width=material.canvas.width;tileAtlas.height=material.canvas.height;tileCtx.setTransform(tileAtlas.width/w,0,0,tileAtlas.height/h,0,0);tileCtx.fillStyle='rgb(32,255,0)';tileCtx.fillRect(0,0,w,h);cellPaths.forEach(function(c){if(!visible(c.face))return;tileCtx.fillStyle='rgb('+(32+c.category*64)+',255,0)';tileCtx.fill(c.path);});tileCtx.setTransform(1,0,0,1,0,0);var image=tileCtx.getImageData(0,0,tileAtlas.width,tileAtlas.height);for(var i=0;i<image.data.length;i+=4){image.data[i]=32+64*clamp(Math.round((image.data[i]-32)/64),0,3);image.data[i+1]=255;image.data[i+2]=0;image.data[i+3]=255;}tileCtx.putImageData(image,0,0);material.updateTiles(tileAtlas);materialKey=key;}
    function build() {
      var rect=canvas.getBoundingClientRect(); dpr=Math.min(root.devicePixelRatio||1,1.6); w=Math.max(1,Math.round(rect.width*dpr)); h=Math.max(1,Math.round(rect.height*dpr));
      if(canvas.width!==w||canvas.height!==h) {canvas.width=w;canvas.height=h;}
      scale=Math.min(w*.24,h*.31)*state.scale; if(w/h>1.7)scale=h*.32*state.scale; cx=w*.5;cy=h*.5;
      var radius=Math.hypot(w/2,h/2)/scale+4, key=[w,h,state.scale,state.seed,state.curl].join(':');
      if(key===cacheKey){if(material&&material.available&&state.variant==='currents'&&materialKey!==key)updateMaterial(radius,key);return;} cacheKey=key;
      geometry=root.OceanTilingGeometry.generate({radius:radius,windowShift:[0,0]});
      deformation=createDeformation(geometry,state);
      categories=tileCategories(geometry);
      edgePaths=geometry.edges.map(function(edge){var pts=[];function add(t0,p0,t1,p1,depth){var tm=(t0+t1)/2,pm=xy(shapeEdge(edge,tm)),err=Math.hypot(pm.x-(p0.x+p1.x)/2,pm.y-(p0.y+p1.y)/2);if(depth<8&&err>.24*dpr){add(t0,p0,tm,pm,depth+1);add(tm,pm,t1,p1,depth+1);}else pts.push(p1);}var p=xy(shapeEdge(edge,0));pts.push(p);for(var i=0;i<48;i++){var t0=i/48,t1=(i+1)/48,p1=xy(shapeEdge(edge,t1));add(t0,p,t1,p1,0);p=p1;}return pts;});
      cellPaths=geometry.faces.map(function(face,index) {
        var ids=face.vertices, center=face.center||ids.reduce(function(c,id){var v=geometry.vertices[id];c.x+=v.x/ids.length;c.y+=v.y/ids.length;return c;},{x:0,y:0}); face.center=center;
        var path=new Path2D(), points=[];
        for(var j=0;j<ids.length;j++) { var pts=edgePaths[face.edges[j]],reverse=face.edgeDirections[j]<0;for(var k=0;k<pts.length;k++){var p=pts[reverse?pts.length-1-k:k];if(j===0&&k===0)path.moveTo(p.x,p.y);else path.lineTo(p.x,p.y);points.push(p);} }
        path.closePath();face.screenBounds=points.reduce(function(b,p){b.minX=Math.min(b.minX,p.x);b.minY=Math.min(b.minY,p.y);b.maxX=Math.max(b.maxX,p.x);b.maxY=Math.max(b.maxY,p.y);return b;},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}); var v0=geometry.vertices[ids[0]],v1=geometry.vertices[ids[1]],angle=Math.atan2(v1.y-v0.y,v1.x-v0.x); var tag=hash(Math.round(center.x*97),Math.round(center.y*97),state.seed);
        return {face:face,path:path,center:center,angle:angle,tag:tag,index:index,category:categories[index],points:points};
      });
      if(material&&material.available&&state.variant==='currents')updateMaterial(radius,key);
      diagnostics={vertices:geometry.vertices.length,faces:geometry.faces.length,edges:geometry.edges.length,visibleFaces:cellPaths.filter(function(c){return visible(c.face);}).length,tileCategories:categories.reduce(function(a,c){a[c]=(a[c]||0)+1;return a;},[0,0,0,0]),silverRatio:SILVER,octaves:5,deformation:deformation.diagnostics,boundary:'Ordered composition of shared compact polar twists, hierarchical star twists and area-preserving shears; identical shared curves.',geometry:geometry.diagnostics||{}};
    }
    function drawTile(c) {
      if(!visible(c.face))return; var p=xy(c.center), angle=c.angle, q=c.tag, type=c.face.type, wave=fbm(c.center.x*.38,c.center.y*.38,3,state.seed), light=type==='square' || q>.59;
      ctx.save();ctx.clip(c.path);
      var base=light?colors.teal:colors.deep,categoryColors=[colors.teal,colors.blue,colors.pale,colors.deep];if(state.structure)base=categoryColors[c.category];else if(state.variant==='currents')base=colorMix(base,categoryColors[c.category],state.tileVariation*.35);var breath=.015*(1+Math.sin(time*.16)),g=ctx.createLinearGradient(p.x-scale*.7,p.y-scale*.6,p.x+scale*.5,p.y+scale*.5);
      g.addColorStop(0,colorMix(base,colors.pale,(light?.06:.01)+breath));g.addColorStop(.65,base);g.addColorStop(1,colorMix(base,colors.ink,.43));ctx.fillStyle=state.structure?base:g;var bounds=c.face.screenBounds;ctx.fillRect(bounds.minX-1,bounds.minY-1,bounds.maxX-bounds.minX+2,bounds.maxY-bounds.minY+2);
      if(!state.structure) { if(state.variant==='escher') drawShapeCurrents(c,light,wave); else drawCurrentCell(c,light,wave); }
      ctx.restore();
    }
    function contourPoint(c,j,t,inset) {
      var ids=c.face.vertices,a=geometry.vertices[ids[j]],b=geometry.vertices[ids[(j+1)%ids.length]],px=a.x+(b.x-a.x)*t,py=a.y+(b.y-a.y)*t;
      // This contraction is only a material coordinate. The actual tile remains
      // the exact image of its shared boundary under the plane homeomorphism.
      var n=fbm(px*3.4,py*3.4,5,state.seed)*.014*inset;
      var p={x:c.center.x+(px-c.center.x)*(1-inset-n),y:c.center.y+(py-c.center.y)*(1-inset-n)};
      return warp(p,c.face);
    }
    function drawShapeCurrents(c,light,wave) {
      var levels=Math.round(28*state.detail),ids=c.face.vertices;
      for(var j=0;j<ids.length;j++) {
        var edge=geometry.edges[c.face.edges[j]],direction=c.face.edgeDirections[j],angle=edge.angle||0;
        // Pick a consistent lit side of a shared curl, rather than decorating
        // both neighbours with duplicate white lines.
        var lit=direction>0, strong=deformation.isStrong(edge),strength=.65+.35*Math.sin(angle-.6);if(!strong)continue;
        for(var l=levels;l>=1;l--) {
          var inset=l*.0185,alpha=(1-l/(levels+1))*.88*strength;
          ctx.beginPath();
          for(var s=0;s<=220;s++){var t=.025+s/220*.95,p=xy(contourPoint(c,j,t,inset));if(!s)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}
          ctx.strokeStyle=lit?(light?colors.pale:colors.teal):colors.ink;ctx.globalAlpha=lit?alpha:alpha*.52;ctx.lineWidth=Math.max(.55*dpr,scale*.0035);ctx.stroke();
        }
        if(lit) {
          ctx.beginPath();for(s=0;s<=250;s++){t=.16+s/250*.68;p=xy(contourPoint(c,j,t,.010));if(!s)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.strokeStyle=colors.foam;ctx.globalAlpha=.96;ctx.lineWidth=scale*.030;ctx.stroke();
          // Multiscale foam branches sit on the actual rolled shared edge.
          var nc=Math.round(46*state.detail);
          for(var i=0;i<nc;i++){t=.19+(i+.7*hash(i,j,state.seed))/nc*.62;var cp=contourPoint(c,j,t,.011),np=contourPoint(c,j,t+.0008,.011),vx=np.x-cp.x,vy=np.y-cp.y,len=Math.hypot(vx,vy)||1;var size=.015+.030*hash(i,c.index+j*100,state.seed);foamBranch(cp,{x:-vy/len,y:vx/len},size,c,i+j*20,.89);}
        }
      }
      ctx.globalAlpha=1;
    }
    function foamBranch(origin,normal,size,c,index,alpha) {
      var angle=Math.atan2(normal.y,normal.x),x=origin.x,y=origin.y;
      ctx.strokeStyle=colors.foam;ctx.fillStyle=colors.foam;ctx.lineCap='round';ctx.globalAlpha=alpha;
      for(var j=0;j<3;j++) {var z=size/Math.pow(SILVER,j),sgn=(index+j)%2?1:-1,aa=angle+sgn*(.35+.6*hash(index,j,state.seed)),ex=x+Math.cos(aa)*z*1.7,ey=y+Math.sin(aa)*z*1.7,control={x:x+Math.cos(angle-.3)*z,y:y+Math.sin(angle-.3)*z};ctx.lineWidth=Math.max(.5*dpr,scale*z*.32);ctx.beginPath();for(var k=0;k<=12;k++){var t=k/12,p=xy({x:(1-t)*(1-t)*x+2*t*(1-t)*control.x+t*t*ex,y:(1-t)*(1-t)*y+2*t*(1-t)*control.y+t*t*ey});if(!k)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.beginPath();for(k=0;k<=12;k++){var a=k/12*TAU; p=xy({x:ex+Math.cos(a)*z*.38,y:ey+Math.sin(a)*z*.38});if(!k)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.closePath();ctx.fill();x=ex;y=ey;}
      ctx.globalAlpha=1;
    }
    function drawCurrentCell(c,light,wave) {
      // Height isolines from a four-direction streamfunction plus silver-ratio
      // roughness form connected capillaries. Bright foam belongs to the
      // high-gradient pieces of selected crest levels, not arbitrary speckles.
      var verts=c.face.vertices.map(function(id){return geometry.vertices[id];}),step=.028;
      var minX=Math.floor(Math.min.apply(null,verts.map(function(v){return v.x;}))/step),maxX=Math.ceil(Math.max.apply(null,verts.map(function(v){return v.x;}))/step);
      var minY=Math.floor(Math.min.apply(null,verts.map(function(v){return v.y;}))/step),maxY=Math.ceil(Math.max.apply(null,verts.map(function(v){return v.y;}))/step);
      var buckets={},interval=.065/state.detail*(1+state.tileVariation*[-.08,-.26,-.42,.65][c.category]);
      function height(x,y){return potential(x*.87+.018*time,y*.87-.011*time,state.seed)+.24*fbm(x*2.2+.02*time,y*2.2,3,state.seed+57);}
      function source(ix,iy){var key=ix+','+iy;if(fieldCache.has(key))return fieldCache.get(key);var x=ix*step,y=iy*step,p={x:x,y:y,h:height(x,y)};fieldCache.set(key,p);return p;}
      function cross(a,b,value){var t=(value-a.h)/(b.h-a.h);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
      for(var iy=minY;iy<maxY;iy++)for(var ix=minX;ix<maxX;ix++) {
        var vv=[source(ix,iy),source(ix+1,iy),source(ix+1,iy+1),source(ix,iy+1)],low=Math.min.apply(null,vv.map(function(v){return v.h;})),high=Math.max.apply(null,vv.map(function(v){return v.h;}));
        var slope=Math.hypot((vv[1].h-vv[0].h)/step,(vv[3].h-vv[0].h)/step);
        for(var level=Math.ceil(low/interval);level<=Math.floor(high/interval);level++) {
          var crossings=[],value=level*interval;
          for(var k=0;k<4;k++){var aa=vv[k],bb=vv[(k+1)%4];if((aa.h<value)!==(bb.h<value))crossings.push(cross(aa,bb,value));}
          for(k=0;k+1<crossings.length;k+=2){var white=level%6===0&&slope>1.15,key=white?'foam':'water';if(!buckets[key])buckets[key]=[];buckets[key].push([xy(warp(crossings[k],c.face)),xy(warp(crossings[k+1],c.face))]);}
        }
      }
      Object.keys(buckets).forEach(function(key){ctx.beginPath();buckets[key].forEach(function(seg){ctx.moveTo(seg[0].x,seg[0].y);ctx.lineTo(seg[1].x,seg[1].y);});ctx.lineWidth=key==='foam'?scale*.006:Math.max(.7*dpr,scale*.0024);ctx.strokeStyle=key==='foam'?colors.foam:(light?colors.pale:colors.teal);ctx.globalAlpha=key==='foam'?.86:.42;ctx.stroke();});ctx.globalAlpha=1;
    }
    function drawEdges(soft) {
      if(soft&&!state.seams&&!state.outlines)return;
      ctx.lineJoin='round';ctx.lineCap='round';
      geometry.edges.forEach(function(e,index) {if(!e.faces.some(function(i){return visible(geometry.faces[i]);}))return;
        ctx.beginPath();var pts=edgePaths[index];for(var s=0;s<pts.length;s++){var p=pts[s];if(!s)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}
        if(!soft||state.seams){ctx.strokeStyle=colors.ink;ctx.lineWidth=soft?1.5*dpr:Math.max(1.1*dpr,scale*.010);ctx.globalAlpha=soft?.80:.95;ctx.stroke();if(soft){ctx.save();ctx.translate(.28*dpr,-.28*dpr);ctx.strokeStyle=colors.pale;ctx.lineWidth=.6*dpr;ctx.globalAlpha=.45;ctx.stroke();ctx.restore();}}
        if(state.outlines){ctx.strokeStyle=colors.foam;ctx.globalAlpha=.72;ctx.lineWidth=1*dpr;ctx.stroke();}
      });ctx.globalAlpha=1;
    }
    function renderAt(seconds) {
      if(destroyed)return;time=Math.max(0,Number(seconds)||0);build();fieldCache.clear();ctx.globalAlpha=1;ctx.fillStyle=colors.ink;ctx.fillRect(0,0,w,h);
      if(state.variant==='currents'&&!state.structure&&material&&material.available){material.render(time,state.detail,state.tileVariation);ctx.drawImage(material.canvas,0,0,w,h);ctx.globalAlpha=1;drawEdges(true);diagnostics.material=material.diagnostics;}else{cellPaths.forEach(drawTile);drawEdges(false);diagnostics.material={renderer:'Canvas2D graphic currents (WebGL unavailable or structure view)'};}
      // Low-density paper tooth belongs to the shared illuminated surface.
      ctx.globalAlpha=state.structure?0:.025;ctx.fillStyle=colors.foam;for(var i=0;i<Math.round(w*h/1200);i++){var x=hash(i,1,state.seed)*w,y=hash(i,2,state.seed)*h;ctx.fillRect(x,y,.7*dpr,.7*dpr);}ctx.globalAlpha=1;
      lastPaint=performance.now();diagnostics.renderMilliseconds=lastPaint-renderAt.started;
    }
    function paint(t){renderAt.started=performance.now();renderAt(t);}
    function tick(now){if(paused||destroyed)return;if(now-lastPaint>100)paint((now-epoch)/1000);raf=root.requestAnimationFrame(tick);}
    function pause(){paused=true;root.cancelAnimationFrame(raf);}
    function resume(){if(destroyed||!paused)return;paused=false;epoch=performance.now()-time*1000;raf=root.requestAnimationFrame(tick);}
    function visibility(){if(document.hidden)root.cancelAnimationFrame(raf);else if(!paused){epoch=performance.now()-time*1000;raf=root.requestAnimationFrame(tick);}}
    if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(function(){paint(time);});observer.observe(canvas);}document.addEventListener('visibilitychange',visibility);paint(0);if(!paused)raf=root.requestAnimationFrame(tick);
    return {renderAt:paint,setOptions:function(patch){state=clean(Object.assign({},state,patch));paint(time);return Object.assign({},state);},pause:pause,resume:resume,destroy:function(){if(destroyed)return;pause();destroyed=true;if(observer)observer.disconnect();document.removeEventListener('visibilitychange',visibility);if(material)material.destroy();},get options(){return Object.assign({},state);},get time(){return time;},get diagnostics(){return Object.assign({},diagnostics);}};
  }
  root.OceanTessellation=Object.freeze({create:create,createDeformation:createDeformation,tileCategories:tileCategories,defaults:defaults,fbm:fbm,potential:potential,flow:flow,diagnostics:Object.freeze({silverRatio:SILVER,octaves:'λ^j frequencies, λ^(-0.82j) amplitudes; π/4 rotation',material:'One shared inverse-deformed coarse ocean field. Four adjacency-contrasting fine foam families: lace, ribbons, capillaries, still water. Fine detail and palette intentionally change at tile seams.',flow:'Unit tangent directions of scalar streamlines; normalization does not preserve incompressible velocity.',boundary:'Single canonical curve for each shared edge; compact area-preserving polar twists and shear composition.',claim:'Original deformation and ocean material on an established tiling; no claim of a newly discovered tiling group.'})});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.OceanTessellation;
})(typeof window!=='undefined'?window:globalThis);
