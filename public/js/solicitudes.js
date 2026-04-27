// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/solicitudes.js
// Restaurado desde stash dangling 0439461 (2026-04-24)
// Solicitudes v8 — flujo BPMN, undo, impresión, drafts
// ═══════════════════════════════════════════════════════

// ── SOLICITUDES ──

// ═══════════════════════════════════════════════════════
// SOLICITUDES v3 — Color dropdowns + Compact urgency + UX
// ═══════════════════════════════════════════════════════
var TALLAS_NINO_TERNO = ['0','2','4','6','8','10','12','14','16','18'];
var TALLAS_NINO_CAMISA = ['0','2','4','6','8','10','12','14','16'];
var TALLAS_ADULTO = ['2XS','XS','S','M','L','XL','2XL','4XL'];
var TALLAS_ADULTO_CAMISA = ['S','M','L','XL','XXL'];

var SOLI_COLORES = [
  {n:'Negro',h:'#1a1a1a'},{n:'Azul Noche',h:'#0a1628'},{n:'Azul Presidente',h:'#1a3a6b'},
  {n:'Azul Barcelona',h:'#004d98'},{n:'Azul Eléctrico',h:'#0040ff'},{n:'Azul Acero',h:'#4682b4'},
  {n:'Verde Petróleo',h:'#006d5b'},{n:'Verde Olivo',h:'#556b2f'},{n:'Celeste BB',h:'#b5d8f0'},
  {n:'Plomo',h:'#6b6b6b'},{n:'Plomo Oscuro',h:'#3d3d3d'},{n:'Plomo Rata',h:'#8a8a8a'},
  {n:'Beige',h:'#d4b896'},{n:'Marrón',h:'#5c3317'},{n:'Camello',h:'#c19a6b'},
  {n:'Vino',h:'#722f37'},{n:'Blanco',h:'#f5f5f5'},{n:'Perla',h:'#eae0c8'},
];

var SOLI_PRENDAS = {
  'Terno':{color:true,talla:'terno',tela:['Wafer','Mil rayas','Entero','Cardiff','Puntos','Liso','Lino','Jack','Jaspeado','Brocado','Cuadros','Otro'],modelo:['Clásico','Slim Fit','Smoking','Cuello punta','Chino','Coreano','Otro']},
  'Chaleco':{color:true,talla:'terno',tela:['Wafer','Mil rayas','Entero','Cardiff','Liso','Otro'],modelo:['Clásico','Slim Fit','Cruzado','Otro']},
  'Camisa':{color:true,talla:'camisa',tela:['Entero','Rayas','Wafer'],modelo:false},
  'Corbata':{color:true,talla:['Niño','Adulto'],tela:false,modelo:['Normal','Michi','Corbatón']},
  'Correa':{color:['Negro','Marrón','Camello'],talla:['Niño','Adulto'],tela:false,modelo:['Con botón','Normal']},
  'Pisacorbata':{color:['Dorado','Plata'],talla:false,tela:false,modelo:false},
  'Gemelos':{color:['Dorado','Plata'],talla:false,tela:false,modelo:false},
  'Medias':{color:['Negro','Marrón','Azul noche','Otro'],talla:false,tela:false,modelo:false},
  'Pañuelo':{color:true,talla:['Niño','Adulto'],tela:false,modelo:['Armable','Armado']},
  'Azar':{color:true,talla:['Niño','Adulto'],tela:false,modelo:false},
  'Otro':{color:true,talla:false,tela:false,modelo:false,descripcion:true},
};
var SOLI_ARTICULOS = {
  'Limpieza':['Limpiavidrios','Detergente','Downy','POETT','Lejía','Ambientador','Trapo (especificar)','Trapeador','Escoba','Recogedor','Escobilla normal','Escobilla para ternos','Tacho de basura','Bolsas de basura'],
  'Empaque':['Bolsas de terno','Bolsa de camisa','Bolsa de venta','Cinta adhesiva','Cinta de embalaje'],
  'Oficina':['Cuadernos (boletas)','Papel bond','Papel térmico','Lapiceros','Plumón negro permanente','Etiquetas'],
  'Costura':['Agujas','Botones','Cinta métrica','Trapo de plancha','Cojín para plancha'],
  'Varios':['Papel higiénico','Pulverizadores','Periódicos','Otros'],
};
var SOLI_EST={pendiente:{label:'Pendiente',badge:'badge-gold',icon:'⏳'},aprobada:{label:'Aprobada',badge:'badge-blue',icon:'✅'},rechazada:{label:'Rechazada',badge:'badge-red',icon:'❌'},entregada:{label:'Entregada',badge:'badge-green',icon:'📦'},confirmada:{label:'Confirmada',badge:'badge-navy',icon:'✓'}};
var URG_BADGE={alta:'badge-red',media:'badge-gold',baja:'badge-green'};
var URG_ICON={alta:'🔴',media:'🟡',baja:'🟢'};
var _si='padding:6px 8px;border-radius:6px;border:1.5px solid var(--border);font-size:11px;background:#fff;outline:none';

// ═══════════════════════════════════════════════════════
// SOLICITUDES v8 — Flujo BPMN completo, undo, print tracking
// ═══════════════════════════════════════════════════════

// ── DATA ──
var SOLI_TELAS=['Casimir','Casimir Satinado','Casimir Bradford','Cardiff','Licra','Paño','Corduroy','Piel de durazno'];
var SOLI_MTELA=['Wafer','Mil rayas','Entero','Puntos','Liso','Lino','Jack','Jaspeado','Brocado','Cuadros'];
var SOLI_MPRENDA_T=['Clásico','Slim Fit','Smoking','Cuello punta','Chino','Coreano'];
var SOLI_MPRENDA_CH=['Clásico','Slim Fit','Cruzado'];
var SOLI_TALL_T=['S','M','L','XL','2XL','4XL','0','2','4','6','8','10','12','14','16','18'];
var SOLI_TALL_C=['S','M','L','XL','XXL','0','2','4','6','8','10','12','14','16','18'];
var SOLI_TIPOS=['Terno','Chaleco','Blazer','Camisa','Corbata','Correa','Pisacorbata','Gemelos','Medias','Pañuelo','Azar','Otro'];
var SOLI_CFG={
  'Terno':{color:1,talla:SOLI_TALL_T,tela:SOLI_TELAS,mtela:SOLI_MTELA,mprenda:SOLI_MPRENDA_T},
  'Chaleco':{color:1,talla:SOLI_TALL_T,tela:SOLI_TELAS,mtela:SOLI_MTELA,mprenda:SOLI_MPRENDA_CH},
  'Blazer':{color:1,talla:SOLI_TALL_T,tela:SOLI_TELAS,mtela:SOLI_MTELA,mprenda:SOLI_MPRENDA_T},
  'Camisa':{color:1,talla:SOLI_TALL_C,tela:['Entero','Rayas','Wafer']},
  'Corbata':{color:1,talla:['Adulto','Niño'],modelo:['Normal','Michi','Corbatón']},
  'Correa':{color:['Negro','Marrón','Camello'],talla:['Adulto','Niño'],modelo:['Con botón','Normal']},
  'Pisacorbata':{color:['Dorado','Plata']},'Gemelos':{color:['Dorado','Plata']},
  'Medias':{color:['Negro','Marrón','Azul noche']},'Pañuelo':{color:1,talla:['Adulto','Niño'],modelo:['Armable','Armado']},
  'Azar':{color:1,talla:['Adulto','Niño']},'Otro':{color:1,desc:1},
};

// ── DROPDOWN GENÉRICO (position:fixed, searchable) ──
var _sDD=null;
function sDD(anch,opts,onPick,allowCustom){
  sDDClose();var r=anch.getBoundingClientRect();
  var up=(window.innerHeight-r.bottom)<200&&r.top>200;
  var dd=document.createElement('div');dd.id='sDDFloat';
  dd.style.cssText='position:fixed;z-index:9999;width:'+Math.max(r.width,170)+'px;background:#fff;border:1.5px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;'+(up?'bottom:'+(window.innerHeight-r.top+2)+'px;left:'+r.left+'px':'top:'+(r.bottom+2)+'px;left:'+r.left+'px');
  var h='<input type="text" class="sdd-s" placeholder="Buscar..." style="width:100%;padding:7px 10px;border:none;border-bottom:1px solid var(--border-s);font-size:11px;outline:none" autocomplete="off">';
  h+='<div style="max-height:180px;overflow-y:auto">';
  opts.forEach(function(o){h+='<div class="sdd-i" data-v="'+o+'" style="padding:5px 10px;font-size:11px;cursor:pointer" onmouseenter="this.style.background=\'var(--s3)\'" onmouseleave="this.style.background=\'\'" onclick="sDDPick(this)">'+o+'</div>';});
  h+='</div>';
  if(allowCustom!==false)h+='<div style="padding:5px 10px;font-size:10px;color:var(--text3);border-top:1px dashed var(--border-s);cursor:pointer" onmouseenter="this.style.background=\'var(--s3)\'" onmouseleave="this.style.background=\'\'" onclick="sDDCustom()">+ Escribir otro</div>';
  dd.innerHTML=h;document.body.appendChild(dd);
  _sDD={dd:dd,anch:anch,cb:onPick};
  dd.querySelector('.sdd-s').addEventListener('input',function(){var v=this.value.toLowerCase();dd.querySelectorAll('.sdd-i').forEach(function(i){i.style.display=i.dataset.v.toLowerCase().indexOf(v)>=0?'':'none';});});
  dd.querySelector('.sdd-s').focus();
}
function sDDPick(el){if(!_sDD)return;_sDD.anch.value=el.dataset.v;_sDD.anch.dispatchEvent(new Event('change'));if(_sDD.cb)_sDD.cb(el.dataset.v);sDDClose();}
function sDDCustom(){if(!_sDD)return;var v=(_sDD.dd.querySelector('.sdd-s')?.value||'').trim();if(!v)return;v=v.charAt(0).toUpperCase()+v.slice(1);_sDD.anch.value=v;if(_sDD.cb)_sDD.cb(v);sDDClose();}
function sDDClose(){if(_sDD){_sDD.dd.remove();_sDD=null;}}
document.addEventListener('mousedown',function(e){if(_sDD&&!_sDD.dd.contains(e.target)&&e.target!==_sDD.anch)sDDClose();});

