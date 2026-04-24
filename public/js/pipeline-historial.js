// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/pipeline-historial.js
// Historial unificado del pipeline + Envío de accesorios
// Acceso: admin / dueño / encargado_almacen
// ═══════════════════════════════════════════════════════

const PH_TIPO_META = {
  prenda:    { icon:'👕', color:'#1976d2', label:'Prenda' },
  accesorio: { icon:'🎀', color:'#ad1457', label:'Accesorio' },
  lista:     { icon:'📦', color:'#6d4c41', label:'Lista (tienda→almacén)' },
  envio:     { icon:'🚚', color:'#2e7d32', label:'Envío prendas' },
  envio_acc: { icon:'🎁', color:'#ef6c00', label:'Envío accesorios' }
};

let _phDebounce = null;
function renderPipelineHistorialDebounced(){
  if (_phDebounce) clearTimeout(_phDebounce);
  _phDebounce = setTimeout(renderPipelineHistorial, 350);
}

function phLimpiarFiltros(){
  ['phDesde','phHasta','phSede','phTipo','phResp'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value='';
  });
  var s = document.getElementById('phSort'); if (s) s.value='fecha_desc';
  renderPipelineHistorial();
}

async function renderPipelineHistorial(){
  var body = document.getElementById('phBody');
  if (!body) return;
  var params = {
    desde:       (document.getElementById('phDesde')||{}).value || '',
    hasta:       (document.getElementById('phHasta')||{}).value || '',
    sede:        (document.getElementById('phSede') ||{}).value || '',
    tipo:        (document.getElementById('phTipo') ||{}).value || '',
    responsable: (document.getElementById('phResp') ||{}).value || '',
    sort:        (document.getElementById('phSort') ||{}).value || 'fecha_desc'
  };
  Object.keys(params).forEach(function(k){ if(!params[k]) delete params[k]; });

  body.innerHTML = '<div style="color:var(--text3);text-align:center;padding:30px">Cargando historial...</div>';
  var data = await API.pipeHistorial(params);
  if (!data) { body.innerHTML='<div style="color:var(--red);text-align:center;padding:30px">No se pudo cargar (¿permiso denegado?)</div>'; return; }

  // Stats
  var st = document.getElementById('phStats');
  if (st){
    var parts = ['Total: <strong>'+data.stats.total+'</strong>'];
    Object.keys(data.stats.por_tipo||{}).forEach(function(t){
      var m = PH_TIPO_META[t] || {icon:'·', label:t};
      parts.push(m.icon+' '+m.label+': '+data.stats.por_tipo[t]);
    });
    st.innerHTML = parts.join(' · ');
  }

  if (!data.eventos.length){
    body.innerHTML = '<div style="color:var(--text3);text-align:center;padding:30px">Sin eventos con los filtros elegidos</div>';
    return;
  }

  var rows = data.eventos.map(function(ev){
    var m = PH_TIPO_META[ev.tipo] || {icon:'·', color:'#666', label:ev.tipo};
    var fecha = (ev.fecha||'').replace('T',' ').substring(0,16);
    var sedeTxt = ev.sede ? ((SEDES&&SEDES[ev.sede]?SEDES[ev.sede].short:ev.sede)) : '—';
    var linkTraza = (ev.tipo==='lista' && ev.ref_id)
      ? ' <a href="#" onclick="phAbrirTrazaLista('+ev.ref_id+');return false" style="font-size:10px;color:var(--blue)">[ver trazabilidad]</a>'
      : (ev.tipo==='prenda' && ev.lista_id)
        ? ' <a href="#" onclick="phAbrirTrazaLista('+ev.lista_id+');return false" style="font-size:10px;color:var(--blue)">[lista #'+ev.lista_id+']</a>'
        : '';
    var obs = (ev.obs||'').replace(/</g,'&lt;');
    var badgeEnv = (ev.tipo==='accesorio' && ev.enviado) ? ' <span class="badge badge-green" style="font-size:9px">enviado</span>' : '';
    return ''+
      '<div style="display:grid;grid-template-columns:150px 100px 70px 160px 1fr;gap:10px;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;align-items:center">'+
        '<div style="color:var(--text3);font-family:monospace">'+fecha+'</div>'+
        '<div><span class="badge" style="background:'+m.color+'22;color:'+m.color+';font-size:10px">'+m.icon+' '+m.label+'</span></div>'+
        '<div style="font-weight:600">'+sedeTxt+'</div>'+
        '<div>'+(ev.responsable||'—')+'</div>'+
        '<div><strong>'+(ev.accion||'')+'</strong> · '+(ev.ref||'')+badgeEnv+' <span style="color:var(--text3)">'+obs+'</span>'+linkTraza+'</div>'+
      '</div>';
  }).join('');

  body.innerHTML =
    '<div style="display:grid;grid-template-columns:150px 100px 70px 160px 1fr;gap:10px;padding:8px 10px;font-size:10px;text-transform:uppercase;color:var(--text3);border-bottom:2px solid var(--border);font-weight:700">'+
      '<div>Fecha</div><div>Tipo</div><div>Sede</div><div>Responsable</div><div>Detalle</div>'+
    '</div>' + rows;
}

