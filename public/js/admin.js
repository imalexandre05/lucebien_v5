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
  if(sub)sub.textContent=`${fs?SEDES[fs]?.label:'Todas las sedes'}  ·  Este mes`;
  const params={}; if(fs)params.sede=fs;
  const [reps,incs]=await Promise.all([API.reportes(params),API.incidencias(params)]);
  if(!reps)return;
  renderKpis(reps,incs||[]);
  renderAlertas(fs);
  renderRanking(reps);
  renderDesempenoTiendas(reps);
  renderIncidenciasDash(incs||[]);
  renderLavStats();
  renderPipelineRanking();
  renderActIncumplidas(reps);
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
  let html='';
  for(const sed of sedes){
    const data=await API.alertas(sed);if(!data)continue;
    const {tieneM,tieneT,pendEval}=data;
    const label=SEDES[sed]?.label;
    if(tieneM&&tieneT&&!pendEval)html+=`<div class="report-alert report-alert-ok">✅ <strong>${label}</strong> — Ambos turnos y evaluados</div>`;
    else{
      if(!tieneM)html+=`<div class="report-alert">⚠️ <strong>${label}</strong> — Falta reporte de Mañana</div>`;
      if(!tieneT)html+=`<div class="report-alert">⚠️ <strong>${label}</strong> — Falta reporte de Tarde</div>`;
      if(pendEval)html+=`<div class="report-alert report-alert-warn">📋 <strong>${label}</strong> — Reportes sin evaluar</div>`;
    }
  }
  c.innerHTML=html||'<div style="color:var(--text3);font-size:12px;font-family:var(--font-m)">Sin alertas</div>';
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
  const c=document.getElementById('dashIncidencias');if(!c)return;
  const pN={Alto:0,Medio:0,Bajo:0};incs.forEach(i=>{pN[i.nivel]=(pN[i.nivel]||0)+1;});
  const cols={Alto:'var(--red)',Medio:'var(--yellow)',Bajo:'var(--green)'};
  const bdgs={Alto:'badge-red',Medio:'badge-yellow',Bajo:'badge-green'};
  c.innerHTML=`
    <div style="display:flex;gap:10px;margin-bottom:14px">
      ${Object.entries(pN).map(([n,cnt])=>`
        <div style="flex:1;text-align:center;padding:10px;background:var(--s3);border-radius:var(--r)">
          <div style="font-size:22px;font-weight:700;color:${cols[n]}">${cnt}</div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-top:2px">${n}</div>
        </div>`).join('')}
    </div>
    ${incs.slice(-4).reverse().map(inc=>`
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-s);font-size:12px">
        <span class="badge ${bdgs[inc.nivel]||'badge-gray'}" style="flex-shrink:0">${inc.nivel}</span>
        <span style="flex:1;color:var(--text2)">${inc.tipo}</span>
        <span class="mono" style="font-size:10px;color:var(--text3)">${SEDES[inc.sede]?.short||inc.sede}</span>
      </div>`).join('')}`;
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