function sColorDD(anch){
  sDDClose();var r=anch.getBoundingClientRect();var up=(window.innerHeight-r.bottom)<200&&r.top>200;
  var dd=document.createElement('div');dd.id='sDDFloat';
  dd.style.cssText='position:fixed;z-index:9999;width:200px;background:#fff;border:1.5px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;'+(up?'bottom:'+(window.innerHeight-r.top+2)+'px;left:'+r.left+'px':'top:'+(r.bottom+2)+'px;left:'+r.left+'px');
  var h='<input type="text" class="sdd-s" placeholder="⌕ Color..." style="width:100%;padding:7px 10px;border:none;border-bottom:1px solid var(--border-s);font-size:11px;outline:none" autocomplete="off"><div style="max-height:180px;overflow-y:auto">';
  SOLI_COLORES.forEach(function(c){h+='<div class="sdd-i" data-v="'+c.n+'" data-h="'+c.h+'" style="padding:5px 10px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:6px" onmouseenter="this.style.background=\'var(--s3)\'" onmouseleave="this.style.background=\'\'" onclick="sColorPick(this)"><span style="width:12px;height:12px;border-radius:50%;background:'+c.h+';border:1px solid rgba(0,0,0,.1);flex-shrink:0"></span>'+c.n+'</div>';});
  h+='</div><div style="padding:5px 10px;font-size:10px;color:var(--text3);border-top:1px dashed var(--border-s);cursor:pointer" onclick="sColorCustom()">+ Otro</div>';
  dd.innerHTML=h;document.body.appendChild(dd);_sDD={dd:dd,anch:anch};
  dd.querySelector('.sdd-s').addEventListener('input',function(){var v=this.value.toLowerCase();dd.querySelectorAll('.sdd-i').forEach(function(i){i.style.display=i.dataset.v.toLowerCase().indexOf(v)>=0?'':'none';});});
  dd.querySelector('.sdd-s').focus();
}
function sColorPick(el){if(!_sDD)return;_sDD.anch.value=el.dataset.v;var d=_sDD.anch.parentNode.querySelector('.si-cdot');if(d)d.style.background=el.dataset.h;sDDClose();}
function sColorCustom(){if(!_sDD)return;var v=(_sDD.dd.querySelector('.sdd-s')?.value||'').trim();if(!v)return;v=v.charAt(0).toUpperCase()+v.slice(1);_sDD.anch.value=v;sDDClose();}

// ── UNDO SYSTEM ──
var _undoTimer=null,_undoData=null;
function soliShowUndo(id,estadoAnterior){
  var bar=document.getElementById('soliUndoBar');if(!bar)return;
  _undoData={id:id,estado:estadoAnterior};
  bar.style.display='flex';
  bar.innerHTML='<span style="font-size:12px">Acción realizada en #'+id+'</span><button class="btn btn-sm" style="background:var(--navy);color:#fff;border:none" onclick="soliDoUndo()">↩ Deshacer</button><div style="flex:1"></div><div style="width:100%;height:3px;background:var(--border);border-radius:2px;margin-top:4px"><div id="soliUndoProgress" style="height:100%;background:var(--navy);border-radius:2px;width:100%;transition:width 10s linear"></div></div>';
  setTimeout(function(){var p=document.getElementById('soliUndoProgress');if(p)p.style.width='0%';},50);
  clearTimeout(_undoTimer);
  _undoTimer=setTimeout(function(){bar.style.display='none';_undoData=null;},10000);
}
async function soliDoUndo(){
  if(!_undoData)return;
  var r=await API.put('/solicitudes/'+_undoData.id+'/deshacer',{estado_destino:_undoData.estado});
  if(r&&r.ok){showToast('↩ Deshecho → '+_undoData.estado,'success');clearTimeout(_undoTimer);document.getElementById('soliUndoBar').style.display='none';_undoData=null;await renderSolicitudes();}
}

// ── LIST ──
var _soliSel=new Set();
// Real-time polling
var _soliPollTimer=null;
function _soliStartPoll(){clearInterval(_soliPollTimer);_soliPollTimer=setInterval(function(){var pg=document.getElementById('page-solicitudes');if(pg&&pg.classList.contains('active'))renderSolicitudes();else clearInterval(_soliPollTimer);},20000);}

async function renderSolicitudes(){
  _soliStartPoll();
  var solis=await API.get('/solicitudes');if(!solis)return;
  STATE.solicitudesCache=solis;_soliSel.clear();
  var pend=0,aprob=0,entreg=0,conf=0;
  solis.forEach(function(s){if(s.estado==='pendiente')pend++;else if(s.estado==='aprobada')aprob++;else if(s.estado==='entregada')entreg++;else if(s.estado==='confirmada')conf++;});
  var kpis=document.getElementById('soliKpis');
  if(kpis)kpis.innerHTML='<div class="stat-card accent-gold"><div class="stat-label">Pendientes</div><div class="stat-val" style="color:var(--gold-d)">'+pend+'</div></div><div class="stat-card accent-blue"><div class="stat-label">Aprobadas</div><div class="stat-val" style="color:var(--blue)">'+aprob+'</div></div><div class="stat-card accent-green"><div class="stat-label">Entregadas</div><div class="stat-val" style="color:var(--green)">'+entreg+'</div></div><div class="stat-card accent-navy"><div class="stat-label">Confirmadas</div><div class="stat-val">'+conf+'</div></div>';

  // Pending panel
  var pp=document.getElementById('soliPendingPanel');
  if(pp){
    var isA=STATE.user&&(STATE.user.rol==='admin'||STATE.user.rol==='dueno'||STATE.user.rol==='encargado_almacen');
    var ph='';
    if(isA){
      if(pend)ph+='<div style="padding:6px 10px;background:rgba(184,165,21,.08);border:1px solid rgba(184,165,21,.2);border-radius:6px;font-size:11px;display:flex;justify-content:space-between;align-items:center"><span>⏳ <b>'+pend+'</b> solicitud(es) por aprobar</span><button class="btn btn-ghost btn-xs" onclick="document.getElementById(\'soliFiltroEstado\').value=\'pendiente\';renderSolicitudes()">Ver</button></div>';
      var sinImprimir=solis.filter(function(s){return(s.estado==='entregada'||s.estado==='confirmada')&&!s.confirmacion_impresa;}).length;
      if(sinImprimir)ph+='<div style="padding:6px 10px;background:rgba(37,99,168,.08);border:1px solid rgba(37,99,168,.2);border-radius:6px;font-size:11px;margin-top:4px">🖨 <b>'+sinImprimir+'</b> confirmación(es) pendientes de imprimir</div>';
    } else {
      var misEntreg=solis.filter(function(s){return s.estado==='entregada'&&s.sede===STATE.sede;}).length;
      if(misEntreg)ph+='<div style="padding:6px 10px;background:rgba(26,122,82,.08);border:1px solid rgba(26,122,82,.2);border-radius:6px;font-size:11px">📦 <b>'+misEntreg+'</b> entrega(s) por confirmar en tu tienda</div>';
    }
    pp.innerHTML=ph;
  }

  var fE=(document.getElementById('soliFiltroEstado')||{}).value||'';
  var fS=(document.getElementById('soliFiltroSede')||{}).value||'';
  var esAlmacen=STATE.sede==='AL';
  var isAdmin=STATE.user&&(STATE.user.rol==='admin'||STATE.user.rol==='dueno'||STATE.user.rol==='encargado_almacen');
  // Hide sede filter for non-admin (stores only see their own)
  var sedeFilter=document.getElementById('soliFiltroSede');
  if(sedeFilter){sedeFilter.style.display=isAdmin?'':'none';}
  // Print buttons only visible from almacén
  var bPed=document.getElementById('soliBtnPedido'),bConf=document.getElementById('soliBtnConfirm');
  if(bPed)bPed.style.display=esAlmacen?'':'none';
  if(bConf)bConf.style.display=esAlmacen?'':'none';
  var filtered=solis.filter(function(s){
    if(fE==='_all') return isAdmin ? (fS ? s.sede===fS : true) : s.sede===STATE.sede;
    if(fE&&s.estado!==fE)return false;
    if(!isAdmin&&s.sede!==STATE.sede)return false;
    if(isAdmin&&fS&&s.sede!==fS)return false;
    if(!fE&&(s.estado==='confirmada'||s.estado==='rechazada'))return false;
    return true;
  });
  var body=document.getElementById('solicitudesBody');if(!body)return;
  if(!filtered.length){body.innerHTML='<tr><td class="empty-cell" colspan="8">Sin solicitudes'+(fE||fS?' con ese filtro':' activas (usa filtro "Todos" para ver todas)')+'</td></tr>';return;}
  body.innerHTML=filtered.map(function(s){
    var est=SOLI_EST[s.estado]||{label:s.estado,badge:'badge-gray',icon:'?'};
    var items=(s.items||[]).slice(0,3).map(function(i){return i.tipo}).join(', ');
    if((s.items||[]).length>3)items+=' +'+(s.items.length-3);
    var esMia=(s.sede===STATE.sede);
    var chk=isAdmin&&s.estado==='pendiente'?'<td style="text-align:center;width:28px"><input type="checkbox" class="soli-chk" data-id="'+s.id+'" onchange="soliToggleChk(this)"></td>':'<td style="width:28px"></td>';
    var prints='';
    if(s.pedido_impreso)prints+='<span title="Pedido impreso" style="font-size:9px;color:var(--green)">📄</span>';
    if(s.confirmacion_impresa)prints+='<span title="Confirmación impresa" style="font-size:9px;color:var(--blue)">📄</span>';
    return '<tr style="'+(esMia?'border-left:3px solid var(--navy);background:rgba(59,130,246,.04)':'')+'">'+chk+'<td class="mono" style="font-size:11px">#'+s.id+' '+prints+'</td><td class="mono" style="font-size:10px">'+(s.fecha||'').slice(0,16)+' <span style="font-size:9px;color:var(--text3)">'+(SEDES[s.sede]?.short||s.sede)+'</span></td><td style="font-size:11px">'+items+'</td><td><span class="badge '+(URG_BADGE[s.urgencia]||'badge-gray')+'" style="font-size:9px">'+(URG_ICON[s.urgencia]||'')+' '+s.urgencia+'</span></td><td><span class="badge '+est.badge+'" style="font-size:9px">'+est.icon+' '+est.label+'</span></td><td style="font-size:11px">'+(s.solicitante||'—')+'</td><td><button class="btn btn-ghost btn-xs" onclick="verDetalleSolicitud('+s.id+')">Ver</button></td></tr>';
  }).join('');
  _soliBulk();
}
function soliToggleChk(cb){var id=parseInt(cb.dataset.id);if(cb.checked)_soliSel.add(id);else _soliSel.delete(id);_soliBulk();}
function soliSelectAll(){var cbs=document.querySelectorAll('.soli-chk');var on=_soliSel.size===cbs.length&&cbs.length>0;cbs.forEach(function(cb){cb.checked=!on;if(!on)_soliSel.add(parseInt(cb.dataset.id));});if(on)_soliSel.clear();_soliBulk();}
function _soliBulk(){var bar=document.getElementById('soliBulkBar');if(!bar)return;if(_soliSel.size>0){bar.style.display='flex';bar.innerHTML='<span style="font-size:12px;font-weight:700">'+_soliSel.size+' pendiente(s) seleccionada(s)</span><button class="btn btn-ghost btn-xs" onclick="soliSelectAll()">Todas</button>';}else bar.style.display='none';}

