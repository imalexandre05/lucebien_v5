// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/admin.js v4.3
// ═══════════════════════════════════════════════════════

// Animated counter - numbers count up from 0
function animateCounters(container) {
  if (!container) return;
  container.querySelectorAll('.stat-val').forEach(function(el) {
    var text = el.textContent.trim();
    var num = parseInt(text);
    if (isNaN(num) || num === 0) return;
    var suffix = text.replace(String(num), '');
    var duration = Math.min(800, Math.max(300, num * 15));
    var start = performance.now();
    el.textContent = '0' + suffix;
    el.style.animation = 'counterUp .3s ease both';
    function tick(now) {
      var progress = Math.min((now - start) / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      el.textContent = Math.round(num * ease) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// ── DASHBOARD ─────────────────────────────────────────
async function renderDashboard() {
  const fs  = document.getElementById('dashFiltroSede')?.value||'';
  const sub = document.getElementById('dashSub');
  if(sub)sub.textContent=`${fs?SEDES[fs]?.label:'Todas las sedes'}  ·  ${hoyLocal()}`;

  // 1) Snapshot ejecutivo (único endpoint nuevo)
  let snap = null;
  try {
    snap = await API.get('/dashboard/admin' + (fs?('?sede='+encodeURIComponent(fs)):''));
  } catch(e) {}
  if (snap) {
    renderDashKpisV2(snap.kpis, snap.tendencia_7d||{});
    renderDashAlertas(snap.alertas_criticas||[]);
    renderDashPipeline(snap.pipeline_estado||{});
    renderDashProxEvals(snap.proximas_evaluaciones||[]);
    renderDashSalud(snap.salud_sistema);
    renderDashTendencia(snap.tendencia_7d||{});
    renderDashResumenSedes(snap.resumen_sedes||{});
    var upd = document.getElementById('dashUpdated');
    if (upd) upd.textContent = 'actualizado ' + new Date(snap.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  }

  // 2) Las secciones legacy (ranking, desempeño, lavandería) siguen
  //    leyendo sus endpoints viejos para no romper nada hasta que se
  //    migren al snapshot.
  const params={}; if(fs)params.sede=fs;
  const [reps,incs]=await Promise.all([API.reportes(params),API.incidencias(params)]);
  if (reps) {
    renderAlertas(fs);
    renderRanking(reps);
    renderDesempenoTiendas(reps);
    renderIncidenciasDash(incs||[]);
    renderLavStats();
    renderPipelineRanking();
    renderActIncumplidas(reps);
  }
}

// ═══════════════════════════════════════════════════════
// DASHBOARD V2 — secciones nuevas alimentadas por snapshot
// ═══════════════════════════════════════════════════════

const DASH_KPI_SPECS = [
  { key:'prendas_en_proceso',     label:'Prendas en almacén',          sub:'lavándose, planchándose, etc.',          accent:'navy',  goto:'kanban-almacen' },
  { key:'reportes_hoy',           label:'Reportes enviados hoy',       sub:'cuántos turnos ya cerraron',             accent:'gold',  goto:'reporte' },
  { key:'reportes_sin_evaluar',   label:'Reportes por evaluar',        sub:'el siguiente turno debe calificarlos',   accent:'gold',  goto:'evaluacion' },
  { key:'solicitudes_pendientes', label:'Solicitudes por aprobar',     sub:'tiendas piden cosas al almacén',         accent:'blue',  goto:'solicitudes' },
  { key:'envios_sin_validar',     label:'Envíos sin confirmar',        sub:'la tienda no acusó recibo',              accent:'red',   goto:'pipeline-envios' },
  { key:'prendas_observadas',     label:'Prendas con problema',        sub:'devueltas por calidad',                  accent:'red',   goto:'kanban-almacen' },
  { key:'incidencias_hoy',        label:'Incidencias del día',         sub:'algo pasó, revisarlo',                   accent:'red',   goto:'incidencias-admin' },
  { key:'incidencias_mes',        label:'Incidencias del mes',         sub:'total acumulado',                        accent:'gold',  goto:'incidencias-admin' }
];

function renderDashKpisV2(kpis, tendencia) {
  var c = document.getElementById('dashKpis');
  if (!c || !kpis) return;
  // Las series del backend van en orden cronológico ascendente (6 días atrás → hoy).
  // Usamos las 2 últimas (ayer y hoy) para el delta.
  var serieDelta = {
    reportes_hoy:    (tendencia && tendencia.reportes)    || [],
    incidencias_hoy: (tendencia && tendencia.incidencias) || []
  };
  c.innerHTML = DASH_KPI_SPECS.map(function(s){
    var v = kpis[s.key]||0;
    var deltaHtml = '';
    if (serieDelta[s.key] && serieDelta[s.key].length>=2) {
      var hoy = serieDelta[s.key][serieDelta[s.key].length-1]||0;
      var ayer = serieDelta[s.key][serieDelta[s.key].length-2]||0;
      var d = hoy - ayer;
      var sign = d>0?'▲':d<0?'▼':'•';
      var cls = (s.key==='incidencias_hoy')
                ? (d>0?'down':d<0?'up':'flat')   // más incidencias = malo
                : (d>0?'up':d<0?'down':'flat');
      deltaHtml = '<div class="dash-kpi-delta '+cls+'">'+sign+' '+Math.abs(d)+' vs ayer</div>';
    }
    return '<div class="dash-kpi accent-'+s.accent+'" onclick="goTo(\''+s.goto+'\')">' +
           '<div class="dash-kpi-val">'+v+'</div>' +
           '<div class="dash-kpi-lbl">'+s.label+'</div>' +
           '<div class="dash-kpi-sub">'+s.sub+'</div>' +
           deltaHtml +
           '</div>';
  }).join('');
}

function renderDashAlertas(alertas) {
  var c = document.getElementById('dashAlertasCriticas');
  if (!c) return;
  if (!alertas.length) {
    c.innerHTML = '<div class="dash-no-alertas">✓ Sin alertas críticas en este momento</div>';
    return;
  }
  c.innerHTML = '<div class="dash-alertas-grid">' +
    alertas.slice(0,6).map(function(a){
      return '<div class="dash-alerta dash-alerta-'+a.nivel+'" onclick="goTo(\''+a.goto+'\')">' +
             '<div class="dash-alerta-icon">'+(a.nivel==='alta'?'⚠':a.nivel==='media'?'!':'·')+'</div>' +
             '<div class="dash-alerta-body">' +
               '<div class="dash-alerta-t">'+a.titulo+'</div>' +
               '<div class="dash-alerta-d">'+a.detalle+'</div>' +
             '</div></div>';
    }).join('') + '</div>';
}

const DASH_ETAPAS_ORDER = ['recepcion','lavado','empatado','refaccion','compostura','planchado','control_calidad','listo'];
const DASH_ETAPAS_LBL = {recepcion:'Recepción',lavado:'Lavado',empatado:'Empatado',refaccion:'Refacción',compostura:'Compostura',planchado:'Planchado',control_calidad:'Calidad',listo:'Listo'};
const DASH_ETAPAS_COLOR = {recepcion:'#94a3b8',lavado:'#2563a8',empatado:'#b8a515',refaccion:'#c8651a',compostura:'#7c3aed',planchado:'#0e7490',control_calidad:'#1a7a52',listo:'#b8a515'};

function renderDashPipeline(estado) {
  var c = document.getElementById('dashPipelineEstado');
  if (!c) return;
  var total = DASH_ETAPAS_ORDER.reduce(function(s,e){return s+(estado[e]||0)},0);
  var badge = document.getElementById('dashPipeTotal');
  if (badge) badge.textContent = total;
  if (total === 0) {
    c.innerHTML = '<div style="color:var(--text3);font-size:11px;text-align:center;padding:20px">Sin prendas en proceso</div>';
    return;
  }
  // Donut SVG: radio 38, stroke 12, perímetro 2π·38 ≈ 238.76
  var R=38, C0=2*Math.PI*R;
  var offset = 0;
  var donutSegs = '';
  DASH_ETAPAS_ORDER.forEach(function(et){
    var n = estado[et]||0;
    if (!n) return;
    var frac = n / total;
    var len = +(C0*frac).toFixed(2);
    donutSegs += '<circle cx="50" cy="50" r="'+R+'" fill="none" stroke="'+DASH_ETAPAS_COLOR[et]+'" stroke-width="12" '+
                 'stroke-dasharray="'+len+' '+(C0-len).toFixed(2)+'" '+
                 'stroke-dashoffset="'+(-offset)+'" '+
                 'transform="rotate(-90 50 50)"></circle>';
    offset += len;
  });
  var leyenda = DASH_ETAPAS_ORDER.map(function(et){
    var n = estado[et]||0;
    if (!n) return '';
    var pct = Math.round((n/total)*100);
    return '<div class="dash-pipe-leg">' +
           '<span class="dash-pipe-leg-dot" style="background:'+DASH_ETAPAS_COLOR[et]+'"></span>' +
           '<span class="dash-pipe-leg-lbl">'+DASH_ETAPAS_LBL[et]+'</span>' +
           '<span class="dash-pipe-leg-num">'+n+'</span>' +
           '<span class="dash-pipe-leg-pct">'+pct+'%</span>' +
           '</div>';
  }).join('');
  c.innerHTML =
    '<div class="dash-pipe-wrap">' +
      '<div class="dash-pipe-donut">' +
        '<svg viewBox="0 0 100 100" width="120" height="120">' +
          '<circle cx="50" cy="50" r="'+R+'" fill="none" stroke="var(--s3)" stroke-width="12"></circle>' +
          donutSegs +
        '</svg>' +
        '<div class="dash-pipe-donut-center">' +
          '<div class="dash-pipe-donut-num">'+total+'</div>' +
          '<div class="dash-pipe-donut-lbl">en proceso</div>' +
        '</div>' +
      '</div>' +
      '<div class="dash-pipe-legends">'+leyenda+'</div>' +
    '</div>';
}

function renderDashProxEvals(lista) {
  var c = document.getElementById('dashProxEvals');
  if (!c) return;
  var badge = document.getElementById('dashProxEvalsBadge');
  if (badge) badge.textContent = lista.length;
  if (!lista.length) {
    c.innerHTML = '<div style="color:var(--text3);font-size:11px;text-align:center;padding:20px">Ningún colaborador cierra ciclo en los próximos 7 días</div>';
    return;
  }
  c.innerHTML = '<div class="dash-eval-help">Estos colaboradores terminan su ciclo y necesitan que les calcules su nota y registres el pago.</div>' +
    lista.slice(0,8).map(function(e){
    var urg = e.dias_faltan<=1 ? 'urg' : e.dias_faltan<=3 ? 'warn' : '';
    var diasTxt = e.dias_faltan===0 ? 'hoy cierra' : e.dias_faltan===1 ? 'mañana' : 'en '+e.dias_faltan+' días';
    return '<div class="dash-eval-row '+urg+'" onclick="iniciarEvalMensual(\''+e.emp_id+'\')" title="Click para evaluar y registrar pago">' +
           '<div class="dash-eval-name">'+e.nombre+'</div>' +
           '<div class="dash-eval-meta">'+(SEDES[e.sede]&&SEDES[e.sede].short||e.sede||'—')+' · cierra '+e.cierre+'</div>' +
           '<div class="dash-eval-dias">'+diasTxt+'</div>' +
           '</div>';
  }).join('');
}

function renderDashSalud(salud) {
  var c = document.getElementById('dashSalud');
  var card = document.getElementById('dashSaludCard');
  if (!c) return;
  if (!salud) { if (card) card.style.display='none'; return; }
  if (card) card.style.display='';
  // Items con lenguaje claro + acción concreta. Cada uno dice qué pasa,
  // por qué importa y a dónde ir a resolverlo.
  var items = [
    {
      ok: salud.empleados_sin_fecha_ingreso === 0,
      lbl: salud.empleados_sin_fecha_ingreso > 0
        ? salud.empleados_sin_fecha_ingreso + ' colaborador(es) sin fecha de ingreso'
        : 'Todos los colaboradores tienen fecha de ingreso',
      hint: 'Sin esa fecha no podemos calcular el ciclo personal de pago',
      cta: salud.empleados_sin_fecha_ingreso > 0 ? { lbl:'Completar', goto:'empleados' } : null
    },
    {
      ok: salud.evaluaciones_mes_pendientes === 0,
      lbl: salud.evaluaciones_mes_pendientes > 0
        ? salud.evaluaciones_mes_pendientes + ' evaluación(es) mensual(es) sin cerrar'
        : 'Evaluaciones del mes al día',
      hint: 'Cada colaborador necesita su evaluación cerrada para generar pago',
      cta: salud.evaluaciones_mes_pendientes > 0 ? { lbl:'Evaluar', goto:'evaluacion-mensual' } : null
    },
    {
      ok: salud.audit_log_hoy > 0,
      lbl: salud.audit_log_hoy > 0
        ? salud.audit_log_hoy + ' acción(es) registradas hoy'
        : 'Sin actividad auditada hoy',
      hint: 'La auditoría guarda quién hizo qué en cada cambio importante',
      cta: { lbl:'Ver auditoría', goto:'audit-log' }
    },
    {
      ok: salud.backup_dirs >= 3,
      lbl: salud.backup_dirs + ' copia(s) de seguridad disponibles',
      hint: salud.backup_dirs < 3
        ? 'Recomendamos tener 3 o más por si la BD falla'
        : 'Backups automáticos cada 24h activos'
    },
    {
      ok: salud.horario_slots > 0,
      lbl: salud.horario_slots > 0
        ? salud.horario_slots + ' turnos programados en el horario'
        : 'No hay horarios cargados',
      hint: 'Los horarios definen cuántos reportes esperar de cada colaborador',
      cta: salud.horario_slots === 0 ? { lbl:'Configurar', goto:'horarios-admin' } : null
    }
  ];
  c.innerHTML = items.map(function(i){
    var hint = i.hint ? '<div class="dash-salud-hint">'+i.hint+'</div>' : '';
    var cta = i.cta ? '<button class="dash-salud-cta" onclick="goTo(\''+i.cta.goto+'\')">'+i.cta.lbl+' →</button>' : '';
    var icon = i.ok ? '<span class="dash-salud-icon ok">✓</span>' : '<span class="dash-salud-icon bad">!</span>';
    return '<div class="dash-salud-row2 '+(i.ok?'ok':'bad')+'">' +
           icon +
           '<div class="dash-salud-body">' +
             '<div class="dash-salud-lbl2">'+i.lbl+'</div>' +
             hint +
           '</div>' +
           cta +
           '</div>';
  }).join('');
}

function renderDashTendencia(t) {
  var c = document.getElementById('dashTendencia');
  if (!c) return;
  if (!t.fechas || !t.fechas.length) { c.innerHTML='<div style="color:var(--text3);font-size:11px">Sin datos</div>'; return; }
  function spark(serie, color, lbl) {
    var max = Math.max.apply(null, serie.concat([1]));
    var bars = serie.map(function(v,i){
      var h = Math.max(2, Math.round((v/max)*42));
      return '<div class="dash-spark-bar" style="height:'+h+'px;background:'+color+'" title="'+t.fechas[i]+': '+v+'"></div>';
    }).join('');
    var total = serie.reduce(function(s,n){return s+n;},0);
    var hoyV = serie[serie.length-1]||0;
    var prev = serie[serie.length-2]||0;
    var delta = hoyV - prev;
    var deltaSign = delta>0?'▲':delta<0?'▼':'→';
    var deltaColor = delta>0?'var(--green)':delta<0?'var(--red)':'var(--text3)';
    return '<div class="dash-spark">' +
           '<div class="dash-spark-head"><span class="dash-spark-lbl">'+lbl+'</span><span class="dash-spark-tot">'+total+'</span></div>' +
           '<div class="dash-spark-bars">'+bars+'</div>' +
           '<div class="dash-spark-foot"><span style="color:'+deltaColor+'">'+deltaSign+' '+Math.abs(delta)+'</span> vs ayer</div>' +
           '</div>';
  }
  c.innerHTML =
    spark(t.reportes||[],          'var(--navy)', 'Reportes') +
    spark(t.incidencias||[],       'var(--red)',  'Incidencias') +
    spark(t.pipeline_acciones||[], 'var(--gold-d)','Acciones pipeline');
}

function renderDashResumenSedes(rs) {
  var c = document.getElementById('dashResumenSedes');
  if (!c) return;
  var keys = ['LB','ST','TR','AL'];
  c.innerHTML = '<div class="dash-sedes-grid">' + keys.map(function(s){
    var d = rs[s] || {reportes_hoy:0, incidencias_hoy:0, empleados_activos:0};
    return '<div class="dash-sede-card">' +
           '<div class="dash-sede-lbl">'+(SEDES[s]&&SEDES[s].short||s)+'</div>' +
           '<div class="dash-sede-row"><span>Reportes</span><strong>'+d.reportes_hoy+'</strong></div>' +
           '<div class="dash-sede-row"><span>Incidencias</span><strong style="color:'+(d.incidencias_hoy>0?'var(--red)':'inherit')+'">'+d.incidencias_hoy+'</strong></div>' +
           '<div class="dash-sede-row"><span>Equipo</span><strong>'+d.empleados_activos+'</strong></div>' +
           '</div>';
  }).join('') + '</div>';
}

function renderKpis(reps,incs) {
  const c=document.getElementById('dashKpis');if(!c)return;
  const ev=reps.filter(r=>r.evaluado).length;
  const avg=reps.length?Math.round(reps.reduce((s,r)=>s+(r.puntaje||0),0)/reps.length):0;
  c.innerHTML=`
    <div class="stat-card accent-navy"><div class="stat-label">Reportes</div><div class="stat-val">${reps.length}</div><div class="stat-sub">${ev} evaluados</div></div>
    <div class="stat-card accent-gold"><div class="stat-label">Puntaje promedio</div><div class="stat-val" style="color:var(--gold-d)">${avg}%</div><div class="stat-sub">promedio general</div></div>
    <div class="stat-card accent-red"><div class="stat-label">Incidencias</div><div class="stat-val" style="color:var(--red)">${incs.length}</div><div class="stat-sub">total registradas</div></div>
    <div class="stat-card accent-green"><div class="stat-label">Completados hoy</div><div class="stat-val" style="color:var(--green)">${reps.filter(r=>r.fecha===hoyLocal()).length}</div><div class="stat-sub">reportes de hoy</div></div>`;
  animateCounters(c);
}

async function renderAlertas(fs) {
  const c=document.getElementById('dashAlertas');if(!c)return;
  const sedes=fs?[fs]:Object.keys(SEDES);
  // Render grid de cards por sede con estado claro de M/T y evaluación
  var datas = await Promise.all(sedes.map(function(s){ return API.alertas(s).catch(function(){return null;}); }));
  var html = '<div class="dash-sedes-status">';
  sedes.forEach(function(sed, i){
    var d = datas[i] || {tieneM:false,tieneT:false,pendEval:false};
    var label = (SEDES[sed]&&SEDES[sed].label)||sed;
    var short = (SEDES[sed]&&SEDES[sed].short)||sed;
    var allOk = d.tieneM && d.tieneT && !d.pendEval;
    var stateCls = allOk ? 'ok' : (d.tieneM||d.tieneT ? 'partial' : 'missing');
    function dot(estado, lbl) {
      var cls = estado === 'ok' ? 'on' : estado === 'warn' ? 'warn' : 'off';
      var icon = estado === 'ok' ? '✓' : estado === 'warn' ? '!' : '·';
      return '<div class="dash-shift-dot '+cls+'" title="'+lbl+'">'+
             '<span class="dot-ic">'+icon+'</span><span class="dot-lbl">'+lbl+'</span></div>';
    }
    var dM = d.tieneM ? dot('ok','Mañana enviado') : dot('off','Sin reporte M');
    var dT = d.tieneT ? dot('ok','Tarde enviado')  : dot('off','Sin reporte T');
    var dE = d.pendEval ? dot('warn','Sin evaluar') : (d.tieneM||d.tieneT ? dot('ok','Evaluados') : dot('off','—'));
    html += '<div class="dash-sede-card-status '+stateCls+'">' +
              '<div class="dash-sede-card-head">' +
                '<div class="dash-sede-card-title">'+label+'</div>' +
                '<div class="dash-sede-card-tag">'+short+'</div>' +
              '</div>' +
              '<div class="dash-sede-card-body">' +
                dM + dT + dE +
              '</div>' +
              '<div class="dash-sede-card-foot">' +
                (allOk ? '✓ Día completo'
                       : d.pendEval ? 'Falta evaluación del siguiente turno'
                       : (!d.tieneM && !d.tieneT) ? 'Sin actividad reportada hoy'
                       : 'Falta '+(!d.tieneM?'Mañana':'')+(!d.tieneM&&!d.tieneT?' y ':'')+(!d.tieneT?'Tarde':'')) +
              '</div>' +
            '</div>';
  });
  html += '</div>';
  c.innerHTML = html;
}

function renderRanking(reps) {
  const c=document.getElementById('dashRanking');if(!c)return;
  const scores={};
  reps.forEach(r=>(r.trabajadores||[]).forEach(n=>{
    if(!scores[n])scores[n]={total:0,count:0};
    scores[n].total+=r.puntaje||0;scores[n].count++;
  }));
  const ranking=Object.entries(scores)
    .map(([n,s])=>({n,avg:s.count>0?Math.round(s.total/s.count):0,cnt:s.count,
      ini:(STATE.empleadosCache.find(e=>e.nombre===n)?.iniciales||n.slice(0,2).toUpperCase()),
      tienda:(STATE.empleadosCache.find(e=>e.nombre===n)?.tiendas||['—'])[0]}))
    .filter(r=>r.cnt>0).sort((a,b)=>b.avg-a.avg).slice(0,8);
  if(!ranking.length){c.innerHTML='<div style="color:var(--text3);font-size:12px;font-family:var(--font-m)">Sin datos aún</div>';return;}
  const rcls=['rank-1','rank-2','rank-3'];
  c.innerHTML=ranking.map((r,i)=>`
    <div class="rank-item">
      <div class="rank-num ${rcls[i]||'rank-other'}">${i+1}</div>
      <div class="rank-avatar">${r.ini}</div>
      <div style="flex:1"><div class="rank-name">${r.n}</div>
        <div class="rank-sede">${SEDES[r.tienda]?.short||r.tienda} · ${r.cnt} reportes</div></div>
      <div class="rank-score">${r.avg}%</div>
    </div>`).join('');
}

function renderDesempenoTiendas(reps) {
  const c=document.getElementById('dashTiendas');if(!c)return;
  const por={};Object.keys(SEDES).forEach(s=>{por[s]={total:0,count:0};});
  reps.forEach(r=>{if(!por[r.sede])por[r.sede]={total:0,count:0};por[r.sede].total+=r.puntaje||0;por[r.sede].count++;});
  const data=Object.entries(por).map(([s,v])=>({label:SEDES[s]?.short||s,avg:v.count>0?Math.round(v.total/v.count):0})).sort((a,b)=>b.avg-a.avg);
  const cols=['#2e3e6e','#b8a515','#1a7a52','#2563a8'];
  c.innerHTML=`<div class="bar-chart">${data.map((d,i)=>`
    <div class="bar-row">
      <div class="bar-label">${d.label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${d.avg}%;background:${cols[i%cols.length]}"></div></div>
      <div class="bar-val">${d.avg}%</div>
    </div>`).join('')}</div>`;
}

function renderIncidenciasDash(incs) {
  var c = document.getElementById('dashIncidencias'); if (!c) return;
  if (!incs || !incs.length) {
    c.innerHTML = '<div style="text-align:center;padding:30px;color:var(--green);font-size:13px;font-weight:600">✓ Sin incidencias registradas en el periodo</div>';
    return;
  }
  // Stats principales
  var pN = {Alto:0, Medio:0, Bajo:0};
  var porSede = {};
  var porTipo = {};
  incs.forEach(function(i){
    pN[i.nivel] = (pN[i.nivel]||0) + 1;
    if (i.sede) porSede[i.sede] = (porSede[i.sede]||0) + 1;
    if (i.tipo) porTipo[i.tipo] = (porTipo[i.tipo]||0) + 1;
  });
  var puntosTotales = incs.reduce(function(s,i){ return s + (parseFloat(i.puntos_penalidad)||0); }, 0);
  var sedeMax = Object.entries(porSede).sort(function(a,b){return b[1]-a[1];})[0];
  var tipoMax = Object.entries(porTipo).sort(function(a,b){return b[1]-a[1];})[0];

  var html = '';
  // Header con total + sede más afectada + tipo más común
  html += '<div class="dash-inc-summary">' +
            '<div class="dash-inc-total">' +
              '<div class="dash-inc-total-num">'+incs.length+'</div>' +
              '<div class="dash-inc-total-lbl">incidencias</div>' +
              '<div class="dash-inc-total-sub">−'+puntosTotales.toFixed(1)+' pts en penalidades</div>' +
            '</div>' +
            '<div class="dash-inc-meta">' +
              (sedeMax ? '<div class="dash-inc-meta-row"><span class="lbl">Sede más afectada</span><span class="val"><strong>'+((SEDES[sedeMax[0]]&&SEDES[sedeMax[0]].short)||sedeMax[0])+'</strong> · '+sedeMax[1]+'</span></div>' : '') +
              (tipoMax ? '<div class="dash-inc-meta-row"><span class="lbl">Tipo más frecuente</span><span class="val"><strong>'+tipoMax[0]+'</strong> · '+tipoMax[1]+'×</span></div>' : '') +
            '</div>' +
          '</div>';
  // Distribución por nivel (barra apilada)
  var totalLvl = pN.Alto + pN.Medio + pN.Bajo;
  var pctA = totalLvl ? (pN.Alto/totalLvl*100) : 0;
  var pctM = totalLvl ? (pN.Medio/totalLvl*100) : 0;
  var pctB = totalLvl ? (pN.Bajo/totalLvl*100) : 0;
  html += '<div class="dash-inc-bar">' +
            '<div class="dash-inc-seg alto"  style="width:'+pctA.toFixed(2)+'%" title="Alto: '+pN.Alto+'">'+(pctA>=12?pN.Alto:'')+'</div>' +
            '<div class="dash-inc-seg medio" style="width:'+pctM.toFixed(2)+'%" title="Medio: '+pN.Medio+'">'+(pctM>=12?pN.Medio:'')+'</div>' +
            '<div class="dash-inc-seg bajo"  style="width:'+pctB.toFixed(2)+'%" title="Bajo: '+pN.Bajo+'">'+(pctB>=12?pN.Bajo:'')+'</div>' +
          '</div>' +
          '<div class="dash-inc-bar-leg">' +
            '<span><span class="ld alto"></span> Alto: <strong>'+pN.Alto+'</strong></span>' +
            '<span><span class="ld medio"></span> Medio: <strong>'+pN.Medio+'</strong></span>' +
            '<span><span class="ld bajo"></span> Bajo: <strong>'+pN.Bajo+'</strong></span>' +
          '</div>';
  // Últimas 5 con descripción y responsable
  html += '<div class="dash-inc-list-title">Últimas registradas</div>';
  var bdgs = {Alto:'badge-red', Medio:'badge-yellow', Bajo:'badge-green'};
  html += incs.slice(-5).reverse().map(function(inc){
    var fecha = (inc.fecha||'').slice(5,10);
    return '<div class="dash-inc-item">' +
             '<span class="badge '+(bdgs[inc.nivel]||'badge-gray')+'" style="font-size:9px">'+inc.nivel+'</span>' +
             '<div class="dash-inc-item-body">' +
               '<div class="dash-inc-item-tit">'+(inc.descripcion||inc.tipo||'—')+'</div>' +
               '<div class="dash-inc-item-meta">' +
                 (inc.tipo?'<span>'+inc.tipo+'</span>':'') +
                 (inc.responsable?'<span>· '+inc.responsable+'</span>':'') +
                 '<span>· '+((SEDES[inc.sede]&&SEDES[inc.sede].short)||inc.sede||'—')+'</span>' +
                 (fecha?'<span>· '+fecha+'</span>':'') +
               '</div>' +
             '</div>' +
             (inc.puntos_penalidad?'<span class="dash-inc-item-pts">−'+inc.puntos_penalidad+'</span>':'') +
           '</div>';
  }).join('');
  html += '<button class="dash-inc-btn-all" onclick="goTo(\'incidencias-admin\')">Ver todas las incidencias →</button>';
  c.innerHTML = html;
}

async function renderLavStats() {
  const listas=await API.listas({});if(!listas)return;
  const c=document.getElementById('dashLavStats');const body=document.getElementById('dashLavBody');
  const enP=listas.filter(l=>l.estado==='En proceso').length;
  const proc=listas.filter(l=>l.estado==='Procesado').length;
  const dev=listas.filter(l=>['Devuelto','Validado'].includes(l.estado)).length;
  const totalTernos=listas.reduce((s,l)=>s+(l.prendas||0),0);
  // Per-tienda breakdown
  const porTienda={};
  listas.forEach(l=>{if(!porTienda[l.sede])porTienda[l.sede]={listas:0,prendas:0};porTienda[l.sede].listas++;porTienda[l.sede].prendas+=(l.prendas||0);});
  if(c)c.innerHTML=`
    <div class="stat-card accent-yellow"><div class="stat-label">En proceso</div><div class="stat-val" style="color:var(--yellow)">${enP}</div></div>
    <div class="stat-card accent-blue"><div class="stat-label">Procesadas</div><div class="stat-val" style="color:var(--blue)">${proc}</div></div>
    <div class="stat-card accent-green"><div class="stat-label">Devueltas</div><div class="stat-val" style="color:var(--green)">${dev}</div></div>
    <div class="stat-card accent-navy"><div class="stat-label">Total ternos</div><div class="stat-val">${totalTernos}</div></div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${Object.entries(porTienda).map(([s,v])=>`<div style="flex:1;min-width:120px;padding:8px 12px;background:var(--s3);border-radius:var(--r);text-align:center"><div style="font-size:10px;font-weight:700;color:var(--text3)">${SEDES[s]?.short||s}</div><div style="font-weight:800;font-size:14px">${v.listas} listas</div><div style="font-size:10px;color:var(--text2)">${v.prendas} prendas</div></div>`).join('')}`;
  if(body){
    const sb={'En proceso':'badge-yellow','Procesado':'badge-blue','Devuelto':'badge-green','Validado':'badge-navy','Devuelto-Observado':'badge-red'};
    body.innerHTML=listas.slice(0,8).map(l=>`
      <tr>
        <td><span class="badge badge-navy mono">${l.id}</span></td>
        <td><span class="badge ${l.tipo==='LAV'?'badge-blue':'badge-gold'}">${l.tipo}</span></td>
        <td>${SEDES[l.sede]?.label||l.sede}</td><td>${l.prendas}</td>
        <td><span class="badge ${sb[l.estado]||'badge-gray'}">${l.estado}</span></td>
        <td class="mono" style="font-size:11px">${l.fecha}</td>
      </tr>`).join('');
  }
}

// ── PIPELINE RANKING (Almacén) — con filtro de fecha ──
var _pipeRangoActivo = 'semana'; // 'hoy' | 'semana' | 'mes' | '30d'

window.dashPipeSetRango = function(rango){
  _pipeRangoActivo = rango;
  renderPipelineRanking();
};

async function renderPipelineRanking() {
  var c = document.getElementById('dashPipelineRank');
  if (!c) return;
  // Calcular el rango según botón activo
  function ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  var hoy = new Date();
  var desde, hasta = ymd(hoy), titulo = '';
  if (_pipeRangoActivo === 'hoy') {
    desde = ymd(hoy); titulo = 'Hoy';
  } else if (_pipeRangoActivo === 'mes') {
    desde = ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); titulo = 'Este mes';
  } else if (_pipeRangoActivo === '30d') {
    var d30 = new Date(hoy); d30.setDate(d30.getDate()-29); desde = ymd(d30); titulo = 'Últimos 30 días';
  } else {
    var dSem = new Date(hoy); dSem.setDate(dSem.getDate() - dSem.getDay()); desde = ymd(dSem); titulo = 'Esta semana';
  }
  // Endpoint ranking soporta solo "semana actual" — filtramos del lado cliente leyendo bitacora
  // si necesitamos un rango distinto.
  var data = null;
  if (_pipeRangoActivo === 'semana') {
    data = await API.get('/pipeline/ranking');
  } else {
    var bita = await API.get('/pipeline/bitacora?limit=2000');
    if (bita) {
      var acc = {};
      (bita || []).forEach(function(b){
        var f = (b.fecha||'').slice(0,10);
        if (f < desde || f > hasta) return;
        var pts = parseFloat(b.puntos)||0;
        if (pts <= 0) return; // ignoramos descuentos para el ranking
        var k = (b.emp_cod||'') + '|' + (b.emp_nombre||'');
        if (!acc[k]) acc[k] = { emp_cod: b.emp_cod, emp_nombre: b.emp_nombre, total_pts: 0, acciones: 0 };
        acc[k].total_pts += pts;
        acc[k].acciones += 1;
      });
      var rk = Object.values(acc).sort(function(a,b){ return b.total_pts - a.total_pts; }).slice(0, 15);
      data = { ranking: rk, desde: desde };
    }
  }

  // Header con tabs de rango
  var rangos = [['hoy','Hoy'],['semana','Semana'],['mes','Mes'],['30d','30 días']];
  var headerTabs = '<div class="dash-rank-tabs">' + rangos.map(function(r){
    var active = _pipeRangoActivo === r[0] ? ' active' : '';
    return '<button class="dash-rank-tab'+active+'" onclick="dashPipeSetRango(\''+r[0]+'\')">'+r[1]+'</button>';
  }).join('') + '</div>';

  if (!data || !data.ranking || !data.ranking.length) {
    c.innerHTML = headerTabs + '<div class="dash-rank-empty">Sin acciones de pipeline en '+titulo.toLowerCase()+'</div>';
    return;
  }

  var top = data.ranking.slice(0, 8);
  var maxPts = top[0].total_pts || 1;
  var medallas = ['🥇','🥈','🥉'];

  var html = headerTabs + '<div class="dash-rank-head">'+titulo+' · '+(data.desde||desde)+' →</div>';
  html += '<div class="dash-rank-list">' + top.map(function(r, i){
    var pct = Math.round((r.total_pts / maxPts) * 100);
    var ini = r.emp_nombre ? r.emp_nombre.split(' ').slice(0,2).map(function(p){return p[0];}).join('').toUpperCase() : '?';
    var lugar = i < 3 ? '<span class="dash-rank-medal">'+medallas[i]+'</span>' : '<span class="dash-rank-num">'+(i+1)+'</span>';
    var topClass = i === 0 ? ' top1' : i === 1 ? ' top2' : i === 2 ? ' top3' : '';
    return '<div class="dash-rank-row'+topClass+'">' +
             '<div class="dash-rank-pos">'+lugar+'</div>' +
             '<div class="dash-rank-avatar">'+ini+'</div>' +
             '<div class="dash-rank-info">' +
               '<div class="dash-rank-name">'+(r.emp_nombre||'—')+'</div>' +
               '<div class="dash-rank-bar"><div class="dash-rank-fill" style="width:'+pct+'%"></div></div>' +
             '</div>' +
             '<div class="dash-rank-stats">' +
               '<div class="dash-rank-pts">'+Number(r.total_pts).toFixed(1)+' pts</div>' +
               '<div class="dash-rank-acc">'+r.acciones+' acciones</div>' +
             '</div>' +
           '</div>';
  }).join('') + '</div>';
  c.innerHTML = html;
}

// ── COMPLETITUD DE REPORTES (antes "Actividades más incumplidas") ─────
// Renombre + claridad: muestra qué turnos cerraron con menor % de
// actividades hechas. Útil para detectar de un vistazo qué sede está
// dejando tareas sin cumplir y dónde concentrar la atención.
function renderActIncumplidas(reps) {
  var c = document.getElementById('dashActIncumplidas');
  if (!c) return;
  if (!reps || !reps.length) {
    c.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:18px">Sin reportes en el periodo</div>';
    return;
  }
  // Promedio por sede
  var porSede = {};
  reps.forEach(function(r){
    if (!r.act_total) return;
    if (!porSede[r.sede]) porSede[r.sede] = { suma:0, n:0, pendientes:[] };
    var ratio = (r.act_done / r.act_total) * 100;
    porSede[r.sede].suma += ratio;
    porSede[r.sede].n += 1;
    if (ratio < 80) porSede[r.sede].pendientes.push({ fecha:r.fecha, turno:r.turno, ratio:Math.round(ratio), done:r.act_done, total:r.act_total });
  });
  var sedes = Object.entries(porSede).map(function(e){
    return { sede: e[0], promedio: e[1].n ? Math.round(e[1].suma/e[1].n) : 100, pendientes: e[1].pendientes };
  }).sort(function(a,b){ return a.promedio - b.promedio; });

  if (!sedes.length) {
    c.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:18px">Sin reportes con actividades en el periodo</div>';
    return;
  }

  var html = '<div class="dash-cmp-head">Promedio de cumplimiento por sede en el periodo</div>';
  html += '<div class="dash-cmp-sedes">' + sedes.map(function(s){
    var color = s.promedio >= 90 ? 'ok' : s.promedio >= 75 ? 'warn' : 'bad';
    return '<div class="dash-cmp-sede '+color+'">' +
             '<div class="dash-cmp-sede-head">' +
               '<span class="dash-cmp-sede-name">'+((SEDES[s.sede]&&SEDES[s.sede].label)||s.sede)+'</span>' +
               '<span class="dash-cmp-sede-pct">'+s.promedio+'%</span>' +
             '</div>' +
             '<div class="dash-cmp-sede-bar"><div class="dash-cmp-sede-fill" style="width:'+s.promedio+'%"></div></div>' +
             '<div class="dash-cmp-sede-foot">'+s.pendientes.length+' turno(s) bajo el 80%</div>' +
           '</div>';
  }).join('') + '</div>';

  // Detalle de los 4 peores turnos individuales
  var peores = [];
  sedes.forEach(function(s){
    s.pendientes.forEach(function(p){ peores.push(Object.assign({sede:s.sede}, p)); });
  });
  peores.sort(function(a,b){ return a.ratio - b.ratio; });
  if (peores.length) {
    html += '<div class="dash-cmp-list-title">Turnos con menor cumplimiento</div>';
    html += peores.slice(0, 5).map(function(r){
      var ratioColor = r.ratio < 50 ? 'var(--red)' : r.ratio < 75 ? 'var(--yellow)' : 'var(--green)';
      var turnoLbl = ({M:'Mañana', T:'Tarde', C:'Completo'})[r.turno] || r.turno;
      return '<div class="dash-cmp-row">' +
               '<span class="badge badge-navy" style="font-size:9px">'+((SEDES[r.sede]&&SEDES[r.sede].short)||r.sede)+'</span>' +
               '<span class="dash-cmp-row-meta">'+r.fecha+' · '+turnoLbl+'</span>' +
               '<span class="dash-cmp-row-pct" style="color:'+ratioColor+'">'+r.done+'/'+r.total+' · '+r.ratio+'%</span>' +
             '</div>';
    }).join('');
  }
  c.innerHTML = html;
}

// ── INCIDENCIAS ADMIN ──────────────────────────────────
function populateIncResp() {
  var sel = document.getElementById('incNuevaResp'); if (!sel || sel.options.length > 1) return;
  (STATE.empleadosCache||[]).forEach(e => { var o = document.createElement('option'); o.value = e.nombre; o.textContent = e.nombre + ' (' + ((e.tiendas||[])[0]||'—') + ')'; sel.appendChild(o); });
}

async function renderIncidenciasAdmin() {
  const fs   = document.getElementById('incFiltroSede')?.value||'';
  const fn   = document.getElementById('incFiltroNivel')?.value||'';
  const ft   = document.getElementById('incFiltroTrab')?.value||'';
  const fd   = document.getElementById('incFiltroDesde')?.value||'';
  const fh   = document.getElementById('incFiltroHasta')?.value||'';
  const params={}; if(fs)params.sede=fs; if(fn)params.nivel=fn; if(ft)params.responsable=ft; if(fd)params.desde=fd; if(fh)params.hasta=fh;
  var tSel=document.getElementById('incFiltroTrab');
  if(tSel&&tSel.options.length<=1){(STATE.empleadosCache||[]).forEach(function(e){var o=document.createElement('option');o.value=e.nombre;o.textContent=e.nombre;tSel.appendChild(o);});}
  const incs = await API.incidencias(params);if(!incs)return;
  const body = document.getElementById('incAdminBody');if(!body)return;
  const pN   = {Alto:0,Medio:0,Bajo:0};incs.forEach(i=>{pN[i.nivel]=(pN[i.nivel]||0)+1;});
  document.getElementById('incAdminStats').innerHTML=`
    <div class="stat-card accent-red"><div class="stat-label">Alto</div><div class="stat-val" style="color:var(--red)">${pN.Alto}</div></div>
    <div class="stat-card accent-yellow"><div class="stat-label">Medio</div><div class="stat-val" style="color:var(--yellow)">${pN.Medio}</div></div>
    <div class="stat-card accent-green"><div class="stat-label">Bajo</div><div class="stat-val" style="color:var(--green)">${pN.Bajo}</div></div>
    <div class="stat-card accent-navy"><div class="stat-label">Total</div><div class="stat-val">${incs.length}</div></div>`;
  if(!incs.length){body.innerHTML='<tr><td class="empty-cell" colspan="10">Sin incidencias</td></tr>';return;}
  const bdgs={Alto:'badge-red',Medio:'badge-yellow',Bajo:'badge-green'};
  const origBdg={manual:'badge-navy',reporte:'badge-gold'};
  const origLbl={manual:'Manual',reporte:'Reporte'};
  body.innerHTML=incs.map(inc=>{
    const pts=(inc.puntos_penalidad!=null&&!isNaN(inc.puntos_penalidad))?Math.round(inc.puntos_penalidad*10)/10:0;
    const rep=inc.reportado_por||'—';
    const repCod=inc.reportado_por_cod?` <span class="mono" style="font-size:10px;color:var(--text3)">[${inc.reportado_por_cod}]</span>`:'';
    const orig=inc.origen||'manual';
    return `
    <tr class="inc-${inc.nivel?inc.nivel.toLowerCase():'medio'}">
      <td class="mono" style="font-size:11px">${inc.fecha}</td>
      <td>${SEDES[inc.sede]?.label||inc.sede}</td>
      <td style="font-size:12.5px">${inc.tipo}</td>
      <td style="font-size:11px;color:var(--text2);max-width:220px;white-space:normal">${inc.descripcion||'—'}</td>
      <td><span class="badge ${bdgs[inc.nivel]||'badge-gray'}">${inc.nivel}</span></td>
      <td style="font-size:12px;font-weight:700;color:var(--red);text-align:center">-${pts}</td>
      <td style="font-size:12px">${inc.responsable||'—'}</td>
      <td style="font-size:12px">${rep}${repCod}</td>
      <td><span class="badge ${origBdg[orig]||'badge-gray'}" style="font-size:10px">${origLbl[orig]||orig}</span></td>
      <td><button class="btn btn-danger btn-xs" onclick="eliminarIncidencia(${inc.id})">✕</button></td>
    </tr>`;}).join('');
}

async function eliminarIncidencia(id) {
  showConfirm('¿Eliminar incidencia?','Esta acción no se puede deshacer',async()=>{
    const r=await API.del('/incidencias/'+id);
    if(r){await renderIncidenciasAdmin();showToast('Incidencia eliminada','success');}
  },'🗑️');
}

async function agregarIncidenciaAdmin() {
  const sede=document.getElementById('incNuevaSede')?.value;
  const tipo=document.getElementById('incNuevaTipo')?.value;
  const desc=document.getElementById('incNuevaDesc')?.value;
  const nivel=document.getElementById('incNuevaNivel')?.value;
  const resp=document.getElementById('incNuevaResp')?.value;
  const fecha=document.getElementById('incNuevaFecha')?.value||hoyLocal();
  if(!sede||!tipo){showToast('Sede y tipo son requeridos','error');return;}
  const r=await API.crearIncidencia({sede,tipo,descripcion:desc,nivel,responsable:resp||'—',fecha});
  if(r){closeModal('incNuevaModal');await renderIncidenciasAdmin();showToast('✅ Incidencia registrada','success');}
}

// ── EMPLEADOS ──────────────────────────────────────────
// ═══ GESTIÓN DE EMPLEADOS v2 ═══
var EMP_ROLES={admin:{l:'Administrador',b:'badge-gold',o:1},dueno:{l:'Dueño/a',b:'badge-gold',o:0},encargado_tienda:{l:'Encargado Tienda',b:'badge-green',o:2},encargado_almacen:{l:'Enc. Almacén',b:'badge-green',o:3},ventas_junior:{l:'Ventas Jr.',b:'badge-blue',o:4},ventas_junior_2:{l:'Ventas Jr. 2',b:'badge-blue',o:5},auxiliar:{l:'Auxiliar Almacén',b:'badge-navy',o:6},confeccionista:{l:'Confeccionista',b:'badge-purple',o:7},trabajador:{l:'Trabajador',b:'badge-gray',o:8}};
var EMP_EST={activo:{l:'Activo',b:'badge-green',i:'●'},suspendido:{l:'Suspendido',b:'badge-gold',i:'⚠'},deshabilitado:{l:'Deshabilitado',b:'badge-red',i:'○'}};

function empTab(tab,btn){
  ['General','Personal','Notas'].forEach(function(t){document.getElementById('empTab'+t).style.display='none';});
  document.getElementById('empTab'+tab.charAt(0).toUpperCase()+tab.slice(1)).style.display='';
  document.querySelectorAll('.emp-tab').forEach(function(b){b.style.background='var(--s3)';b.style.color='var(--text3)';});
  btn.style.background='var(--navy)';btn.style.color='#fff';
}

async function renderEmpleados() {
  var q=document.getElementById('empSearch')?.value.toLowerCase()||'';
  var sortBy=document.getElementById('empSort')?.value||'nombre';
  var filterEst=document.getElementById('empFilterEstado')?.value||'activo';
  var all=await API.todosEmpleados();if(!all)return;
  STATE.empleadosCache=all;
  var body=document.getElementById('empBody');if(!body)return;

  var filtered=all.filter(function(e){
    var match=e.nombre.toLowerCase().includes(q)||e.cod.includes(q)||(e.dni||'').includes(q);
    var est=e.estado||'activo';
    if(filterEst==='todos')return match;
    if(filterEst==='activo')return match&&(est==='activo');
    return match&&est===filterEst;
  });

  // Sort
  filtered.sort(function(a,b){
    if(sortBy==='nombre')return a.nombre.localeCompare(b.nombre);
    if(sortBy==='rol'){var ra=(EMP_ROLES[a.rol]||{}).o||99,rb=(EMP_ROLES[b.rol]||{}).o||99;return ra-rb||a.nombre.localeCompare(b.nombre);}
    if(sortBy==='sede')return (a.tiendas||[]).join(',').localeCompare((b.tiendas||[]).join(','));
    if(sortBy==='estado')return (a.estado||'activo').localeCompare(b.estado||'activo');
    return 0;
  });

  if(!filtered.length){body.innerHTML='<tr><td class="empty-cell" colspan="7">Sin empleados</td></tr>';return;}

  body.innerHTML=filtered.map(function(e){
    var rol=EMP_ROLES[e.rol]||{l:e.rol,b:'badge-gray'};
    var est=EMP_EST[e.estado||'activo']||EMP_EST.activo;
    var isSusp=e.estado==='suspendido'||e.estado==='deshabilitado';
    var opac=isSusp?'opacity:.5':'';
    // Indicador de datos críticos faltantes (afectan ciclo personal y pago)
    var faltantes=[];
    if(!e.fecha_ingreso) faltantes.push('fecha de ingreso');
    if(!e.salario_base || parseFloat(e.salario_base)===0) faltantes.push('salario base');
    if(!e.dni) faltantes.push('DNI');
    var faltBadge=(!isSusp&&faltantes.length)
      ? '<span class="badge" style="background:rgba(184,134,11,.12);color:var(--yellow);border:1px solid rgba(184,134,11,.3);font-size:8px;font-weight:700;margin-left:6px;padding:1px 5px" title="Faltan: '+faltantes.join(', ')+'">⚠ '+faltantes.length+' dato(s)</span>'
      : '';
    return '<tr style="'+opac+'"><td><div style="display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:'+(isSusp?'#94a3b8':'var(--navy-xd)')+';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:'+(isSusp?'#fff':'#d4bf1e')+'">'+e.iniciales+'</div><div><div style="font-weight:600;font-size:13px">'+e.nombre+faltBadge+'</div><div class="mono" style="font-size:9px;color:var(--text3)">'+e.id+' · '+(e.dni||'Sin DNI')+'</div></div></div></td>'+
      '<td style="font-size:11px">'+(e.tiendas||[]).map(function(t){return '<span class="badge badge-navy" style="font-size:8px;padding:1px 5px;margin:1px">'+(SEDES[t]?.short||t)+'</span>'}).join(' ')+'</td>'+
      '<td><span class="badge '+rol.b+'" style="font-size:9px">'+rol.l+'</span></td>'+
      '<td><span class="badge '+est.b+'" style="font-size:9px">'+est.i+' '+est.l+'</span></td>'+
      '<td>'+(document.getElementById('empShowCod')?.checked?'<span class="mono" style="font-size:11px;background:var(--s3);padding:2px 8px;border-radius:4px;border:1px solid var(--border)">'+e.cod+'</span>':'<span style="font-size:10px;color:var(--text3)">••••</span>')+'</td>'+
      '<td style="font-size:11px;color:var(--text3)">'+(e.telefono||'—')+'</td>'+
      '<td><div style="display:flex;gap:3px;flex-wrap:wrap"><button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();editarEmpleado(&quot;'+e.id+'&quot;)">Editar</button>'+
      '<button class="btn btn-ghost btn-xs" title="Ver horario semanal" onclick="event.stopPropagation();verHorarioEmpleado(&quot;'+e.id+'&quot;)">📅 Horario</button>'+
      (isSusp?'<button class="btn btn-ghost btn-xs" style="color:var(--green)" onclick="event.stopPropagation();toggleEstadoEmp(&quot;'+e.id+'&quot;,&quot;activo&quot;)">Activar</button>':
      '<button class="btn btn-ghost btn-xs" style="color:#ca8a04" onclick="event.stopPropagation();toggleEstadoEmp(&quot;'+e.id+'&quot;,&quot;suspendido&quot;)">Suspender</button>')+
      '</div></td></tr>';
  }).join('');
}

async function editarEmpleado(empId) {
  var emp=STATE.empleadosCache.find(function(e){return e.id===empId});if(!emp)return;
  document.getElementById('editEmpTitle').textContent='✏️ '+emp.nombre;
  document.getElementById('editEmpId').value=empId;
  document.getElementById('editEmpNombre').value=emp.nombre;
  document.getElementById('editEmpNombreCompleto').value=emp.nombre_completo||'';
  document.getElementById('editEmpCod').value=emp.cod;
  document.getElementById('editEmpPass').value='';
  document.getElementById('editEmpRol').value=emp.rol;
  document.getElementById('editEmpEstado').value=emp.estado||'activo';
  document.getElementById('editEmpDni').value=emp.dni||'';
  document.getElementById('editEmpTel').value=emp.telefono||'';
  document.getElementById('editEmpDir').value=emp.direccion||'';
  document.getElementById('editEmpFnac').value=emp.fecha_nacimiento||'';
  document.getElementById('editEmpFing').value=emp.fecha_ingreso||'';
  document.getElementById('editEmpCE').value=emp.contacto_emergencia||'';
  document.getElementById('editEmpCET').value=emp.tel_emergencia||'';
  document.getElementById('editEmpNotas').value=emp.notas||'';
  // Tab Contrato
  var elCt=document.getElementById('editEmpContrato'); if(elCt)elCt.value=emp.tipo_contrato||'';
  var elVc=document.getElementById('editEmpVencContrato'); if(elVc)elVc.value=emp.vencimiento_contrato||'';
  var elSal=document.getElementById('editEmpSalario'); if(elSal)elSal.value=emp.salario_base||'';

  var tBox=document.getElementById('editEmpTiendas');
  if(tBox)_renderTiendaChips(tBox,emp.tiendas||[]);

  // Reset to first tab
  empTab('general',document.querySelector('.emp-tab'));
  document.getElementById('editEmpSaveBtn').onclick=guardarEmpleado;
  openModal('editEmpModal');
}

function _renderTiendaChips(box,selected){
  box.innerHTML=Object.entries(SEDES).map(function(e){
    var cod=e[0],s=e[1],chk=selected.indexOf(cod)>=0;
    return '<div class="emp-sede-chip" data-cod="'+cod+'" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;border:2px solid '+(chk?'var(--navy)':'var(--border)')+';background:'+(chk?'rgba(46,62,110,.08)':'#fff')+';cursor:pointer;transition:all .15s;font-size:12px;font-weight:600"><input type="checkbox" value="'+cod+'" '+(chk?'checked':'')+' style="display:none">'+s.icon+' '+s.label+'</div>';
  }).join('');
  box.querySelectorAll('.emp-sede-chip').forEach(function(d){
    d.addEventListener('click',function(){
      var cb=d.querySelector('input');cb.checked=!cb.checked;
      d.style.border='2px solid '+(cb.checked?'var(--navy)':'var(--border)');
      d.style.background=cb.checked?'rgba(46,62,110,.08)':'#fff';
    });
  });
}

async function guardarEmpleado() {
  var empId=document.getElementById('editEmpId').value;
  var data={
    nombre:document.getElementById('editEmpNombre').value.trim(),
    nombre_completo:document.getElementById('editEmpNombreCompleto').value.trim(),
    cod:document.getElementById('editEmpCod').value.trim(),
    rol:document.getElementById('editEmpRol').value,
    estado:document.getElementById('editEmpEstado').value,
    iniciales:document.getElementById('editEmpNombre').value.trim().slice(0,2).toUpperCase(),
    tiendas:Array.from(document.querySelectorAll('#editEmpTiendas input:checked')).map(function(el){return el.value}),
    dni:document.getElementById('editEmpDni').value.trim(),
    telefono:document.getElementById('editEmpTel').value.trim(),
    direccion:document.getElementById('editEmpDir').value.trim(),
    fecha_nacimiento:document.getElementById('editEmpFnac').value,
    fecha_ingreso:document.getElementById('editEmpFing').value,
    contacto_emergencia:document.getElementById('editEmpCE').value.trim(),
    tel_emergencia:document.getElementById('editEmpCET').value.trim(),
    notas:document.getElementById('editEmpNotas').value,
    // Contrato
    tipo_contrato:(document.getElementById('editEmpContrato')||{}).value||'',
    vencimiento_contrato:(document.getElementById('editEmpVencContrato')||{}).value||'',
    salario_base:parseFloat((document.getElementById('editEmpSalario')||{}).value)||0,
  };
  var pw=document.getElementById('editEmpPass').value.trim();
  if(pw)data.password=pw;
  if(!data.nombre||!data.cod){showToast('Nombre y código requeridos','error');return;}
  if(!data.tiendas.length){showToast('Selecciona al menos una sede','error');return;}
  var r=await API.put('/empleados/'+empId,data);
  if(r){closeModal('editEmpModal');await renderEmpleados();showToast('✅ '+data.nombre+' actualizado','success');}
}

async function nuevoEmpleado() {
  var newId='E'+String((STATE.empleadosCache||[]).length+1).padStart(2,'0');
  var newCod=String(1000+(STATE.empleadosCache||[]).length+1);
  document.getElementById('editEmpTitle').textContent='➕ Nuevo Empleado';
  document.getElementById('editEmpId').value=newId;
  document.getElementById('editEmpNombre').value='';
  document.getElementById('editEmpNombreCompleto').value='';
  document.getElementById('editEmpCod').value=newCod;
  document.getElementById('editEmpPass').value='';
  document.getElementById('editEmpRol').value='trabajador';
  document.getElementById('editEmpEstado').value='activo';
  document.getElementById('editEmpDni').value='';
  document.getElementById('editEmpTel').value='';
  document.getElementById('editEmpDir').value='';
  document.getElementById('editEmpFnac').value='';
  document.getElementById('editEmpFing').value='';
  document.getElementById('editEmpCE').value='';
  document.getElementById('editEmpCET').value='';
  document.getElementById('editEmpNotas').value='';
  // Tab Contrato — limpiar
  var elCt2=document.getElementById('editEmpContrato'); if(elCt2)elCt2.value='';
  var elVc2=document.getElementById('editEmpVencContrato'); if(elVc2)elVc2.value='';
  var elSal2=document.getElementById('editEmpSalario'); if(elSal2)elSal2.value='';
  _renderTiendaChips(document.getElementById('editEmpTiendas'),[]);
  empTab('general',document.querySelector('.emp-tab'));
  document.getElementById('editEmpSaveBtn').onclick=async function(){
    var data={
      id:newId,nombre:document.getElementById('editEmpNombre').value.trim(),
      nombre_completo:document.getElementById('editEmpNombreCompleto').value.trim(),
      cod:document.getElementById('editEmpCod').value.trim(),
      rol:document.getElementById('editEmpRol').value,estado:'activo',iniciales:document.getElementById('editEmpNombre').value.trim().slice(0,2).toUpperCase(),
      tiendas:Array.from(document.querySelectorAll('#editEmpTiendas input:checked')).map(function(el){return el.value}),
      dni:document.getElementById('editEmpDni').value.trim(),telefono:document.getElementById('editEmpTel').value.trim(),
      direccion:document.getElementById('editEmpDir').value.trim(),fecha_nacimiento:document.getElementById('editEmpFnac').value,
      fecha_ingreso:document.getElementById('editEmpFing').value,contacto_emergencia:document.getElementById('editEmpCE').value.trim(),
      tel_emergencia:document.getElementById('editEmpCET').value.trim(),notas:document.getElementById('editEmpNotas').value,
      tipo_contrato:(document.getElementById('editEmpContrato')||{}).value||'',
      vencimiento_contrato:(document.getElementById('editEmpVencContrato')||{}).value||'',
      salario_base:parseFloat((document.getElementById('editEmpSalario')||{}).value)||0,
    };
    var pw=document.getElementById('editEmpPass').value.trim();
    if(pw)data.password=pw;
    if(!data.nombre||!data.cod||!data.tiendas.length){showToast('Completa nombre, código y al menos una sede','error');return;}
    var r=await API.post('/empleados',data);
    if(r){closeModal('editEmpModal');await renderEmpleados();showToast('✅ '+data.nombre+' agregado','success');}
  };
  openModal('editEmpModal');
}

async function toggleEstadoEmp(empId,estado){
  var emp=STATE.empleadosCache.find(function(e){return e.id===empId});if(!emp)return;
  var msg=estado==='activo'?'Activar a '+emp.nombre:'Suspender a '+emp.nombre;
  var detail=estado==='activo'?'Podrá iniciar sesión y aparecer en reportes':'No podrá iniciar sesión ni aparecer en reportes';
  var icon=estado==='activo'?'✅':'⚠️';
  showConfirm(msg,detail,async function(){
    var r=await API.put('/empleados/'+empId+'/estado',{estado:estado});
    if(r&&r.ok){showToast(estado==='activo'?'✅ '+emp.nombre+' activado':'⚠️ '+emp.nombre+' suspendido','success');await renderEmpleados();}
  },icon);
}


// ═══ CONFIG ACCESOS POR ROL ═══
async function abrirConfigAccesos(){
  var prev=document.getElementById('accesosModal');if(prev)prev.remove();
  await loadPermisos();
  var roles=['encargado_tienda','encargado_almacen','ventas_junior','ventas_junior_2','auxiliar','confeccionista','trabajador'];
  var pages=PAGES_CONFIG;
  var perms=STATE._permisos||{};
  var rl={encargado_tienda:'Enc. Tienda',encargado_almacen:'Enc. Almacén',ventas_junior:'Ventas Jr.',ventas_junior_2:'Ventas Jr.2',auxiliar:'Auxiliar',confeccionista:'Confección',trabajador:'Trabajador'};

  var m=document.createElement('div');m.id='accesosModal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px';
  m.onclick=function(e){if(e.target===m)m.remove();};

  var inner=document.createElement('div');
  inner.style.cssText='background:#fff;border-radius:16px;width:95%;max-width:850px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column';
  inner.onclick=function(e){e.stopPropagation();};

  // Header
  var hdr=document.createElement('div');
  hdr.style.cssText='padding:16px 24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center';
  hdr.innerHTML='<div><div style="font-size:16px;font-weight:800">⚙ Configurar Accesos</div><div style="font-size:11px;color:var(--text3)">Define qué puede ver cada rol</div></div>';
  var closeBtn=document.createElement('button');closeBtn.textContent='✕';closeBtn.style.cssText='background:none;border:none;font-size:18px;cursor:pointer;color:var(--text3)';
  closeBtn.onclick=function(){m.remove();};
  hdr.appendChild(closeBtn);
  inner.appendChild(hdr);

  // Body with table
  var body=document.createElement('div');body.style.cssText='flex:1;overflow:auto;padding:20px 24px';
  var t='<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="text-align:left;padding:6px 8px;font-size:9px;color:var(--text3);border-bottom:2px solid var(--border)">Módulo</th>';
  roles.forEach(function(r){t+='<th style="text-align:center;padding:6px 4px;font-size:8px;color:var(--text3);border-bottom:2px solid var(--border);min-width:60px">'+(rl[r]||r)+'</th>';});
  t+='</tr></thead><tbody>';
  Object.entries(pages).forEach(function(e){
    var pid=e[0],pg=e[1];
    t+='<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px 8px;font-weight:600">'+pg.icon+' '+pg.label+'</td>';
    roles.forEach(function(r){
      var allowed=(perms[r]||DEFAULT_PERMS[r]||[]).indexOf(pid)>=0;
      t+='<td style="text-align:center;padding:4px"><input type="checkbox" class="acc-cb" data-role="'+r+'" data-page="'+pid+'" '+(allowed?'checked':'')+' style="width:16px;height:16px;accent-color:var(--navy);cursor:pointer"></td>';
    });
    t+='</tr>';
  });
  t+='</tbody></table>';
  body.innerHTML=t;
  inner.appendChild(body);

  // Footer
  var ftr=document.createElement('div');ftr.style.cssText='padding:14px 24px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end';
  var resetBtn=document.createElement('button');resetBtn.className='btn btn-ghost btn-sm';resetBtn.textContent='Restaurar defaults';
  resetBtn.onclick=function(){resetAccesos();};
  var saveBtn=document.createElement('button');saveBtn.className='btn btn-primary btn-sm';saveBtn.textContent='Guardar Accesos';
  saveBtn.onclick=function(){guardarAccesos();};
  ftr.appendChild(resetBtn);ftr.appendChild(saveBtn);
  inner.appendChild(ftr);

  m.appendChild(inner);
  document.body.appendChild(m);
}

async function guardarAccesos(){
  var perms={};
  document.querySelectorAll('.acc-cb').forEach(function(cb){
    var r=cb.dataset.role,p=cb.dataset.page;
    if(!perms[r])perms[r]=[];
    if(cb.checked)perms[r].push(p);
  });
  var r=await API.put('/config/permisos',perms);
  if(r&&r.ok){
    STATE._permisos=perms;
    document.getElementById('accesosModal')?.remove();
    applyPermissions();
    showToast('✅ Accesos actualizados','success');
  }
}

function resetAccesos(){
  document.querySelectorAll('.acc-cb').forEach(function(cb){
    var r=cb.dataset.role,p=cb.dataset.page;
    cb.checked=(DEFAULT_PERMS[r]||[]).indexOf(p)>=0;
  });
  showToast('Defaults restaurados — guarda para aplicar','info');
}

// ── MI DESEMPEÑO ───────────────────────────────────────
async function renderMiDesempeno() {
  const u=STATE.user;if(!u)return;
  const data=await API.desempeno(u.id);if(!data)return;
  const {emp,reportes,evals,incidencias,stats,pipeStats,extrasStats}=data;
  const pct=stats.avgPuntaje;
  const cls=pct>=85?'excellent':pct>=70?'good':pct>=50?'regular':'bad';
  const nivB={Alto:'badge-red',Medio:'badge-yellow',Bajo:'badge-green'};
  const ps=pipeStats||{totalPts:0,acciones:0,thisMonth:0,detalle:[]};
  const es=extrasStats||{totalPts:0,count:0};

  document.getElementById('miDesempenoCard').innerHTML=`
    <div class="md-hero md-anim md-anim-1">
      <div class="md-hero-bg"></div>
      <div class="md-hero-content">
        <div class="md-hero-avatar">${u.iniciales}</div>
        <div class="md-hero-info">
          <div class="md-hero-name">${emp.nombre}</div>
          ${emp.nombre_completo?`<div class="md-hero-fullname">${emp.nombre_completo}</div>`:''}
          <div class="md-hero-meta">${(emp.tiendas||[]).map(t=>SEDES[t]?.label||t).join(' · ')}</div>
          <div class="md-hero-tags"><span class="badge badge-gold">${emp.rol}</span></div>
        </div>
        <div class="md-hero-score">
          <div class="md-hero-pct" data-target="${pct}">${pct}<span style="font-size:18px">%</span></div>
          <div class="md-hero-pct-lbl">Puntaje promedio</div>
        </div>
      </div>
    </div>
    <div class="md-stats-grid md-anim md-anim-2">
      <div class="md-stat md-stat-navy">
        <div class="md-stat-icon">📋</div>
        <div class="md-stat-val" data-target="${stats.totalReportes}">${stats.totalReportes}</div>
        <div class="md-stat-lbl">Reportes enviados</div>
        <div class="md-stat-sub">${stats.evaluados} ya evaluados</div>
      </div>
      <div class="md-stat md-stat-gold">
        <div class="md-stat-icon">⭐</div>
        <div class="md-stat-val" data-target="${reportes.length?Math.max(...reportes.map(r=>r.puntaje||0)):0}">${reportes.length?Math.max(...reportes.map(r=>r.puntaje||0)):0}<span style="font-size:14px">%</span></div>
        <div class="md-stat-lbl">Tu mejor puntaje</div>
        <div class="md-stat-sub">en un turno</div>
      </div>
      <div class="md-stat md-stat-red">
        <div class="md-stat-icon">⚠</div>
        <div class="md-stat-val" data-target="${stats.totalIncidencias}">${stats.totalIncidencias}</div>
        <div class="md-stat-lbl">Incidencias</div>
        <div class="md-stat-sub">registradas a tu nombre</div>
      </div>
      <div class="md-stat md-stat-green">
        <div class="md-stat-icon">📊</div>
        <div class="md-stat-val" data-target="${evals.length}">${evals.length}</div>
        <div class="md-stat-lbl">Evaluaciones</div>
        <div class="md-stat-sub">recibidas del turno siguiente</div>
      </div>
    </div>
    <div class="grid-2 md-anim md-anim-3" style="margin-bottom:18px">
      <div class="card" style="overflow:hidden">
        <div class="card-header"><span class="card-title">📦 Puntos de Almacén (Pipeline)</span><span class="badge badge-purple">${ps.totalPts} pts total</span></div>
        <div class="card-body">
          <div style="display:flex;gap:14px;margin-bottom:12px">
            <div style="text-align:center;flex:1"><div style="font-size:24px;font-weight:800;color:var(--purple)">${ps.thisMonth}</div><div style="font-size:9px;color:var(--text3)">Este mes</div></div>
            <div style="text-align:center;flex:1"><div style="font-size:24px;font-weight:800;color:var(--navy)">${ps.acciones}</div><div style="font-size:9px;color:var(--text3)">Acciones</div></div>
            <div style="text-align:center;flex:1"><div style="font-size:24px;font-weight:800;color:var(--green)">${ps.totalPts}</div><div style="font-size:9px;color:var(--text3)">Pts acumulados</div></div>
          </div>
          ${ps.detalle.length?`<div style="font-size:9px;font-weight:700;color:var(--text3);margin-bottom:4px">DESGLOSE POR TIPO</div><div style="display:flex;flex-wrap:wrap;gap:4px">${ps.detalle.map(d=>`<span class="badge badge-purple" style="font-size:9px">${d.tipo}: ${d.pts} pts (${d.n})</span>`).join('')}</div>`:'<div style="font-size:10px;color:var(--text3)">Sin actividad en pipeline aún</div>'}
        </div>
      </div>
      <div class="card" style="overflow:hidden">
        <div class="card-header"><span class="card-title">⭐ Extras en Reportes</span><span class="badge badge-gold">${es.totalPts} pts</span></div>
        <div class="card-body">
          <div style="display:flex;gap:14px;margin-bottom:12px">
            <div style="text-align:center;flex:1"><div style="font-size:24px;font-weight:800;color:var(--gold-d)">${es.count}</div><div style="font-size:9px;color:var(--text3)">Extras realizados</div></div>
            <div style="text-align:center;flex:1"><div style="font-size:24px;font-weight:800;color:var(--green)">${es.totalPts}</div><div style="font-size:9px;color:var(--text3)">Puntos extras</div></div>
          </div>
          <div style="font-size:10px;color:var(--text3)">Las actividades extras registradas con tu código se acumulan para la evaluación mensual.</div>
        </div>
      </div>
    </div>
    <div class="card md-anim md-anim-4">
      <div class="card-header"><span class="card-title">Últimos Reportes</span></div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr><th>Reporte</th><th>Sede</th><th>Turno</th><th>Puntaje</th><th>Evaluado</th></tr></thead>
          <tbody>${reportes.slice(0,10).map(r=>`
            <tr style="cursor:pointer" onclick="verReporteDetalle('${r.id}')">
              <td><span class="badge badge-navy mono">${r.id}</span></td>
              <td>${SEDES[r.sede]?.short||r.sede}</td>
              <td>${{M:'Mañana',T:'Tarde',C:'Completo'}[r.turno]||r.turno}</td>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:5px;background:var(--s3);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${r.puntaje||0}%;background:var(--navy);border-radius:3px"></div></div>
                <span class="mono" style="font-size:11px;font-weight:700">${r.puntaje||0}%</span></div></td>
              <td><span class="badge ${r.evaluado?'badge-green':'badge-yellow'}">${r.evaluado?'✓ Evaluado':'Pendiente'}</span></td>
            </tr>`).join('')||'<tr><td class="empty-cell" colspan="5">Sin reportes</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    ${incidencias&&incidencias.length?`
    <div class="card">
      <div class="card-header"><span class="card-title">🚨 Incidencias Reportadas</span><span class="badge badge-red" style="font-size:10px">${incidencias.length} · -${incidencias.reduce((s,i)=>s+(i.puntos_penalidad||0),0)} pts</span></div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr><th>Fecha</th><th>Sede</th><th>Tipo</th><th>Descripción</th><th>Nivel</th><th>Pts</th></tr></thead>
          <tbody>${incidencias.map(inc=>`
            <tr>
              <td class="mono" style="font-size:11px">${inc.fecha}</td>
              <td>${SEDES[inc.sede]?.short||inc.sede}</td>
              <td style="font-size:11px">${inc.tipo}</td>
              <td style="font-size:11px;color:var(--text2)">${inc.descripcion||'—'}</td>
              <td><span class="badge ${nivB[inc.nivel]||'badge-gray'}">${inc.nivel}</span></td>
              <td style="font-weight:700;color:var(--red)">${inc.puntos_penalidad?'-'+inc.puntos_penalidad:'—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`:''}
    ${evals.length?`
    <div class="card">
      <div class="card-header"><span class="card-title">📋 Evaluaciones Mensuales</span></div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr><th>Mes</th><th>Nota Final /20</th><th>Recomendación</th></tr></thead>
          <tbody>${evals.map(ev=>`
            <tr>
              <td class="mono">${ev.mes}</td>
              <td><div class="score-pill ${ev.nota_final>=17?'excellent':ev.nota_final>=14?'good':ev.nota_final>=11?'regular':'bad'}">${ev.nota_final}/20</div></td>
              <td>${ev.recomendacion}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`:''}`

  document.getElementById('miDesempenoCard').classList.remove('hidden');
}

// ── EVALUACIÓN MENSUAL ─────────────────────────────────

async function initEvalMensual() {
  var empSel = document.getElementById('evalMEmpSel');
  if (empSel && empSel.options.length <= 1) {
    var all = await API.todosEmpleados();
    (all||[]).filter(function(e){return e.rol!=='admin'&&e.rol!=='dueno'}).forEach(function(e){
      var o = document.createElement('option'); o.value = e.id;
      o.textContent = e.nombre + ' (' + ((e.tiendas||[])[0]||'—') + ')';
      empSel.appendChild(o);
    });
  }
  var desdeEl = document.getElementById('evalMDesde');
  var hastaEl = document.getElementById('evalMHasta');
  if (desdeEl && !desdeEl.value) {
    var hoy = new Date();
    var primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    desdeEl.value = primerDia.getFullYear()+'-'+String(primerDia.getMonth()+1).padStart(2,'0')+'-'+String(primerDia.getDate()).padStart(2,'0');
    hastaEl.value = hoyLocal();
  }
  await renderEvalMensualHistorial();
}

function iniciarEvalMensual(empId) {
  goTo('evaluacion-mensual', document.querySelector('[onclick*="evaluacion-mensual"]'));
  var sel = document.getElementById('evalMEmpSel');
  if (sel) { sel.value = empId; cargarEvalPeriodo(); }
}

// ── Ciclo personal del colaborador ──
// Llama al backend para obtener el ciclo aniversario actual y autocompleta
// los selectores Desde/Hasta. Si el colaborador no tiene fecha_ingreso
// válida, el backend devuelve fuente='mes_calendario' y se muestra un
// badge de advertencia.
async function aplicarCicloPersonal() {
  var empId = document.getElementById('evalMEmpSel')?.value;
  if (!empId) { showToast('Selecciona primero un colaborador', 'error'); return; }
  var data = await API.get('/evaluaciones/ciclo-actual?emp_id=' + encodeURIComponent(empId));
  if (!data || !data.ciclo) { showToast('No se pudo calcular el ciclo', 'error'); return; }
  var c = data.ciclo;
  var d = document.getElementById('evalMDesde');
  var h = document.getElementById('evalMHasta');
  if (d) d.value = c.desde;
  if (h) h.value = c.hasta;
  // Badge con la fuente
  var b = document.getElementById('evalMCicloBadge');
  if (b) {
    if (c.fuente === 'aniversario') {
      b.style.display = '';
      b.innerHTML = '<span class="badge badge-green" style="font-size:10px">⏱ Aniversario · ' + c.desde + ' → ' + c.hasta + '</span>';
    } else {
      b.style.display = '';
      b.innerHTML = '<span class="badge badge-gold" style="font-size:10px">⚠ Sin fecha de ingreso · usando mes calendario</span>';
    }
  }
  cargarEvalPeriodo();
}

// ═══ CENTRAL LOADER: triggered by employee/month change ═══
async function cargarEvalPeriodo() {
  var empId = document.getElementById('evalMEmpSel')?.value;
  var desde = document.getElementById('evalMDesde')?.value;
  var hasta = document.getElementById('evalMHasta')?.value;
  if (!empId || !desde || !hasta) {
    document.getElementById('evalMForm')?.classList.add('hidden');
    document.getElementById('evalMSelectorInfo').textContent = 'Selecciona colaborador y periodo';
    return;
  }
  if (desde > hasta) { showToast('Desde debe ser antes de Hasta','error'); return; }

  // Store for later use
  STATE.evalMensualEmp = empId;
  STATE.evalMensualMes = desde.slice(0,7);
  STATE.evalMensualDesde = desde;
  STATE.evalMensualHasta = hasta;

  // Load horario to calculate expected reports
  var horario = await API.get('/asistencias/horarios/' + empId) || [];
  var DIAS_MAP = {0:'domingo',1:'lunes',2:'martes',3:'miercoles',4:'jueves',5:'viernes',6:'sabado'};
  var horLookup = {};
  horario.forEach(function(h) {
    if (!horLookup[h.dia]) horLookup[h.dia] = {};
    horLookup[h.dia][h.turno] = h.sede;
  });

  var expectedReports = 0;
  var workDays = 0;
  var dStart = new Date(desde + 'T12:00:00');
  var dEnd = new Date(hasta + 'T12:00:00');
  for (var dt = new Date(dStart); dt <= dEnd; dt.setDate(dt.getDate()+1)) {
    var dow = dt.getDay();
    var diaName = DIAS_MAP[dow];
    var hor = horLookup[diaName] || {};
    var sedes = new Set();
    if (hor.M) sedes.add(hor.M);
    if (hor.T) sedes.add(hor.T);
    if (sedes.size > 0) workDays++;
    expectedReports += sedes.size;
  }

  STATE.evalExpectedReports = expectedReports;
  STATE.evalWorkDays = workDays;

  document.getElementById('evalMSelectorInfo').innerHTML =
    '<span style="color:var(--navy);font-weight:700">' + workDays + ' días laborales</span> · ' +
    '<span style="color:var(--gold-d);font-weight:700">' + expectedReports + ' reportes esperados</span>';

  // Now load the eval form
  await cargarEvalMensualForm();

  // Also load asistencias if that tab is open
  if (document.getElementById('evalTabAsistencias')?.style.display !== 'none') {
    await cargarAsistencias();
  }
  // Refrescar dashboard por trabajador si la tab está activa
  var dashEl = document.getElementById('evalTabDashboard');
  if (dashEl && dashEl.style.display !== 'none' && typeof renderEvalMDashboard === 'function') {
    renderEvalMDashboard();
  }
}

async function cargarEvalMensualForm() {
  await loadEvalConfig();
  var cfg=_evalConfig||{};
  var lblMap={evalMLblOp:'peso_operaciones',evalMLblSw:'peso_software',evalMLblLimp:'peso_limpieza'};
  Object.keys(lblMap).forEach(function(id){var el=document.getElementById(id);if(el)el.textContent=(cfg[lblMap[id]]||'10')+'%';});
  var empId=STATE.evalMensualEmp;
  var desde=STATE.evalMensualDesde;
  var hasta=STATE.evalMensualHasta;
  if(!empId)return;
  var emp=(STATE.empleadosCache||[]).find(function(e){return String(e.id)===String(empId)});
  if(!emp){try{var d=await API.desempeno(empId);if(d)emp=d.emp;}catch(e){}}
  if(!emp){showToast('Empleado no encontrado','error');return;}
  document.getElementById('evalMForm').classList.remove('hidden');
  document.getElementById('evalMEmpNombre').textContent=emp.nombre+' \u2014 '+(emp.tiendas||[]).map(function(t){return SEDES[t]?.short||t}).join('/');
  document.getElementById('evalMExpectedInfo').textContent=(STATE.evalExpectedReports||0)+' reportes esperados · '+(STATE.evalWorkDays||0)+' días lab.';

  // ═══ 1. COMPETENCIAS — Visual mejorado ═══
  var compBody=document.getElementById('evalMCompBody');
  if(compBody){
    var compColors=['#dc2626','#ea580c','#ca8a04','#16a34a','#059669'];
    compBody.innerHTML=COMPETENCIAS.map(function(c){
      return '<tr><td style="font-size:12px;font-weight:600;padding:10px 8px">'+c.nombre+'</td><td style="padding:8px"><div style="display:flex;gap:4px" id="evalCBtns-'+c.id+'">'+
        c.rubrica.map(function(r,i){
          return '<button type="button" class="eval-comp-btn" data-comp="'+c.id+'" data-val="'+i+'" onclick="selComp(this)" style="flex:1;padding:8px 4px;border-radius:8px;border:2px solid transparent;background:var(--s3);cursor:pointer;font-size:10px;text-align:center;transition:all .15s" title="'+r+'"><div style="font-size:16px;font-weight:800;color:'+compColors[i]+'">'+i+'</div><div style="color:var(--text3);line-height:1.2;margin-top:2px">'+r.split(' ').slice(0,3).join(' ')+'</div></button>';
        }).join('')+'</div><input type="hidden" id="evalC-'+c.id+'" value="0"></td><td style="text-align:center;width:50px"><span class="badge badge-navy" id="evalCPts-'+c.id+'" style="font-size:13px">0/4</span></td></tr>';
    }).join('');
  }

  // ═══ 2. VALORES 360° ═══
  var valBox=document.getElementById('evalMValoresResumen');
  if(valBox){
    valBox.innerHTML='<div style="color:var(--text3);font-size:12px">Cargando valores...</div>';
    try{
      var mes=(desde||'').slice(0,7);
      var resumen=await API.resumenValores(empId,mes);
      if(resumen&&resumen.promedios&&resumen.cantidad>0){
        var p=resumen.promedios;
        valBox.innerHTML='<div style="font-size:12px;color:var(--text2);margin-bottom:8px">Basado en <strong>'+resumen.cantidad+'</strong> evaluaciones de compa\u00f1eros.</div><div style="display:flex;flex-wrap:wrap;gap:6px">'+VALORES_NOMBRES.map(function(v,i){return '<span style="padding:4px 8px;border-radius:6px;background:var(--s3);font-size:11px">'+v+': <strong>'+(p[VALORES_KEYS[i]]||0)+'</strong></span>'}).join('')+'</div>';
        document.getElementById('evalMNotaValores').value=p.nota20||0;
      }else{
        valBox.innerHTML='<div style="color:var(--text3);font-size:12px">Sin evaluaciones de valores este periodo. Ingresa nota manualmente abajo.</div>';
      }
    }catch(e){valBox.innerHTML='<div style="color:var(--text3);font-size:12px">Sin datos de valores disponibles. Ingresa nota manualmente.</div>';}
  }

  // ═══ 3. CHECKLISTS AUTOMÁTICOS ═══
  var chkBox=document.getElementById('evalMChecklistsBox');
  if(chkBox){
    chkBox.innerHTML='<div style="color:var(--text3);font-size:12px">Calculando desde reportes...</div>';
    try{
      var chk=await API.get('/empleados/'+empId+'/checklists2?desde='+(desde||'')+'&hasta='+(hasta||''));
      if(chk&&chk.total_reportes!==undefined){
        document.getElementById('evalMReportCount').textContent=chk.total_reportes+'/'+chk.expected_reportes+' reportes · '+chk.dias_trabajados+'/'+chk.dias_periodo+' d\u00edas';
        var html='';

        // Summary bar
        html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">';
        html+='<div style="flex:1;min-width:80px;padding:8px;background:var(--s3);border-radius:8px;text-align:center"><div style="font-size:9px;font-weight:700;color:#94a3b8">D\u00cdAS PERIODO</div><div style="font-size:18px;font-weight:800">'+chk.dias_periodo+'</div></div>';
        html+='<div style="flex:1;min-width:80px;padding:8px;background:var(--s3);border-radius:8px;text-align:center"><div style="font-size:9px;font-weight:700;color:#94a3b8">D\u00cdAS TRABAJADOS</div><div style="font-size:18px;font-weight:800;color:var(--navy)">'+chk.dias_trabajados+'</div></div>';
        html+='<div style="flex:1;min-width:80px;padding:8px;background:var(--s3);border-radius:8px;text-align:center"><div style="font-size:9px;font-weight:700;color:#94a3b8">REPORTES</div><div style="font-size:18px;font-weight:800">'+chk.total_reportes+'</div></div>';
        html+='<div style="flex:1;min-width:80px;padding:8px;background:var(--s3);border-radius:8px;text-align:center"><div style="font-size:9px;font-weight:700;color:#94a3b8">EVALUADOS</div><div style="font-size:18px;font-weight:800;color:'+(chk.evaluados===chk.total_reportes?'var(--green)':'var(--gold-d)')+'">'+chk.evaluados+'</div></div>';
        html+='<div style="flex:1;min-width:80px;padding:8px;background:var(--s3);border-radius:8px;text-align:center"><div style="font-size:9px;font-weight:700;color:#94a3b8">PUNTOS</div><div style="font-size:18px;font-weight:800;color:'+(chk.prom_puntaje>=80?'var(--green)':chk.prom_puntaje>=60?'var(--gold-d)':'var(--red)')+'">'+(chk.total_actual_points||0)+'/'+(chk.total_expected_points||0)+'</div></div>';
        if(chk.prom_eval)html+='<div style="flex:1;min-width:80px;padding:8px;background:var(--s3);border-radius:8px;text-align:center"><div style="font-size:9px;font-weight:700;color:#94a3b8">EVAL. TURNO SIG.</div><div style="font-size:18px;font-weight:800;color:var(--navy)">'+chk.prom_eval+'%</div></div>';
        html+='</div>';

        // Sede desglose
        var sedes=Object.keys(chk.por_sede||{});
        if(sedes.length>0){
          html+='<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">Desglose por sede</div>';
          html+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
          sedes.forEach(function(s){
            var ps=chk.por_sede[s];
            html+='<div style="padding:6px 10px;background:rgba(46,62,110,.06);border:1px solid rgba(46,62,110,.12);border-radius:6px;font-size:11px">';
            html+='<strong>'+(SEDES[s]?.short||s)+'</strong> \u2014 '+ps.reportes+' rep. ('+ps.evaluados+' eval.) \u2014 Puntaje: <strong>'+ps.puntaje_prom+'%</strong>';
            if(ps.puntaje_eval_prom)html+=' \u2014 Eval: <strong>'+ps.puntaje_eval_prom+'%</strong>';
            html+='</div>';
          });
          html+='</div></div>';
        }

        // Checklist groups
        html+=_renderChkGroup(chk.operaciones,'\ud83d\udccb Operaciones (AT + BT)','var(--navy)');
        html+=_renderChkGroup(chk.software,'\ud83d\udcbb Software (AS + BS)','#7c3aed');
        html+=_renderChkGroup(chk.limpieza,'\ud83e\uddf9 Limpieza (OL)','#0d9488');

        // Incidencias detalladas
        if(chk.incidencias&&chk.incidencias.length>0){
          html+='<div style="margin-top:12px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px">';
          html+='<div style="font-weight:700;color:#991b1b;font-size:12px;margin-bottom:8px">\ud83d\udea8 '+chk.incidencias.length+' incidencia(s) en el periodo</div>';
          chk.incidencias.forEach(function(inc){
            html+='<div style="padding:6px 8px;background:#fff;border-radius:6px;border-left:3px solid #ef4444;margin-bottom:4px;font-size:11px">';
            html+='<strong>'+(inc.fecha||'')+'</strong> \u2014 '+(inc.tipo||'')+': '+(inc.descripcion||'\u2014');
            html+=' <span style="color:#94a3b8">('+(inc.nivel||'')+' \u2014 '+((SEDES[inc.sede]||{}).short||inc.sede||'')+')</span>';
            if(inc.puntos_penalidad)html+=' <span style="color:#dc2626;font-weight:700">-'+inc.puntos_penalidad+'pts</span>';
            html+='</div>';
          });
          html+='<div style="font-size:10px;color:#b91c1c;margin-top:6px">Penalidad total: -'+(chk.incidencias.reduce(function(s,i){return s+(i.puntos_penalidad||0)},0)||Math.min(20,chk.incidencias.length*2))+' pts</div></div>';
        }else{
          html+='<div style="margin-top:10px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:11px;color:#166534">\u2705 Sin incidencias en el periodo</div>';
        }
        chkBox.innerHTML=html;
        document.getElementById('evalMNotaOp').value=chk.operaciones?.nota20||0;
        document.getElementById('evalMNotaSw').value=chk.software?.nota20||0;
        document.getElementById('evalMNotaLimp').value=chk.limpieza?.nota20||0;
        // ── Indicador N/A: si una categoría no tuvo ninguna actividad
        // evaluada en el periodo (típico de almacén con software), mostrar
        // un aviso visual en el label. La nota queda en 0 pero el admin
        // sabe que no es un cero ganado, sino una categoría no aplicable.
        function _markNA(grpKey, lblId, inpId) {
          var grp = chk[grpKey];
          var n = (grp && grp.detalle) ? grp.detalle.reduce(function(s,d){return s+(d.veces_hecha||0)},0) : 0;
          var lbl = document.getElementById(lblId);
          var inp = document.getElementById(inpId);
          if (n === 0) {
            if (lbl) lbl.innerHTML = '<span style="color:var(--text3);font-style:italic">N/A — sin actividades en el periodo</span>';
            if (inp) { inp.style.background = 'var(--s3)'; inp.style.color = 'var(--text3)'; }
          } else {
            if (inp) { inp.style.background = ''; inp.style.color = ''; }
          }
        }
        _markNA('operaciones', 'evalMLblOp', 'evalMNotaOp');
        _markNA('software',    'evalMLblSw', 'evalMNotaSw');
        _markNA('limpieza',    'evalMLblLimp','evalMNotaLimp');
        if(chk.incidencias&&chk.incidencias.length>0){
          // Use actual puntos_penalidad from each record, fallback to config
          var hasPuntos=chk.incidencias.some(function(i){return i.puntos_penalidad>0;});
          var totalDesc=0;
          if(hasPuntos){
            chk.incidencias.forEach(function(inc){totalDesc+=inc.puntos_penalidad||0;});
          }else{
            var cfg=_evalConfig||{};
            var incMap={'Uniforme':'inc_uniforme','Orden/Limpieza':'inc_orden_limpieza','Documentación':'inc_documentacion','Equipos eléctricos':'inc_equipos_electricos','Seguridad al cerrar':'inc_seguridad_cerrar','Graves':'inc_graves','Otro':'inc_otros','Otros':'inc_otros'};
            chk.incidencias.forEach(function(inc){var key=incMap[inc.tipo]||'inc_otros';totalDesc+=parseInt(cfg[key]||2);});
          }
          document.getElementById('evalMDescInc').value=Math.min(20,totalDesc);
        }
        calcEvalMensualPreview();
      }else{
        chkBox.innerHTML='<div style="color:var(--text3);font-size:12px">Sin reportes en el periodo seleccionado. Las notas se ingresan manualmente abajo.</div>';
      }
    }catch(e){
      console.error('[Checklists]',e);
      chkBox.innerHTML='<div style="color:var(--text3);font-size:12px">Sin datos de reportes. Ingresa las notas manualmente abajo.</div>';
    }
  }
  // ═══ 4. TARDANZAS AUTOMÁTICAS ═══
  try {
    var asistData = await API.get('/asistencias/resumen?emp_id='+empId+'&fecha_desde='+(desde||'')+'&fecha_hasta='+(hasta||''));
    if (asistData && asistData.notaTardanza !== undefined) {
      document.getElementById('evalMNotaTardanza').value = asistData.notaTardanza;
    }
  } catch(e) {}


  // ═══ 5. VENTAS + PIPELINE ═══
  var mes = (desde||'').slice(0,7);
  if (mes) await cargarVentasPipeline(empId, mes);

  calcEvalMensualPreview();
}

function _renderChkGroup(data,label,color){
  if(!data||!data.detalle||!data.detalle.length)return '<div style="color:var(--text3);font-size:11px;margin-bottom:8px">'+label+' \u2014 Sin datos</div>';
  var totalPts = 0, maxPts = 0;
  data.detalle.forEach(function(d){ totalPts += d.suma_ponderada||0; maxPts += d.max_posible||0; });
  var pctTotal = maxPts > 0 ? Math.round((totalPts/maxPts)*100) : 0;
  var pctColor = pctTotal>=80?'#16a34a':pctTotal>=50?'#ca8a04':'#dc2626';
  var h='<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:12px;font-weight:700;color:'+color+'">'+label+'</div>';
  h+='<div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:var(--text3)">'+Math.round(totalPts)+' / '+(Math.round(maxPts*10)/10)+' pts</span><span style="font-size:14px;font-weight:800;color:'+pctColor+'">'+data.nota20+'/20</span></div></div>';
  // Progress bar
  h+='<div style="background:var(--s3);border-radius:4px;height:6px;margin-bottom:8px;overflow:hidden"><div style="width:'+pctTotal+'%;height:100%;background:'+pctColor+';border-radius:4px;transition:width .5s"></div></div>';
  h+='<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:var(--s3)"><th style="padding:5px 8px;text-align:left">Actividad</th><th style="padding:5px 8px;text-align:center;width:50px">Peso</th><th style="padding:5px 8px;text-align:center;width:70px">Reportes</th><th style="padding:5px 8px;text-align:center;width:90px">Puntos</th></tr></thead><tbody>';
  data.detalle.forEach(function(d){
    var pts = Math.round((d.suma_ponderada||0)*10)/10;
    var maxP = d.max_posible||0;
    var pct = maxP>0?Math.round((pts/maxP)*100):0;
    var barClr = pct>=80?'#16a34a':pct>=50?'#ca8a04':'#dc2626';
    h+='<tr style="border-bottom:1px solid var(--border-s)">';
    h+='<td style="padding:5px 8px"><span style="color:var(--text3);font-size:9px">'+d.cod+'</span> '+d.nombre+'</td>';
    h+='<td style="padding:5px 8px;text-align:center;font-weight:600">'+d.peso+'</td>';
    h+='<td style="padding:5px 8px;text-align:center">'+d.veces_hecha+'<span style="color:var(--text3)">/'+(d.expected_count||d.total_reportes||0)+'</span></td>';
    h+='<td style="padding:5px 8px;text-align:center"><strong style="color:'+barClr+'">'+pts+'</strong><span style="color:var(--text3)"> / '+maxP+'</span></td>';
    h+='</tr>';
  });
  h+='<tr style="background:var(--s3);font-weight:700"><td style="padding:6px 8px">Total</td><td></td><td></td><td style="padding:6px 8px;text-align:center;color:'+pctColor+'">'+Math.round(totalPts)+' / '+(Math.round(maxPts*10)/10)+'</td></tr>';
  h+='</tbody></table></div>';
  return h;
}

function selComp(btn){
  var comp=btn.dataset.comp;var val=parseInt(btn.dataset.val);
  document.getElementById('evalC-'+comp).value=val;
  document.getElementById('evalCPts-'+comp).textContent=val+'/4';
  var btns=document.querySelectorAll('[data-comp="'+comp+'"]');
  var colors=['#dc2626','#ea580c','#ca8a04','#16a34a','#059669'];
  btns.forEach(function(b){
    var v=parseInt(b.dataset.val);
    if(v<=val){b.style.border='2px solid '+colors[v];b.style.background=colors[v]+'18';}
    else{b.style.border='2px solid transparent';b.style.background='var(--s3)';}
  });
  calcEvalMensualPreview();
}

var _evalConfig = null;
async function loadEvalConfig() {
  if (_evalConfig) return _evalConfig;
  _evalConfig = await API.get('/config') || {};
  return _evalConfig;
}

function calcVentaBonus() {
  var meta = parseFloat(document.getElementById('evalMVentaMeta')?.value) || 0;
  var vendido = parseFloat(document.getElementById('evalMVentaVendido')?.value) || 0;
  var pct = meta > 0 ? Math.round((vendido / meta) * 100) : 0;
  var cfg = _evalConfig || {};
  var bonus = 0;
  if (pct >= 120) bonus = parseFloat(cfg.venta_bonus_max) || 2.0;
  else if (pct >= 100) bonus = parseFloat(cfg.venta_bonus_120) || 1.5;
  else if (pct >= 80) bonus = parseFloat(cfg.venta_bonus_80) || 0.5;
  var info = document.getElementById('evalMVentaInfo');
  if (info) {
    var color = pct >= 100 ? 'var(--green)' : pct >= 80 ? 'var(--gold-d)' : 'var(--red)';
    info.innerHTML = '<span style="color:' + color + '">' + pct + '% cumplimiento</span><span style="font-weight:700;color:var(--gold-d)">Bonus: +' + bonus.toFixed(1) + '</span>';
  }
  window._ventaBonus = bonus;
  calcEvalMensualPreview();
}

async function cargarVentasPipeline(empId, mes) {
  // Ventas
  try {
    var venta = await API.get('/ventas/bonus/' + empId + '/' + mes);
    if (venta) {
      document.getElementById('evalMVentaMeta').value = venta.meta || 0;
      document.getElementById('evalMVentaVendido').value = venta.vendido || 0;
      calcVentaBonus();
    }
  } catch(e) {}

  // Pipeline
  var pipeInfo = document.getElementById('evalMPipelineInfo');
  try {
    var pipe = await API.get('/ventas/pipeline-bonus/' + empId + '/' + mes);
    if (pipe && pipeInfo) {
      var pct = pipe.meta > 0 ? Math.round((pipe.puntos / pipe.meta) * 100) : 0;
      var barColor = pipe.puntos >= pipe.meta ? '#16a34a' : '#ca8a04';
      var barW = Math.min(100, pct);
      var html = '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-weight:600">' + pipe.puntos + ' / ' + pipe.meta + ' pts</span><span style="font-weight:700;color:' + barColor + '">' + pct + '%</span></div>';
      html += '<div style="background:var(--border-s);border-radius:4px;height:8px;overflow:hidden;margin-bottom:8px"><div style="width:' + barW + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width .5s"></div></div>';
      // Desglose
      if (pipe.desglose) {
        var items = ['planchado','lavado','empatado','compostura','refaccion'];
        var labels = {planchado:'Planchado',lavado:'Lavado',empatado:'Empatado',compostura:'Compostura',refaccion:'Refacción'};
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
        items.forEach(function(k) {
          var pts = pipe.desglose[k] || 0;
          var cant = (pipe.desgloseCant||{})[k] || 0;
          if (cant > 0) html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(22,163,34,.08);color:#16a34a">' + labels[k] + ': ' + cant + 'u (' + pts + 'pts)</span>';
        });
        html += '</div>';
      }
      if (pipe.extra > 0) html += '<div style="margin-top:6px;font-size:11px;font-weight:700;color:var(--green)">+' + pipe.extra + ' pts extra × S/' + pipe.precio + ' = S/ ' + pipe.bonificacion.toFixed(2) + '</div>';
      else if (pipe.puntos > 0) html += '<div style="margin-top:4px;font-size:10px;color:var(--text3)">Faltan ' + (pipe.meta - pipe.puntos) + ' pts para meta</div>';
      else html += '<div style="font-size:10px;color:var(--text3)">Sin actividad en pipeline</div>';
      // Weekly breakdown
      if (pipe.semanas && Object.keys(pipe.semanas).length > 0) {
        var ms = pipe.metaSemanal || 20;
        html += '<div style="margin-top:10px;border-top:1px solid var(--border-s);padding-top:8px"><div style="font-size:10px;font-weight:700;color:var(--text2);margin-bottom:6px">Meta semanal: ' + ms + ' pts</div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
        var wks = Object.keys(pipe.semanas).sort();
        wks.forEach(function(wk, i) {
          var s = pipe.semanas[wk];
          var pctW = ms > 0 ? Math.min(100, Math.round((s.pts / ms) * 100)) : 0;
          var clrW = pctW >= 100 ? '#16a34a' : pctW >= 60 ? '#ca8a04' : '#dc2626';
          html += '<div style="flex:1;min-width:70px;padding:6px;background:var(--s2);border-radius:6px;text-align:center">';
          html += '<div style="font-size:9px;color:var(--text3)">Sem ' + (i+1) + '</div>';
          html += '<div style="font-size:14px;font-weight:800;color:' + clrW + '">' + s.pts + '</div>';
          html += '<div style="font-size:8px;color:var(--text3)">' + s.items + ' prendas</div>';
          html += '<div style="margin-top:3px;background:var(--border-s);border-radius:2px;height:4px;overflow:hidden"><div style="width:' + pctW + '%;height:100%;background:' + clrW + ';border-radius:2px"></div></div>';
          html += '</div>';
        });
        html += '</div></div>';
      }
      pipeInfo.innerHTML = html;
    }
  } catch(e) { if(pipeInfo) pipeInfo.innerHTML = '<span style="font-size:11px;color:var(--text3)">Sin datos de pipeline</span>'; }
}

function calcEvalMensualPreview() {
  var compTotal=0;
  COMPETENCIAS.forEach(function(c){var sel=document.getElementById('evalC-'+c.id);compTotal+=sel?parseInt(sel.value||0):0;});
  var compNota=Number(((compTotal/32)*20).toFixed(1));
  var notaValores=parseFloat(document.getElementById('evalMNotaValores')?.value||0);
  var notaOp=parseFloat(document.getElementById('evalMNotaOp')?.value||0);
  var notaSw=parseFloat(document.getElementById('evalMNotaSw')?.value||0);
  var notaLimp=parseFloat(document.getElementById('evalMNotaLimp')?.value||0);
  var notaExamenes=parseFloat(document.getElementById('evalMNotaExam')?.value||0);
  var notaTardanza=parseFloat(document.getElementById('evalMNotaTardanza')?.value||0);
  var descIncidencias=parseFloat(document.getElementById('evalMDescInc')?.value||0);
  var cfg = _evalConfig || {};
  var W = {
    comp: (parseInt(cfg.peso_competencias)||25)/100,
    val: (parseInt(cfg.peso_valores360)||25)/100,
    op: (parseInt(cfg.peso_operaciones)||10)/100,
    sw: (parseInt(cfg.peso_software)||10)/100,
    limp: (parseInt(cfg.peso_limpieza)||10)/100,
    exam: (parseInt(cfg.peso_conocimientos)||15)/100,
    tard: (parseInt(cfg.peso_tardanzas)||5)/100,
  };
  var notaBase=(compNota*W.comp)+(notaValores*W.val)+(notaOp*W.op)+(notaSw*W.sw)+(notaLimp*W.limp)+(notaExamenes*W.exam)+(notaTardanza*W.tard);
  var ventaBonus = window._ventaBonus || 0;
  var notaFinal=parseFloat(Math.max(0,notaBase-descIncidencias+ventaBonus).toFixed(1));
  var prev=document.getElementById('evalMPreview');
  if(prev){
    var cls=notaFinal>=17?'excellent':notaFinal>=14?'good':notaFinal>=11?'regular':'bad';
    var rows=[
      ['Competencias (Jefe)',compNota,(W.comp*100).toFixed(0)+'%',(compNota*W.comp).toFixed(1),false],
      ['Valores 360\u00b0',notaValores,(W.val*100).toFixed(0)+'%',(notaValores*W.val).toFixed(1),false],
      ['Operaciones (AT+BT)',notaOp,(W.op*100).toFixed(0)+'%',(notaOp*W.op).toFixed(1),false],
      ['Software (AS+BS)',notaSw,(W.sw*100).toFixed(0)+'%',(notaSw*W.sw).toFixed(1),false],
      ['Limpieza (OL)',notaLimp,(W.limp*100).toFixed(0)+'%',(notaLimp*W.limp).toFixed(1),false],
      ['Ex\u00e1menes',notaExamenes,(W.exam*100).toFixed(0)+'%',(notaExamenes*W.exam).toFixed(1),false],
      ['Tardanzas',notaTardanza,(W.tard*100).toFixed(0)+'%',(notaTardanza*W.tard).toFixed(1),false],
    ];
    prev.innerHTML='<table class="data-table" style="margin-bottom:14px"><thead><tr><th>Componente</th><th style="text-align:center">Nota /20</th><th style="text-align:center">Peso</th><th style="text-align:center">Ponderado</th></tr></thead><tbody>'+rows.map(function(r){return '<tr'+(r[4]?' style="color:var(--red)"':'')+'><td>'+r[0]+'</td><td style="text-align:center;font-weight:700">'+(r[4]?'-':'')+r[1]+'</td><td style="text-align:center;color:var(--text3)">'+r[2]+'</td><td style="text-align:center;font-weight:700;color:'+(r[4]?'var(--red)':'var(--navy)')+'">'+(r[4]?'-':'')+r[3]+'</td></tr>'}).join('')
      +(descIncidencias>0?'<tr style="color:var(--red)"><td>Incidencias</td><td style="text-align:center;font-weight:700">-'+descIncidencias+'</td><td style="text-align:center">desc.</td><td style="text-align:center;font-weight:700">-'+descIncidencias.toFixed(1)+'</td></tr>':'')
      +(ventaBonus>0?'<tr style="color:var(--green)"><td>Bonus ventas</td><td style="text-align:center;font-weight:700">+'+ventaBonus+'</td><td style="text-align:center">bonus</td><td style="text-align:center;font-weight:700;color:var(--green)">+'+ventaBonus.toFixed(1)+'</td></tr>':'')
      +'</tbody></table><div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:var(--s3);border-radius:var(--r)"><div style="font-size:14px;font-weight:700">'+(notaFinal>=17?'\u2b50 Excelente':notaFinal>=14?'\u2705 Buen desempe\u00f1o':notaFinal>=11?'\u26a0\ufe0f Requiere mejorar':'\u274c Bajo rendimiento')+'</div><div class="score-pill '+cls+'" style="font-size:22px;padding:12px 22px">'+notaFinal+'/20</div></div>';
  }
}

async function guardarEvalMensual() {
  var empId=STATE.evalMensualEmp;var desde=STATE.evalMensualDesde;var hasta=STATE.evalMensualHasta;
  if(!empId){showToast('Selecciona un colaborador','error');return;}
  var compTotal=0;
  COMPETENCIAS.forEach(function(c){var sel=document.getElementById('evalC-'+c.id);compTotal+=sel?parseInt(sel.value||0):0;});
  var nota_competencias=parseFloat(((compTotal/32)*20).toFixed(1));
  var nota_valores=parseFloat(document.getElementById('evalMNotaValores')?.value||0);
  var nota_operaciones=parseFloat(document.getElementById('evalMNotaOp')?.value||0);
  var nota_software=parseFloat(document.getElementById('evalMNotaSw')?.value||0);
  var nota_limpieza=parseFloat(document.getElementById('evalMNotaLimp')?.value||0);
  var nota_examenes=parseFloat(document.getElementById('evalMNotaExam')?.value||0);
  var nota_tardanza=parseFloat(document.getElementById('evalMNotaTardanza')?.value||0);
  var desc_incidencias=parseFloat(document.getElementById('evalMDescInc')?.value||0);
  var ventaBonus = window._ventaBonus || 0;
  var obs=document.getElementById('evalMObsGeneral')?.value||'';
  var cfg = _evalConfig || {};
  var W = {
    comp: (parseInt(cfg.peso_competencias)||25)/100,
    val: (parseInt(cfg.peso_valores360)||25)/100,
    op: (parseInt(cfg.peso_operaciones)||10)/100,
    sw: (parseInt(cfg.peso_software)||10)/100,
    limp: (parseInt(cfg.peso_limpieza)||10)/100,
    exam: (parseInt(cfg.peso_conocimientos)||15)/100,
    tard: (parseInt(cfg.peso_tardanzas)||5)/100,
  };
  var notaBase=(nota_competencias*W.comp)+(nota_valores*W.val)+(nota_operaciones*W.op)+(nota_software*W.sw)+(nota_limpieza*W.limp)+(nota_examenes*W.exam)+(nota_tardanza*W.tard);
  var nota_final=parseFloat(Math.max(0,notaBase-desc_incidencias+ventaBonus).toFixed(1));
  var recomendacion=nota_final>=17?'Excelente':nota_final>=14?'Buen desempe\u00f1o':nota_final>=11?'Requiere mejorar':'Bajo rendimiento';

  // Save ventas
  var ventaMeta = parseFloat(document.getElementById('evalMVentaMeta')?.value) || 0;
  var ventaVendido = parseFloat(document.getElementById('evalMVentaVendido')?.value) || 0;
  var mes = (desde||'').slice(0,7);
  if (ventaMeta > 0 && mes) {
    await API.post('/ventas', {emp_id: empId, mes: mes, meta_soles: ventaMeta, vendido_soles: ventaVendido});
  }

  // Snapshot de pesos: persistir los pesos exactos usados al cierre, así
  // ediciones futuras NO recalculan retroactivamente (regla del usuario).
  var pesosSnapshot = {
    peso_competencias:  parseFloat(cfg.peso_competencias)  || 25,
    peso_valores360:    parseFloat(cfg.peso_valores360)    || 25,
    peso_operaciones:   parseFloat(cfg.peso_operaciones)   || 10,
    peso_software:      parseFloat(cfg.peso_software)      || 10,
    peso_limpieza:      parseFloat(cfg.peso_limpieza)      || 10,
    peso_conocimientos: parseFloat(cfg.peso_conocimientos) || 15,
    peso_tardanzas:     parseFloat(cfg.peso_tardanzas)     || 5
  };
  var r=await API.guardarEvalMensual({
    emp_id:empId, mes:mes||desde+'_'+hasta,
    ciclo_desde: desde, ciclo_hasta: hasta,
    nota_competencias:nota_competencias, nota_valores:nota_valores,
    nota_operaciones:nota_operaciones, nota_software:nota_software,
    nota_limpieza:nota_limpieza, nota_examenes:nota_examenes, nota_tardanza:nota_tardanza,
    descuento_incidencias:desc_incidencias, bonus_ventas:ventaBonus,
    nota_final:nota_final, recomendacion:recomendacion, obs_general:obs,
    evaluador:STATE.user?.nombre||'Admin',
    pesos_usados: pesosSnapshot
  });
  if(r){showToast('\u2705 Evaluaci\u00f3n guardada \u2014 '+nota_final+'/20','success');await renderEvalMensualHistorial();}
}

async function renderEvalMensualHistorial() {
  var evals=await API.evalsMensuales({});if(!evals)return;
  var body=document.getElementById('evalMHistBody');if(!body)return;
  body.innerHTML=evals.length===0?'<tr><td class="empty-cell" colspan="6">Sin evaluaciones</td></tr>'
    :evals.map(function(ev){
      var emp=STATE.empleadosCache.find(function(e){return e.id===ev.emp_id});
      var cls=ev.nota_final>=17?'excellent':ev.nota_final>=14?'good':ev.nota_final>=11?'regular':'bad';
      return '<tr style="cursor:pointer" onclick="iniciarEvalMensual(\''+ev.emp_id+'\')"><td style="font-weight:600">'+(emp?.nombre||ev.emp_id)+'</td><td class="mono" style="font-size:11px">'+ev.mes+'</td><td><div class="score-pill '+cls+'">'+ev.nota_final+'/20</div></td><td style="font-size:12px">'+ev.recomendacion+'</td><td>'+(ev.evaluador||'')+'</td><td style="font-size:11px">'+(ev.obs_general||'\u2014')+'</td></tr>';
    }).join('');
}


// ══════════════════════════════════════════════════════
// GESTIÓN DE ACTIVIDADES — Admin
// ══════════════════════════════════════════════════════

async function gaCargarActividades() {
  var sede = document.getElementById('gaSedeSelect')?.value;
  if (!sede) return;
  gaLoadLayout();
  var acts = await API.req('GET', '/actividades/admin?sede=' + sede);
  var body = document.getElementById('gaTableBody');
  if (!body) return;
  if (!acts||!acts.length) {
    body.innerHTML='<tr><td class="empty-cell" colspan="10">Sin actividades para esta sede</td></tr>';
    document.getElementById('gaCount').textContent='(0)';return;
  }
  STATE._gaAllActs=acts;
  document.getElementById('gaCount').textContent='('+acts.length+')';
  var CL={PO:'cat-po',IND:'cat-ind',SO:'cat-so',EXT:'cat-ext'};
  var CN={PO:'Primer Orden',IND:'Indispensable',SO:'Segundo Orden',EXT:'Extra'};
  var TI={ambos:'⏳',M:'☀',T:'🌙'};
  body.innerHTML=acts.map(function(a,i){
    var f=parseInt(a.frecuencia_dias)||0,ft='Diaria';
    if(f===7&&a.dia_semana){
      var ds=a.dia_semana.split(',').map(function(d){return({lunes:'L',martes:'M',miercoles:'Mi',jueves:'J',viernes:'V',sabado:'S',domingo:'D'})[d.trim()]||d;}).join(' ');
      var sw=parseInt(a.aparece_dia)||1;ft=ds+(sw>1?' c/'+sw+'sem':'');
    } else if(f===2)ft='Interdiaria';
    else if(f>2&&f!==7)ft='Cada '+f+'d';
    return '<tr style="'+(a.activa?'':'opacity:.4')+'">'+
      '<td class="mono" style="font-size:10px;color:var(--text3)">'+(i+1)+'</td>'+
      '<td><div style="font-weight:600;font-size:12px">'+a.nombre+'</div><div class="mono" style="font-size:9px;color:var(--text3)">'+a.cod+'</div></td>'+
      '<td><span class="act-cat '+(CL[a.categoria]||'cat-ext')+'">'+(CN[a.categoria]||a.categoria)+'</span></td>'+
      '<td style="font-size:11px">'+(TI[a.turno]||'⏳')+' '+(a.turno||'ambos')+'</td>'+
      '<td class="mono" style="font-weight:700">'+a.peso+'</td>'+
      '<td class="mono" style="color:'+(a.descuento>0?'var(--red)':'var(--text3)')+'">'+((a.descuento||0)>0?'-'+a.descuento:'—')+'</td>'+
      '<td style="font-size:10px">'+ft+'</td>'+
      '<td style="text-align:center">'+(a.acumula?'<span style="color:var(--green)">✅</span>':'—')+'</td>'+
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+(a.activa?'#16a34a':'#94a3b8')+'"></span></td>'+
      '<td><div style="display:flex;gap:3px">'+
        '<button class="btn btn-ghost" style="padding:3px 8px;font-size:10px" onclick="gaEditarActividad('+a.id+')">Editar</button>'+
        '<button class="btn" style="padding:3px 6px;font-size:9px;background:var(--red-bg);color:var(--red);border:none" onclick="gaEliminarActividad('+a.id+',\''+a.nombre.replace(/'/g,"\\'")+'\')">✕</button>'+
      '</div></td></tr>';
  }).join('');
}

// ── Tipo: obligatoria vs extra ──
function gaSelTipo(val){
  document.getElementById('gaActTipoAct').value=val;
  document.querySelectorAll('.ga-tipo-btn').forEach(function(b){
    var s=b.dataset.val===val;
    b.style.border=s?'1.5px solid var(--navy)':'1.5px solid transparent';
    b.style.background=s?'rgba(46,62,110,.06)':'var(--s3)';
    b.style.color=s?'var(--navy)':'var(--text2)';
  });
  var isExtra=val==='por_puntos';
  document.getElementById('gaActCatWrap').style.display=isExtra?'none':'';
  document.getElementById('gaActSubtipoWrap').style.display=isExtra?'none':'';
  document.getElementById('gaActUnidadWrap').style.display=isExtra?'':'none';
  // Extras: no descuento, no turno, no periodicidad, no acumula
  var dw=document.getElementById('gaActDescuento')?.parentElement;if(dw)dw.style.display=isExtra?'none':'';
  var tw=document.getElementById('gaTurnoSection');if(tw)tw.style.display=isExtra?'none':'';
  var fw=document.getElementById('gaFreqSection');if(fw)fw.style.display=isExtra?'none':'';
  var aw=document.getElementById('gaAcumulaBox');if(aw)aw.style.display=isExtra?'none':'';
  if(isExtra){document.getElementById('gaActCat').value='EXT';gaSelTurno('ambos');gaSelFreq('diaria');}
}

// ── Sub-tipo: Ternos vs Software ──
function gaSelSub(val){
  document.getElementById('gaActSubtipo').value=val;
  document.querySelectorAll('.ga-sub-btn').forEach(function(b){
    var s=b.dataset.val===val;
    b.style.border=s?'1.5px solid var(--navy)':'1.5px solid transparent';
    b.style.background=s?'rgba(46,62,110,.06)':'var(--s3)';
    b.style.color=s?'var(--navy)':'var(--text2)';
  });
}

// ── Auto-code generation ──
function gaAutoCode(){
  var tipo=document.getElementById('gaActTipoAct').value;
  var cat=document.getElementById('gaActCat').value;
  var sub=document.getElementById('gaActSubtipo').value||'T';
  if(tipo==='por_puntos') return 'XTR';
  if(cat==='IND') return 'OL'; // Indispensable: OL## (no T/S relation)
  var prefix=(cat==='PO')?'A':'B';
  return prefix+sub;
}
function gaOnCatChange(){
  var cat=document.getElementById('gaActCat').value;
  var sw=document.getElementById('gaActSubtipoWrap');
  if(sw) sw.style.display=cat==='IND'?'none':'';
}

// ── Turno ──
function gaSelTurno(val){
  document.getElementById('gaActTurno').value=val;
  document.querySelectorAll('.ga-turno-btn').forEach(function(b){
    var s=b.dataset.val===val;
    b.style.border=s?'1.5px solid var(--navy)':'1.5px solid transparent';
    b.style.background=s?'rgba(46,62,110,.06)':'var(--s3)';
    b.style.color=s?'var(--navy)':'var(--text2)';
  });
}

// ── Periodicidad ──
function gaSelFreq(val){
  document.querySelectorAll('.ga-freq-btn').forEach(function(b){
    var s=b.dataset.val===val;
    b.style.border=s?'1.5px solid var(--navy)':'1.5px solid transparent';
    b.style.background=s?'rgba(46,62,110,.06)':'#fff';
    b.style.color=s?'var(--navy)':'var(--text2)';
  });
  var cw=document.getElementById('gaFreqCustomWrap');
  var dw=document.getElementById('gaFreqDiasWrap');
  if(cw)cw.style.display=val==='custom'?'':'none';
  if(dw)dw.style.display=val==='semanal'?'':'none';
  if(val==='diaria') document.getElementById('gaActFrecuencia').value='0';
  else if(val==='custom') document.getElementById('gaActFrecuencia').value=document.getElementById('gaActFreqCustom')?.value||'2';
  else if(val==='semanal') document.getElementById('gaActFrecuencia').value='7';
}

function gaToggleDia(btn){
  var on=btn.dataset.on==='1';
  btn.dataset.on=on?'':'1';
  btn.style.background=on?'#fff':'rgba(46,62,110,.12)';
  btn.style.border=on?'1.5px solid var(--border)':'1.5px solid var(--navy)';
  btn.style.color=on?'var(--text2)':'var(--navy)';
  var dias=[];
  document.querySelectorAll('.ga-dia-btn').forEach(function(b){
    if(b.dataset.on==='1') dias.push(b.dataset.dia);
  });
  document.getElementById('gaActDiaSemana').value=dias.join(',');
}

function gaSetDias(diasStr){
  document.querySelectorAll('.ga-dia-btn').forEach(function(b){
    b.dataset.on='';b.style.background='#fff';b.style.border='1.5px solid var(--border)';b.style.color='var(--text2)';
  });
  if(!diasStr)return;
  diasStr.split(',').forEach(function(d){
    d=d.trim();
    document.querySelectorAll('.ga-dia-btn').forEach(function(b){
      if(b.dataset.dia===d){
        b.dataset.on='1';b.style.background='rgba(46,62,110,.12)';b.style.border='1.5px solid var(--navy)';b.style.color='var(--navy)';
      }
    });
  });
  document.getElementById('gaActDiaSemana').value=diasStr;
}

// ── Sedes ──
function gaToggleSede(el){
  var on=el.dataset.on==='1';
  el.dataset.on=on?'':'1';
  el.style.background=on?'var(--s3)':'rgba(46,62,110,.1)';
  el.style.border=on?'1.5px solid var(--border)':'1.5px solid var(--navy)';
  el.style.color=on?'var(--text2)':'var(--navy)';
}
function gaSetSedes(arr){
  document.querySelectorAll('#gaActSedes .sede-chip').forEach(function(el){
    var on=arr.indexOf(el.dataset.sede)>=0;
    el.dataset.on=on?'1':'';
    el.style.background=on?'rgba(46,62,110,.1)':'var(--s3)';
    el.style.border=on?'1.5px solid var(--navy)':'1.5px solid var(--border)';
    el.style.color=on?'var(--navy)':'var(--text2)';
  });
}
function gaGetSedes(){
  var s=[];
  document.querySelectorAll('#gaActSedes .sede-chip').forEach(function(el){
    if(el.dataset.on==='1') s.push(el.dataset.sede);
  });
  return s;
}

// ── Acumula ──
function gaToggleAcumula(){
  var cb=document.getElementById('gaActAcumula');cb.checked=!cb.checked;
  var box=document.getElementById('gaAcumulaBox');
  var dot=document.getElementById('gaAcumulaDot');
  if(box){box.style.background=cb.checked?'rgba(22,163,74,.06)':'var(--s3)';box.style.border=cb.checked?'1.5px solid rgba(22,163,74,.25)':'1.5px solid transparent';}
  if(dot)dot.style.background=cb.checked?'#16a34a':'#94a3b8';
}
function gaSetAcumula(val){
  document.getElementById('gaActAcumula').checked=!val;
  gaToggleAcumula();
}

function gaTogglePrecio(){}

// ── Abrir modal: nueva ──
function gaAbrirModalNueva(){
  document.getElementById('gaEditId').value='';
  document.getElementById('gaModalTitle').textContent='Nueva Actividad';
  document.getElementById('gaActNombre').value='';
  // code auto-generated
  document.getElementById('gaActPeso').value=1;
  document.getElementById('gaActDescuento').value=0;
  document.getElementById('gaActUnidad').value='unidad';
  document.getElementById('gaActDiaSemana').value='';
  document.getElementById('gaActOrden').value=0;
  var sw=document.getElementById('gaActCadaSemanas');if(sw)sw.value=1;
  gaSelTipo('obligatoria');
  gaSelSub('T');
  gaSetSedes(['LB','ST','TR']);
  gaSelTurno('ambos');
  gaSelFreq('diaria');
  gaSetDias('');
  gaSetAcumula(true);
  document.getElementById('gaActCat').value='PO';
  openModal('gaModal');
}

// ── Abrir modal: editar ──
async function gaEditarActividad(id){
  var sede=document.getElementById('gaSedeSelect')?.value;
  var acts=STATE._gaAllActs||await API.req('GET','/actividades/admin?sede='+sede);
  var a=acts?.find(function(x){return x.id===id});
  if(!a){showToast('Actividad no encontrada','error');return;}

  document.getElementById('gaEditId').value=id;
  document.getElementById('gaModalTitle').textContent='Editar: '+a.nombre;
  document.getElementById('gaActNombre').value=a.nombre;
  // code preserved internally
  document.getElementById('gaEditId').dataset.cod=a.cod;
  document.getElementById('gaActPeso').value=a.peso;
  document.getElementById('gaActDescuento').value=a.descuento||0;
  document.getElementById('gaActUnidad').value=a.unidad||'unidad';
  document.getElementById('gaActOrden').value=a.orden||0;

  // Tipo
  var tipo=a.tipo_act||'obligatoria';
  gaSelTipo(tipo);

  // Categoría
  document.getElementById('gaActCat').value=a.categoria||'PO';

  // Subtipo: infer from code prefix
  var cod=a.cod||'';
  if(cod.match(/^[AB]S/)) gaSelSub('S');
  else gaSelSub('T');

  // Sedes: find all sedes this cod exists in
  var allSedes=acts.filter(function(x){return x.cod===a.cod}).map(function(x){return x.sede});
  gaSetSedes(allSedes.length?allSedes:[a.sede]);

  // Turno
  gaSelTurno(a.turno||'ambos');

  // Periodicidad
  var freq=parseInt(a.frecuencia_dias)||0;
  if(freq===0||freq===1){
    gaSelFreq('diaria');
  } else if(freq===7){
    gaSelFreq('semanal');
    gaSetDias(a.dia_semana||'');
    var sw=document.getElementById('gaActCadaSemanas');
    if(sw) sw.value=parseInt(a.aparece_dia)||1;
  } else {
    gaSelFreq('custom');
    var ci=document.getElementById('gaActFreqCustom');
    if(ci)ci.value=freq;
    document.getElementById('gaActFrecuencia').value=freq;
  }

  // Acumula
  gaSetAcumula(!!a.acumula);

  openModal('gaModal');
}

// ── Guardar ──
async function gaGuardarActividad(){
  var editId=document.getElementById('gaEditId').value;
  var tipo=document.getElementById('gaActTipoAct').value;
  var sedes=gaGetSedes();
  if(!sedes.length){showToast('Selecciona al menos una sede','error');return;}
  var nombre=document.getElementById('gaActNombre').value.trim();
  if(!nombre){showToast('El nombre es requerido','error');return;}

  // Code: use existing if editing, auto-generate if new
  var cod;
  if(editId){
    cod=document.getElementById('gaEditId').dataset.cod||'';
  } else {
    var prefix=gaAutoCode();
    var existingNums=(STATE._gaAllActs||[]).filter(function(a){return a.cod.startsWith(prefix)}).map(function(a){return parseInt(a.cod.replace(prefix,''))||0});
    var next=existingNums.length?Math.max.apply(null,existingNums)+1:1;
    cod=prefix+String(next).padStart(2,'0');
  }

  // Freq
  var freqVal=document.getElementById('gaActFrecuencia').value;
  var diasStr=document.getElementById('gaActDiaSemana')?.value||'';
  var apareceDia=0;
  if(freqVal==='7'){
    apareceDia=parseInt(document.getElementById('gaActCadaSemanas')?.value)||1;
  }

  var payload={
    sedes:sedes,
    cod:cod,
    nombre:nombre,
    categoria:tipo==='por_puntos'?'EXT':document.getElementById('gaActCat').value,
    tipo_act:tipo,
    peso:parseFloat(document.getElementById('gaActPeso').value)||0,
    descuento:parseFloat(document.getElementById('gaActDescuento').value)||0,
    turno:document.getElementById('gaActTurno').value||'ambos',
    unidad:document.getElementById('gaActUnidad').value.trim()||'unidad',
    frecuencia_dias:parseInt(freqVal)||0,
    dia_semana:diasStr,
    aparece_dia:apareceDia,
    acumula:document.getElementById('gaActAcumula').checked,
    orden:parseInt(document.getElementById('gaActOrden').value)||0,
    activa:true
  };

  var r;
  if(editId){
    payload.sede=sedes[0];
    r=await API.req('PUT','/actividades/'+editId,payload);
    if(r)await API.req('POST','/actividades/sync-sedes',{cod:cod,sedes:sedes,payload:payload});
  } else {
    var ok=true;
    for(var i=0;i<sedes.length;i++){
      var p=Object.assign({},payload,{sede:sedes[i]});delete p.sedes;
      var rr=await API.req('POST','/actividades',p);
      if(!rr)ok=false;
    }
    r=ok;
  }
  if(r){showToast(editId?'✅ Actualizada en '+sedes.length+' sede(s)':'✅ Creada en '+sedes.length+' sede(s)','success');closeModal('gaModal');gaCargarActividades();}
}

async function gaEliminarActividad(id,nombre){
  showConfirm('¿Eliminar "'+nombre+'"?','Se eliminará de esta sede. Si existe en otras sedes, seguirá ahí.',async function(){
    var r=await API.req('DELETE','/actividades/'+id);
    if(r){showToast('🗑️ Eliminada','success');gaCargarActividades();}
  },'🗑');
}

async function gaDuplicarActividades(){
  var hacia=document.getElementById('gaSedeSelect')?.value;
  if(!hacia){showToast('Selecciona sede destino primero','error');return;}
  showPrompt('Copiar actividades DESDE sede','Ej: ST, LB, AL, TR',async function(desde){
    if(!desde)return;
    desde=desde.toUpperCase().trim();
    if(desde===hacia){showToast('Sedes deben ser diferentes','error');return;}
    var r=await API.req('POST','/actividades/duplicar',{desde:desde,hacia:hacia});
    if(r){showToast('✅ '+r.duplicadas+' actividades duplicadas','success');gaCargarActividades();}
  },'📋');
}


// ═══════════════════════════════════════════════════════
// ADMIN: REPORTES DE ACTIVIDAD — sección dedicada
// ═══════════════════════════════════════════════════════
async function renderAdminReportes() {
  const box = document.getElementById('adminReportesContent'); if (!box) { console.warn('[AdminRep] adminReportesContent not found'); return; }
  const sede = document.getElementById('arFiltroSede')?.value || '';
  const fecha = document.getElementById('arFiltroFecha')?.value || '';
  const params = {};
  if (sede) params.sede = sede;
  if (fecha) params.fecha = fecha;
  const reps = await API.reportes(params);
  if (!reps) { box.innerHTML = '<div style="color:var(--text3);padding:20px">Error cargando</div>'; return; }

  let html = `<div style="margin-bottom:12px;font-size:12px;color:var(--text3)">${reps.length} reportes encontrados</div>`;
  html += `<div style="overflow-x:auto"><table class="data-table">
    <thead><tr><th>ID</th><th>Sede</th><th>Fecha</th><th>Turno</th><th>Encargado</th><th>Trabajadores</th><th>Act.</th><th>Puntaje</th><th>Evaluado</th><th>Evaluador</th></tr></thead><tbody>`;

  if (!reps.length) { html += '<tr><td class="empty-cell" colspan="10">Sin reportes</td></tr>'; }
  else reps.forEach(function(r) {
    var turnoL = {M:'Mañana',T:'Tarde',C:'Completo'}[r.turno]||r.turno;
    var pct = r.puntaje||0;
    var cls = pct>=85?'excellent':pct>=70?'good':pct>=50?'regular':'bad';
    html += '<tr style="cursor:pointer" onclick="verReporteDetalle(\'' + r.id + '\')">' +
      '<td><span class="badge badge-navy mono">' + r.id + '</span></td>' +
      '<td>' + (SEDES[r.sede]?.short||r.sede) + '</td>' +
      '<td class="mono" style="font-size:11px">' + r.fecha + '</td>' +
      '<td>' + turnoL + '</td>' +
      '<td style="font-size:11px">' + (r.encargado||'—') + '</td>' +
      '<td style="font-size:10px">' + (r.trabajadores||[]).join(', ') + '</td>' +
      '<td style="text-align:center">' + (r.act_done||0) + '/' + (r.act_total||0) + '</td>' +
      '<td><span class="score-pill ' + cls + '" style="font-size:11px">' + pct + '%</span></td>' +
      '<td><span class="badge ' + (r.evaluado?'badge-green':'badge-yellow') + '">' + (r.evaluado?'✓':'Pend.') + '</span></td>' +
      '<td style="font-size:10px">' + (r.evaluador||'—') + '</td></tr>';
  });
  html += '</tbody></table></div>';
  box.innerHTML = html;
}

// ═══════════════════════════════════════════════════════
// AUDITORÍA — Vista de admin
// ═══════════════════════════════════════════════════════
async function renderAuditLog() {
  var params = {};
  var desde = document.getElementById('auditDesde')?.value;
  var hasta = document.getElementById('auditHasta')?.value;
  var sede = document.getElementById('auditSede')?.value;
  var modulo = document.getElementById('auditModulo')?.value;
  var usuario = document.getElementById('auditUsuario')?.value;
  if (desde) params.desde = desde;
  if (hasta) params.hasta = hasta;
  if (sede) params.sede = sede;
  if (modulo) params.modulo = modulo;
  if (usuario) params.usuario = usuario;

  var q = new URLSearchParams(params).toString();
  var [logs, stats] = await Promise.all([
    API.get('/audit?' + q),
    API.get('/audit/stats')
  ]);

  // KPIs
  var kpis = document.getElementById('auditKpis');
  if (kpis && stats) {
    kpis.innerHTML = `
      <div class="stat-card accent-navy"><div class="stat-label">Acciones hoy</div><div class="stat-val">${stats.total_hoy}</div></div>
      <div class="stat-card accent-gold"><div class="stat-label">Total histórico</div><div class="stat-val" style="color:var(--gold-d)">${stats.total}</div></div>
      <div class="stat-card accent-green"><div class="stat-label">Usuarios activos hoy</div><div class="stat-val" style="color:var(--green)">${(stats.por_usuario||[]).length}</div></div>
      <div class="stat-card accent-blue"><div class="stat-label">Sedes activas hoy</div><div class="stat-val" style="color:var(--blue)">${(stats.por_sede||[]).length}</div></div>`;
  animateCounters(kpis);
  }

  var body = document.getElementById('auditBody');
  var badge = document.getElementById('auditCount');
  if (!body || !logs) return;
  if (badge) badge.textContent = logs.length + ' registros';

  if (!logs.length) { body.innerHTML = '<tr><td class="empty-cell" colspan="8">Sin registros</td></tr>'; return; }

  var modColors = {
    reportes:'badge-navy', lavanderia:'badge-blue', pipeline:'badge-purple',
    prestamos:'badge-gold', incidencias:'badge-red', empleados:'badge-green',
    actividades:'badge-navy', garantias:'badge-gold', solicitudes:'badge-blue',
    config:'badge-gray', auth:'badge-green', evaluaciones:'badge-purple'
  };

  body.innerHTML = logs.map(function(l) {
    var det = l.detalle || '';
    try { var parsed = JSON.parse(det); det = Object.entries(parsed).map(function(e){return e[0]+':'+e[1]}).join(' · '); } catch(e) {}

    return '<tr>' +
      '<td class="mono" style="font-size:10px">' + l.fecha + '</td>' +
      '<td class="mono" style="font-size:10px">' + l.hora + '</td>' +
      '<td style="font-weight:600;font-size:12px">' + (l.usuario_nombre || '<span style="color:var(--text3)">—</span>') + (l.usuario_cod ? ' <span class="mono" style="font-size:9px;color:var(--text3)">' + l.usuario_cod + '</span>' : '') + '</td>' +
      '<td>' + (l.sede ? '<span class="badge badge-navy" style="font-size:9px">' + l.sede + '</span>' : '—') + '</td>' +
      '<td><span class="badge ' + (modColors[l.modulo] || 'badge-gray') + '" style="font-size:9px">' + (l.modulo || '—') + '</span></td>' +
      '<td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + l.accion + '">' + l.accion + '</td>' +
      '<td style="font-size:10px;color:var(--text2);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + det + '">' + det + '</td>' +
      '<td class="mono" style="font-size:9px;color:var(--text3)">' + (l.ip || '—') + '</td>' +
      '</tr>';
  }).join('');
}

// ═══════════════════════════════════════════════════════
// CONFIG PIPELINE — Puntajes de almacén
// ═══════════════════════════════════════════════════════
async function renderCfgPipeline() {
  var box = document.getElementById('cfgPipeBody'); if (!box) return;
  var cfg = await API.get('/pipeline/config-puntos');
  if (!cfg) { box.innerHTML = '<div style="color:var(--red);font-size:12px">Error cargando</div>'; return; }
  var items = [
    { key: 'pts_lavado_normal', label: 'Lavado Normal', icon: '🧴', desc: 'Puntos por lavar 1 prenda con lavado normal' },
    { key: 'pts_lavado_seco', label: 'Lavado Seco', icon: '🧪', desc: 'Puntos por lavado en seco' },
    { key: 'pts_lavado_especializado', label: 'Lavado Especializado', icon: '⭐', desc: 'Puntos por lavado especializado' },
    { key: 'pts_empatado', label: 'Empatado', icon: '📦', desc: 'Puntos por empatar 1 prenda' },
    { key: 'pts_refaccion', label: 'Refacción / Compostura', icon: '🪡', desc: 'Puntos por refaccionar/componer 1 prenda' },
    { key: 'pts_compostura', label: 'Compostura', icon: '✂️', desc: 'Puntos por compostura' },
    { key: 'pts_planchado', label: 'Planchado', icon: '👔', desc: 'Puntos por planchar 1 prenda' },
    { key: 'pts_control_calidad', label: 'Control de Calidad', icon: '✅', desc: 'Puntos por revisar 1 prenda en calidad' },
    { key: 'pts_accesorio', label: 'Accesorio', icon: '🎀', desc: 'Puntos por procesar 1 accesorio (corbata, michi, etc.)' },
  ];
  box.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + items.map(function(it) {
    var val = cfg[it.key] !== undefined ? cfg[it.key] : 1;
    return '<div style="padding:12px;background:var(--s3);border-radius:8px">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<span style="font-size:18px">' + it.icon + '</span>' +
      '<div><div style="font-weight:700;font-size:12px">' + it.label + '</div>' +
      '<div style="font-size:9px;color:var(--text3)">' + it.desc + '</div></div></div>' +
      '<input type="number" id="cfg-' + it.key + '" value="' + val + '" min="0" max="50" step="0.5" style="width:100%;padding:8px;border-radius:6px;border:1.5px solid var(--border);font-size:14px;font-weight:700;text-align:center">' +
      '</div>';
  }).join('') + '</div>';
}

async function guardarCfgPipeline() {
  var payload = {};
  document.querySelectorAll('[id^="cfg-pts_"]').forEach(function(el) {
    payload[el.id.replace('cfg-', '')] = parseFloat(el.value) || 0;
  });
  var r = await API.put('/pipeline/config-puntos', payload);
  if (r && r.ok) showToast('✅ Puntajes actualizados', 'success');
}

// ═══════════════════════════════════════════════════════
// CONFIG EVALUACIÓN
// ═══════════════════════════════════════════════════════
const CFG_PESOS = [
  {key:'peso_operaciones',label:'Operaciones (AT,BT)'},
  {key:'peso_limpieza',label:'Limpieza (OL)'},
  {key:'peso_software',label:'Software (AS,BS)'},
  {key:'peso_valores360',label:'Valores 360°'},
  {key:'peso_competencias',label:'Competencias'},
  {key:'peso_conocimientos',label:'Conocimientos'},
  {key:'peso_tardanzas',label:'Tardanzas'},
];
const CFG_PIPELINE = [
  {key:'pipeline_meta_mensual',label:'Meta mensual (pts)'},
  {key:'pipeline_meta_semanal',label:'Meta semanal (pts)'},
  {key:'pipeline_precio_punto',label:'Precio por punto extra (S/)'},
];
const CFG_VENTAS = [
  {key:'venta_bonus_80',label:'Bonus 80-99% ventas'},
  {key:'venta_bonus_100',label:'Bonus 100% ventas'},
  {key:'venta_bonus_120',label:'Bonus 101-120% ventas'},
  {key:'venta_bonus_max',label:'Bonus >120% ventas'},
];
const CFG_INC = [
  {key:'inc_uniforme',label:'Uniforme'},
  {key:'inc_orden_limpieza',label:'Orden/Limpieza'},
  {key:'inc_documentacion',label:'Documentación'},
  {key:'inc_equipos_electricos',label:'Equipos eléctricos'},
  {key:'inc_seguridad_cerrar',label:'Seguridad al cerrar'},
  {key:'inc_graves',label:'Graves'},
  {key:'inc_otros',label:'Otros'},
];

async function renderConfigEval() {
  var cfg = await API.get('/config');
  if (!cfg) return;
  // Pesos
  var grid = document.getElementById('cfgPesosGrid');
  if (grid) {
    grid.innerHTML = CFG_PESOS.map(function(p) {
      var val = cfg[p.key] || '0';
      return '<label style="font-size:12px;font-weight:600">'+p.label+'</label><div style="display:flex;align-items:center;gap:4px"><input type="number" id="cfg_'+p.key+'" class="f-input" value="'+val+'" min="0" max="100" style="width:60px;text-align:center" oninput="updatePesoTotal()"><span style="font-size:11px;color:var(--text3)">%</span></div>';
    }).join('');
    updatePesoTotal();
  }
  // Incidencias
  var igrid = document.getElementById('cfgIncGrid');
  if (igrid) {
    igrid.innerHTML = CFG_INC.map(function(p) {
      var val = cfg[p.key] || '0';
      return '<label style="font-size:12px;font-weight:600">'+p.label+'</label><div style="display:flex;align-items:center;gap:4px"><span style="font-size:11px;color:var(--red)">-</span><input type="number" id="cfg_'+p.key+'" class="f-input" value="'+val+'" min="0" max="20" style="width:60px;text-align:center"><span style="font-size:11px;color:var(--text3)">pts</span></div>';
    }).join('');
  }
  // Pipeline
  var pgrid = document.getElementById('cfgPipelineGrid');
  if (pgrid) {
    pgrid.innerHTML = CFG_PIPELINE.map(function(p) {
      var val = cfg[p.key] || '0';
      return '<label style="font-size:12px;font-weight:600">'+p.label+'</label><input type="number" id="cfg_'+p.key+'" class="f-input" value="'+val+'" min="0" step="0.01" style="width:80px;text-align:center">';
    }).join('');
  }
  // Ventas
  var vgrid = document.getElementById('cfgVentasGrid');
  if (vgrid) {
    vgrid.innerHTML = CFG_VENTAS.map(function(p) {
      var val = cfg[p.key] || '0';
      return '<label style="font-size:12px;font-weight:600">'+p.label+'</label><div style="display:flex;align-items:center;gap:4px"><span style="font-size:11px;color:var(--green)">+</span><input type="number" id="cfg_'+p.key+'" class="f-input" value="'+val+'" min="0" max="5" step="0.1" style="width:60px;text-align:center"><span style="font-size:11px;color:var(--text3)">pts</span></div>';
    }).join('');
  }
  // Horarios
  var hi=document.getElementById('cfgHoraIM');if(hi)hi.value=cfg.hora_inicio_m||'08:00';
  var hf=document.getElementById('cfgHoraFM');if(hf)hf.value=cfg.hora_fin_m||'14:00';
  var ht=document.getElementById('cfgHoraIT');if(ht)ht.value=cfg.hora_inicio_t||'14:00';
  var hft=document.getElementById('cfgHoraFT');if(hft)hft.value=cfg.hora_fin_t||'20:00';
  // Pipeline
  var pm=document.getElementById('cfgPipeMeta');if(pm)pm.value=cfg.pipeline_meta_mensual||'80';
  var pp=document.getElementById('cfgPipePrecio');if(pp)pp.value=cfg.pipeline_precio_punto||'0.05';
  // Ventas
  var v80=document.getElementById('cfgVB80');if(v80)v80.value=cfg.venta_bonus_80||'0.5';
  var v100=document.getElementById('cfgVB100');if(v100)v100.value=cfg.venta_bonus_100||'1.0';
  var v120=document.getElementById('cfgVB120');if(v120)v120.value=cfg.venta_bonus_120||'1.5';
  var vmax=document.getElementById('cfgVBMax');if(vmax)vmax.value=cfg.venta_bonus_max||'2.0';
  var vdef=document.getElementById('cfgVMetaDef');if(vdef)vdef.value=cfg.venta_meta_default||'3000';
}

function updatePesoTotal() {
  var total = CFG_PESOS.reduce(function(s,p) {
    var el=document.getElementById('cfg_'+p.key); return s+(el?parseInt(el.value)||0:0);
  }, 0);
  var el=document.getElementById('cfgPesoTotal');
  if(el){el.textContent='Total: '+total+'%';el.style.color=total===100?'var(--green)':'var(--red)';}
}

// ═══════════════════════════════════════════════════════
// SEGUIMIENTO VALORES 360° (admin)
// Matriz de quién evaluó a quién en el mes, promedios, faltantes.
// ═══════════════════════════════════════════════════════
async function cargarSeguimientoValores() {
  var mes = document.getElementById('evalVAdminMes')?.value;
  if (!mes) return;
  var box = document.getElementById('evalVAdminBox');
  if (box) box.innerHTML = '<div style="color:var(--text3);text-align:center;padding:30px">Cargando...</div>';
  var data = await API.get('/valores/seguimiento/' + encodeURIComponent(mes));
  if (!data) {
    if (box) box.innerHTML = '<div style="color:var(--red);text-align:center;padding:30px">No se pudo cargar</div>';
    return;
  }
  // Header global
  var globalEl = document.getElementById('evalVAdminGlobal');
  if (globalEl) {
    var pct = Math.round((data.cumplimiento_global || 0) * 100);
    var clr = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--gold-d)' : 'var(--red)';
    globalEl.innerHTML = data.total_evaluaciones + ' / ' + data.esperadas +
      ' <span style="margin-left:6px;color:' + clr + ';font-weight:800">(' + pct + '%)</span>';
  }
  if (!data.filas || !data.filas.length) {
    if (box) box.innerHTML = '<div class="empty-cell">Sin colaboradores activos.</div>';
    return;
  }
  var html = '';
  // Resumen visual de cumplimiento
  var pendCount = data.filas.filter(function(f){ return f.enviadas < f.debe_enviar; }).length;
  if (pendCount > 0) {
    html += '<div style="margin-bottom:12px;padding:8px 12px;background:var(--yellow-bg);border:1px solid rgba(184,134,11,.3);border-radius:var(--r);font-size:12px;color:var(--yellow)">' +
            '⚠ <strong>' + pendCount + '</strong> colaborador(es) aún tienen evaluaciones pendientes este mes.</div>';
  }
  // Tabla
  html += '<div style="overflow-x:auto"><table class="data-table" style="font-size:12px"><thead><tr>' +
          '<th style="width:140px">Colaborador</th>' +
          '<th style="width:60px;text-align:center">Sede</th>' +
          '<th style="width:90px;text-align:center">Enviadas</th>' +
          '<th style="width:90px;text-align:center">Recibidas</th>' +
          '<th style="width:90px;text-align:center">Nota /20</th>' +
          '<th>Promedios por valor (recibidos)</th>' +
          '<th style="width:200px">Le falta evaluar a</th>' +
          '</tr></thead><tbody>';
  var campos = [['integridad','Int.'],['respeto','Resp.'],['honestidad','Hon.'],['amabilidad','Amab.'],['relacion','Rel.'],['actitud','Act.']];
  data.filas.forEach(function(f) {
    var pctEnv = Math.round((f.cumplimiento || 0) * 100);
    var clrEnv = pctEnv >= 80 ? 'var(--green)' : pctEnv >= 50 ? 'var(--gold-d)' : 'var(--red)';
    var notaCls = f.nota20 == null ? '' : (f.nota20 >= 17 ? 'excellent' : f.nota20 >= 14 ? 'good' : f.nota20 >= 11 ? 'regular' : 'bad');
    var promPills = campos.map(function(c) {
      var v = f.promedios[c[0]];
      if (v == null) return '<span style="padding:1px 6px;border-radius:4px;background:var(--s3);color:var(--text3);font-size:10px">' + c[1] + ' —</span>';
      var bg = v >= 4 ? 'rgba(26,122,82,.1)' : v >= 3 ? 'rgba(184,134,11,.1)' : 'rgba(192,57,43,.1)';
      var fg = v >= 4 ? 'var(--green)' : v >= 3 ? 'var(--yellow)' : 'var(--red)';
      return '<span style="padding:1px 6px;border-radius:4px;background:' + bg + ';color:' + fg + ';font-size:10px;font-weight:600">' + c[1] + ' ' + v + '</span>';
    }).join(' ');
    var faltStr = (f.faltantes || []).length === 0
      ? '<span style="color:var(--green);font-size:11px">✓ completo</span>'
      : (f.faltantes.slice(0, 4).map(function(p){ return p.iniciales; }).join(', ') + (f.faltantes.length > 4 ? ' +' + (f.faltantes.length - 4) : ''));
    html += '<tr>' +
            '<td style="font-weight:600">' + f.nombre + '</td>' +
            '<td style="text-align:center"><span class="badge" style="font-size:10px">' + (f.sede || '—') + '</span></td>' +
            '<td style="text-align:center;color:' + clrEnv + ';font-weight:700">' + f.enviadas + '/' + f.debe_enviar + '</td>' +
            '<td style="text-align:center;font-weight:700">' + f.recibidas + '</td>' +
            '<td style="text-align:center">' + (f.nota20 == null ? '<span style="color:var(--text3)">—</span>' : '<div class="score-pill ' + notaCls + '" style="display:inline-block">' + f.nota20 + '/20</div>') + '</td>' +
            '<td>' + promPills + '</td>' +
            '<td style="font-size:11px;color:var(--text3)" title="' + (f.faltantes || []).map(function(p){return p.nombre;}).join(', ') + '">' + faltStr + '</td>' +
            '</tr>';
  });
  html += '</tbody></table></div>';
  if (box) box.innerHTML = html;
}

async function guardarConfigPesos() {
  _evalConfig = null; // invalidate cache
  var body = {};
  var total = 0;
  CFG_PESOS.forEach(function(p) {
    var v = parseInt(document.getElementById('cfg_'+p.key)?.value)||0;
    body[p.key] = v; total += v;
  });
  if (total !== 100) { showToast('Los pesos deben sumar 100% (actual: '+total+'%)','error'); return; }
  var r = await API.put('/config', body);
  if (r) showToast('Pesos guardados','success');
}

async function guardarConfigInc() {
  _evalConfig = null;
  var body = {};
  CFG_INC.forEach(function(p) {
    body[p.key] = parseInt(document.getElementById('cfg_'+p.key)?.value)||0;
  });
  var r = await API.put('/config', body);
  if (r) showToast('Descuentos guardados','success');
}

async function guardarConfigPipeVentas() {
  _evalConfig = null;
  var body = {};
  CFG_PIPELINE.forEach(function(p) { body[p.key] = document.getElementById('cfg_'+p.key)?.value || '0'; });
  CFG_VENTAS.forEach(function(p) { body[p.key] = document.getElementById('cfg_'+p.key)?.value || '0'; });
  var r = await API.put('/config', body);
  if (r) showToast('Pipeline y ventas guardados','success');
}

async function guardarConfigHorarios() {
  _evalConfig = null;
  var body = {
    hora_inicio_m: document.getElementById('cfgHoraIM')?.value||'08:00',
    hora_fin_m: document.getElementById('cfgHoraFM')?.value||'14:00',
    hora_inicio_t: document.getElementById('cfgHoraIT')?.value||'14:00',
    hora_fin_t: document.getElementById('cfgHoraFT')?.value||'20:00',
  };
  var r = await API.put('/config', body);
  if (r) showToast('Horarios guardados','success');
}

// ═══════════════════════════════════════════════════════
// ASISTENCIAS
// ═══════════════════════════════════════════════════════
async function initAsistencias() {
  // Sync from shared eval selector
  var sharedEmp = STATE.evalMensualEmp || document.getElementById('evalMEmpSel')?.value;
  var sharedMes = STATE.evalMensualMes || (document.getElementById('evalMDesde')?.value||'').slice(0,7);
  var asistEmpEl = document.getElementById('asistEmp');
  var asistMesEl = document.getElementById('asistMes');
  if (sharedEmp && asistEmpEl) asistEmpEl.value = sharedEmp;
  if (sharedMes && asistMesEl) asistMesEl.value = sharedMes;

  var sel = document.getElementById('asistEmp');
  if (sel && sel.options.length <= 1) {
    (STATE.empleadosCache||[]).forEach(function(e) {
      var o = document.createElement('option'); o.value = e.id; o.textContent = e.nombre; sel.appendChild(o);
    });
  }
  var mesEl = document.getElementById('asistMes');
  if (mesEl && !mesEl.value) mesEl.value = mesLocal();
  // Build horario selects (L-D, M+T)
  var DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  var SEDES_OPT = [{v:'',l:'Libre'},{v:'LB',l:'LuceBien'},{v:'ST',l:'Stan'},{v:'AL',l:'Almacén'},{v:'TR',l:'Trece'}];
  ['horRowM','horRowT'].forEach(function(rowId) {
    var row = document.getElementById(rowId);
    if (!row || row.cells.length > 1) return;
    var turno = rowId === 'horRowM' ? 'M' : 'T';
    DIAS.forEach(function(dia) {
      var td = document.createElement('td');
      td.style.padding = '4px';
      var sel = document.createElement('select');
      sel.className = 'hor-sel';
      sel.dataset.dia = dia;
      sel.dataset.turno = turno;
      sel.onchange = function() { calcHorarioInfo(); sel.style.background = sel.value ? '#e8f5e9' : ''; };
      SEDES_OPT.forEach(function(s) {
        var o = document.createElement('option');
        o.value = s.v; o.textContent = s.l;
        if (!s.v) o.style.color = '#999';
        sel.appendChild(o);
      });
      td.appendChild(sel);
      row.appendChild(td);
    });
  });
}

function calcHorarioInfo() {
  var DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  var diasTrabajo = 0;
  var reportesSemana = 0;
  DIAS.forEach(function(dia) {
    var selM = document.querySelector('.hor-sel[data-dia="'+dia+'"][data-turno="M"]');
    var selT = document.querySelector('.hor-sel[data-dia="'+dia+'"][data-turno="T"]');
    var sedeM = selM ? selM.value : '';
    var sedeT = selT ? selT.value : '';
    if (sedeM || sedeT) diasTrabajo++;
    // Count unique sedes per day = number of reports expected
    var sedes = new Set();
    if (sedeM) sedes.add(sedeM);
    if (sedeT) sedes.add(sedeT);
    reportesSemana += sedes.size;
  });
  var el1 = document.getElementById('horDiasOblig');
  if (el1) el1.textContent = diasTrabajo + ' días/semana';
  var el2 = document.getElementById('horReportesEsperados');
  if (el2) el2.textContent = reportesSemana + ' reportes/semana';
}

async function cargarAsistencias() {
  var empId = document.getElementById('asistEmp')?.value || STATE.evalMensualEmp;
  var mes = document.getElementById('asistMes')?.value || STATE.evalMensualMes;
  if (!empId || !mes) {
    ['cardHorario','cardAsistGrid','cardAsistResumen'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.style.display='none';
    });
    return;
  }
  ['cardHorario','cardAsistGrid','cardAsistResumen'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.style.display='';
  });

  // ── Load horario ──
  var horario = await API.get('/asistencias/horarios/' + empId) || [];
  document.querySelectorAll('.hor-sel').forEach(function(s) { s.value = ''; s.style.background = ''; });
  horario.forEach(function(h) {
    var sel = document.querySelector('.hor-sel[data-dia="'+h.dia+'"][data-turno="'+h.turno+'"]');
    if (sel) { sel.value = h.sede; sel.style.background = '#e8f5e9'; }
  });
  calcHorarioInfo();

  // ── Calculate expected reports for the month ──
  var DIAS_MAP = {0:'domingo',1:'lunes',2:'martes',3:'miercoles',4:'jueves',5:'viernes',6:'sabado'};
  var year = parseInt(mes.split('-')[0]);
  var month = parseInt(mes.split('-')[1]);
  var daysInMonth = new Date(year, month, 0).getDate();

  // Build horario lookup: dia -> {M: sede, T: sede}
  var horLookup = {};
  horario.forEach(function(h) {
    if (!horLookup[h.dia]) horLookup[h.dia] = {};
    horLookup[h.dia][h.turno] = h.sede;
  });

  var expectedReports = 0;
  var workDays = [];
  for (var d = 1; d <= daysInMonth; d++) {
    var fecha = mes + '-' + String(d).padStart(2,'0');
    var dow = new Date(year, month-1, d).getDay();
    var diaName = DIAS_MAP[dow];
    var hor = horLookup[diaName] || {};
    var sedes = new Set();
    if (hor.M) sedes.add(hor.M);
    if (hor.T) sedes.add(hor.T);
    var isWorkDay = sedes.size > 0;
    workDays.push({d:d, fecha:fecha, dow:dow, diaName:diaName, isWork:isWorkDay, sedes:sedes, expectedReps:sedes.size, horM:hor.M||'', horT:hor.T||''});
    expectedReports += sedes.size;
  }

  // ── Load asistencias ──
  var asist = await API.get('/asistencias?emp_id='+empId+'&fecha_desde='+mes+'-01&fecha_hasta='+mes+'-31') || [];
  var asistMap = {};
  asist.forEach(function(a) { asistMap[a.fecha+'_'+(a.turno||'M')] = a; });

  // ── Load reportes del empleado ──
  var emp = (STATE.empleadosCache||[]).find(function(e){return String(e.id)===String(empId)});
  var empNombre = emp ? emp.nombre : '';
  var reportes = [];
  if (empNombre) {
    reportes = await API.get('/reportes?emp_nombre='+encodeURIComponent(empNombre)+'&sede=') || [];
    reportes = reportes.filter(function(r) { return r.fecha >= mes+'-01' && r.fecha <= mes+'-31'; });
  }
  var reportesByFecha = {};
  reportes.forEach(function(r) {
    if (!reportesByFecha[r.fecha]) reportesByFecha[r.fecha] = [];
    reportesByFecha[r.fecha].push(r);
  });

  // ── Build visual grid ──
  var DOW_NAMES = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];
  var gridHtml = '<table class="data-table asist-grid"><thead><tr><th style="min-width:75px;position:sticky;left:0;z-index:2;background:var(--s2)"></th>';
  workDays.forEach(function(wd) {
    var cls = !wd.isWork ? 'weekend' : '';
    gridHtml += '<th class="'+cls+'" style="min-width:44px"><div style="font-size:8px;color:var(--text3)">'+DOW_NAMES[wd.dow]+'</div><div>'+wd.d+'</div></th>';
  });
  gridHtml += '</tr></thead><tbody>';

  // Row: Entrada M
  gridHtml += '<tr><td class="row-label">Entrada ☀</td>';
  workDays.forEach(function(wd) {
    var key = wd.fecha+'_M';
    var val = asistMap[key] ? (asistMap[key].hora_entrada||'') : '';
    var cls = !wd.isWork ? 'weekend' : (asistMap[key]?.minutos_tardanza>0?'tardanza':'');
    gridHtml += '<td class="'+cls+'"><input type="time" value="'+val+'" data-fecha="'+wd.fecha+'" data-turno="M" data-field="hora_entrada"'+(wd.horM?'':' style="opacity:.3"')+'></td>';
  });
  gridHtml += '</tr>';

  // Row: Salida M
  gridHtml += '<tr><td class="row-label">Salida ☀</td>';
  workDays.forEach(function(wd) {
    var key = wd.fecha+'_M';
    var val = asistMap[key] ? (asistMap[key].hora_salida||'') : '';
    gridHtml += '<td class="'+(wd.isWork?'':'weekend')+'"><input type="time" value="'+val+'" data-fecha="'+wd.fecha+'" data-turno="M" data-field="hora_salida"'+(wd.horM?'':' style="opacity:.3"')+'></td>';
  });
  gridHtml += '</tr>';

  // Row: Entrada T
  gridHtml += '<tr><td class="row-label">Entrada 🌙</td>';
  workDays.forEach(function(wd) {
    var key = wd.fecha+'_T';
    var val = asistMap[key] ? (asistMap[key].hora_entrada||'') : '';
    var cls = !wd.isWork ? 'weekend' : (asistMap[key]?.minutos_tardanza>0?'tardanza':'');
    gridHtml += '<td class="'+cls+'"><input type="time" value="'+val+'" data-fecha="'+wd.fecha+'" data-turno="T" data-field="hora_entrada"'+(wd.horT?'':' style="opacity:.3"')+'></td>';
  });
  gridHtml += '</tr>';

  // Row: Salida T
  gridHtml += '<tr><td class="row-label">Salida 🌙</td>';
  workDays.forEach(function(wd) {
    var key = wd.fecha+'_T';
    var val = asistMap[key] ? (asistMap[key].hora_salida||'') : '';
    gridHtml += '<td class="'+(wd.isWork?'':'weekend')+'"><input type="time" value="'+val+'" data-fecha="'+wd.fecha+'" data-turno="T" data-field="hora_salida"'+(wd.horT?'':' style="opacity:.3"')+'></td>';
  });
  gridHtml += '</tr>';

  // Row: Reportes del día
  var totalRepHechos = 0;
  gridHtml += '<tr style="background:rgba(46,62,110,.04)"><td class="row-label" style="color:var(--navy)">Reportes</td>';
  workDays.forEach(function(wd) {
    var reps = reportesByFecha[wd.fecha] || [];
    totalRepHechos += reps.length;
    var expected = wd.expectedReps;
    var color = 'var(--text3)';
    if (reps.length > 0 && reps.length >= expected) color = 'var(--green)';
    else if (reps.length > 0) color = 'var(--gold-d)';
    else if (expected > 0) color = 'var(--red)';
    gridHtml += '<td class="'+(wd.isWork?'':'weekend')+'" style="font-weight:700;color:'+color+'">'+(reps.length||'')+(!wd.isWork?'':'<span style="font-size:7px;color:var(--text3)">/'+expected+'</span>')+'</td>';
  });
  gridHtml += '</tr>';

  // Row: Tardanzas
  var totalTard = 0, diasTard = 0;
  gridHtml += '<tr style="background:rgba(220,38,38,.04)"><td class="row-label" style="color:var(--red)">Tard. min</td>';
  workDays.forEach(function(wd) {
    var tardM = asistMap[wd.fecha+'_M']?.minutos_tardanza||0;
    var tardT = asistMap[wd.fecha+'_T']?.minutos_tardanza||0;
    var t = tardM + tardT;
    totalTard += t;
    if (t > 0) diasTard++;
    gridHtml += '<td class="'+(wd.isWork?'':'weekend')+'" style="'+(t>0?'color:var(--red);font-weight:700':'color:var(--text3)')+'">'+( t||'')+'</td>';
  });
  gridHtml += '</tr>';

  gridHtml += '</tbody></table>';
  document.getElementById('asistGridWrap').innerHTML = gridHtml;
  document.getElementById('asistProgressTxt').textContent = totalRepHechos+'/'+expectedReports+' reportes';

  // ── Summary ──
  var notaCheck = expectedReports > 0 ? Math.min(20, Math.round((totalRepHechos/expectedReports)*20*10)/10) : 0;
  var notaTard = Math.max(0, 20 - Math.floor(totalTard/15));

  document.getElementById('asistRepEsperados').textContent = expectedReports;
  document.getElementById('asistRepHechos').textContent = totalRepHechos;
  var ncEl = document.getElementById('asistNotaCheck');
  if(ncEl){ncEl.textContent = notaCheck; ncEl.style.color = notaCheck>=16?'var(--green)':notaCheck>=10?'var(--gold-d)':'var(--red)';}
  document.getElementById('asistTardanzas').textContent = diasTard + ' días';
  var ntEl = document.getElementById('asistNota');
  if(ntEl){ntEl.textContent = notaTard; ntEl.style.color = notaTard>=16?'var(--green)':notaTard>=10?'var(--yellow)':'var(--red)';}
  animateCounters(document.getElementById('asistResumen'));
}

async function guardarHorario() {
  var empId = document.getElementById('asistEmp')?.value;
  if (!empId) { showToast('Selecciona colaborador','error'); return; }
  var slots = [];
  document.querySelectorAll('.hor-sel').forEach(function(s) {
    if (s.value) slots.push({dia:s.dataset.dia, turno:s.dataset.turno, sede:s.value});
  });
  var r = await API.put('/asistencias/horarios/'+empId, {slots:slots});
  if (r) { showToast('Horario guardado ('+slots.length+' turnos)','success'); cargarAsistencias(); }
}

async function guardarAsistenciasBulk() {
  var empId = document.getElementById('asistEmp')?.value;
  if (!empId) { showToast('Selecciona colaborador','error'); return; }
  var grouped = {};
  document.querySelectorAll('#asistGridWrap input[type="time"]').forEach(function(inp) {
    var key = inp.dataset.fecha+'_'+inp.dataset.turno;
    if (!grouped[key]) grouped[key] = {emp_id:parseInt(empId), fecha:inp.dataset.fecha, turno:inp.dataset.turno};
    grouped[key][inp.dataset.field] = inp.value || null;
  });
  var rows = Object.values(grouped).filter(function(r){return r.hora_entrada||r.hora_salida;});
  if (!rows.length) { showToast('No hay datos','error'); return; }
  var r = await API.post('/asistencias/bulk', {rows:rows});
  if (r) { showToast(r.count+' registros guardados','success'); cargarAsistencias(); }
}


// ═══════════════════════════════════════════════════════
// VENTAS
// ═══════════════════════════════════════════════════════


async function guardarVenta() {
  var empId = STATE.evalMensualEmp;
  var desde = STATE.evalMensualDesde;
  if (!empId) { showToast('Selecciona colaborador', 'error'); return; }
  var mes = (desde || '').slice(0, 7);
  var r = await API.post('/ventas', {
    emp_id: parseInt(empId),
    mes: mes,
    meta_soles: parseFloat(document.getElementById('evalMVentaMeta')?.value || 0),
    vendido_soles: parseFloat(document.getElementById('evalMVentaVendido')?.value || 0)
  });
  if (r) showToast('Venta guardada — bonus: +' + r.bonus, 'success');
}

// ═══════════════════════════════════════════════════════
// PIPELINE ALMACÉN POINTS
// ═══════════════════════════════════════════════════════
async function cargarPipelinePoints(empId, desde, hasta) {
  var pipeCard = document.getElementById('evalMPipelineCard');
  var pipeBox = document.getElementById('evalMPipelineBox');
  if (!pipeCard || !pipeBox) return;

  // Check if employee had any almacen shifts
  var horario = await API.get('/asistencias/horarios/' + empId) || [];
  var tieneAlmacen = horario.some(function(h) { return h.sede === 'AL'; });
  if (!tieneAlmacen) { pipeCard.style.display = 'none'; return; }
  pipeCard.style.display = '';

  // Get pipeline points for this employee in the period
  try {
    var prendas = await API.get('/pipeline/puntos-empleado?emp_id=' + empId + '&desde=' + (desde||'') + '&hasta=' + (hasta||''));
    var cfg = _evalConfig || {};
    var meta = parseInt(cfg.pipeline_meta_mensual || 80);
    var precio = parseFloat(cfg.pipeline_precio_punto || 0.05);

    if (prendas && prendas.total_puntos !== undefined) {
      var pts = prendas.total_puntos;
      var extra = Math.max(0, pts - meta);
      var bono = extra * precio;
      var pctMeta = meta > 0 ? Math.round((pts / meta) * 100) : 0;
      var barW = Math.min(100, pctMeta);

      pipeBox.innerHTML = '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">' +
        '<div style="flex:1;min-width:200px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span>Puntos: <strong>' + pts + '</strong></span><span>Meta: <strong>' + meta + '</strong></span></div>' +
        '<div style="background:var(--s3);border-radius:6px;height:16px;overflow:hidden">' +
        '<div style="width:' + barW + '%;height:100%;background:' + (pts >= meta ? 'var(--green)' : 'var(--gold)') + ';border-radius:6px;transition:width .5s"></div>' +
        '</div>' +
        '</div>' +
        '<div style="text-align:center;min-width:80px">' +
        '<div style="font-size:20px;font-weight:700;color:' + (pts >= meta ? 'var(--green)' : 'var(--red)') + '">' + pts + '</div>' +
        '<div style="font-size:9px;color:var(--text3)">' + pctMeta + '% de meta</div>' +
        '</div>' +
        (extra > 0 ? '<div style="text-align:center;min-width:100px;padding:8px;background:#EAF3DE;border-radius:8px"><div style="font-size:9px;color:#3B6D11">Bonificación</div><div style="font-size:18px;font-weight:700;color:#27500A">S/ ' + bono.toFixed(2) + '</div><div style="font-size:9px;color:#3B6D11">' + extra + ' pts × S/' + precio + '</div></div>' : '') +
        '</div>';

      if (prendas.detalle) {
        pipeBox.innerHTML += '<table class="data-table" style="margin-top:10px;font-size:11px"><thead><tr><th>Proceso</th><th>Cantidad</th><th>Pts c/u</th><th>Total</th></tr></thead><tbody>' +
          prendas.detalle.map(function(d) { return '<tr><td>' + d.proceso + '</td><td>' + d.cantidad + '</td><td class="mono">' + d.pts_unitario + '</td><td class="mono" style="font-weight:700">' + d.total + '</td></tr>'; }).join('') +
          '</tbody></table>';
      }

      document.getElementById('evalMPipeBadge').textContent = pts + ' pts' + (bono > 0 ? ' — S/' + bono.toFixed(2) : '');
    } else {
      pipeBox.innerHTML = '<div style="color:var(--text3);font-size:12px">Sin datos de pipeline en el periodo</div>';
    }
  } catch(e) {
    pipeBox.innerHTML = '<div style="color:var(--text3);font-size:12px">Pipeline no disponible</div>';
  }
}

// ═══════════════════════════════════════════════════════
// CONFIG: Pipeline + Ventas
// ═══════════════════════════════════════════════════════
async function guardarConfigPipeline2() {
  _evalConfig = null;
  var r = await API.put('/config', {
    pipeline_meta_mensual: document.getElementById('cfgPipeMeta')?.value || '80',
    pipeline_precio_punto: document.getElementById('cfgPipePrecio')?.value || '0.05'
  });
  if (r) showToast('Config pipeline guardada', 'success');
}

async function guardarConfigVentas() {
  _evalConfig = null;
  var r = await API.put('/config', {
    venta_bonus_80: document.getElementById('cfgVB80')?.value || '0.5',
    venta_bonus_100: document.getElementById('cfgVB100')?.value || '1.0',
    venta_bonus_120: document.getElementById('cfgVB120')?.value || '1.5',
    venta_bonus_max: document.getElementById('cfgVBMax')?.value || '2.0',
    venta_meta_default: document.getElementById('cfgVMetaDef')?.value || '3000'
  });
  if (r) showToast('Config ventas guardada', 'success');
}

// ═══════════════════════════════════════════════════════
// LAYOUT EDITOR — Gestión de Actividades
// ═══════════════════════════════════════════════════════
var _gaLayoutZonas = [];
var _gaLayoutFilter = 'ambos';

async function gaLoadLayout() {
  var sede = document.getElementById('gaSedeSelect')?.value;
  if (!sede) return;
  try {
    _gaLayoutZonas = await API.get('/layout?sede=' + sede) || [];
  } catch(e) { _gaLayoutZonas = []; }
  gaRenderLayout();
}

function gaRenderLayout() {
  var el = document.getElementById('gaLayoutCount');
  if (el) el.textContent = _gaLayoutZonas.length + ' zonas';

  LayoutMap._edCb = function(action, cod, z) {
    if (action === 'edit') {
      var idx = _gaLayoutZonas.findIndex(function(x) { return x.cod === cod; });
      if (idx >= 0) gaLayoutEditZonaIdx(idx);
    }
    // move/resize: already saved to zone by _drag
  };
  LayoutMap.render('gaLayoutCanvas', _gaLayoutZonas, {
    turno: _gaLayoutFilter,
    selected: {},
    editable: true,
    onToggle: function() {}
  });

  // Render list
  var list = document.getElementById('gaLayoutList');
  if (!list) return;
  list.innerHTML = _gaLayoutZonas.map(function(z, i) {
    var turnoLabel = z.turno === 'mañana' ? '☀' : z.turno === 'tarde' ? '🌙' : '⏳';
    var tipoLabel = {mueble:'🪑',maniqui:'👤',vitrina:'🪟',riel:'📐',espejo:'🪞',silla:'💺',area:'📍',equipo:'⚡'}[z.tipo] || '📦';
    var dim=Math.round(z.ancho)+'×'+Math.round(z.alto);
    return '<div style="display:flex;align-items:center;gap:5px;padding:3px 6px;border-bottom:1px solid var(--border-s);font-size:10px">' +
      '<span style="width:14px;text-align:center;font-size:9px">' + turnoLabel + '</span>' +
      '<span style="width:14px;text-align:center;font-size:9px">' + tipoLabel + '</span>' +
      '<span style="font-weight:700;width:50px;font-family:var(--font-m);font-size:9px">' + z.cod + '</span>' +
      '<span style="flex:1;color:var(--text2);font-size:10px">' + z.nombre + '</span>' +
      '<span style="font-size:8px;color:var(--text3);font-family:var(--font-m)">' + dim + '</span>' +
      '<span style="width:24px;text-align:center;font-weight:700;color:var(--navy);font-size:9px">' + z.peso + '</span>' +
      '<button class="btn btn-ghost btn-xs" onclick="gaLayoutEditZonaIdx(' + i + ')" style="padding:1px 4px;font-size:8px">✏️</button>' +
      '<button class="btn btn-ghost btn-xs" onclick="gaLayoutDeleteZona(' + i + ')" style="padding:1px 4px;font-size:8px;color:var(--red)">✕</button>' +
      '</div>';
  }).join('');
}

function gaLayoutFilter(turno) {
  _gaLayoutFilter = turno;
  document.querySelectorAll('#gaLayoutBtnAll,#gaLayoutBtnM,#gaLayoutBtnT').forEach(function(b) {
    b.style.background = ''; b.style.color = '';
    b.className = 'btn btn-ghost btn-xs';
  });
  var btnId = turno === 'mañana' ? 'gaLayoutBtnM' : turno === 'tarde' ? 'gaLayoutBtnT' : 'gaLayoutBtnAll';
  var btn = document.getElementById(btnId);
  if (btn) { btn.style.background = 'var(--navy)'; btn.style.color = '#fff'; }
  gaRenderLayout();
}

var _ZONA_TIPOS=[
  {v:'mueble',l:'🪑 Mueble normal (MB)',f:'rect'},
  {v:'maniqui',l:'👤 Maniquí (M)',f:'tri'},
  {v:'vitrina',l:'🪟 Mampara/Vitrina (VF)',f:'rect'},
  {v:'espejo',l:'🪞 Espejo (VI)',f:'rect'},
  {v:'riel',l:'📐 Riel de ternos (MT)',f:'rect'},
  {v:'silla',l:'💺 Asiento clientes (MS)',f:'rect'},
  {v:'equipo',l:'⚡ Plancha/Equipo',f:'circle'},
  {v:'area',l:'📍 Sector (Baño/Pasadizo/Escaleras)',f:'rect'},
];
function _gaZonaModal(title,data,onSave){
  var prev=document.getElementById('gaZonaModal');if(prev)prev.remove();
  var d=data||{};
  var m=document.createElement('div');m.id='gaZonaModal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px';
  m.onclick=function(e){if(e.target===m)m.remove();};
  var inner=document.createElement('div');
  inner.style.cssText='background:#fff;border-radius:14px;width:95%;max-width:400px;overflow:hidden';
  inner.onclick=function(e){e.stopPropagation();};
  var h='<div style="padding:14px 18px;border-bottom:1px solid var(--border);font-weight:700;font-size:14px">'+title+'</div>';
  h+='<div style="padding:14px 18px">';
  h+='<div style="display:flex;gap:6px;margin-bottom:8px"><div class="field" style="flex:1;margin:0"><label>Código</label><input type="text" id="gzCod" value="'+(d.cod||'')+'" placeholder="Ej: VF05" style="text-transform:uppercase"></div>';
  h+='<div class="field" style="flex:1;margin:0"><label>Nombre</label><input type="text" id="gzNombre" value="'+(d.nombre||'')+'" placeholder="Nombre"></div></div>';
  h+='<div style="display:flex;gap:6px;margin-bottom:8px"><div class="field" style="flex:1;margin:0"><label>Tipo</label><select id="gzTipo">';
  _ZONA_TIPOS.forEach(function(t){h+='<option value="'+t.v+'"'+(d.tipo===t.v?' selected':'')+'>'+t.l+'</option>';});
  h+='</select></div>';
  h+='<div class="field" style="flex:1;margin:0"><label>Turno</label><select id="gzTurno"><option value="ambos"'+(d.turno==='ambos'?' selected':'')+'>Ambos</option><option value="mañana"'+(d.turno==='mañana'?' selected':'')+'>Mañana</option><option value="tarde"'+(d.turno==='tarde'?' selected':'')+'>Tarde</option></select></div></div>';
  h+='<div style="display:flex;gap:6px;margin-bottom:8px"><div class="field" style="flex:1;margin:0"><label>Puntos</label><input type="number" id="gzPeso" value="'+(d.peso||1)+'" min="0" max="20" step="0.1"></div>';
  h+='<div class="field" style="flex:1;margin:0"><label>Ancho</label><input type="number" id="gzAncho" value="'+(d.ancho||60)+'" min="10" max="400" step="5"></div>';
  h+='<div class="field" style="flex:1;margin:0"><label>Alto</label><input type="number" id="gzAlto" value="'+(d.alto||40)+'" min="10" max="400" step="5"></div></div>';
  h+='</div>';
  h+='<div style="padding:10px 18px;border-top:1px solid var(--border);display:flex;gap:6px;justify-content:flex-end">';
  h+='<button class="btn btn-ghost btn-sm" id="gzCancel">Cancelar</button>';
  h+='<button class="btn btn-primary btn-sm" id="gzSave">Guardar</button></div>';
  inner.innerHTML=h;m.appendChild(inner);document.body.appendChild(m);
  document.getElementById('gzCancel').onclick=function(){m.remove();};
  document.getElementById('gzSave').onclick=function(){
    var r={
      cod:(document.getElementById('gzCod').value||'').trim().toUpperCase(),
      nombre:document.getElementById('gzNombre').value||'',
      tipo:document.getElementById('gzTipo').value,
      turno:document.getElementById('gzTurno').value,
      peso:parseFloat(document.getElementById('gzPeso').value)||1,
      ancho:parseInt(document.getElementById('gzAncho').value)||60,
      alto:parseInt(document.getElementById('gzAlto').value)||40,
    };
    if(!r.cod){showToast('Ingresa el código','error');return;}
    m.remove();
    if(onSave)onSave(r);
  };
  document.getElementById('gzCod').focus();
}

function gaLayoutAddZona(){
  _gaZonaModal('+ Nueva Zona',{},function(r){
    var turnoColor=r.turno==='mañana'?'#eab308':r.turno==='tarde'?'#2563eb':'#94a3b8';
    var forma=_ZONA_TIPOS.find(function(t){return t.v===r.tipo})?.f||'rect';
    _gaLayoutZonas.push({
      cod:r.cod,nombre:r.nombre||r.cod,turno:r.turno,tipo:r.tipo,peso:r.peso,
      pos_x:350,pos_y:250,ancho:r.ancho,alto:r.alto,
      color:turnoColor,forma:forma
    });
    gaRenderLayout();
  });
}

function gaLayoutEditZonaIdx(idx){
  var z=_gaLayoutZonas[idx];if(!z)return;
  _gaZonaModal('Editar: '+z.cod,{
    cod:z.cod,nombre:z.nombre,tipo:z.tipo,turno:z.turno,
    peso:z.peso,ancho:Math.round(z.ancho),alto:Math.round(z.alto)
  },function(r){
    z.cod=r.cod;z.nombre=r.nombre||z.nombre;
    z.tipo=r.tipo;z.turno=r.turno;z.peso=r.peso;
    z.ancho=r.ancho;z.alto=r.alto;
    z.color=r.turno==='mañana'?'#eab308':r.turno==='tarde'?'#2563eb':'#94a3b8';
    z.forma=_ZONA_TIPOS.find(function(t){return t.v===r.tipo})?.f||'rect';
    gaRenderLayout();
  });
}

function gaLayoutDeleteZona(idx){
  var z=_gaLayoutZonas[idx];
  showConfirm('¿Eliminar zona?',(z?.cod||'')+' — '+(z?.nombre||''),function(){
    _gaLayoutZonas.splice(idx,1);
    gaRenderLayout();
  },'🗑');
}

async function gaLayoutSave() {
  var sede = document.getElementById('gaSedeSelect')?.value;
  if (!sede) { showToast('Selecciona sede','error'); return; }

  // Read positions from DOM
  var canvas = document.querySelector('#gaLayoutCanvas .layout-canvas');
  if (canvas) {
    canvas.querySelectorAll('.layout-zone').forEach(function(el) {
      var cod = el.dataset.cod;
      var z = _gaLayoutZonas.find(function(x) { return x.cod === cod; });
      if (z) {
        z.pos_x = parseFloat(el.style.left) / 100 * 800;
        z.pos_y = parseFloat(el.style.top) / 100 * 580;
      }
    });
  }

  var r = await API.put('/layout/bulk', { sede: sede, zonas: _gaLayoutZonas });
  if (r) showToast('Layout guardado (' + _gaLayoutZonas.length + ' zonas)', 'success');
}

// ═══════════════════════════════════════════════════════
// CONFIG EVAL VALORES 360° — admin habilita/programa cuándo
// ═══════════════════════════════════════════════════════
window.abrirConfigEvalValores = async function(){
  var cfg = await API.get('/valores/config');
  if (!cfg) { showToast('No se pudo cargar configuración','error'); return; }
  document.querySelectorAll('input[name="evcModo"]').forEach(function(r){
    r.checked = (r.value === (cfg.modo||'manual'));
  });
  document.getElementById('evcHabilitado').checked = !!cfg.habilitado;
  document.getElementById('evcHabilitadoLbl').textContent = cfg.habilitado ? 'Encendido' : 'Apagado';
  document.getElementById('evcHabilitado').onchange = function(){
    document.getElementById('evcHabilitadoLbl').textContent = this.checked ? 'Encendido' : 'Apagado';
  };
  var dias = (cfg.dias||[]);
  var grid = document.getElementById('evcDiasGrid');
  if (grid) {
    grid.innerHTML = '';
    for (var d=1; d<=31; d++){
      var act = dias.indexOf(d) >= 0;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'evc-day' + (act?' on':'');
      btn.dataset.dia = d;
      btn.textContent = d;
      btn.onclick = function(){ this.classList.toggle('on'); };
      grid.appendChild(btn);
    }
  }
  evcUpdateUI();
  var st = document.getElementById('evcStatusActual');
  if (st) {
    st.innerHTML = cfg.activo_hoy
      ? '✓ <strong>HOY</strong> los colaboradores SÍ pueden evaluarse entre sí'
      : '✕ <strong>HOY</strong> los colaboradores NO pueden evaluarse';
  }
  openModal('evalValConfigModal');
};

window.evcUpdateUI = function(){
  var modo = document.querySelector('input[name="evcModo"]:checked');
  var modoVal = modo ? modo.value : 'manual';
  document.getElementById('evcManualBox').style.display = (modoVal==='manual') ? '' : 'none';
  document.getElementById('evcAutoBox').style.display   = (modoVal==='auto')   ? '' : 'none';
};

window.evcGuardar = async function(){
  var modo = (document.querySelector('input[name="evcModo"]:checked')||{}).value || 'manual';
  var habilitado = document.getElementById('evcHabilitado').checked;
  var dias = Array.from(document.querySelectorAll('#evcDiasGrid .evc-day.on')).map(function(b){ return parseInt(b.dataset.dia); });
  var body = { modo: modo };
  if (modo === 'manual') body.habilitado = habilitado;
  if (modo === 'auto')   body.dias = dias;
  var r = await API.put('/valores/config', body);
  if (!r) return;
  showToast('Configuración guardada · ' + (r.activo_hoy ? 'activo HOY' : 'inactivo HOY'), 'success');
  closeModal('evalValConfigModal');
  if (typeof checkEvalValoresHabilitado === 'function') checkEvalValoresHabilitado();
};


// ═══════════════════════════════════════════════════════
// EXPORT CSV — utilidad genérica para llevar tablas a Excel
// ═══════════════════════════════════════════════════════
window.exportCSV = function(filename, headers, rows) {
  // headers: ['Col1','Col2',...]
  // rows: [[v1,v2,...],[...]]
  function esc(v){
    if (v == null) return '';
    var s = String(v).replace(/"/g, '""');
    if (/[",\n;]/.test(s)) return '"' + s + '"';
    return s;
  }
  var sep = ';'; // separador friendly para Excel-ES
  var bom = '﻿'; // UTF-8 BOM para que Excel detecte acentos
  var lines = [headers.map(esc).join(sep)];
  rows.forEach(function(r){ lines.push(r.map(esc).join(sep)); });
  var blob = new Blob([bom + lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Botón "Exportar CSV" para Auditoría
window.exportAuditCSV = async function(){
  var params = {};
  ['auditDesde','auditHasta','auditSede','auditModulo','auditUsuario'].forEach(function(id){
    var el=document.getElementById(id); if(el && el.value) params[id.replace('audit','').toLowerCase()] = el.value;
  });
  var q = new URLSearchParams(params).toString();
  var logs = await API.get('/audit?'+q);
  if (!logs || !logs.length) { showToast('Nada que exportar','error'); return; }
  exportCSV('auditoria_'+hoyLocal()+'.csv',
    ['Fecha','Hora','Usuario','Cod','Sede','Módulo','Acción','Detalle','IP'],
    logs.map(function(l){
      var det = l.detalle || '';
      try { var p = JSON.parse(det); det = Object.entries(p).map(function(e){return e[0]+':'+e[1]}).join(' | '); } catch(e){}
      return [l.fecha, l.hora, l.usuario_nombre||'', l.usuario_cod||'', l.sede||'', l.modulo||'', l.accion||'', det, l.ip||''];
    }));
  showToast('Exportadas '+logs.length+' filas','success');
};

// Botón "Exportar CSV" para Pagos
window.exportPagosCSV = async function(){
  var sede = document.getElementById('pagoFiltroSede')?.value || '';
  var estado = document.getElementById('pagoFiltroEstado')?.value || '';
  var mes = document.getElementById('pagoFiltroMes')?.value || '';
  var qp = []; if(sede)qp.push('sede='+sede); if(estado)qp.push('estado='+estado); if(mes)qp.push('mes='+mes);
  var pagos = await API.get('/pagos'+(qp.length?'?'+qp.join('&'):''));
  if (!pagos || !pagos.length) { showToast('Nada que exportar','error'); return; }
  exportCSV('pagos_'+(mes||hoyLocal())+'.csv',
    ['#','Colaborador','Sede','Cargo','Ciclo desde','Ciclo hasta','Mes','Monto base','Bonus','Descuentos','Total','Nota','Método','N° comprob.','Fecha pago','Estado','Anulado','Observaciones','Registrado por'],
    pagos.map(function(p){
      return [p.id, p.emp_nombre||'', p.emp_sede||'', (p.emp_rol||'').replace(/_/g,' '),
        p.ciclo_desde||'', p.ciclo_hasta||'', p.mes||'',
        p.monto_base||0, p.bonus||0, p.descuentos||0, p.monto||0,
        p.nota_final!=null?p.nota_final:'', p.metodo||'', p.comprobante_num||'',
        p.fecha_pago||'', p.estado||'', p.anulado?'SÍ ('+(p.anulado_motivo||'')+')':'NO',
        p.observaciones||'', p.registrado_por||''];
    }));
  showToast('Exportados '+pagos.length+' pagos','success');
};

// Botón "Exportar CSV" para Asistencia diaria
window.exportAsistDiaCSV = async function(){
  var fecha = document.getElementById('asistDiaFecha')?.value || hoyLocal();
  var sede = document.getElementById('asistDiaSede')?.value || '';
  var qp = ['fecha='+fecha]; if(sede) qp.push('sede='+sede);
  var d = await API.get('/asistencias/del-dia?'+qp.join('&'));
  if (!d || !d.rows || !d.rows.length) { showToast('Nada que exportar','error'); return; }
  exportCSV('asistencia_'+fecha+(sede?'_'+sede:'')+'.csv',
    ['Colaborador','Rol','Turno','Sede esperada','Estado','Hora entrada','Min tardanza','Fuente','Observación'],
    d.rows.map(function(r){
      var a = r.asistencia;
      return [r.nombre, (r.rol||'').replace(/_/g,' '), r.turno==='M'?'Mañana':'Tarde',
        r.sede_esperada||'', a?'Presente':'Ausente',
        a?(a.hora_entrada||''):'', a?(a.minutos_tardanza||0):'',
        a?(a.fuente||''):'', a?(a.obs||''):''];
    }));
  showToast('Exportadas '+d.rows.length+' filas','success');
};

// ═══════════════════════════════════════════════════════
// DASHBOARD POR TRABAJADOR (tab "Dashboard" en page-evaluacion-mensual)
// ═══════════════════════════════════════════════════════
function _evalMDashFmtMes(rng) {
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var d0 = new Date(rng.desde + 'T12:00:00');
  var d1 = new Date(rng.hasta + 'T12:00:00');
  if (d0.getMonth() === d1.getMonth() && d0.getFullYear() === d1.getFullYear()) {
    return meses[d0.getMonth()] + ' ' + d0.getFullYear();
  }
  return rng.desde + ' → ' + rng.hasta;
}
function _evalMDashCatDot(c) {
  return ({IND:'#c0392b', PO:'#2e3e6e', SO:'#b8860b', EXT:'#7c3aed'})[c] || '#888';
}

async function renderEvalMDashboard() {
  var empId = document.getElementById('evalMEmpSel')?.value || STATE.evalMensualEmp || '';
  var desde = document.getElementById('evalMDesde')?.value || STATE.evalMensualDesde || '';
  var hasta = document.getElementById('evalMHasta')?.value || STATE.evalMensualHasta || '';
  var empty = document.getElementById('evalMDashEmpty');
  var content = document.getElementById('evalMDashContent');
  if (!empId || !desde || !hasta) {
    if (empty) empty.style.display = '';
    if (content) content.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (content) content.style.display = '';

  var qs = new URLSearchParams({ emp_id: empId, desde: desde, hasta: hasta }).toString();
  var d = await API.get('/dashboard/empleado?' + qs);
  if (!d) return;

  // ── Hero scorecard
  var hero = document.getElementById('evalMDashHero');
  var k = d.kpis || {};
  var puntaje = k.puntaje_avg || 0;
  var dlt = k.delta || 0;
  var deltaTxt = dlt > 0 ? '▲ +' + dlt : dlt < 0 ? '▼ ' + dlt : 'sin cambio';
  var deltaCol = dlt > 0 ? '#86efac' : dlt < 0 ? '#fca5a5' : '#9ca3af';
  var ini = (d.empleado.nombre || '').slice(0,2).toUpperCase();
  var sedeLbl = d.empleado.sedes && d.empleado.sedes[0]
    ? (SEDES[d.empleado.sedes[0]]?.label || d.empleado.sedes[0])
    : '—';
  if (hero) hero.innerHTML =
    '<div class="lb-hero-left">' +
      '<div class="lb-hero-avatar">' + ini + '</div>' +
      '<div>' +
        '<div class="lb-hero-name">' + d.empleado.nombre + '</div>' +
        '<div class="lb-hero-meta">' + (d.empleado.rol || '—') + ' · ' + sedeLbl + '</div>' +
        '<div class="lb-hero-period">' + _evalMDashFmtMes(d.periodo) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="lb-hero-right">' +
      '<div class="lb-hero-score-lbl">Puntaje promedio</div>' +
      '<div class="lb-hero-score-val">' + puntaje + '<small>/100</small></div>' +
      '<div class="lb-hero-delta" style="color:' + deltaCol + '">' + deltaTxt + ' vs mes anterior</div>' +
    '</div>';

  // ── KPIs personales
  var kpis = document.getElementById('evalMDashKpis');
  if (kpis) kpis.innerHTML =
    '<div class="lb-kpi lb-kpi--navy"><div class="lb-kpi-lbl">Reportes</div><div class="lb-kpi-val">' + (k.reportes||0) + '</div><div class="lb-kpi-sub">' + (k.evaluados||0) + ' evaluados</div></div>' +
    '<div class="lb-kpi lb-kpi--gold"><div class="lb-kpi-lbl">Puntaje base</div><div class="lb-kpi-val">' + (k.puntaje_avg||0) + '<span class="lb-kpi-unit">/100</span></div><div class="lb-kpi-sub">prom. del per&iacute;odo</div></div>' +
    '<div class="lb-kpi lb-kpi--green"><div class="lb-kpi-lbl">Mes anterior</div><div class="lb-kpi-val">' + (k.puntaje_prev||0) + '<span class="lb-kpi-unit">/100</span></div><div class="lb-kpi-sub">' + (k.reportes_prev||0) + ' reportes</div></div>' +
    '<div class="lb-kpi lb-kpi--purp"><div class="lb-kpi-lbl">Sede principal</div><div class="lb-kpi-val" style="font-size:18px;line-height:1.6">' + sedeLbl + '</div><div class="lb-kpi-sub">' + ((d.empleado.sedes||[]).length) + ' sede(s) asignada(s)</div></div>';

  // ── Cumplimiento por categoría
  var cat = document.getElementById('evalMDashCat');
  if (cat) {
    var rows = (d.cumplimiento_categoria || []).map(function(x){
      var color = x.pct >= 85 ? 'var(--green)' : x.pct >= 65 ? 'var(--yellow)' : 'var(--red)';
      return '<div class="lb-cat-row">' +
        '<div class="lb-cat-head">' +
          '<span class="lb-cat-name"><span class="lb-cat-dot" style="background:' + _evalMDashCatDot(x.cat) + '"></span>' + x.label + '<small class="lb-cat-peso">' + x.realizadas + '/' + x.esperadas + ' actos</small></span>' +
          '<span class="lb-cat-pct" style="color:' + color + '">' + x.pct + '%</span>' +
        '</div>' +
        '<div class="lb-cat-bar"><div class="lb-cat-fill" style="width:' + Math.max(2, x.pct) + '%;background:' + color + '"></div></div>' +
      '</div>';
    }).join('');
    if (!rows) rows = '<div style="color:var(--text3);font-size:12px;padding:18px 0">Sin actividades configuradas o sin reportes en el per&iacute;odo.</div>';
    cat.innerHTML = rows;
  }

  // ── Heatmap del trabajador
  var hm = document.getElementById('evalMDashHeat');
  var hbBdg = document.getElementById('evalMDashHeatBadge');
  if (hbBdg) hbBdg.textContent = _evalMDashFmtMes(d.periodo);
  if (hm) {
    var byDate = {};
    (d.heatmap||[]).forEach(function(h){ byDate[h.fecha] = h; });
    var d0 = new Date(d.periodo.desde + 'T12:00:00');
    var d1 = new Date(d.periodo.hasta + 'T12:00:00');
    var pad = (d0.getDay() + 6) % 7;
    var totalDays = Math.round((d1 - d0) / 86400000) + 1;
    var html = '<div class="lb-hm-labels"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div>';
    html += '<div class="lb-hm-grid">';
    for (var i=0; i<pad; i++) html += '<div class="lb-hm-cell lb-hm-empty"></div>';
    for (var i=0; i<totalDays; i++) {
      var dt = new Date(d0); dt.setDate(d0.getDate()+i);
      var key = dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
      var h = byDate[key];
      var p = h ? h.puntaje : null;
      var cls = p === null || p === undefined ? 'lb-hm-none' : p >= 85 ? 'lb-hm-high' : p >= 65 ? 'lb-hm-mid' : 'lb-hm-low';
      var tip = p !== null && p !== undefined ? ('Día ' + dt.getDate() + ': ' + p + '%') : ('Día ' + dt.getDate() + ' · sin reporte');
      html += '<div class="lb-hm-cell ' + cls + '" title="' + tip + '">' + dt.getDate() + '</div>';
    }
    html += '</div>';
    html += '<div class="lb-hm-legend">' +
      '<span class="lb-hm-cell lb-hm-high"></span><span>≥85</span>' +
      '<span class="lb-hm-cell lb-hm-mid"></span><span>65–84</span>' +
      '<span class="lb-hm-cell lb-hm-low"></span><span>&lt;65</span>' +
      '<span class="lb-hm-cell lb-hm-none"></span><span>sin rep.</span>' +
    '</div>';
    hm.innerHTML = html;
  }

  // ── Christie: Actividades × Días
  var ch = document.getElementById('evalMDashChristie');
  var chBdg = document.getElementById('evalMDashChristieBadge');
  if (chBdg) chBdg.textContent = (d.fechas||[]).length + ' días · ' + (d.christie||[]).length + ' actividades';
  if (ch) {
    var fechas = d.fechas || [];
    var rows = d.christie || [];
    if (!rows.length) {
      ch.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">Sin actividades para mostrar.</div>';
    } else {
      var byCat = {};
      rows.forEach(function(r){ if(!byCat[r.categoria]) byCat[r.categoria] = []; byCat[r.categoria].push(r); });
      var orden = ['IND','PO','SO','EXT'];
      var html = '<table class="lb-christie">';
      html += '<thead><tr><th class="ch-act">Actividad</th><th class="ch-peso">Peso</th>';
      fechas.forEach(function(f){
        var dd = f.slice(8,10);
        var dow = new Date(f+'T12:00:00').getDay();
        var isWk = (dow === 0 || dow === 6);
        html += '<th class="ch-day' + (isWk?' wk':'') + '">' + dd + '</th>';
      });
      html += '<th class="ch-tot">✓</th><th class="ch-tot">✗</th><th class="ch-tot">%</th></tr></thead><tbody>';
      orden.forEach(function(cat){
        if (!byCat[cat]) return;
        var label = ({IND:'INDISPENSABLES',PO:'PRIMER ORDEN',SO:'SEGUNDO ORDEN',EXT:'EXTRAS'})[cat];
        html += '<tr class="ch-cat-row"><td colspan="' + (fechas.length+5) + '"><span class="lb-cat-dot" style="background:' + _evalMDashCatDot(cat) + '"></span> ' + label + '</td></tr>';
        byCat[cat].forEach(function(row){
          html += '<tr>';
          html += '<td class="ch-act"><span class="ch-cod">' + row.cod + '</span> ' + row.nombre + '</td>';
          html += '<td class="ch-peso">' + row.peso + '</td>';
          row.celdas.forEach(function(c){
            var sym = c.status === 'ok' ? '✓' : c.status === 'no' ? '✗' : '·';
            html += '<td class="ch-c ch-c-' + c.status + '">' + sym + '</td>';
          });
          var pctCls = row.pct >= 85 ? 'ch-pct-high' : row.pct >= 65 ? 'ch-pct-mid' : 'ch-pct-low';
          html += '<td class="ch-tot ch-tot-ok">' + row.realizadas + '</td>';
          html += '<td class="ch-tot ch-tot-no">' + row.no_realizadas + '</td>';
          html += '<td class="ch-tot ' + pctCls + '">' + row.pct + '%</td>';
          html += '</tr>';
        });
      });
      html += '</tbody></table>';
      ch.innerHTML = html;
    }
  }

  // ── Evolución
  var ev = document.getElementById('evalMDashEvolucion');
  if (ev) {
    var arr = d.evolucion || [];
    if (!arr.length) ev.innerHTML = '<div style="color:var(--text3);font-size:12px">Sin datos históricos</div>';
    else {
      ev.innerHTML = arr.map(function(m){
        var color = m.puntaje >= 85 ? 'var(--green)' : m.puntaje >= 65 ? 'var(--yellow)' : m.puntaje > 0 ? 'var(--red)' : 'var(--text3)';
        return '<div class="lb-evo-row">' +
          '<span class="lb-evo-lbl">' + m.label + '</span>' +
          '<div class="lb-evo-bar"><div class="lb-evo-fill" style="width:' + m.puntaje + '%;background:' + color + '"></div></div>' +
          '<span class="lb-evo-val" style="color:' + color + '">' + m.puntaje + '</span>' +
          '<span class="lb-evo-cnt">' + m.reportes + ' rep.</span>' +
        '</div>';
      }).join('');
    }
  }

  // ── Incidencias
  var inc = document.getElementById('evalMDashIncidencias');
  if (inc) {
    var arr = d.incidencias || [];
    if (!arr.length) {
      inc.innerHTML = '<div style="color:var(--green);font-size:12px;font-weight:600;padding:12px 0">Sin incidencias en el período</div>';
    } else {
      var bdgs = { Alto:'badge-red', Medio:'badge-yellow', Bajo:'badge-green' };
      inc.innerHTML = arr.slice(0,8).map(function(i){
        return '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-s);font-size:12px">' +
          '<span class="badge ' + (bdgs[i.nivel]||'badge-gray') + '" style="flex-shrink:0">' + i.nivel + '</span>' +
          '<div style="flex:1">' +
            '<div style="font-weight:600;color:var(--text)">' + i.tipo + '</div>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + (i.descripcion||'') + '</div>' +
          '</div>' +
          '<span class="mono" style="font-size:10px;color:var(--text3);white-space:nowrap">' + i.fecha + '</span>' +
        '</div>';
      }).join('');
    }
  }
}