// ── PIPELINE RANKING (Almacén) ────────────────────────
async function renderPipelineRanking() {
  const c=document.getElementById('dashPipelineRank');if(!c)return;
  const data=await API.get('/pipeline/ranking');
  if(!data||!data.ranking||!data.ranking.length){c.innerHTML='<div style="color:var(--text3);font-size:12px">Sin datos de almacén esta semana</div>';return;}
  const rcls=['rank-1','rank-2','rank-3'];
  c.innerHTML=`<div style="font-size:10px;color:var(--text3);margin-bottom:10px">Semana desde ${data.desde}</div>`+
    data.ranking.slice(0,6).map((r,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-s)">
      <div style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;background:${i<3?['#fef3c7','#f1f5f9','#fed7aa'][i]:'var(--s3)'};color:${i<3?['#92400e','#475569','#9a3412'][i]:'var(--text3)'}">${i+1}</div>
      <div style="flex:1"><div style="font-weight:700;font-size:12px">${r.emp_nombre}</div><div style="font-size:10px;color:var(--text3)">${r.acciones} acciones</div></div>
      <div style="font-weight:800;font-size:14px;color:var(--green)">${Number(r.total_pts).toFixed(1)} pts</div>
    </div>`).join('');
}

// ── ACTIVIDADES MÁS INCUMPLIDAS ──────────────────────
function renderActIncumplidas(reps) {
  const c=document.getElementById('dashActIncumplidas');if(!c)return;
  if(!reps||!reps.length){c.innerHTML='<div style="color:var(--text3);font-size:12px">Sin datos</div>';return;}
  // Count how often each activity was NOT done vs available
  const actStats={};
  reps.forEach(r=>{
    // Each report has act_total and act_done
    // We need per-activity data from the detail, but we only have summary here
    // Use what we have: group by sede and count reports with low scores
  });
  // Better approach: fetch from reportes with actividades
  // For now, show low-scoring reports as proxy
  const lowScore=reps.filter(r=>r.puntaje<50).sort((a,b)=>a.puntaje-b.puntaje);
  const missRatio=reps.map(r=>({sede:r.sede,turno:r.turno,fecha:r.fecha,ratio:r.act_total>0?Math.round((r.act_done/r.act_total)*100):100,done:r.act_done,total:r.act_total})).filter(r=>r.ratio<80).sort((a,b)=>a.ratio-b.ratio);

  if(!missRatio.length){c.innerHTML='<div style="color:var(--green);font-size:12px;font-weight:600">✅ Todas las tiendas cumplen >80% de actividades</div>';return;}
  c.innerHTML=missRatio.slice(0,6).map(r=>`
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-s);font-size:12px">
      <span class="badge badge-navy" style="flex-shrink:0">${SEDES[r.sede]?.short||r.sede}</span>
      <span style="flex:1;color:var(--text2)">${r.fecha} · ${{M:'Mañana',T:'Tarde',C:'Completo'}[r.turno]||r.turno}</span>
      <span style="font-weight:700;color:${r.ratio<50?'var(--red)':'var(--yellow)'}">${r.done}/${r.total} (${r.ratio}%)</span>
    </div>`).join('');
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
  if(!incs.length){body.innerHTML='<tr><td class="empty-cell" colspan="7">Sin incidencias</td></tr>';return;}
  const bdgs={Alto:'badge-red',Medio:'badge-yellow',Bajo:'badge-green'};
  body.innerHTML=incs.map(inc=>`
    <tr class="inc-${inc.nivel?.toLowerCase()}">
      <td class="mono" style="font-size:11px">${inc.fecha}</td>
      <td>${SEDES[inc.sede]?.label||inc.sede}</td>
      <td style="font-size:12.5px">${inc.tipo}</td>
      <td style="font-size:11px;color:var(--text2)">${inc.descripcion||'—'}</td>
      <td><span class="badge ${bdgs[inc.nivel]||'badge-gray'}">${inc.nivel}</span></td>
      <td style="font-size:12px">${inc.responsable||'—'}</td>
      <td><button class="btn btn-danger btn-xs" onclick="eliminarIncidencia(${inc.id})">✕</button></td>
    </tr>`).join('');
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
    return '<tr style="'+opac+'"><td><div style="display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:'+(isSusp?'#94a3b8':'var(--navy-xd)')+';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:'+(isSusp?'#fff':'#d4bf1e')+'">'+e.iniciales+'</div><div><div style="font-weight:600;font-size:13px">'+e.nombre+'</div><div class="mono" style="font-size:9px;color:var(--text3)">'+e.id+' · '+(e.dni||'Sin DNI')+'</div></div></div></td>'+
      '<td style="font-size:11px">'+(e.tiendas||[]).map(function(t){return '<span class="badge badge-navy" style="font-size:8px;padding:1px 5px;margin:1px">'+(SEDES[t]?.short||t)+'</span>'}).join(' ')+'</td>'+
      '<td><span class="badge '+rol.b+'" style="font-size:9px">'+rol.l+'</span></td>'+
      '<td><span class="badge '+est.b+'" style="font-size:9px">'+est.i+' '+est.l+'</span></td>'+
      '<td>'+(document.getElementById('empShowCod')?.checked?'<span class="mono" style="font-size:11px;background:var(--s3);padding:2px 8px;border-radius:4px;border:1px solid var(--border)">'+e.cod+'</span>':'<span style="font-size:10px;color:var(--text3)">••••</span>')+'</td>'+
      '<td style="font-size:11px;color:var(--text3)">'+(e.telefono||'—')+'</td>'+
      '<td><div style="display:flex;gap:3px"><button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();editarEmpleado(&quot;'+e.id+'&quot;)">Editar</button>'+
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
    <div class="perfil-card">
      <div style="display:flex;align-items:center;gap:18px">
        <div class="perfil-avatar-lg">${u.iniciales}</div>
        <div style="flex:1">
          <div style="font-size:20px;font-weight:700;margin-bottom:2px">${emp.nombre}</div>
          ${emp.nombre_completo?`<div style="font-size:11px;color:rgba(255,255,255,.5)">${emp.nombre_completo}</div>`:''}
          <div style="font-size:12px;opacity:.6;font-family:var(--font-m)">${(emp.tiendas||[]).map(t=>SEDES[t]?.label||t).join(' · ')}</div>
          <div style="margin-top:8px"><span class="badge badge-gold">${emp.rol}</span></div>
        </div>
        <div style="text-align:center">
          <div class="score-pill ${cls}" style="font-size:20px;padding:12px 20px">${pct}%</div>
          <div style="font-size:10px;font-family:var(--font-m);color:rgba(255,255,255,.4);margin-top:4px">Puntaje promedio</div>
        </div>
      </div>
    </div>
    <div class="grid-4" style="margin-bottom:18px">
      <div class="stat-card accent-navy"><div class="stat-label">Reportes</div><div class="stat-val">${stats.totalReportes}</div><div class="stat-sub">${stats.evaluados} evaluados</div></div>
      <div class="stat-card accent-gold"><div class="stat-label">Mejor puntaje</div><div class="stat-val" style="color:var(--gold-d)">${reportes.length?Math.max(...reportes.map(r=>r.puntaje||0)):0}%</div></div>
      <div class="stat-card accent-red"><div class="stat-label">Incidencias</div><div class="stat-val" style="color:var(--red)">${stats.totalIncidencias}</div></div>
      <div class="stat-card accent-green"><div class="stat-label">Evaluaciones</div><div class="stat-val" style="color:var(--green)">${evals.length}</div></div>
    </div>
    <div class="grid-2" style="margin-bottom:18px">
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
    <div class="card">
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

  var r=await API.guardarEvalMensual({
    emp_id:empId,mes:mes||desde+'_'+hasta,nota_competencias:nota_competencias,nota_valores:nota_valores,
    nota_operaciones:nota_operaciones,nota_tardanza:nota_tardanza,
    descuento_incidencias:desc_incidencias,
    nota_final:nota_final,recomendacion:recomendacion,obs_general:obs,evaluador:STATE.user?.nombre||'Admin'
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