// ── CODE INPUT ──
function soliCode(titulo,icono,cb){
  var p=document.getElementById('soliCodeModal');if(p)p.remove();
  var h='<div id="soliCodeModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1100;display:flex;align-items:center;justify-content:center"><div style="background:#fff;border-radius:14px;padding:24px;width:320px;text-align:center" onclick="event.stopPropagation()"><div style="font-size:32px;margin-bottom:8px">'+icono+'</div><div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:4px">'+titulo+'</div><div style="font-size:11px;color:var(--text3);margin-bottom:14px">Ingresa tu código de empleado</div><input type="password" id="scI" class="code-masked" placeholder="••••" inputmode="numeric" autocomplete="off" data-lpignore="true" style="width:100px;padding:10px;text-align:center;border:2px solid var(--border);border-radius:10px;font-size:16px;font-weight:700" onclick="event.stopPropagation()" oninput="_scV()" onkeydown="if(event.key===\'Enter\')_scC()"><div id="scS" style="font-size:11px;min-height:18px;margin:8px 0">—</div><div style="display:flex;gap:8px"><button class="btn btn-ghost" style="flex:1" onclick="document.getElementById(\'soliCodeModal\').remove()">Cancelar</button><button class="btn btn-primary" style="flex:1" id="scB" onclick="_scC()" disabled>Confirmar</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend',h);window._scCb=cb;
  // Close on overlay click only
  document.getElementById('soliCodeModal').addEventListener('click',function(e){if(e.target===this)this.remove();});
  document.getElementById('scI')?.focus();
}
function _scV(){var c=document.getElementById('scI')?.value?.trim()||'',st=document.getElementById('scS'),bn=document.getElementById('scB');if(c.length<4){if(st)st.innerHTML='—';if(bn)bn.disabled=true;return;}var f=(STATE.empleadosCache||[]).find(function(e){return e.cod===c});if(f){if(st)st.innerHTML='<span style="color:var(--green)">✅ '+f.nombre+'</span>';if(bn)bn.disabled=false;}else{if(st)st.innerHTML='<span style="color:var(--red)">❌</span>';if(bn)bn.disabled=true;}}
function _scC(){var c=document.getElementById('scI')?.value?.trim()||'',f=(STATE.empleadosCache||[]).find(function(e){return e.cod===c});if(!f)return;document.getElementById('soliCodeModal')?.remove();if(window._scCb)window._scCb(f);}

// ── DETAIL MODAL ──
function verDetalleSolicitud(id){
  var s=(STATE.solicitudesCache||[]).find(function(x){return x.id===id});if(!s)return;
  var p=document.getElementById('soliDetalleModal');if(p)p.remove();
  var est=SOLI_EST[s.estado]||{label:s.estado,badge:'badge-gray'};
  var isA=STATE.user&&(STATE.user.rol==='admin'||STATE.user.rol==='dueno'||STATE.user.rol==='encargado_almacen');
  var myS=(s.sede===STATE.sede),isP=s.estado==='pendiente';
  var h='<div id="soliDetalleModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px" onclick="this.remove()"><div style="background:#fff;border-radius:14px;width:95%;max-width:750px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()"><div class="modal-header"><h2>#'+s.id+' — '+(SEDES[s.sede]?.short||s.sede)+'</h2><button class="modal-close" onclick="document.getElementById(\'soliDetalleModal\').remove()">✕</button></div>';
  // Content with no-scrollbar styling
  h+='<div style="flex:1;overflow-y:auto;padding:16px;scrollbar-width:none;-ms-overflow-style:none" onscroll="" class="soli-detail-scroll">';
  // Info pills
  h+='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;font-size:10px">';
  h+='<div style="padding:4px 8px;background:var(--s3);border-radius:5px"><span style="color:#8a90aa">Solicita:</span> <b>'+s.solicitante+'</b></div>';
  h+='<div style="padding:4px 8px;background:var(--s3);border-radius:5px">'+(s.fecha||'').slice(0,16)+'</div>';
  h+='<span class="badge '+(URG_BADGE[s.urgencia]||'')+'" style="font-size:9px">'+(URG_ICON[s.urgencia]||'')+' '+s.urgencia+'</span>';
  h+='<span class="badge '+est.badge+'" style="font-size:9px">'+est.icon+' '+est.label+'</span>';
  if(s.pedido_impreso)h+='<span style="font-size:9px;padding:3px 6px;background:rgba(26,122,82,.08);border-radius:4px;color:var(--green)">📄 Pedido impreso</span>';
  if(s.confirmacion_impresa)h+='<span style="font-size:9px;padding:3px 6px;background:rgba(37,99,168,.08);border-radius:4px;color:var(--blue)">📄 Confirmación impresa</span>';
  h+='</div>';
  // Trail
  if(s.aprobado_por)h+='<div style="font-size:10px;padding:3px 8px;background:rgba(37,99,168,.05);border-radius:3px;margin-bottom:3px;border-left:3px solid var(--blue)">Aprobó: <b>'+s.aprobado_por+'</b> · '+(s.fecha_respuesta||'').slice(0,16)+'</div>';
  if(s.entregado_por)h+='<div style="font-size:10px;padding:3px 8px;background:rgba(26,122,82,.05);border-radius:3px;margin-bottom:3px;border-left:3px solid var(--green)">Entregó: <b>'+s.entregado_por+'</b> · '+(s.fecha_entrega||'').slice(0,16)+'</div>';
  if(s.confirmado_por)h+='<div style="font-size:10px;padding:3px 8px;background:rgba(46,62,110,.05);border-radius:3px;margin-bottom:3px;border-left:3px solid var(--navy)">Confirmó: <b>'+s.confirmado_por+'</b> · '+(s.fecha_confirmacion||'').slice(0,16)+'</div>';
  if(s.rechazado_por)h+='<div style="font-size:10px;padding:3px 8px;background:rgba(192,57,43,.05);border-radius:3px;margin-bottom:3px;border-left:3px solid var(--red)">Rechazó: <b>'+s.rechazado_por+'</b> — '+s.motivo_rechazo+'</div>';
  if(s.obs)h+='<div style="font-size:10px;margin-bottom:4px;padding:3px 8px;background:var(--s3);border-radius:3px"><b>Obs:</b> '+s.obs+'</div>';
  if(s.obs_respuesta)h+='<div style="font-size:10px;margin-bottom:4px;padding:3px 8px;background:rgba(46,62,110,.04);border-radius:3px;border-left:3px solid var(--navy)"><b>Respuesta:</b> '+s.obs_respuesta+'</div>';
  // Items
  h+='<table class="data-table" style="font-size:11px"><thead><tr><th>Tipo</th><th>Color</th><th>Talla</th><th>Tela</th><th style="text-align:center">Solicit.</th>';
  if(isP&&isA)h+='<th style="text-align:center;background:#e0f2fe">A enviar</th>';
  else if(!isP)h+='<th style="text-align:center">Enviado</th>';
  if(s.estado==='entregada'&&(myS||isA))h+='<th style="text-align:center;background:#dcfce7">Recibido</th><th>Obs. recep.</th>';
  else if(s.estado==='confirmada')h+='<th style="text-align:center">Recibido</th>';
  h+='<th>Obs.</th></tr></thead><tbody>';
  (s.items||[]).forEach(function(i){
    var dot=SOLI_COLORES.find(function(c){return c.n===i.color});
    var dH=dot?'<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+dot.h+';border:1px solid rgba(0,0,0,.1);vertical-align:middle;margin-right:3px"></span>':'';
    var tela=[(i.tela||''),(i.modelo||'')].filter(Boolean).join(' · ');
    h+='<tr><td style="font-weight:600">'+i.tipo+'</td><td>'+dH+(i.color||'—')+'</td><td>'+(i.talla||'—')+'</td><td style="font-size:10px;color:#64748b">'+(tela||'—')+'</td><td style="text-align:center;font-weight:700">'+i.cantidad+'</td>';
    if(isP&&isA){
      h+='<td style="text-align:center;background:#f0f9ff"><div style="display:inline-flex;align-items:center;gap:2px;background:var(--s3);border-radius:6px;padding:1px 4px;border:1px solid var(--border)"><button type="button" onclick="soliQA(this,-1)" style="width:20px;height:20px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:700">−</button><input type="number" min="0" max="'+i.cantidad+'" value="'+i.cantidad+'" class="soli-cant-env" data-item-id="'+i.id+'" style="width:32px;text-align:center;border:none;background:transparent;font-weight:800;font-size:12px;outline:none" onfocus="this.select()"><button type="button" onclick="soliQA(this,1)" style="width:20px;height:20px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:700">+</button></div></td>';
    } else if(!isP){
      var env=i.cantidad_enviada||0;var col=env>=i.cantidad?'#16a34a':env>0?'#ca8a04':'#dc2626';
      h+='<td style="text-align:center;font-weight:700;color:'+col+'">'+env+'</td>';
    }
    if(s.estado==='entregada'&&(myS||isA)){
      var ev=i.cantidad_enviada||0;
      h+='<td style="text-align:center;background:#f0fdf4"><input type="number" min="0" max="'+ev+'" value="'+ev+'" class="soli-cant-rec" data-item-id="'+i.id+'" style="width:40px;text-align:center;'+_si+';font-weight:700" onfocus="this.select()"></td>';
      h+='<td><input type="text" class="soli-obs-rec" data-item-id="'+i.id+'" placeholder="Obs." style="'+_si+';width:100%;font-size:10px"></td>';
    } else if(s.estado==='confirmada'){
      var rec=i.cantidad_recibida||0;var colR=rec>=(i.cantidad_enviada||0)?'#16a34a':'#dc2626';
      h+='<td style="text-align:center;font-weight:700;color:'+colR+'">'+rec+(i.obs_recepcion?' *':'')+'</td>';
    }
    h+='<td style="font-size:10px;color:#64748b">'+(i.obs||i.detalle||'—')+'</td></tr>';
  });
  h+='</tbody></table>';
  if(isP&&isA)h+='<div class="field" style="margin-top:8px"><label style="font-size:10px">Observación</label><input type="text" id="soliRespObs" placeholder="Ej: No hay stock talla XL" style="'+_si+';width:100%"></div>';
  h+='</div>';
  // Footer — with sede restrictions (only AL can operate, only receiving store can confirm)
  h+='<div class="modal-footer" style="flex-wrap:wrap;gap:6px">';
  var esAlmacen=STATE.sede==='AL';
  var esDuena=STATE.user&&STATE.user.rol==='dueno';
  // Dueña puede aprobar/rechazar desde cualquier sede. Almacén/admin solo desde AL.
  if(isP&&isA&&(esAlmacen||esDuena))h+='<button class="btn btn-primary btn-sm" onclick="soliAAprobar('+s.id+')">✅ Aprobar</button><button class="btn btn-sm" style="background:#dc2626;color:#fff;border:none" onclick="soliARechazar('+s.id+')">❌ Rechazar</button>';
  if(s.estado==='aprobada'&&isA&&esAlmacen)h+='<button class="btn btn-primary btn-sm" onclick="soliAEntregar('+s.id+')">📦 Registrar Entrega</button>';
  if(s.estado==='entregada'&&myS)h+='<button class="btn btn-primary btn-sm" onclick="soliAConfirmar('+s.id+')">✓ Confirmar Recepción</button>';
  // Prints only from almacén
  if(esAlmacen){
    if(s.estado==='pendiente'||s.estado==='aprobada')h+='<button class="btn btn-ghost btn-sm" onclick="soliImprimirPedido(['+s.id+'])">🖨 Formato Pedido</button>';
    if(s.estado==='aprobada'||s.estado==='entregada'||s.estado==='confirmada'){
      var hasCods=s.codigos_prenda&&s.codigos_prenda!=='[]'&&s.codigos_prenda!=='';
      if(hasCods||s.estado==='confirmada')h+='<button class="btn btn-ghost btn-sm" onclick="soliImprimirConfirmacion(['+s.id+'])">🖨 Confirmación</button>';
      else h+='<button class="btn btn-ghost btn-sm" disabled style="opacity:.4" title="Primero registre la entrega con códigos">🖨 Confirmación</button>';
    }
  }
  h+='<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="_soliSaveDraft('+s.id+');document.getElementById(\'soliDetalleModal\').remove()">Cerrar</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend',h);
  // Close on overlay click — save draft
  document.getElementById('soliDetalleModal').addEventListener('click',function(e){if(e.target===this){_soliSaveDraft(id);this.remove();}});
  // Hide scrollbar CSS
  if(!document.getElementById('soliScrollStyle')){var style=document.createElement('style');style.id='soliScrollStyle';style.textContent='.soli-detail-scroll::-webkit-scrollbar{display:none}';document.head.appendChild(style);}
  // Load draft if exists
  _soliLoadDraft(id);
}
function soliQA(btn,d){var inp=btn.parentNode.querySelector('input[type="number"]');if(!inp)return;var mx=parseInt(inp.max)||99;inp.value=Math.max(0,Math.min(mx,(parseInt(inp.value)||0)+d));}