// ── Trazabilidad de una lista ─────────────────────────
async function phAbrirTrazaLista(listaId){
  var data = await API.pipeListaTraza(listaId);
  if (!data) return;
  var L = data.lista;
  var html = ''+
    '<div style="padding:10px"><h3 style="margin:0 0 8px">Lista #'+L.id+' · '+L.sede+' · '+L.tipo+'</h3>'+
    '<div style="font-size:12px;color:var(--text3);margin-bottom:10px">Fecha '+L.fecha+' · Estado <strong>'+L.estado+'</strong> · Resp. inv: '+(L.resp_inv||'—')+' · Traslado: '+(L.resp_traslado||'—')+'</div>'+
    '<div style="font-size:12px;margin-bottom:10px">Accesorios: 👔'+(L.camisas||0)+' · 👕'+(L.corbatas||0)+' · 🎀'+(L.michis||0)+' · 🎀'+(L.corbatones||0)+' · 👞'+(L.zapatos||0)+' · 💼'+(L.porta_ternos||0)+'</div>'+
    '<div style="font-weight:700;margin-top:10px">Prendas asociadas ('+data.prendas.length+')</div>';
  if (data.prendas.length===0){
    html += '<div style="color:var(--text3);font-size:12px;padding:6px">Sin prendas rastreadas en el pipeline</div>';
  } else {
    html += '<div style="max-height:50vh;overflow:auto;margin-top:6px">';
    data.prendas.forEach(function(p){
      html += '<div style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px">'+
        '<div style="font-weight:700">'+(p.codigo||'?')+' · '+(p.tipo||'')+' '+(p.color||'')+' '+(p.talla||'')+' <span class="badge" style="font-size:10px">'+(p.etapa||'')+'</span></div>';
      if (p.historial && p.historial.length){
        html += '<div style="font-size:11px;margin-top:4px">';
        p.historial.forEach(function(h){
          html += '<div>· '+(h.fecha||'').substring(0,16)+' — '+(h.etapa_anterior?h.etapa_anterior+'→':'')+h.etapa_nueva+' · '+(h.responsable||'—')+(h.obs?' · '+h.obs:'')+'</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
  }
  html += '<div style="text-align:right;margin-top:10px"><button class="btn btn-ghost" onclick="phCerrarTraza()">Cerrar</button></div></div>';

  var mod = document.getElementById('phTrazaModal');
  if (!mod){
    mod = document.createElement('div');
    mod.id = 'phTrazaModal';
    mod.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
    mod.onclick = function(e){ if(e.target===mod) phCerrarTraza(); };
    document.body.appendChild(mod);
  }
  mod.innerHTML = '<div style="background:var(--bg);border-radius:12px;max-width:820px;width:92%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4)">'+html+'</div>';
  mod.style.display = 'flex';
}
function phCerrarTraza(){
  var m = document.getElementById('phTrazaModal');
  if (m) m.style.display='none';
}

// ═══════════════════════════════════════════════════════
// ENVÍO DE ACCESORIOS A TIENDA
// ═══════════════════════════════════════════════════════
async function renderEnvioAccesorios(){
  // Default fecha = hoy si está vacío
  var f = document.getElementById('eaFecha');
  if (f && !f.value) f.value = new Date().toISOString().substring(0,10);
  await cargarHistorialEnviosAcc();
}

async function cargarHistorialEnviosAcc(){
  var cont = document.getElementById('eaHistorial');
  if (!cont) return;
  cont.innerHTML = '<div style="color:var(--text3);font-size:12px">Cargando...</div>';
  var data = await API.pipeEnviosAccesorios({});
  if (!data){ cont.innerHTML='<div style="color:var(--red);font-size:12px">No se pudo cargar</div>'; return; }
  var lista = data.envios || data || [];
  if (!Array.isArray(lista)) lista = data.rows || [];
  if (!lista.length){ cont.innerHTML='<div style="color:var(--text3);font-size:12px;padding:20px;text-align:center">Sin envíos registrados todavía</div>'; return; }
  cont.innerHTML = lista.map(function(e){
    var items = (e.items||[]).map(function(it){return it.cantidad+'× '+it.tipo;}).join(', ') || '—';
    var fecha = (e.created_at||e.fecha||'').replace('T',' ').substring(0,16);
    var sedeTxt = SEDES&&SEDES[e.sede_destino]?SEDES[e.sede_destino].short:(e.sede_destino||'—');
    var val = e.validado_tienda
      ? '<span class="badge badge-green" style="font-size:10px">validado</span>'
      : '<span class="badge" style="background:#fff8e1;color:#b26a00;font-size:10px">sin validar</span>';
    return '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;display:grid;grid-template-columns:110px 90px 1fr 110px 90px;gap:10px;align-items:center;font-size:12px">'+
      '<div style="color:var(--text3);font-family:monospace">'+fecha+'</div>'+
      '<div><strong>→ '+sedeTxt+'</strong></div>'+
      '<div>'+items+(e.obs?' <span style="color:var(--text3)">· '+e.obs+'</span>':'')+'</div>'+
      '<div>'+(e.responsable||'—')+'</div>'+
      '<div style="text-align:right">#'+e.id+' '+val+'</div>'+
    '</div>';
  }).join('');
}

async function enviarAccesoriosTienda(){
  var destino = (document.getElementById('eaDestino')||{}).value;
  var fecha   = (document.getElementById('eaFecha')||{}).value;
  var obs     = (document.getElementById('eaObs')||{}).value || '';
  if (!destino){ showToast('Elige la sede destino','error'); return; }
  if (!fecha)  { showToast('Elige la fecha','error'); return; }

  var items = [
    { tipo:'corbata',     cantidad: parseInt((document.getElementById('eaCorbatas')||{}).value)||0 },
    { tipo:'michi',       cantidad: parseInt((document.getElementById('eaMichis')||{}).value)||0 },
    { tipo:'corbaton',    cantidad: parseInt((document.getElementById('eaCorbatones')||{}).value)||0 },
    { tipo:'camisa',      cantidad: parseInt((document.getElementById('eaCamisas')||{}).value)||0 },
    { tipo:'zapato',      cantidad: parseInt((document.getElementById('eaZapatos')||{}).value)||0 },
    { tipo:'porta_terno', cantidad: parseInt((document.getElementById('eaPortaTernos')||{}).value)||0 }
  ].filter(function(it){ return it.cantidad > 0; });

  if (!items.length){ showToast('Agrega al menos un accesorio con cantidad > 0','error'); return; }

  var res = await API.pipeCrearEnvioAcc({
    sede_destino: destino,
    fecha: fecha,
    items: items,
    obs: obs
  });
  if (!res) return;
  showToast('Envío #'+(res.id||'?')+' registrado','success');
  limpiarFormEnvioAcc();
  cargarHistorialEnviosAcc();
}

function limpiarFormEnvioAcc(){
  ['eaCorbatas','eaMichis','eaCorbatones','eaCamisas','eaZapatos','eaPortaTernos'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '0';
  });
  var obs = document.getElementById('eaObs'); if (obs) obs.value='';
}

// Exponer globalmente
window.renderPipelineHistorial = renderPipelineHistorial;
window.renderPipelineHistorialDebounced = renderPipelineHistorialDebounced;
window.phLimpiarFiltros = phLimpiarFiltros;
window.phAbrirTrazaLista = phAbrirTrazaLista;
window.phCerrarTraza = phCerrarTraza;
window.renderEnvioAccesorios = renderEnvioAccesorios;
window.enviarAccesoriosTienda = enviarAccesoriosTienda;
window.limpiarFormEnvioAcc = limpiarFormEnvioAcc;
