// ═══════════════════════════════════════════════════════
// LUCEBIEN · Layout Map v10 — Tooltips + Fixed deselect
// ═══════════════════════════════════════════════════════
var LayoutMap={
  _cb:null,_sel:{},_mode:'report',_ec:{},_zonas:[],_sbId:null,_tf:'ambos',_cId:null,

  render:function(cId,zonas,opts){
    opts=opts||{};var box=document.getElementById(cId);if(!box)return;
    var tf=(opts.turno||'ambos').toLowerCase();if(tf==='c'||tf==='completo')tf='ambos';
    var L=this;L._tf=tf;L._mode=opts.mode||'report';L._ec=opts.evalCals||{};L._cId=cId;
    L._sel=opts.selected||{};L._cb=opts.onToggle||function(){};L._zonas=zonas;L._sbId=opts.sidebarId||null;

    var flZ=zonas.find(function(z){return z.cod==='PISO'}),stZ=zonas.find(function(z){return z.cod==='CALLE'});
    var furn=zonas.filter(function(z){return z.cod!=='PISO'&&z.cod!=='CALLE'&&z.tipo!=='area'});
    var areas=zonas.filter(function(z){return z.tipo==='area'&&z.cod!=='PISO'&&z.cod!=='CALLE'});
    var mode=L._mode,sel=L._sel;

    var h='<style>.lz-z{transition:all .15s ease}.lz-z:hover{filter:brightness(1.08);z-index:20!important}.lz-chk{animation:lzP .2s ease}@keyframes lzP{0%{transform:scale(0)}60%{transform:scale(1.3)}100%{transform:scale(1)}}@keyframes lzFlash{0%{box-shadow:0 0 0 0 rgba(46,62,110,.6)}40%{box-shadow:0 0 0 8px rgba(46,62,110,.3)}100%{box-shadow:0 0 0 0 rgba(46,62,110,0)}}.lz-z.lz-highlight{animation:lzFlash .8s ease!important;z-index:30!important}.lz-b{transition:all .2s ease}.lz-b:hover{filter:brightness(.96)}.lz-tip{display:none;position:fixed;background:#1e293b;color:#fff;padding:6px 10px;border-radius:6px;font-size:9px;font-weight:500;line-height:1.4;max-width:220px;pointer-events:none;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.25)}.lz-tip b{font-weight:700;display:block;margin-bottom:2px;font-size:10px}.lz-tip i{font-style:normal;color:#94a3b8;font-size:8px}</style>';

    // ── CALLE ──
    if(stZ){var cs=sel['CALLE'];
      var calleClick=mode==='eval'?'LayoutMap._cyc(\'CALLE\')':'LayoutMap._sp(\'CALLE\')';
      h+='<div class="lz-b" id="lm-st" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:6px;border-radius:8px;border:1.5px '+(cs?'solid #16a34a':'dashed #94a3b8')+';background:'+(cs?'#dcfce7':'#fafafa')+';cursor:pointer" onclick="'+calleClick+'">';
      h+='<span id="lm-st-i" style="font-size:15px">'+(cs?'✅':'☐')+'</span>';
      h+='<div style="flex:1"><div id="lm-st-l" style="font-size:11px;font-weight:700;color:'+(cs?'#166534':'#64748b')+'">Barrer y baldear calle/vereda</div><div style="font-size:8px;color:#94a3b8">Barrer y baldear con agua y detergente</div></div>';
      h+='<span style="font-size:10px;color:'+(cs?'#16a34a':'#94a3b8')+';font-weight:700">'+stZ.peso+'pts</span></div>';}

    // ── CANVAS ──
    var fs=flZ&&sel['PISO'],fBd=fs?'#16a34a':'#e2e8f0',fBg=fs?'#dcfce7':'#f8fafc';
    h+='<div id="lm-cv" style="position:relative;width:100%;padding-bottom:72.5%;border-radius:8px;border:1.5px solid '+fBd+';overflow:hidden;background:'+fBg+';transition:all .2s;cursor:pointer" onclick="LayoutMap._cvC(event)">';
    if(flZ)h+='<div id="lm-fl" style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);font-size:7px;font-weight:700;color:'+(fs?'#16a34a':'#d1d5db')+';z-index:0;pointer-events:none;user-select:none">'+(fs?'✓ Piso limpio':'Clic espacio vacío → Piso')+'</div>';

    // Areas
    areas.forEach(function(z,aIdx){
      var l=(z.pos_x/800*100).toFixed(2),t=(z.pos_y/580*100).toFixed(2),w=(z.ancho/800*100).toFixed(2),ht=(z.alto/580*100).toFixed(2);
      if(opts.editable){
        var aHandles='';
        var ahs='position:absolute;width:8px;height:8px;background:#fff;border:1.5px solid #2563eb;z-index:22;display:none;';
        aHandles='<div class="lz-handle" data-dir="nw" style="'+ahs+'left:-4px;top:-4px;cursor:nw-resize;border-radius:2px"></div>'+
          '<div class="lz-handle" data-dir="ne" style="'+ahs+'right:-4px;top:-4px;cursor:ne-resize;border-radius:2px"></div>'+
          '<div class="lz-handle" data-dir="sw" style="'+ahs+'left:-4px;bottom:-4px;cursor:sw-resize;border-radius:2px"></div>'+
          '<div class="lz-handle" data-dir="se" style="'+ahs+'right:-4px;bottom:-4px;cursor:se-resize;border-radius:2px"></div>';
        h+='<div class="lz-z" data-cod="'+z.cod+'" data-color="#94a3b8" data-turno="'+z.turno+'" data-draggable="1" style="position:absolute;left:'+l+'%;top:'+t+'%;width:'+w+'%;height:'+ht+'%;background:rgba(148,163,184,.15);border:1.5px dashed #94a3b8;border-radius:4px;z-index:2;display:flex;align-items:center;justify-content:center;cursor:move;overflow:visible">'+aHandles+'<span style="font-size:7px;font-weight:600;color:#64748b;pointer-events:none">'+z.cod+' · '+z.nombre+'</span></div>';
      } else {
        h+='<div style="position:absolute;left:'+l+'%;top:'+t+'%;width:'+w+'%;height:'+ht+'%;background:#f1f5f9;border:1px dashed #cbd5e166;border-radius:4px;z-index:1;display:flex;align-items:center;justify-content:center;pointer-events:none"><span style="font-size:5px;font-weight:600;color:#94a3b8">'+z.cod+'</span></div>';
      }});

    // Furniture
    furn.forEach(function(z,idx){
      var isM=z.turno==='mañana'||z.turno==='m',isT=z.turno==='tarde'||z.turno==='t';
      var myT=tf==='ambos'||z.turno==='ambos'||(tf==='mañana'&&isM)||(tf==='tarde'&&isT);
      var otherT=!myT&&z.turno!=='ambos';
      var iS=sel[z.cod],isTri=z.forma==='tri',isPlch=z.cod.indexOf('PLANCHA')>=0,isCir=z.forma==='circle'&&!isPlch;

      // COLORS: selected = green. Unselected = original. Deselected other-turno = faded.
      var bg=z.color||'#3b82f6',op=myT?'1':otherT?'0.30':'0.1';
      if(iS&&mode==='report'){bg=myT?'#16a34a':'#4ade80';op='1';}
      if(!iS&&mode==='eval'){bg='#cbd5e1';op='0.4';}
      var brd=iS?'2px solid #15803d':'1px solid rgba(0,0,0,.08)',shd=iS?'box-shadow:0 0 5px #16a34a44;':'';
      if(mode==='eval'&&iS){var ec=L._ec[z.cod];var c2=ec===0?'#dc2626':ec===0.5?'#ca8a04':'#16a34a';bg=ec===0?'#fca5a5':ec===0.5?'#fde68a':'#86efac';brd='2px solid '+c2;shd='box-shadow:0 0 4px '+c2+'44;';}
      if(!iS&&mode==='eval'){brd='1px solid #e2e8f0';}

      var shape='border-radius:3px;';
      if(isTri)shape='border-radius:50% 50% 4px 4px;';
      else if(isPlch)shape='border-radius:10px;';
      else if(isCir)shape='border-radius:50%;';

      var l=(z.pos_x/800*100).toFixed(2),t2=(z.pos_y/580*100).toFixed(2);
      var w=(z.ancho/800*100).toFixed(2),ht=(z.alto/580*100).toFixed(2);
      var tc=iS?'#fff':(bg==='#eab308'||bg==='#facc15'||bg==='#c59100'||bg==='#cbd5e1')?'#5c3d00':'#fff';
      if(!iS&&mode==='eval')tc='#94a3b8';
      var fs2=isTri?(z.ancho<30?'6':'8'):(z.ancho<30?'5':z.ancho<55?'6':'7');

      var chk='';
      if(iS&&mode!=='eval')chk='<div class="lz-chk" style="position:absolute;top:-3px;right:-3px;width:11px;height:11px;background:#15803d;border-radius:50%;border:1.5px solid #fff;color:#fff;font-size:6px;font-weight:900;display:flex;align-items:center;justify-content:center;z-index:6">✓</div>';
      if(iS&&mode==='eval'){var ec2=L._ec[z.cod],c3=ec2===0?'#dc2626':ec2===0.5?'#ca8a04':'#16a34a',ct=ec2===0?'✗':ec2===0.5?'◉':'✓';chk='<div class="lz-chk" style="position:absolute;top:-3px;right:-3px;width:11px;height:11px;background:'+c3+';border-radius:50%;border:1.5px solid #fff;color:#fff;font-size:6px;font-weight:900;display:flex;align-items:center;justify-content:center;z-index:6">'+ct+'</div>';}

      var isRiel=z.tipo==='riel';
      var inner='<span style="font-size:'+fs2+'px;font-weight:700;color:'+tc+';pointer-events:none;line-height:1;text-shadow:0 0 1px rgba(0,0,0,.1)">'+z.cod+'</span>';
      if(isPlch)inner='<span style="font-size:'+fs2+'px;font-weight:700;color:'+tc+';pointer-events:none;line-height:1">⚡</span>';

      var plOv=isPlch?'<div style="position:absolute;inset:0;border-radius:10px;background:repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,.15) 3px,rgba(255,255,255,.15) 6px);pointer-events:none"></div>':'';
      if(isRiel)plOv='<div style="position:absolute;inset:0;border-radius:3px;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,.2) 3px,rgba(255,255,255,.2) 5px);pointer-events:none"></div>';

      // Tooltip with cleaning instructions
      var tipInstr={maniqui:'Desempolvar con escobilla para ternos',vitrina:'Limpiar con limpiavidrios y trapo especial para vidrios',espejo:'Limpiar con limpiavidrios y paño seco',mueble:'Limpiar superficie con trapo húmedo y limpiatodo',riel:'Desempolvar ternos colgados y limpiar el tubo/varilla',silla:'Limpiar cojín con trapo si hay suciedad',equipo:'Limpiar mesa de plancha y tanque de agua',area:'Limpiar y ordenar el área',piso:'Barrer y trapear todo el interior',calle:'Barrer y baldear con agua y detergente'};
      var instrTxt=tipInstr[z.tipo]||'Limpiar y ordenar';
      // Override by cod prefix
      var codUp=z.cod.toUpperCase();
      if(codUp.startsWith('MC'))instrTxt='Limpiar mesa de máquina de costura con trapo';
      else if(codUp.startsWith('CB'))instrTxt='Limpiar mueble colgante y todos los objetos que contiene';
      else if(codUp.startsWith('CT'))instrTxt='Desempolvar rieles colgantes del techo (cada 2 semanas)';
      else if(codUp.startsWith('PC'))instrTxt='Limpiar computadora y mueble donde está ubicada';
      else if(codUp.startsWith('CO'))instrTxt='Limpiar corbatero con trapo';
      else if(codUp.startsWith('ME'))instrTxt='Limpiar estante y reorganizar contenido';
      var tip='<div class="lz-tip" data-name="'+z.nombre+'" data-instr="'+instrTxt+'"></div>';

      var clk=mode==='report'?'onclick="LayoutMap._tz(this,\''+z.cod+'\',event)"':(mode==='eval'?'onclick="LayoutMap._cyc(\''+z.cod+'\',event)"':'');

      var handles='';
      if(opts.editable){
        var hs='position:absolute;width:8px;height:8px;background:#fff;border:1.5px solid #2563eb;z-index:22;display:none;';
        handles='<div class="lz-handle" data-dir="nw" style="'+hs+'left:-4px;top:-4px;cursor:nw-resize;border-radius:2px"></div>'+
          '<div class="lz-handle" data-dir="ne" style="'+hs+'right:-4px;top:-4px;cursor:ne-resize;border-radius:2px"></div>'+
          '<div class="lz-handle" data-dir="sw" style="'+hs+'left:-4px;bottom:-4px;cursor:sw-resize;border-radius:2px"></div>'+
          '<div class="lz-handle" data-dir="se" style="'+hs+'right:-4px;bottom:-4px;cursor:se-resize;border-radius:2px"></div>';
      }
      h+='<div class="lz-z" data-cod="'+z.cod+'" data-color="'+z.color+'" data-turno="'+z.turno+'" data-idx="'+idx+'" style="position:absolute;left:'+l+'%;top:'+t2+'%;width:'+w+'%;height:'+ht+'%;background:'+bg+';border:'+brd+';'+shape+'opacity:'+op+';'+shd+'cursor:'+(opts.editable?'move':'pointer')+';display:flex;align-items:center;justify-content:center;overflow:visible;z-index:'+(iS?'10':'4')+'" '+(opts.editable?'data-draggable="1"':clk)+'>'+plOv+chk+handles+tip+inner+'</div>';
    });
    h+='</div>'; // canvas

    // ── PISO ──
    if(flZ){
      var pisoClick=mode==='eval'?'LayoutMap._cyc(\'PISO\')':'LayoutMap._sp(\'PISO\')';
      h+='<div class="lz-b" id="lm-pb" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-top:6px;border-radius:8px;border:1.5px '+(fs?'solid #16a34a':'dashed #e2e8f0')+';background:'+(fs?'#dcfce7':'#fafafa')+';cursor:pointer" onclick="'+pisoClick+'">';
      h+='<span id="lm-pb-i" style="font-size:15px">'+(fs?'✅':'☐')+'</span>';
      h+='<div style="flex:1"><div id="lm-pb-l" style="font-size:11px;font-weight:700;color:'+(fs?'#166534':'#64748b')+'">Barrer y trapear piso</div><div style="font-size:8px;color:#94a3b8">Barrer y trapear todo el interior de la tienda</div></div>';
      h+='<span style="font-size:10px;color:'+(fs?'#16a34a':'#94a3b8')+';font-weight:700">'+flZ.peso+'pts</span></div>';}

    // Legend
    h+='<div style="display:flex;gap:5px;margin-top:5px;font-size:8px;color:#94a3b8;align-items:center;flex-wrap:wrap">';
    h+='<span style="display:inline-flex;align-items:center;gap:2px"><span style="width:7px;height:7px;background:#eab308;border-radius:1px"></span>AM</span>';
    h+='<span style="display:inline-flex;align-items:center;gap:2px"><span style="width:7px;height:7px;background:#2563eb;border-radius:1px"></span>PM</span>';
    h+='<span style="display:inline-flex;align-items:center;gap:2px"><span style="width:8px;height:10px;border-radius:50% 50% 2px 2px;background:#facc15"></span>Maniquí</span>';
    h+='<span style="display:inline-flex;align-items:center;gap:2px"><span style="width:9px;height:7px;border-radius:3px;background:repeating-linear-gradient(45deg,#eab308,#eab308 2px,#eab308cc 2px,#eab308cc 4px)"></span>Plancha</span>';
    h+='<span style="display:inline-flex;align-items:center;gap:2px"><span style="width:7px;height:7px;background:#16a34a;border-radius:50%"></span>Hecho</span>';
    if(mode==='eval')h+='<span style="margin-left:auto">Clic: ✅→👁→❌</span>';
    h+='</div>';

    box.innerHTML=h;
    // Tooltip hover handlers
    var oldTip=document.getElementById('lm-tooltip');if(oldTip)oldTip.remove();var tipEl=document.createElement('div');tipEl.className='lz-tip';tipEl.id='lm-tooltip';document.body.appendChild(tipEl);
    box.querySelectorAll('.lz-z').forEach(function(el){
      el.addEventListener('mouseenter',function(e){
        var t=el.querySelector('.lz-tip');if(!t)return;
        var name=t.getAttribute('data-name')||'';
        var instr=t.getAttribute('data-instr')||'';
        var tip=document.getElementById('lm-tooltip');
        tip.innerHTML='<b>'+name+'</b>'+instr;
        tip.style.display='block';
        var r=el.getBoundingClientRect();
        tip.style.left=Math.min(r.left+r.width/2-tip.offsetWidth/2,window.innerWidth-tip.offsetWidth-8)+'px';
        tip.style.left=Math.max(8,parseFloat(tip.style.left))+'px';
        tip.style.top=(r.top-tip.offsetHeight-6)+'px';
        if(parseFloat(tip.style.top)<4)tip.style.top=(r.bottom+6)+'px';
      });
      el.addEventListener('mouseleave',function(){
        var tip=document.getElementById('lm-tooltip');tip.style.display='none';
      });
    });
    if(opts.editable)this._drag(box);
    this._usb();
  },

  _cvC:function(ev){var ctn=LayoutMap._cId?document.getElementById(LayoutMap._cId):document;var cv=ctn?ctn.querySelector('#lm-cv'):null;if(!cv||ev.target!==cv)return;if(LayoutMap._mode==='eval')LayoutMap._cyc('PISO');else LayoutMap._sp('PISO');},

  // Sidebar with sections + limited height
  _usb:function(){
    var sb=this._sbId?document.getElementById(this._sbId):null;
    if(!sb)return;
    var sel=this._sel,zonas=this._zonas,tf=this._tf,mode=this._mode,L=this;
    var clean=zonas.filter(function(z){return z.tipo!=='area'}).sort(function(a,b){return a.cod.localeCompare(b.cod)});

    var myT=[],extT=[];
    clean.forEach(function(z){
      var isM=z.turno==='mañana'||z.turno==='m',isT=z.turno==='tarde'||z.turno==='t';
      var mine=tf==='ambos'||z.turno==='ambos'||(tf==='mañana'&&isM)||(tf==='tarde'&&isT);
      if(mine)myT.push(z);else if(sel[z.cod])extT.push(z);
    });

    var IC={maniqui:'👤',vitrina:'🪟',mueble:'🪑',riel:'📐',espejo:'🪞',silla:'💺',equipo:'⚡',piso:'🧹',calle:'🛣️'};

    var done=myT.filter(function(z){return sel[z.cod]});
    var pending=myT.filter(function(z){return !sel[z.cod]});
    var pct=myT.length?Math.round(done.length/myT.length*100):0;
    var totalP=L.calcPoints(zonas);
    var maxP=myT.reduce(function(s,z){return s+z.peso},0)+extT.reduce(function(s,z){return s+z.peso},0);

    function row(z,isDone,isExtra){
      var ic=IC[z.tipo]||'📦';
      if(isDone){
        var bgc=isExtra?'#f0fdf4':'#dcfce7',bdc=isExtra?'#bbf7d0':'#86efac';
        if(mode==='eval'){var ec=L._ec[z.cod];bgc=ec===0?'#fef2f2':ec===0.5?'#fefce8':'#dcfce7';bdc=ec===0?'#fecaca':ec===0.5?'#fde68a':'#86efac';}
        var chkIc=mode==='eval'?(L._ec[z.cod]===0?'❌':L._ec[z.cod]===0.5?'👁':'✅'):'✅';
        return '<div style="display:flex;align-items:center;gap:4px;padding:3px 5px;margin-bottom:2px;border-radius:5px;background:'+bgc+';border:1px solid '+bdc+'">'+
          '<span style="font-size:10px">'+chkIc+'</span><span style="font-size:9px">'+ic+'</span>'+
          '<div style="flex:1;min-width:0"><div style="font-size:8px;font-weight:700;color:#166534">'+z.cod+'</div><div style="font-size:6px;color:#4ade80;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+z.nombre+'</div></div>'+
          '<span style="font-size:8px;font-weight:800;color:#16a34a">'+z.peso+'</span></div>';
      } else {
        return '<div style="display:flex;align-items:center;gap:4px;padding:3px 5px;margin-bottom:2px;border-radius:5px;background:#fafafa;border:1px solid #f1f5f9">'+
          '<span style="font-size:10px;color:#e2e8f0">☐</span><span style="font-size:9px;opacity:.4">'+ic+'</span>'+
          '<div style="flex:1;min-width:0"><div style="font-size:8px;font-weight:600;color:#94a3b8">'+z.cod+'</div><div style="font-size:6px;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+z.nombre+'</div></div>'+
          '<span style="font-size:8px;font-weight:600;color:#e2e8f0">'+z.peso+'</span></div>';
      }
    }

    var html='';
    // Progress
    html+='<div style="margin-bottom:6px">';
    html+='<div style="display:flex;justify-content:space-between;font-size:8px;font-weight:700;margin-bottom:3px"><span style="color:#334155">LIMPIEZA</span><span style="color:#16a34a">'+done.length+'/'+myT.length+'</span></div>';
    html+='<div style="height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,#16a34a,#4ade80);border-radius:3px;transition:width .3s"></div></div>';
    html+='</div>';

    // Scrollable list
    html+='<div style="overflow-y:auto;max-height:480px;scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent">';
    if(done.length){
      html+='<div style="font-size:7px;font-weight:700;color:#16a34a;padding:3px 0;display:flex;align-items:center;gap:3px"><span style="font-size:9px">✅</span>HECHAS ('+done.length+')</div>';
      html+=done.map(function(z){return row(z,true,false)}).join('');
    }
    if(extT.length){
      html+='<div style="font-size:7px;font-weight:700;color:#ca8a04;padding:4px 0 2px;margin-top:3px;border-top:1px solid #fde68a;display:flex;align-items:center;gap:3px"><span style="font-size:9px">⭐</span>EXTRAS</div>';
      html+=extT.map(function(z){return row(z,true,true)}).join('');
    }
    if(pending.length){
      html+='<div style="font-size:7px;font-weight:700;color:#94a3b8;padding:4px 0 2px;margin-top:'+(done.length?'4':'0')+'px;'+(done.length?'border-top:1px solid #e2e8f0;':'')+'display:flex;align-items:center;gap:3px"><span style="font-size:9px">📋</span>PENDIENTES ('+pending.length+')</div>';
      html+=pending.map(function(z){return row(z,false,false)}).join('');
    }
    html+='</div>';

    // Total
    html+='<div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;display:flex;justify-content:space-between;align-items:center">';
    html+='<span style="font-size:9px;font-weight:700;color:#166534">Total</span>';
    html+='<span style="font-size:13px;font-weight:900;color:#16a34a">'+totalP+'<span style="font-size:8px;color:#86efac;font-weight:600">/'+maxP+'</span></span></div>';

    sb.innerHTML=html;
  },

  // Toggle zone - FIX: restore correct color + opacity
  _tz:function(el,cod,ev){
    if(ev)ev.stopPropagation();
    var was=LayoutMap._sel[cod];LayoutMap._sel[cod]=!was;
    if(LayoutMap._cb)LayoutMap._cb(cod,!was);

    var z=LayoutMap._zonas.find(function(x){return x.cod===cod});
    var tf=LayoutMap._tf;
    var isM=z&&(z.turno==='mañana'||z.turno==='m'),isT=z&&(z.turno==='tarde'||z.turno==='t');
    var myT=tf==='ambos'||(z&&z.turno==='ambos')||(tf==='mañana'&&isM)||(tf==='tarde'&&isT);

    if(!was){
      // SELECT: turn green
      el.style.background=myT?'#16a34a':'#4ade80';
      el.style.border='2px solid #15803d';
      el.style.boxShadow='0 0 5px #16a34a44';
      el.style.zIndex='10';el.style.opacity='1';
      var sp=el.querySelector('span:last-of-type');if(sp)sp.style.color='#fff';
      if(!el.querySelector('.lz-chk')){var c=document.createElement('div');c.className='lz-chk';c.style.cssText='position:absolute;top:-3px;right:-3px;width:11px;height:11px;background:#15803d;border-radius:50%;border:1.5px solid #fff;color:#fff;font-size:6px;font-weight:900;display:flex;align-items:center;justify-content:center;z-index:6';c.textContent='✓';el.appendChild(c);}
    } else {
      // DESELECT: restore from data attributes (not z.color which may be wrong)
      var origColor=el.getAttribute('data-color')||'#3b82f6';
      el.style.background=origColor;
      el.style.border='1px solid rgba(0,0,0,.08)';
      el.style.boxShadow='';el.style.zIndex='4';
      el.style.opacity=myT?'1':'0.30';
      var sp2=el.querySelector('span:last-of-type');
      if(sp2){
        var isYellow=origColor==='#eab308'||origColor==='#facc15'||origColor==='#c59100';
        sp2.style.color=isYellow?'#5c3d00':'#fff';
      }
      el.querySelectorAll('.lz-chk').forEach(function(c){c.remove();});
    }
    LayoutMap._usb();
    if(typeof updateEvalLayoutSummary==='function')updateEvalLayoutSummary();
    if(typeof calcEvalPreview==='function')calcEvalPreview();
  },

  _sp:function(cod){
    var was=LayoutMap._sel[cod];LayoutMap._sel[cod]=!was;
    if(LayoutMap._cb)LayoutMap._cb(cod,!was);
    var ctn=LayoutMap._cId?document.getElementById(LayoutMap._cId):document;if(!ctn)ctn=document;
    if(cod==='CALLE'){
      var el=ctn.querySelector('#lm-st');if(el){el.style.border='1.5px '+(!was?'solid #16a34a':'dashed #94a3b8');el.style.background=!was?'#dcfce7':'#fafafa';}
      var i=ctn.querySelector('#lm-st-i');if(i)i.textContent=!was?'✅':'☐';
      var l=ctn.querySelector('#lm-st-l');if(l)l.style.color=!was?'#166534':'#64748b';
    }
    if(cod==='PISO'){
      var bar=ctn.querySelector('#lm-pb');if(bar){bar.style.border='1.5px '+(!was?'solid #16a34a':'dashed #e2e8f0');bar.style.background=!was?'#dcfce7':'#fafafa';}
      var i2=ctn.querySelector('#lm-pb-i');if(i2)i2.textContent=!was?'✅':'☐';
      var l2=ctn.querySelector('#lm-pb-l');if(l2)l2.style.color=!was?'#166534':'#64748b';
      var cv=ctn.querySelector('#lm-cv');if(cv){cv.style.borderColor=!was?'#16a34a':'#e2e8f0';cv.style.background=!was?'#dcfce7':'#f8fafc';}
      var fl=ctn.querySelector('#lm-fl');if(fl){fl.style.color=!was?'#16a34a':'#d1d5db';fl.textContent=!was?'✓ Piso limpio':'Clic espacio vacío → Piso';}
    }
    LayoutMap._usb();
    if(typeof updateEvalLayoutSummary==='function')updateEvalLayoutSummary();
    if(typeof calcEvalPreview==='function')calcEvalPreview();
  },

  _cyc:function(cod,ev){
    if(ev)ev.stopPropagation();
    // Prevent evaluating items that weren't done (not in selected)
    if(!LayoutMap._sel[cod]){showToast&&showToast('No se limpió — no se puede evaluar','error');return;}
    var cur=LayoutMap._ec[cod],nx=cur===1?0.5:cur===0.5?0:1;
    LayoutMap._ec[cod]=nx;if(LayoutMap._cb)LayoutMap._cb(cod,nx);
    var C={1:'#16a34a',0.5:'#ca8a04',0:'#dc2626'},BG={1:'#86efac',0.5:'#fde68a',0:'#fca5a5'},T={1:'✓',0.5:'◉',0:'✗'},IC={1:'✅',0.5:'👁',0:'❌'};
    var ctn=LayoutMap._cId?document.getElementById(LayoutMap._cId):document;if(!ctn)ctn=document;
    var el=ctn.querySelector('.lz-z[data-cod="'+cod+'"]');
    if(el){el.style.background=BG[nx];el.style.border='2px solid '+C[nx];el.style.boxShadow='0 0 4px '+C[nx]+'44';var k=el.querySelector('.lz-chk');if(k){k.style.background=C[nx];k.textContent=T[nx];}}
    if(cod==='CALLE'){var st=ctn.querySelector('#lm-st');if(st){st.style.borderColor=C[nx];st.style.borderStyle='solid';st.style.background=BG[nx]+'22';}var si=ctn.querySelector('#lm-st-i');if(si)si.textContent=IC[nx];var sl=ctn.querySelector('#lm-st-l');if(sl)sl.style.color=C[nx];}
    if(cod==='PISO'){var pb=ctn.querySelector('#lm-pb');if(pb){pb.style.borderColor=C[nx];pb.style.borderStyle='solid';pb.style.background=BG[nx]+'22';}var pi=ctn.querySelector('#lm-pb-i');if(pi)pi.textContent=IC[nx];var pl=ctn.querySelector('#lm-pb-l');if(pl)pl.style.color=C[nx];var cv=ctn.querySelector('#lm-cv');if(cv){cv.style.borderColor=C[nx];cv.style.background=BG[nx]+'11';}}
    LayoutMap._usb();
    if(typeof updateEvalLayoutSummary==='function')updateEvalLayoutSummary();
    if(typeof calcEvalPreview==='function')calcEvalPreview();
  },

  _edSel:null,_edCb:null,
  _drag:function(box){
    var cv=box.querySelector('#lm-cv');if(!cv)return;
    var L=LayoutMap,d=null,mode=null,sx,sy,ol,ot,ow,oh,dir;
    // Click on canvas bg = deselect
    cv.addEventListener('click',function(e){
      if(e.target===cv||e.target.id==='lm-cv'){L._edSel=null;L._updHandles(cv);}
    });
    // Mousedown on zone or handle
    cv.addEventListener('mousedown',function(e){
      var handle=e.target.closest('.lz-handle');
      var zone=e.target.closest('[data-draggable]');
      if(!zone||zone===cv)return;
      e.preventDefault();e.stopPropagation();
      d=zone;sx=e.clientX;sy=e.clientY;
      ol=parseFloat(zone.style.left);ot=parseFloat(zone.style.top);
      ow=parseFloat(zone.style.width);oh=parseFloat(zone.style.height);
      L._edSel=zone.dataset.cod;L._updHandles(cv);
      if(handle){mode='resize';dir=handle.dataset.dir;zone.style.zIndex='100';}
      else{mode='move';zone.style.zIndex='100';zone.style.opacity='.7';}
    });
    document.addEventListener('mousemove',function(e){
      if(!d)return;
      var r=cv.getBoundingClientRect();
      var dx=(e.clientX-sx)/r.width*100,dy=(e.clientY-sy)/r.height*100;
      if(mode==='move'){
        d.style.left=Math.max(0,Math.min(100-ow,ol+dx))+'%';
        d.style.top=Math.max(0,Math.min(100-oh,ot+dy))+'%';
      } else if(mode==='resize'){
        var nl=ol,nt=ot,nw=ow,nh=oh;
        if(dir.indexOf('e')>=0)nw=Math.max(1,ow+dx);
        if(dir.indexOf('w')>=0){nl=ol+dx;nw=Math.max(1,ow-dx);}
        if(dir.indexOf('s')>=0)nh=Math.max(1,oh+dy);
        if(dir.indexOf('n')>=0){nt=ot+dy;nh=Math.max(1,oh-dy);}
        d.style.left=nl+'%';d.style.top=nt+'%';d.style.width=nw+'%';d.style.height=nh+'%';
      }
    });
    document.addEventListener('mouseup',function(){
      if(!d)return;
      d.style.opacity='1';d.style.zIndex='10';
      // Save back to zones array (% → virtual 800×580)
      var cod=d.dataset.cod,zIdx=L._zonas.findIndex(function(x){return x.cod===cod}),z=zIdx>=0?L._zonas[zIdx]:null;
      if(z){
        z.pos_x=parseFloat(d.style.left)/100*800;
        z.pos_y=parseFloat(d.style.top)/100*580;
        z.ancho=parseFloat(d.style.width)/100*800;
        z.alto=parseFloat(d.style.height)/100*580;
        // FIX "mueble encima se revierte": al mover, llevar al final del array y del DOM
        // para que renderice SIEMPRE encima de los muebles que están debajo.
        if(mode==='move'){
          L._zonas.splice(zIdx,1);L._zonas.push(z);
          if(d.parentNode)d.parentNode.appendChild(d);
        }
        if(L._edCb)L._edCb(mode||'move',cod,z);
      }
      d=null;mode=null;
    });
    // Double click = edit
    cv.addEventListener('dblclick',function(e){
      var zone=e.target.closest('[data-draggable]');
      if(!zone||zone===cv)return;
      e.preventDefault();
      var cod=zone.dataset.cod;
      if(L._edCb)L._edCb('edit',cod);
    });
  },
  _updHandles:function(cv){
    if(!cv)cv=document.querySelector('#lm-cv');if(!cv)return;
    cv.querySelectorAll('.lz-z').forEach(function(z){
      var sel=z.dataset.cod===LayoutMap._edSel;
      z.querySelectorAll('.lz-handle').forEach(function(h){h.style.display=sel?'':'none';});
      z.style.border=sel?'2px solid #2563eb':(z.dataset.color?'1px solid rgba(0,0,0,.08)':'1px solid rgba(0,0,0,.08)');
      if(sel)z.style.zIndex='15';
    });
  },

  getSelected:function(){var r=[];Object.keys(LayoutMap._sel||{}).forEach(function(k){if(LayoutMap._sel[k])r.push(k);});return r;},
  calcPoints:function(zonas){var t=0,s=LayoutMap._sel||{};(zonas||[]).forEach(function(z){if(s[z.cod]&&z.tipo!=='area')t+=(z.peso||0);});return t;},
  calcEvalPoints:function(zonas){var t=0,s=LayoutMap._sel||{},ec=LayoutMap._ec||{};(zonas||[]).forEach(function(z){if(s[z.cod]&&z.tipo!=='area')t+=(z.peso||0)*(ec[z.cod]!==undefined?ec[z.cod]:1);});return t;}
};