// Draft system — save progress in memory
var _soliDrafts={};
function _soliSaveDraft(id){
  var d={cantEnv:{},cantRec:{},obsRec:{},respObs:'',codsPrenda:{}};
  document.querySelectorAll('.soli-cant-env').forEach(function(inp){d.cantEnv[inp.dataset.itemId]=inp.value;});
  document.querySelectorAll('.soli-cant-rec').forEach(function(inp){d.cantRec[inp.dataset.itemId]=inp.value;});
  document.querySelectorAll('.soli-obs-rec').forEach(function(inp){d.obsRec[inp.dataset.itemId]=inp.value;});
  document.querySelectorAll('.soli-cod-prenda').forEach(function(inp){d.codsPrenda[inp.dataset.itemId]=inp.value;});
  var obs=document.getElementById('soliRespObs');if(obs)d.respObs=obs.value;
  _soliDrafts[id]=d;
}
function _soliLoadDraft(id){
  var d=_soliDrafts[id];if(!d)return;
  setTimeout(function(){
    Object.entries(d.cantEnv).forEach(function(e){var inp=document.querySelector('.soli-cant-env[data-item-id="'+e[0]+'"]');if(inp)inp.value=e[1];});
    Object.entries(d.cantRec).forEach(function(e){var inp=document.querySelector('.soli-cant-rec[data-item-id="'+e[0]+'"]');if(inp)inp.value=e[1];});
    Object.entries(d.obsRec).forEach(function(e){var inp=document.querySelector('.soli-obs-rec[data-item-id="'+e[0]+'"]');if(inp)inp.value=e[1];});
    Object.entries(d.codsPrenda||{}).forEach(function(e){var inp=document.querySelector('.soli-cod-prenda[data-item-id="'+e[0]+'"]');if(inp)inp.value=e[1];});
    var obs=document.getElementById('soliRespObs');if(obs&&d.respObs)obs.value=d.respObs;
  },50);
}

function soliAAprobar(id){
  _soliSaveDraft(id);
  var items=[];document.querySelectorAll('.soli-cant-env').forEach(function(inp){items.push({id:parseInt(inp.dataset.itemId),cantidad_enviada:parseInt(inp.value)||0});});
  var obs=document.getElementById('soliRespObs')?.value||'';
  soliCode('Aprobar #'+id,'✅',async function(emp){
    var r=await API.put('/solicitudes/'+id+'/aprobar',{responsable:emp.nombre,obs_respuesta:obs,items:items});
    if(r&&r.ok){delete _soliDrafts[id];document.getElementById('soliDetalleModal')?.remove();showToast('✅ Aprobada por '+emp.nombre,'success');soliShowUndo(id,'pendiente');await renderSolicitudes();}
  });
}
function soliARechazar(id){
  soliCode('Rechazar #'+id,'❌',async function(emp){
    showPrompt('Motivo del rechazo (obligatorio)','',async function(motivo){
      if(!motivo||!motivo.trim()){showToast('El motivo es obligatorio','error');return;}
      var r=await API.put('/solicitudes/'+id+'/rechazar',{responsable:emp.nombre,motivo:motivo});
      if(r&&r.ok){delete _soliDrafts[id];document.getElementById('soliDetalleModal')?.remove();showToast('❌ Rechazada','success');soliShowUndo(id,r.estado_anterior||'pendiente');await renderSolicitudes();}
    },'❌');
  });
}
var _soliEntregaDraft={};
function soliAEntregar(id){
  var s=(STATE.solicitudesCache||[]).find(function(x){return x.id===id});if(!s)return;
  var prev=document.getElementById('soliEntregarModal');if(prev)prev.remove();
  var emps=(STATE.empleadosCache||[]).filter(function(e){return e.tiendas&&e.tiendas.indexOf(s.sede)>=0&&(e.estado||'activo')==='activo';});
  var draft=_soliEntregaDraft[id]||{};
  var h='<div id="soliEntregarModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1050;display:flex;align-items:center;justify-content:center;padding:16px"><div style="background:#fff;border-radius:14px;width:95%;max-width:580px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()"><div class="modal-header"><h2>📦 Entrega #'+id+' → '+(SEDES[s.sede]?.short||s.sede)+'</h2><button class="modal-close" onclick="_soliSaveEntregaDraft('+id+');document.getElementById(\'soliEntregarModal\').remove()">✕</button></div><div style="flex:1;overflow-y:auto;padding:16px;scrollbar-width:none">';
  // Receptor — persona style
  h+='<div class="field mb-0" style="margin-bottom:14px"><label>Quién recibe en '+(SEDES[s.sede]?.short||s.sede)+'</label>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px" id="seRecibeWrap">';
  emps.forEach(function(e){
    var sel=draft.recibe===e.nombre;
    h+='<button type="button" class="se-rb" data-n="'+e.nombre+'" onclick="seSelRecibe(this)" style="padding:5px 10px;border-radius:8px;border:1.5px solid '+(sel?'var(--navy)':'var(--border)')+';background:'+(sel?'rgba(46,62,110,.08)':'#fff')+';cursor:pointer;font-size:11px;font-weight:600;transition:all .15s">'+(e.iniciales?'<span style="background:var(--navy);color:#fff;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:8px;margin-right:4px">'+e.iniciales+'</span>':'')+e.nombre+'</button>';
  });
  h+='<button type="button" onclick="seAddOtro()" style="padding:5px 10px;border-radius:8px;border:1.5px dashed var(--border);background:#fafafa;cursor:pointer;font-size:11px;color:var(--text3)">+ Otro</button>';
  h+='</div><input type="hidden" id="seRecibe" value="'+(draft.recibe||'')+'"></div>';
  // Prenda codes
  h+='<div style="font-size:12px;font-weight:700;color:var(--navy);margin:14px 0 8px;display:flex;align-items:center;gap:6px"><span>📋 Códigos de prenda</span><span style="font-size:9px;color:var(--text3);font-weight:400">En mayúscula — obligatorio para imprimir confirmación</span></div>';
  (s.items||[]).forEach(function(i){
    if(i.categoria!=='prenda')return;
    var env=i.cantidad_enviada||i.cantidad;
    h+='<div style="padding:8px 10px;margin-bottom:6px;border:1px solid var(--border);border-radius:8px;background:#fafafa"><div style="font-size:11px;font-weight:700;margin-bottom:4px;display:flex;justify-content:space-between"><span>'+i.tipo+' '+(i.color||'')+' '+(i.talla||'')+'</span><span style="color:var(--text3);font-size:10px">×'+env+'</span></div>';
    for(var k=0;k<env;k++){
      var dv=(draft.cods&&draft.cods[i.id+'_'+k])||'';
      h+='<input type="text" class="se-cod" data-item-id="'+i.id+'" data-idx="'+k+'" placeholder="Código '+(k+1)+'" value="'+dv+'" style="'+_si+';width:100%;margin-bottom:3px;text-transform:uppercase;font-family:var(--font-m);font-weight:600;letter-spacing:1px" oninput="this.value=this.value.toUpperCase()" onclick="event.stopPropagation()">';
    }
    h+='</div>';
  });
  h+='</div><div class="modal-footer"><button class="btn btn-ghost" onclick="_soliSaveEntregaDraft('+id+');document.getElementById(\'soliEntregarModal\').remove()">Cancelar</button><button class="btn btn-primary" onclick="soliConfirmarEntrega('+id+')">📦 Confirmar Entrega</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend',h);
  document.getElementById('soliEntregarModal').addEventListener('click',function(e){if(e.target===this){_soliSaveEntregaDraft(id);this.remove();}});
  // Auto-select from draft
  if(draft.recibe){var btn=document.querySelector('.se-rb[data-n="'+draft.recibe+'"]');if(btn)seSelRecibe(btn);}
}
function seSelRecibe(btn){
  document.querySelectorAll('.se-rb').forEach(function(b){b.style.border='1.5px solid var(--border)';b.style.background='#fff';});
  btn.style.border='1.5px solid var(--navy)';btn.style.background='rgba(46,62,110,.08)';
  document.getElementById('seRecibe').value=btn.dataset.n;
}
function seAddOtro(){
  showPrompt('Nombre del receptor','',function(nombre){
    if(!nombre)return;
    document.getElementById('seRecibe').value=nombre;
    var wrap=document.getElementById('seRecibeWrap');
    if(wrap){
      document.querySelectorAll('.se-rb').forEach(function(b){b.style.border='1.5px solid var(--border)';b.style.background='#fff';});
      var nb=document.createElement('button');nb.type='button';nb.className='se-rb';nb.dataset.n=nombre;
      nb.style.cssText='padding:5px 10px;border-radius:8px;border:1.5px solid var(--navy);background:rgba(46,62,110,.08);cursor:pointer;font-size:11px;font-weight:600';
      nb.textContent=nombre;nb.onclick=function(){seSelRecibe(this);};
      wrap.insertBefore(nb,wrap.lastElementChild);
    }
  },'👤');
}
function _soliSaveEntregaDraft(id){
  var d={recibe:document.getElementById('seRecibe')?.value||'',cods:{}};
  document.querySelectorAll('.se-cod').forEach(function(inp){d.cods[inp.dataset.itemId+'_'+inp.dataset.idx]=inp.value;});
  _soliEntregaDraft[id]=d;
}
function soliConfirmarEntrega(id){
  var recibe=document.getElementById('seRecibe')?.value;
  if(!recibe){showToast('Selecciona quién recibe en tienda','error');return;}
  var codsPrenda={};
  document.querySelectorAll('.se-cod').forEach(function(inp){
    if(inp.value.trim()){
      var iid=inp.dataset.itemId;
      if(!codsPrenda[iid])codsPrenda[iid]=[];
      codsPrenda[iid].push(inp.value.trim().toUpperCase());
    }
  });
  soliCode('Entrega #'+id,'📦',async function(emp){
    var r=await API.put('/solicitudes/'+id+'/entregar',{responsable:emp.nombre,recibe_en_tienda:recibe,codigos_prenda:codsPrenda});
    if(r&&r.ok){delete _soliEntregaDraft[id];delete _soliDrafts[id];document.getElementById('soliEntregarModal')?.remove();document.getElementById('soliDetalleModal')?.remove();showToast('📦 Entregada a '+recibe+' por '+emp.nombre,'success');soliShowUndo(id,'aprobada');await renderSolicitudes();}
  });
}
function soliAConfirmar(id){
  // Only the receiving store can confirm
  var s=(STATE.solicitudesCache||[]).find(function(x){return x.id===id});
  if(s&&s.sede!==STATE.sede){showToast('Solo '+((SEDES[s.sede]?.short)||s.sede)+' puede confirmar','error');return;}
  _soliSaveDraft(id);
  var items=[];
  document.querySelectorAll('.soli-cant-rec').forEach(function(inp){
    var itemId=parseInt(inp.dataset.itemId);
    var obsInp=document.querySelector('.soli-obs-rec[data-item-id="'+itemId+'"]');
    items.push({id:itemId,cantidad_recibida:parseInt(inp.value)||0,obs_recepcion:obsInp?.value||''});
  });
  soliCode('Confirmar Recepción #'+id,'✓',async function(emp){
    var r=await API.put('/solicitudes/'+id+'/confirmar',{responsable:emp.nombre,items:items});
    if(r&&r.ok){delete _soliDrafts[id];document.getElementById('soliDetalleModal')?.remove();showToast('✓ Confirmada por '+emp.nombre,'success');soliShowUndo(id,'entregada');await renderSolicitudes();}
  });
}

// ══════════════════════════════════════
// PRINT
// ══════════════════════════════════════
function _pCSS(){return '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Inter:wght@300;400;500;600;700&display=swap");@page{size:A4 portrait;margin:8mm 10mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,sans-serif;color:#1a2035;font-size:9.5px;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.np{max-width:210mm;margin:12px auto;display:flex;justify-content:flex-end}.np button{padding:8px 20px;background:#1e2a4a;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px}.sh{max-width:210mm;margin:0 auto;padding:22px 24px;position:relative;overflow:hidden}.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:.035;pointer-events:none;z-index:0;width:300px}.wm img{width:100%}.hdr{display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;margin-bottom:12px;border-bottom:2.5px solid #1e2a4a;position:relative;z-index:1}.hdr-b{display:flex;align-items:center;gap:12px}.hdr-b img{height:36px}.hdr-b .nm{font-family:"Cormorant Garamond",Georgia,serif;font-size:24px;font-weight:700;color:#1e2a4a;line-height:1;letter-spacing:1px}.hdr-b .sl{font-size:8px;color:#8a90aa;letter-spacing:2px;text-transform:uppercase;margin-top:1px}.hdr-r{text-align:right}.dt{font-family:"Cormorant Garamond",Georgia,serif;font-size:12px;font-weight:700;color:#1e2a4a;text-transform:uppercase}.dd{font-size:9px;color:#4a5272;margin-top:3px}.dn{font-size:8px;color:#8a90aa;margin-top:2px}.ins{padding:7px 12px;border-radius:5px;text-align:center;margin-bottom:12px;font-size:8.5px;border:1px solid;z-index:1;position:relative}.ss{margin-bottom:14px;page-break-inside:avoid;position:relative;z-index:1}.sh2{padding:6px 12px;display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;text-transform:uppercase;border:1.5px solid;border-bottom:none;border-radius:5px 5px 0 0}.sb2{font-size:8.5px;font-weight:700;background:rgba(255,255,255,.9);padding:2px 8px;border-radius:3px}table{width:100%;border-collapse:collapse;border:1px solid #8a90aa;font-size:9px;position:relative;z-index:1}thead th{padding:5px 6px;text-align:left;font-size:7.5px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1.5px solid #8a90aa;background:#eef0f7;color:#2e3e6e;font-weight:700}td{padding:4px 6px;border-bottom:1px solid #d8dce8;border-right:1px solid #e8eaf2}td:last-child{border-right:none}tr:nth-child(even) td{background:#f7f8fc}.cb-w{width:40px;text-align:center;vertical-align:middle}.cb{width:16px;height:16px;border:1.5px solid #4a5272;border-radius:3px;display:inline-block}.qb{width:32px;height:18px;border:1.5px solid #4a5272;border-radius:3px;display:inline-block}.hc{font-size:7px;line-height:1.1;text-align:center;padding:4px 2px;font-weight:800}.hg{background:#d1fae5;color:#065f46}.hn{background:#fecaca;color:#991b1b}.hp{background:#fed7aa;color:#9a3412}.ar td{background:#eef0f7!important;text-align:center;font-weight:700;font-size:8px;text-transform:uppercase;color:#4a5272;padding:4px;border-right:none}.ob td{font-size:8px;color:#8a90aa;padding:3px 8px;background:#fefce8!important;border-right:none;font-style:italic}.nt td{font-size:8px;color:#2e3e6e;padding:3px 8px;background:rgba(46,62,110,.04)!important;border-right:none;border-left:2px solid #2e3e6e}.ok{color:#065f46;font-weight:800}.pc{color:#854d0e;font-weight:800}.nk{color:#991b1b;font-weight:800}.cn{text-align:center;font-weight:800;width:40px}.rs{margin-top:4px;padding:5px 10px;background:rgba(46,62,110,.03);border:1px solid #d8dce8;border-radius:4px;font-size:8.5px;color:#2e3e6e;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px}.rs b{font-weight:800}.fs{margin-top:28px;page-break-inside:avoid;position:relative;z-index:1}.ft{font-size:7.5px;font-weight:700;text-transform:uppercase;color:#8a90aa;letter-spacing:1.5px;margin-bottom:8px;text-align:center}.ff{display:flex;justify-content:space-around;gap:10px;flex-wrap:wrap}.fi{flex:1;text-align:center;min-width:120px;max-width:180px}.fl{border-bottom:1.5px solid #1a2035;margin-bottom:3px;min-height:36px}.fb{font-size:7px;font-weight:700;text-transform:uppercase;color:#4a5272}.fn{font-size:9px;font-weight:700;color:#1a2035;margin-top:1px}.fc{font-size:7px;color:#8a90aa}.fn[contenteditable]{border-bottom:1px dashed #8a90aa;outline:none;cursor:text}.fn[contenteditable]:focus{border-bottom-color:#2e3e6e;background:rgba(46,62,110,.05)}.ftr{margin-top:14px;text-align:center;font-size:7px;color:#8a90aa;border-top:1px solid #d8dce8;padding-top:5px;position:relative;z-index:1}@media print{.np{display:none!important}.sh{padding:0}.wm{position:fixed}.fn[contenteditable]{border-bottom-color:transparent}}';}
var _SC2={ST:{bg:'#f0f7f5',bd:'#6ec6a9',tx:'#134e4a'},LB:{bg:'#eef0f7',bd:'#7b8cc4',tx:'#1e2a4a'},TR:{bg:'#fdf6e3',bd:'#d4a735',tx:'#5c4a00'},AL:{bg:'#f0f2f7',bd:'#8a90aa',tx:'#1a2035'}};
function _pH(t,ids){return '<div class="wm"><img src="/assets/logo_lion_bw.png" alt=""></div><div class="hdr"><div class="hdr-b"><img src="/assets/logo_lion_color.png" alt="LB"><div><div class="nm">LUCEBIEN</div><div class="sl">Para la Ocasión</div></div></div><div class="hdr-r"><div class="dt">'+t+'</div><div class="dd">'+new Date().toLocaleDateString('es-PE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})+'</div>'+(ids?'<div class="dn">Ref: #'+ids.join(', #')+'</div>':'')+'</div></div>';}
function _pF(l){var h='<div class="fs"><div class="ft">Conformidad y Firmas</div><div class="ff">';l.forEach(function(f){h+='<div class="fi"><div class="fl"></div><div class="fb">'+f.lb+'</div><div class="fn"'+(f.ed?' contenteditable="true" title="Clic para cambiar"':'')+'>'+f.nm+'</div>'+(f.dni?'<div class="fc">DNI: '+f.dni+'</div>':'')+(f.cg?'<div class="fc">'+f.cg+'</div>':'')+'</div>';});return h+'</div></div>';}
function _empDNI(nombre){var e=(STATE.empleadosCache||[]).find(function(x){return x.nombre===nombre});return e?.dni||'';}

function soliImprimir(id){soliImprimirPedido([id]);}

// ── DOC 1: FORMATO DE SOLICITUD DE PEDIDOS ──
async function soliImprimirPedido(idsParam){
  var solis;
  if(idsParam){solis=(STATE.solicitudesCache||[]).filter(function(s){return idsParam.indexOf(s.id)>=0;});}
  else{
    // Solo las seleccionadas
    if(!_soliSel.size){showToast('Selecciona las solicitudes pendientes a imprimir','info');return;}
    var ids=Array.from(_soliSel);solis=(STATE.solicitudesCache||[]).filter(function(s){return ids.indexOf(s.id)>=0&&(s.estado==='pendiente'||s.estado==='aprobada');});
    if(!solis.length){showToast('Las solicitudes seleccionadas no están pendientes','info');return;}
  }
  if(!solis.length){showToast('Sin solicitudes para imprimir','info');return;}
  var bySede={},nms={},allIds=[];
  solis.forEach(function(s){if(!bySede[s.sede])bySede[s.sede]=[];bySede[s.sede].push(s);if(!nms[s.sede])nms[s.sede]=[];if(nms[s.sede].indexOf(s.solicitante)<0)nms[s.sede].push(s.solicitante);allIds.push(s.id);});
  // Mark as printed
  for(var i=0;i<allIds.length;i++)await API.put('/solicitudes/'+allIds[i]+'/marcar-impreso',{tipo:'pedido'});
  var w=window.open('','_blank');
  var h='<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Pedidos — LuceBien</title><style>'+_pCSS()+'</style></head><body><div class="np"><button onclick="window.print()">🖨️ Imprimir</button></div><div class="sh">';
  h+=_pH('Formato de Solicitud de Pedidos',allIds);
  h+='<div class="ins" style="background:#fefce8;border-color:#d4a735;color:#5c4a00">Escriba la cantidad disponible en la columna "Cant. Disp." · Marque <b style="color:#991b1b">❌ No Hay</b> o <b style="color:#9a3412">🛒 Pedir</b></div>';
  Object.keys(bySede).sort().forEach(function(sede){
    var c=_SC2[sede]||_SC2.AL,ss=bySede[sede],ti=0;ss.forEach(function(s){ti+=(s.items||[]).length;});
    h+='<div class="ss"><div class="sh2" style="background:'+c.bg+';border-color:'+c.bd+';color:'+c.tx+'"><span>'+((SEDES[sede]?.label)||sede).toUpperCase()+'</span><span class="sb2" style="border:1px solid '+c.bd+'">Solicita: '+(nms[sede]||[]).join(', ').toUpperCase()+' · '+ti+' items</span></div>';
    h+='<table><thead><tr><th>Prenda / Artículo</th><th style="width:68px">Color</th><th style="width:64px">Tela</th><th style="width:36px;text-align:center;background:#d8dce8;font-weight:900">Talla</th>';
    h+='<th style="width:42px;text-align:center;font-weight:900">Cant.<br>Solic.</th>';
    h+='<th class="hc hg" style="width:42px">Cant.<br>Disp.</th>';
    h+='<th class="hc hn" style="width:34px">❌<br>No</th><th class="hc hp" style="width:34px">🛒<br>Pedir</th></tr></thead><tbody>';
    ss.forEach(function(s){
      var pr=(s.items||[]).filter(function(i){return i.categoria==='prenda';}),ar=(s.items||[]).filter(function(i){return i.categoria!=='prenda';});
      pr.forEach(function(i){var tm=[(i.tela||''),(i.modelo||'')].filter(Boolean).join(' · ')||'—';h+='<tr><td style="font-weight:700">'+i.tipo+'</td><td>'+(i.color||'—')+'</td><td style="color:#4a5272;font-size:8px">'+tm+'</td><td style="text-align:center;font-weight:800;background:#f7f8fc">'+(i.talla||'—')+'</td><td style="text-align:center;font-weight:800;font-size:11px">'+i.cantidad+'</td><td class="cb-w hg"><div class="qb"></div></td><td class="cb-w hn"><div class="cb"></div></td><td class="cb-w hp"><div class="cb"></div></td></tr>';if(i.obs&&i.obs.trim())h+='<tr class="ob"><td colspan="8">↳ '+i.obs+'</td></tr>';});
      if(ar.length){h+='<tr class="ar"><td colspan="8">Artículos</td></tr>';ar.forEach(function(i){h+='<tr><td style="font-weight:700;color:#4a5272">'+i.tipo+'</td><td style="color:#d8dce8">—</td><td style="color:#d8dce8">—</td><td style="color:#d8dce8">—</td><td style="text-align:center;font-weight:800">'+i.cantidad+'</td><td class="cb-w hg"><div class="qb"></div></td><td class="cb-w hn"><div class="cb"></div></td><td class="cb-w hp"><div class="cb"></div></td></tr>';});}
      if(s.obs&&s.obs.trim())h+='<tr class="nt"><td colspan="8">Nota: '+s.obs+'</td></tr>';
    });
    h+='</tbody></table></div>';
  });
  var fi=[{lb:'Enc. Logístico',nm:(STATE.user?.nombre||'').toUpperCase(),ed:true,dni:_empDNI(STATE.user?.nombre),cg:'Almacén / Admin'},{lb:'Dueña / Enc.',nm:'MARGARITA',ed:true,dni:_empDNI('Margarita'),cg:'Autoriza'}];
  h+=_pF(fi)+'<div class="ftr">LUCEBIEN · Sistema de Control Interno · '+new Date().toLocaleDateString('es-PE')+' '+new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})+'</div></div>';
  h+='<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>';
  w.document.write(h);w.document.close();
  await renderSolicitudes();
}

// ── DOC 2: CONFIRMACIÓN DE ENTREGA ──
async function soliImprimirConfirmacion(idsParam){
  var solis;
  if(idsParam){solis=(STATE.solicitudesCache||[]).filter(function(s){return idsParam.indexOf(s.id)>=0;});}
  else{
    // Bulk: print all delivered/confirmed not yet printed, OR aprobadas not yet printed
    var all=await API.get('/solicitudes');if(!all)return;
    solis=all.filter(function(s){return(s.estado==='aprobada'||s.estado==='entregada'||s.estado==='confirmada')&&!s.confirmacion_impresa;});
    if(!solis.length){showToast('No hay entregas pendientes de imprimir','info');return;}
  }
  if(!solis.length){showToast('Sin solicitudes para imprimir','info');return;}
  var bySede={},nms={},allIds=[];
  solis.forEach(function(s){if(!bySede[s.sede])bySede[s.sede]=[];bySede[s.sede].push(s);if(!nms[s.sede])nms[s.sede]=[];if(nms[s.sede].indexOf(s.solicitante)<0)nms[s.sede].push(s.solicitante);allIds.push(s.id);});
  // Mark as printed
  for(var i=0;i<allIds.length;i++)await API.put('/solicitudes/'+allIds[i]+'/marcar-impreso',{tipo:'confirmacion'});
  var w=window.open('','_blank');
  var h='<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Confirmación — LuceBien</title><style>'+_pCSS()+'</style></head><body><div class="np"><button onclick="window.print()">🖨️ Imprimir</button></div><div class="sh">';
  h+=_pH('Confirmación de Entrega',allIds);
  var gP=0,gE=0;
  Object.keys(bySede).sort().forEach(function(sede){
    var c=_SC2[sede]||_SC2.AL,ss=bySede[sede];
    h+='<div class="ss"><div class="sh2" style="background:'+c.bg+';border-color:'+c.bd+';color:'+c.tx+'"><span>'+((SEDES[sede]?.label)||sede).toUpperCase()+'</span><span class="sb2" style="border:1px solid '+c.bd+'">Recibe: '+(nms[sede]||[]).join(', ').toUpperCase()+'</span></div>';
    h+='<table><thead><tr><th>Prenda / Artículo</th><th style="width:64px">Color</th><th style="width:60px">Tela</th><th style="width:34px;text-align:center;background:#d8dce8;font-weight:900">Talla</th>';
    h+='<th style="width:38px;text-align:center;font-weight:900">Solic.</th>';
    h+='<th style="width:38px;text-align:center;background:rgba(26,122,82,.08);font-weight:900">Entreg.</th>';
    var hasConf=ss.some(function(s){return s.estado==='confirmada';});
    if(hasConf)h+='<th style="width:38px;text-align:center;background:rgba(46,62,110,.08);font-weight:900">Recib.</th>';
    h+='<th style="width:30px;text-align:center">Est.</th></tr></thead><tbody>';
    var sP=0,sE=0;
    ss.forEach(function(s){
      var pr=(s.items||[]).filter(function(i){return i.categoria==='prenda';}),ar=(s.items||[]).filter(function(i){return i.categoria!=='prenda';});
      function rw(i,isA){var ev=i.cantidad_enviada||0,rc=i.cantidad_recibida||0,ic=ev>=i.cantidad?'✅':ev>0?'⚠️':'❌',cl=ev>=i.cantidad?'ok':ev>0?'pc':'nk';sP+=i.cantidad;sE+=ev;var tm=isA?'—':[(i.tela||''),(i.modelo||'')].filter(Boolean).join(' · ')||'—';
      // Get codes for this item
      var itemCods='';
      if(s.codigos_prenda){try{var cd=JSON.parse(s.codigos_prenda);if(Array.isArray(cd)){/* old format - skip per-row */}else if(cd&&cd[String(i.id)]){itemCods=cd[String(i.id)].join(' · ');}}catch(e){}}
      h+='<tr><td style="font-weight:700;'+(isA?'color:#4a5272':'')+'">'+i.tipo+(itemCods?' <span style="font-family:var(--font-m);font-size:7px;color:#2563a8;letter-spacing:.5px">'+itemCods+'</span>':'')+'</td><td>'+(isA?'—':(i.color||'—'))+'</td><td style="color:#4a5272;font-size:8px">'+tm+'</td><td style="text-align:center;font-weight:800;background:#f7f8fc">'+(isA?'—':(i.talla||'—'))+'</td><td class="cn">'+i.cantidad+'</td><td class="cn '+cl+'">'+ev+'</td>';if(hasConf)h+='<td class="cn">'+(s.estado==='confirmada'?rc:'—')+'</td>';h+='<td style="text-align:center;font-size:13px">'+ic+'</td></tr>';}
      pr.forEach(function(i){rw(i,false);});
      if(ar.length){h+='<tr class="ar"><td colspan="'+(hasConf?8:7)+'">Artículos</td></tr>';ar.forEach(function(i){rw(i,true);});}
      h+='<tr class="nt"><td colspan="'+(hasConf?8:7)+'" style="font-size:8px">';
      if(s.aprobado_por)h+='Aprobó: <b>'+s.aprobado_por+'</b> · ';
      if(s.entregado_por)h+='Entregó: <b>'+s.entregado_por+'</b>'+(s.fecha_entrega?' ('+s.fecha_entrega.slice(0,16)+')':'')+' · ';
      if(s.confirmado_por)h+='Confirmó: <b>'+s.confirmado_por+'</b>'+(s.fecha_confirmacion?' ('+s.fecha_confirmacion.slice(0,16)+')':'');
      h+='</td></tr>';
      // Prenda codes — only show global row for old flat-array format
      if(s.codigos_prenda){try{var cds=JSON.parse(s.codigos_prenda);if(Array.isArray(cds)&&cds.length)h+='<tr class="nt"><td colspan="'+(hasConf?8:7)+'" style="font-size:8px">Códigos: <b style="font-family:var(--font-m);letter-spacing:1px">'+cds.join(' · ')+'</b></td></tr>';}catch(e){}}
      if(s.recibe_en_tienda)h+='<tr class="nt"><td colspan="'+(hasConf?8:7)+'" style="font-size:8px">Recibió: <b>'+s.recibe_en_tienda+'</b></td></tr>';
    });
    h+='</tbody></table>';gP+=sP;gE+=sE;
    var pc=sP>0?Math.round((sE/sP)*100):0;
    h+='<div class="rs"><b>Solicitado: '+sP+'</b><b>Entregado: '+sE+'</b><b style="color:'+(pc>=100?'#065f46':'#991b1b')+'">'+pc+'%</b></div></div>';
  });
  var gPc=gP>0?Math.round((gE/gP)*100):0;
  h+='<div style="margin-top:10px;padding:7px 14px;background:rgba(46,62,110,.05);border:1.5px solid #7b8cc4;border-radius:5px;display:flex;justify-content:space-between;font-size:10px;font-weight:800;color:#1e2a4a;z-index:1;position:relative"><span>RESUMEN</span><span>Solicitado: '+gP+'</span><span>Entregado: '+gE+'</span><span>'+gPc+'%</span></div>';
  // Firmas con DNI — use recibe_en_tienda if available
  var fi=[];
  Object.keys(bySede).sort().forEach(function(sede){
    var recibeNombres=bySede[sede].map(function(s){return s.recibe_en_tienda||''}).filter(Boolean);
    var nm=recibeNombres.length?recibeNombres[0].toUpperCase():(nms[sede]||[]).join(' / ').toUpperCase();
    fi.push({lb:'Recibe — '+(SEDES[sede]?.short||sede),nm:nm,ed:true,dni:_empDNI(recibeNombres[0]||(nms[sede]||[])[0]),cg:'Tienda'});
  });
  fi.push({lb:'Entrega',nm:(STATE.user?.nombre||'').toUpperCase(),ed:true,dni:_empDNI(STATE.user?.nombre),cg:'Almacén / Admin'});
  h+=_pF(fi);
  h+='<div class="ftr">LUCEBIEN · Sistema de Control Interno · '+new Date().toLocaleDateString('es-PE')+' '+new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})+'</div></div>';
  h+='<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>';
  w.document.write(h);w.document.close();
  await renderSolicitudes();
}
async function soliImprimirPendientes(){await soliImprimirPedido();}

// ══════════════════════════════════════
// NUEVA SOLICITUD
// ══════════════════════════════════════
var _soliIdx=0;
function abrirNuevaSolicitud(){
  _soliIdx=0;var prev=document.getElementById('soliNuevoModal');if(prev)prev.remove();
  var h='<div id="soliNuevoModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px" onclick="this.remove()"><div style="background:#fff;border-radius:14px;width:95%;max-width:720px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()"><div class="modal-header"><h2>📋 Nueva Solicitud</h2><button class="modal-close" onclick="document.getElementById(\'soliNuevoModal\').remove()">✕</button></div><div style="flex:1;overflow-y:auto;padding:16px">';
  h+='<div style="display:flex;gap:10px;margin-bottom:14px;align-items:center;flex-wrap:wrap">';
  h+='<div><div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px">TU CÓDIGO</div><div style="display:flex;gap:6px;align-items:center"><input type="password" id="suC" class="code-masked" placeholder="••••" inputmode="numeric" autocomplete="off" data-lpignore="true" style="width:70px;padding:7px;text-align:center;border:1.5px solid var(--border);border-radius:8px;font-size:13px" onclick="event.stopPropagation()" oninput="_suV()"><span id="suI" style="font-size:14px">—</span><span id="suN" style="font-size:10px;color:var(--green)"></span></div></div>';
  h+='<div><div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px">URGENCIA</div><div style="display:flex;gap:4px" id="suUB"><button type="button" class="su-ub" data-val="baja" onclick="suUrg(\'baja\')" style="padding:6px 10px;border-radius:6px;border:1.5px solid transparent;background:#f0fdf4;cursor:pointer;font-size:10px;font-weight:700;color:#16a34a">🟢 Baja</button><button type="button" class="su-ub" data-val="media" onclick="suUrg(\'media\')" style="padding:6px 10px;border-radius:6px;border:1.5px solid #ca8a04;background:#fefce8;cursor:pointer;font-size:10px;font-weight:700;color:#ca8a04">🟡 Media</button><button type="button" class="su-ub" data-val="alta" onclick="suUrg(\'alta\')" style="padding:6px 10px;border-radius:6px;border:1.5px solid transparent;background:#fef2f2;cursor:pointer;font-size:10px;font-weight:700;color:#dc2626">🔴 Alta</button></div><input type="hidden" id="suU" value="media"></div>';
  h+='<div style="flex:1;min-width:140px"><div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px">OBSERVACIÓN</div><input type="text" id="suO" placeholder="Ej: Campaña escolar" style="'+_si+';width:100%"></div></div>';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-weight:700;font-size:12px">Items del pedido</span><div style="display:flex;gap:4px"><button class="btn btn-primary btn-xs" onclick="suAdd(\'prenda\')">+ Prenda</button><button class="btn btn-ghost btn-xs" onclick="suAdd(\'articulo\')">+ Artículo</button></div></div>';
  h+='<div id="suItems"></div>';
  h+='</div><div class="modal-footer"><button class="btn btn-ghost" onclick="document.getElementById(\'soliNuevoModal\').remove()">Cancelar</button><button class="btn btn-primary" onclick="suEnviar()">📤 Enviar Solicitud</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend',h);
  suAdd('prenda');
}
function _suV(){var c=document.getElementById('suC')?.value?.trim()||'',ic=document.getElementById('suI'),nm=document.getElementById('suN');if(c.length<4){if(ic)ic.textContent='—';if(nm)nm.textContent='';return;}var f=(STATE.empleadosCache||[]).find(function(e){return e.cod===c});if(f){if(ic)ic.textContent='✅';if(nm)nm.textContent=f.nombre;}else{if(ic)ic.textContent='❌';if(nm)nm.textContent='';}}
function suUrg(v){document.getElementById('suU').value=v;document.querySelectorAll('.su-ub').forEach(function(b){b.style.border=b.dataset.val===v?'1.5px solid '+(v==='alta'?'#dc2626':v==='media'?'#ca8a04':'#16a34a'):'1.5px solid transparent';});}

function suAdd(cat){
  var w=document.getElementById('suItems');if(!w)return;
  var idx=_soliIdx++;var d=document.createElement('div');d.className='soli-item';d.dataset.cat=cat;d.dataset.idx=idx;
  d.style.cssText='padding:10px;margin-bottom:6px;border:1px solid var(--border);border-radius:8px;background:#fafafa';
  var ih='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="display:flex;gap:4px;align-items:center"><span class="badge '+(cat==='prenda'?'badge-navy':'badge-blue')+'" style="font-size:8px;padding:2px 6px">'+cat+'</span><button class="btn btn-ghost btn-xs" onclick="suDup(this)" style="font-size:8px" title="Duplicar">📋</button></div><button class="btn btn-ghost btn-xs" onclick="this.closest(\'.soli-item\').remove()" style="color:var(--red);font-size:10px">✕</button></div>';
  if(cat==='prenda'){
    ih+='<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">';
    ih+='<input type="text" class="si-tipo" placeholder="Tipo" readonly onclick="sDD(this,SOLI_TIPOS,function(){suFields(this.closest(\'.soli-item\'))}.bind(this),false)" style="'+_si+';font-weight:700;width:90px;cursor:pointer" value="Terno">';
    ih+='<div style="display:inline-flex;align-items:center;gap:1px;background:var(--s3);border-radius:7px;padding:1px 5px;border:1.5px solid var(--border)"><button type="button" onclick="suQA(this,-1)" style="width:20px;height:20px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:700">−</button><input type="number" class="si-cant" value="1" min="1" style="width:30px;text-align:center;font-weight:800;font-size:12px;border:none;background:transparent;outline:none" onfocus="this.select()"><button type="button" onclick="suQA(this,1)" style="width:20px;height:20px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:700">+</button></div>';
    ih+='<div class="si-campos" style="display:flex;gap:4px;flex-wrap:wrap;flex:1;align-items:center"></div></div>';
    ih+='<input type="text" class="si-obs" placeholder="Obs." style="'+_si+';width:100%;font-size:10px;margin-top:5px;background:#fff">';
  } else {
    ih+='<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">';
    ih+='<input type="text" class="si-tipo" placeholder="Artículo" readonly onclick="sDD(this,_suArtL(),null,true)" style="'+_si+';flex:1;min-width:140px;cursor:pointer">';
    ih+='<div style="display:inline-flex;align-items:center;gap:1px;background:var(--s3);border-radius:7px;padding:1px 5px;border:1.5px solid var(--border)"><button type="button" onclick="suQA(this,-1)" style="width:20px;height:20px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:700">−</button><input type="number" class="si-cant" value="1" min="1" style="width:30px;text-align:center;font-weight:800;font-size:12px;border:none;background:transparent;outline:none" onfocus="this.select()"><button type="button" onclick="suQA(this,1)" style="width:20px;height:20px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:700">+</button></div>';
    ih+='</div><input type="text" class="si-obs" placeholder="Especificación" style="'+_si+';width:100%;font-size:10px;margin-top:5px;background:#fff">';
  }
  d.innerHTML=ih;w.appendChild(d);
  if(cat==='prenda')suFields(d);
  d.querySelector('.si-cant')?.focus();
}
function _suArtL(){var r=[];Object.values(SOLI_ARTICULOS).forEach(function(a){r=r.concat(a);});return r;}
function suQA(b,d){var i=b.parentNode.querySelector('input[type="number"]');if(!i)return;i.value=Math.max(1,(parseInt(i.value)||1)+d);}
function suDup(btn){var r=btn.closest('.soli-item');if(!r)return;var c=r.cloneNode(true);c.dataset.idx=_soliIdx++;r.parentNode.insertBefore(c,r.nextSibling);var t=c.querySelector('.si-tipo');if(t&&c.dataset.cat==='prenda')t.onclick=function(){sDD(this,SOLI_TIPOS,function(){suFields(this.closest('.soli-item'))}.bind(t),false);};c.querySelectorAll('button[onclick*="suQA"]').forEach(function(b){var delta=b.textContent==='−'?-1:1;b.onclick=function(){suQA(this,delta);};});}

function suFields(row){
  var campos=row.querySelector('.si-campos');if(!campos)return;
  var tipo=row.querySelector('.si-tipo')?.value||'';
  var cfg=SOLI_CFG[tipo];if(!cfg){campos.innerHTML='';return;}
  var h='';
  if(cfg.color){
    h+='<div style="position:relative;display:inline-flex;align-items:center"><span class="si-cdot" style="position:absolute;left:6px;width:12px;height:12px;border-radius:50%;background:#ddd;border:1px solid rgba(0,0,0,.1);pointer-events:none"></span><input type="text" class="si-color" placeholder="Color" readonly onclick="sColorDD(this)" style="'+_si+';width:105px;cursor:pointer;padding-left:24px"></div>';
  }
  if(cfg.talla){
    h+='<input type="text" class="si-talla" placeholder="Talla" readonly onclick="sDD(this,'+JSON.stringify(cfg.talla).replace(/"/g,"'")+',null,false)" style="'+_si+';width:58px;cursor:pointer;text-align:center">';
  }
  if(cfg.tela){
    h+='<input type="text" class="si-tela" placeholder="Tela" readonly onclick="sDD(this,'+JSON.stringify(cfg.tela).replace(/"/g,"'")+',null,true)" style="'+_si+';width:85px;cursor:pointer">';
  }
  if(cfg.mtela){
    h+='<input type="text" class="si-mtela" placeholder="Mod. Tela" readonly onclick="sDD(this,SOLI_MTELA,null,true)" style="'+_si+';width:80px;cursor:pointer">';
  }
  if(cfg.mprenda){
    h+='<input type="text" class="si-mprenda" placeholder="Mod. Prenda" readonly onclick="sDD(this,'+JSON.stringify(cfg.mprenda).replace(/"/g,"'")+',null,true)" style="'+_si+';width:85px;cursor:pointer">';
  }
  if(cfg.modelo&&!cfg.mprenda){
    h+='<input type="text" class="si-modelo" placeholder="Modelo" readonly onclick="sDD(this,'+JSON.stringify(cfg.modelo).replace(/"/g,"'")+',null,true)" style="'+_si+';width:75px;cursor:pointer">';
  }
  if(cfg.desc)h+='<input class="si-detalle" placeholder="Describe" style="flex:1;min-width:80px;'+_si+'">';
  campos.innerHTML=h;
}

async function suEnviar(){
  var c=document.getElementById('suC')?.value?.trim()||'';
  var f=(STATE.empleadosCache||[]).find(function(e){return e.cod===c});
  if(!f){showToast('Ingresa tu código de empleado','error');document.getElementById('suC')?.focus();return;}
  var items=[],valid=true;
  document.querySelectorAll('.soli-item').forEach(function(row){
    var cat=row.dataset.cat,tipo=row.querySelector('.si-tipo')?.value||'',cant=parseInt(row.querySelector('.si-cant')?.value)||1;
    if(!tipo){valid=false;row.style.border='1.5px solid var(--red)';return;}
    var item={categoria:cat,tipo:tipo,cantidad:cant,obs:row.querySelector('.si-obs')?.value||''};
    if(cat==='prenda'){
      var cfg=SOLI_CFG[tipo]||{};
      item.color=row.querySelector('.si-color')?.value||'';
      item.talla=row.querySelector('.si-talla')?.value||'';
      item.tela=row.querySelector('.si-tela')?.value||'';
      var mt=row.querySelector('.si-mtela')?.value||'';
      var mp=row.querySelector('.si-mprenda')?.value||row.querySelector('.si-modelo')?.value||'';
      item.modelo=[mt,mp].filter(Boolean).join(' | ');
      item.detalle=row.querySelector('.si-detalle')?.value||'';
      if(cfg.color&&!item.color){valid=false;row.style.border='1.5px solid var(--red)';return;}
      if(cfg.talla&&!item.talla){valid=false;row.style.border='1.5px solid var(--red)';return;}
    } else {item.detalle=row.querySelector('.si-obs')?.value||'';}
    row.style.border='1px solid var(--border)';
    items.push(item);
  });
  if(!valid){showToast('Completa los campos marcados en rojo','error');return;}
  if(!items.length){showToast('Agrega al menos un item','error');return;}
  var r=await API.post('/solicitudes',{sede:STATE.sede,solicitante:f.nombre,urgencia:document.getElementById('suU')?.value||'media',obs:document.getElementById('suO')?.value||'',items:items});
  if(r&&r.ok){document.getElementById('soliNuevoModal')?.remove();showToast('✅ Solicitud #'+r.id+' enviada','success');await renderSolicitudes();}
}

// ── Exponer en window (compatibilidad con onclick="...") ──
window.renderSolicitudes=renderSolicitudes;
window.abrirNuevaSolicitud=abrirNuevaSolicitud;
window.verDetalleSolicitud=verDetalleSolicitud;
window.soliShowUndo=soliShowUndo;window.soliDoUndo=soliDoUndo;
window.soliToggleChk=soliToggleChk;window.soliSelectAll=soliSelectAll;
window.soliCode=soliCode;window._scV=_scV;window._scC=_scC;
window.soliQA=soliQA;window.soliAAprobar=soliAAprobar;window.soliARechazar=soliARechazar;
window.soliAEntregar=soliAEntregar;window.seSelRecibe=seSelRecibe;window.seAddOtro=seAddOtro;
window.soliConfirmarEntrega=soliConfirmarEntrega;
window.soliImprimir=soliImprimir;window.soliImprimirPedido=soliImprimirPedido;window.soliImprimirConfirmacion=soliImprimirConfirmacion;
window.sDD=sDD;window.sDDPick=sDDPick;window.sDDCustom=sDDCustom;window.sDDClose=sDDClose;
window.sColorDD=sColorDD;window.sColorPick=sColorPick;window.sColorCustom=sColorCustom;
window.suUrg=suUrg;window.suAdd=suAdd;window.suQA=suQA;window.suDup=suDup;window.suFields=suFields;window.suEnviar=suEnviar;window._suV=_suV;
console.log("[LuceBien] solicitudes.js v8 (restaurado) cargado");
