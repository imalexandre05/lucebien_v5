// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/admin.js v4.3
// ═══════════════════════════════════════════════════════

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
}

function renderKpis(reps,incs) {
  const c=document.getElementById('dashKpis');if(!c)return;
  const ev=reps.filter(r=>r.evaluado).length;
  const avg=reps.length?Math.round(reps.reduce((s,r)=>s+(r.puntaje||0),0)/reps.length):0;
  c.innerHTML=`
    <div class="stat-card accent-navy"><div class="stat-label">Reportes</div><div class="stat-val">${reps.length}</div><div class="stat-sub">${ev} evaluados</div></div>
    <div class="stat-card accent-gold"><div class="stat-label">Puntaje promedio</div><div class="stat-val" style="color:var(--gold-d)">${avg}%</div><div class="stat-sub">promedio general</div></div>
    <div class="stat-card accent-red"><div class="stat-label">Incidencias</div><div class="stat-val" style="color:var(--red)">${incs.length}</div><div class="stat-sub">total registradas</div></div>
    <div class="stat-card accent-green"><div class="stat-label">Completados hoy</div><div class="stat-val" style="color:var(--green)">${reps.filter(r=>r.fecha===new Date().toISOString().slice(0,10)).length}</div><div class="stat-sub">reportes de hoy</div></div>`;
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
  if(c)c.innerHTML=`
    <div class="stat-card accent-yellow"><div class="stat-label">En proceso</div><div class="stat-val" style="color:var(--yellow)">${enP}</div></div>
    <div class="stat-card accent-blue"><div class="stat-label">Procesadas</div><div class="stat-val" style="color:var(--blue)">${proc}</div></div>
    <div class="stat-card accent-green"><div class="stat-label">Devueltas</div><div class="stat-val" style="color:var(--green)">${dev}</div></div>
    <div class="stat-card accent-navy"><div class="stat-label">Total</div><div class="stat-val">${listas.length}</div></div>`;
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

// ── INCIDENCIAS ADMIN ──────────────────────────────────
async function renderIncidenciasAdmin() {
  const fs   = document.getElementById('incFiltroSede')?.value||'';
  const fn   = document.getElementById('incFiltroNivel')?.value||'';
  const params={}; if(fs)params.sede=fs; if(fn)params.nivel=fn;
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
  const fecha=document.getElementById('incNuevaFecha')?.value||new Date().toISOString().slice(0,10);
  if(!sede||!tipo){showToast('Sede y tipo son requeridos','error');return;}
  const r=await API.crearIncidencia({sede,tipo,descripcion:desc,nivel,responsable:resp||'—',fecha});
  if(r){closeModal('incNuevaModal');await renderIncidenciasAdmin();showToast('✅ Incidencia registrada','success');}
}

// ── EMPLEADOS ──────────────────────────────────────────
async function renderEmpleados() {
  const q  =document.getElementById('empSearch')?.value.toLowerCase()||'';
  const all=await API.todosEmpleados();if(!all)return;
  STATE.empleadosCache=all;
  const body=document.getElementById('empBody');if(!body)return;
  const reps=await API.reportes({});
  const filtered=all.filter(e=>e.nombre.toLowerCase().includes(q)||e.cod.includes(q));
  const rBadge={admin:'badge-gold',trabajador:'badge-navy'};
  body.innerHTML=filtered.map(e=>{
    const r=(reps||[]).filter(rep=>(rep.trabajadores||[]).includes(e.nombre));
    const avg=r.length?Math.round(r.reduce((s,rep)=>s+(rep.puntaje||0),0)/r.length):0;
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:10px">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--navy-xd);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#d4bf1e">${e.iniciales}</div>
        <div><div style="font-weight:600">${e.nombre}</div><div class="mono" style="font-size:10px;color:var(--text3)">${e.id}</div></div>
      </div></td>
      <td style="font-size:12px">${(e.tiendas||[]).map(t=>SEDES[t]?.short||t).join(', ')}</td>
      <td><span class="badge ${rBadge[e.rol]||'badge-gray'}">${e.rol}</span></td>
      <td><div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;height:5px;background:var(--s3);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${avg}%;background:var(--navy);border-radius:3px"></div></div>
        <span class="mono" style="font-size:11px;font-weight:700;width:32px">${avg}%</span>
      </div></td>
      <td class="mono" style="font-size:12px">${r.length}</td>
      <td><span class="mono" style="font-size:12px;background:var(--s3);padding:2px 8px;border-radius:4px;border:1px solid var(--border)">${e.cod}</span></td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-xs" onclick="editarEmpleado('${e.id}')">Editar</button>
        <button class="btn btn-purple btn-xs" onclick="iniciarEvalMensual('${e.id}')">Eval.</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function editarEmpleado(empId) {
  const emp=STATE.empleadosCache.find(e=>e.id===empId);if(!emp)return;
  document.getElementById('editEmpId').value=empId;
  document.getElementById('editEmpNombre').value=emp.nombre;
  document.getElementById('editEmpCod').value=emp.cod;
  document.getElementById('editEmpRol').value=emp.rol;
  const tBox=document.getElementById('editEmpTiendas');
  if(tBox)tBox.innerHTML=Object.entries(SEDES).map(([cod,s])=>{
    const checked=(emp.tiendas||[]).includes(cod);
    return `<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;font-size:13px;padding:8px 10px;border-radius:8px;border:2px solid ${checked?'var(--navy)':'rgba(0,0,0,0.1)'};background:${checked?'rgba(46,62,110,0.1)':'transparent'};transition:all .15s" onclick="this.style.border=this.querySelector('input').checked?'2px solid rgba(0,0,0,0.1)':'2px solid var(--navy)';this.style.background=this.querySelector('input').checked?'transparent':'rgba(46,62,110,0.1)'">
      <input type="checkbox" value="${cod}" ${checked?'checked':''} style="width:18px;height:18px;accent-color:var(--navy);cursor:pointer">
      ${s.icon} <strong>${s.label}</strong>
    </label>`}).join('');
  document.querySelector('#editEmpModal .btn-primary').onclick=guardarEmpleado;
  openModal('editEmpModal');
}

async function guardarEmpleado() {
  const empId=document.getElementById('editEmpId').value;
  const nombre=document.getElementById('editEmpNombre').value.trim();
  const cod=document.getElementById('editEmpCod').value.trim();
  const rol=document.getElementById('editEmpRol').value;
  const tiendas=Array.from(document.querySelectorAll('#editEmpTiendas input:checked')).map(el=>el.value);
  if(!nombre||!cod){showToast('Nombre y código requeridos','error');return;}
  if(!tiendas.length){showToast('Selecciona al menos una tienda','error');return;}
  const r=await API.put('/empleados/'+empId,{nombre,cod,rol,tiendas,iniciales:nombre.slice(0,2).toUpperCase()});
  if(r){closeModal('editEmpModal');await renderEmpleados();showToast(`✅ ${nombre} actualizado`,'success');}
}

async function nuevoEmpleado() {
  const newId='E'+String(STATE.empleadosCache.length+1).padStart(2,'0');
  const newCod=String(1000+STATE.empleadosCache.length+1);
  document.getElementById('editEmpId').value=newId;
  document.getElementById('editEmpNombre').value='';
  document.getElementById('editEmpCod').value=newCod;
  document.getElementById('editEmpRol').value='trabajador';
  const tBox=document.getElementById('editEmpTiendas');
  if(tBox)tBox.innerHTML=Object.entries(SEDES).map(([cod,s])=>`
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;font-size:13px;padding:8px 10px;border-radius:8px;border:2px solid rgba(0,0,0,0.1);background:transparent;transition:all .15s" onclick="this.style.border=this.querySelector('input').checked?'2px solid rgba(0,0,0,0.1)':'2px solid var(--navy)';this.style.background=this.querySelector('input').checked?'transparent':'rgba(46,62,110,0.1)'">
      <input type="checkbox" value="${cod}" style="width:18px;height:18px;accent-color:var(--navy);cursor:pointer"> ${s.icon} <strong>${s.label}</strong>
    </label>`).join('');
  document.querySelector('#editEmpModal .btn-primary').onclick=async()=>{
    const nombre=document.getElementById('editEmpNombre').value.trim();
    const cod=document.getElementById('editEmpCod').value.trim();
    const rol=document.getElementById('editEmpRol').value;
    const tiendas=Array.from(document.querySelectorAll('#editEmpTiendas input:checked')).map(el=>el.value);
    if(!nombre||!cod||!tiendas.length){showToast('Completa todos los campos','error');return;}
    const r=await API.post('/empleados',{id:newId,cod,nombre,iniciales:nombre.slice(0,2).toUpperCase(),rol,tiendas});
    if(r){closeModal('editEmpModal');await renderEmpleados();showToast(`✅ ${nombre} agregado`,'success');}
  };
  openModal('editEmpModal');
}

// ── MI DESEMPEÑO ───────────────────────────────────────
async function renderMiDesempeno() {
  const u=STATE.user;if(!u)return;
  const data=await API.desempeno(u.id);if(!data)return;
  const {emp,reportes,evals,incidencias,stats}=data;
  const pct=stats.avgPuntaje;
  const cls=pct>=85?'excellent':pct>=70?'good':pct>=50?'regular':'bad';

  document.getElementById('miDesempenoCard').innerHTML=`
    <div class="perfil-card">
      <div style="display:flex;align-items:center;gap:18px">
        <div class="perfil-avatar-lg">${u.iniciales}</div>
        <div style="flex:1">
          <div style="font-size:20px;font-weight:700;margin-bottom:2px">${emp.nombre}</div>
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
    <div class="card">
      <div class="card-header"><span class="card-title">Últimos Reportes</span></div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr><th>Reporte</th><th>Sede</th><th>Turno</th><th>Puntaje</th><th>Evaluado</th></tr></thead>
          <tbody>${reportes.slice(0,10).map(r=>`
            <tr>
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
    ${evals.length?`
    <div class="card">
      <div class="card-header"><span class="card-title">Evaluaciones Mensuales</span></div>
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
  const empSel=document.getElementById('evalMEmpSel');
  if(empSel&&empSel.options.length<=1){
    const all=await API.todosEmpleados();
    (all||[]).filter(e=>e.rol!=='admin').forEach(e=>{
      const o=document.createElement('option');o.value=e.id;o.textContent=e.nombre;empSel.appendChild(o);
    });
  }
  await renderEvalMensualHistorial();
}

function iniciarEvalMensual(empId) {
  goTo('evaluacion-mensual',document.querySelector('[onclick*="evaluacion-mensual"]'));
  const sel=document.getElementById('evalMEmpSel');
  if(sel){sel.value=empId;cargarEvalMensualForm();}
}

async function cargarEvalMensualForm() {
  const empId=document.getElementById('evalMEmpSel')?.value;
  const mes=document.getElementById('evalMMes')?.value;
  if(!empId)return;
  const emp=STATE.empleadosCache.find(e=>e.id===empId)||await API.desempeno(empId).then(d=>d?.emp);
  if(!emp)return;
  STATE.evalMensualEmp=empId;STATE.evalMensualMes=mes;
  document.getElementById('evalMForm').classList.remove('hidden');
  document.getElementById('evalMEmpNombre').textContent=`${emp.nombre} — ${(emp.tiendas||[]).map(t=>SEDES[t]?.short||t).join('/')}`;

  // Competencias
  const compBody=document.getElementById('evalMCompBody');
  if(compBody){
    compBody.innerHTML=COMPETENCIAS.map(c=>`
      <tr>
        <td style="font-size:12.5px;font-weight:500">${c.nombre}</td>
        <td><select class="rubrica-select" id="evalC-${c.id}" onchange="calcEvalMensualPreview()">
          ${c.rubrica.map((r,i)=>`<option value="${i}">${i} — ${r}</option>`).join('')}
        </select></td>
        <td style="text-align:center"><span class="badge badge-navy" id="evalCPts-${c.id}">0/4</span></td>
      </tr>`).join('');
    compBody.querySelectorAll('.rubrica-select').forEach(sel=>{
      sel.addEventListener('change',()=>{
        const id=sel.id.replace('evalC-','');
        document.getElementById(`evalCPts-${id}`).textContent=`${sel.value}/4`;
        calcEvalMensualPreview();
      });
    });
  }

  // Valores — resumen de 360
  const valBox=document.getElementById('evalMValoresResumen');
  if(valBox&&mes){
    const resumen=await API.resumenValores(empId,mes);
    if(resumen&&resumen.promedios){
      const p=resumen.promedios;
      valBox.innerHTML=`
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
          Basado en <strong>${resumen.cantidad}</strong> evaluaciones de compañeros este mes.
        </div>
        <table class="data-table">
          <thead><tr><th>Valor</th>${[1,2,3,4,5].map(n=>`<th style="text-align:center">${n}⭐</th>`).join('')}<th>Prom.</th></tr></thead>
          <tbody>
            ${VALORES_NOMBRES.map((v,i)=>`
              <tr>
                <td>${v}</td>
                ${[1,2,3,4,5].map(()=>'<td style="text-align:center;font-size:11px">—</td>').join('')}
                <td style="text-align:center;font-weight:700;font-family:var(--font-m)">${p[VALORES_KEYS[i]]||0}</td>
              </tr>`).join('')}
            <tr style="background:var(--s3)"><td colspan="6" style="font-weight:700">NOTA /20</td><td style="font-weight:700;font-family:var(--font-m);color:var(--navy)">${p.nota20||0}</td></tr>
          </tbody>
        </table>`;
      document.getElementById('evalMNotaValores').value=p.nota20||0;
    } else {
      valBox.innerHTML='<div style="color:var(--text3);font-size:12px;font-family:var(--font-m)">Sin evaluaciones de valores este mes. Ingresa nota manualmente.</div>';
    }
  }

  // Tardanzas — nota manual
  const tardBox=document.getElementById('evalMNotaTardanza');
  if(tardBox)tardBox.value=0;

  calcEvalMensualPreview();
}

function calcEvalMensualPreview() {
  let compTotal=0;
  COMPETENCIAS.forEach(c=>{const sel=document.getElementById(`evalC-${c.id}`);compTotal+=sel?parseInt(sel.value||0):0;});
  const compNota=(compTotal/32)*20;

  const notaValores=parseFloat(document.getElementById('evalMNotaValores')?.value||0);
  const notaOperaciones=parseFloat(document.getElementById('evalMNotaOp')?.value||0);
  const notaTardanza=parseFloat(document.getElementById('evalMNotaTardanza')?.value||0);
  const notaExamenes=parseFloat(document.getElementById('evalMNotaExam')?.value||0);
  const descIncidencias=parseFloat(document.getElementById('evalMDescInc')?.value||0);

  // Nota final /20 según pesos del Excel
  const W={comp:0.25,valores:0.25,op:0.15,exam:0.15,tard:0.10,inc:0.10};
  const notaBase=(compNota*W.comp)+(notaValores*W.valores)+(notaOperaciones*W.op)+(notaExamenes*W.exam);
  const descuento=(notaTardanza*W.tard)+(descIncidencias*W.inc);
  const notaFinal=Math.max(0,Math.min(20,notaBase-descuento));

  const prev=document.getElementById('evalMPreview');
  if(prev){
    const cls=notaFinal>=17?'excellent':notaFinal>=14?'good':notaFinal>=11?'regular':'bad';
    prev.innerHTML=`
      <table class="data-table" style="margin-bottom:14px">
        <thead><tr><th>Componente</th><th style="text-align:center">Nota /20</th><th style="text-align:center">Peso</th><th style="text-align:center">Ponderado</th></tr></thead>
        <tbody>
          <tr><td>Competencias (Jefe)</td><td style="text-align:center;font-family:var(--font-m);font-weight:700">${compNota.toFixed(1)}</td><td style="text-align:center;color:var(--text3)">25%</td><td style="text-align:center;font-family:var(--font-m);font-weight:700;color:var(--navy)">${(compNota*W.comp).toFixed(1)}</td></tr>
          <tr><td>Valores 360°</td><td style="text-align:center;font-family:var(--font-m);font-weight:700">${notaValores}</td><td style="text-align:center;color:var(--text3)">25%</td><td style="text-align:center;font-family:var(--font-m);font-weight:700;color:var(--navy)">${(notaValores*W.valores).toFixed(1)}</td></tr>
          <tr><td>Checklist Operaciones</td><td style="text-align:center;font-family:var(--font-m);font-weight:700">${notaOperaciones}</td><td style="text-align:center;color:var(--text3)">15%</td><td style="text-align:center;font-family:var(--font-m);font-weight:700;color:var(--navy)">${(notaOperaciones*W.op).toFixed(1)}</td></tr>
          <tr><td>Exámenes y Conocimientos</td><td style="text-align:center;font-family:var(--font-m);font-weight:700">${notaExamenes}</td><td style="text-align:center;color:var(--text3)">15%</td><td style="text-align:center;font-family:var(--font-m);font-weight:700;color:var(--navy)">${(notaExamenes*W.exam).toFixed(1)}</td></tr>
          <tr style="color:var(--red)"><td>Desc. por Tardanzas</td><td style="text-align:center;font-family:var(--font-m);font-weight:700">-${notaTardanza}</td><td style="text-align:center">10%</td><td style="text-align:center;font-family:var(--font-m);font-weight:700">-${(notaTardanza*W.tard).toFixed(1)}</td></tr>
          <tr style="color:var(--red)"><td>Desc. por Incidencias</td><td style="text-align:center;font-family:var(--font-m);font-weight:700">-${descIncidencias}</td><td style="text-align:center">10%</td><td style="text-align:center;font-family:var(--font-m);font-weight:700">-${(descIncidencias*W.inc).toFixed(1)}</td></tr>
        </tbody>
      </table>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:var(--s3);border-radius:var(--r)">
        <div style="font-size:14px;font-weight:700">${notaFinal>=17?'⭐ Excelente desempeño':notaFinal>=14?'✅ Buen desempeño':notaFinal>=11?'⚠️ Requiere mejorar':'❌ Bajo rendimiento'}</div>
        <div class="score-pill ${cls}" style="font-size:22px;padding:12px 22px">${notaFinal.toFixed(1)}/20</div>
      </div>`;
  }
}

async function guardarEvalMensual() {
  const empId=STATE.evalMensualEmp;const mes=STATE.evalMensualMes;
  if(!empId){showToast('Selecciona un empleado','error');return;}
  let compTotal=0;
  COMPETENCIAS.forEach(c=>{const sel=document.getElementById(`evalC-${c.id}`);compTotal+=sel?parseInt(sel.value||0):0;});
  const nota_competencias=parseFloat(((compTotal/32)*20).toFixed(1));
  const nota_valores=parseFloat(document.getElementById('evalMNotaValores')?.value||0);
  const nota_operaciones=parseFloat(document.getElementById('evalMNotaOp')?.value||0);
  const nota_examenes=parseFloat(document.getElementById('evalMNotaExam')?.value||0);
  const nota_tardanza=parseFloat(document.getElementById('evalMNotaTardanza')?.value||0);
  const desc_incidencias=parseFloat(document.getElementById('evalMDescInc')?.value||0);
  const W={comp:0.25,valores:0.25,op:0.15,exam:0.15,tard:0.10,inc:0.10};
  const notaBase=(nota_competencias*W.comp)+(nota_valores*W.valores)+(nota_operaciones*W.op)+(nota_examenes*W.exam);
  const nota_final=parseFloat(Math.max(0,Math.min(20,notaBase-(nota_tardanza*W.tard)-(desc_incidencias*W.inc))).toFixed(1));
  const recomendacion=nota_final>=17?'⭐ Excelente':nota_final>=14?'✅ Buen desempeño':nota_final>=11?'⚠️ Requiere mejorar':'❌ Bajo rendimiento';
  const obs=document.getElementById('evalMObsGeneral')?.value||'';
  const r=await API.guardarEvalMensual({emp_id:empId,mes,evaluador:STATE.user?.nombre||'Admin',nota_competencias,nota_valores,nota_operaciones,nota_tardanza:nota_tardanza*W.tard,descuento_incidencias:desc_incidencias*W.inc,nota_final,recomendacion,obs_general:obs});
  if(r){await renderEvalMensualHistorial();showToast(`✅ Evaluación guardada — ${nota_final}/20`,'success');}
}

async function renderEvalMensualHistorial() {
  const evals=await API.evalsMensuales({});if(!evals)return;
  const body=document.getElementById('evalMHistBody');if(!body)return;
  body.innerHTML=evals.length===0?'<tr><td class="empty-cell" colspan="6">Sin evaluaciones</td></tr>'
    :evals.map(ev=>{
      const emp=STATE.empleadosCache.find(e=>e.id===ev.emp_id);
      const cls=ev.nota_final>=17?'excellent':ev.nota_final>=14?'good':ev.nota_final>=11?'regular':'bad';
      return `<tr>
        <td style="font-weight:600">${emp?.nombre||ev.emp_id}</td>
        <td class="mono" style="font-size:11px">${ev.mes}</td>
        <td><div class="score-pill ${cls}">${ev.nota_final}/20</div></td>
        <td style="font-size:12px">${ev.recomendacion}</td>
        <td>${ev.evaluador}</td>
        <td>${ev.obs_general||'—'}</td>
      </tr>`;
    }).join('');
}

// ══════════════════════════════════════════════════════
// GESTIÓN DE ACTIVIDADES — Admin
// ══════════════════════════════════════════════════════

async function gaCargarActividades() {
  const sede = document.getElementById('gaSedeSelect')?.value;
  if (!sede) return;
  const acts = await API.req('GET', `/actividades/admin?sede=${sede}`);
  const body = document.getElementById('gaTableBody');
  if (!body) return;

  const CAT_LABELS = {PO:'Primer Orden',IND:'Indispensable',SO:'2° Orden',ALM:'Almacén',EXT:'Extra'};
  const CAT_CLS    = {PO:'cat-po',IND:'cat-ind',SO:'cat-so',ALM:'cat-alm',EXT:'cat-ext'};

  if (!acts || !acts.length) {
    body.innerHTML = '<tr><td class="empty-cell" colspan="9">Sin actividades configuradas — usa "Importar defaults"</td></tr>';
    document.getElementById('gaCount').textContent = '(0 actividades)';
    return;
  }
  document.getElementById('gaCount').textContent = `(${acts.length} actividades)`;
  const TIPO_BADGE={obligatoria:'badge-navy',por_puntos:'badge-blue',remunerada:'badge-gold'};
  const TIPO_LABEL={obligatoria:'Obligatoria',por_puntos:'Por Puntos',remunerada:'Remunerada'};
  body.innerHTML = acts.map((a,i) => `
    <tr>
      <td class="mono" style="font-size:11px;color:var(--text3)">${i+1}</td>
      <td style="font-weight:500">${a.nombre} <span class="mono" style="font-size:10px;color:var(--text3)">${a.cod}</span></td>
      <td><span class="act-cat ${CAT_CLS[a.categoria]||'cat-ext'}">${CAT_LABELS[a.categoria]||a.categoria}</span></td>
      <td><span class="badge ${TIPO_BADGE[a.tipo_act]||'badge-gray'}" style="font-size:10px">${TIPO_LABEL[a.tipo_act]||'Obligatoria'}</span></td>
      <td class="mono">${a.peso}</td>
      <td class="mono">${a.tipo_act==='remunerada'?'S/'+Number(a.precio_unitario||0).toFixed(2):'—'}</td>
      <td class="mono" style="font-size:10px">${a.turno||'ambos'}</td>
      <td><span class="${a.activa ? 'status-pill green' : 'status-pill gray'}">${a.activa ? 'Activa' : 'Inactiva'}</span></td>
      <td>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" onclick="gaEditarActividad(${a.id})">Editar</button>
        <button class="btn" style="padding:4px 10px;font-size:11px;background:var(--red-bg);color:var(--red);border:none" onclick="gaEliminarActividad(${a.id},'${a.nombre.replace(/'/g,"\\'")}')">Eliminar</button>
      </td>
    </tr>`).join('');
}

function gaTogglePrecio() {
  const tipo = document.getElementById('gaActTipoAct')?.value;
  const wrap = document.getElementById('gaActPrecioWrap');
  if (wrap) wrap.style.display = tipo === 'remunerada' ? '' : 'none';
}

function gaAbrirModalNueva() {
  document.getElementById('gaEditId').value = '';
  document.getElementById('gaModalTitle').textContent = 'Nueva Actividad';
  document.getElementById('gaActNombre').value = '';
  document.getElementById('gaActCod').value = '';
  document.getElementById('gaActCat').value = 'PO';
  document.getElementById('gaActPeso').value = 5;
  document.getElementById('gaActTipoAct').value = 'obligatoria';
  document.getElementById('gaActPrecio').value = 0;
  document.getElementById('gaActTurno').value = 'ambos';
  document.getElementById('gaActUnidad').value = 'unidad';
  document.getElementById('gaActApareceDia').value = 0;
  document.getElementById('gaActFrecuencia').value = 0;
  document.getElementById('gaActAcumula').checked = true;
  document.getElementById('gaActOrden').value = 0;
  gaTogglePrecio();
  openModal('gaModal');
}

async function gaEditarActividad(id) {
  const sede = document.getElementById('gaSedeSelect')?.value;
  const acts = await API.req('GET', `/actividades/admin?sede=${sede}`);
  const a = acts?.find(x => x.id === id);
  if (!a) return;
  document.getElementById('gaEditId').value = id;
  document.getElementById('gaModalTitle').textContent = 'Editar Actividad';
  document.getElementById('gaActNombre').value = a.nombre;
  document.getElementById('gaActCod').value = a.cod;
  document.getElementById('gaActCat').value = a.categoria;
  document.getElementById('gaActPeso').value = a.peso;
  document.getElementById('gaActTipoAct').value = a.tipo_act || 'obligatoria';
  document.getElementById('gaActPrecio').value = a.precio_unitario || 0;
  document.getElementById('gaActTurno').value = a.turno || 'ambos';
  document.getElementById('gaActUnidad').value = a.unidad || 'unidad';
  document.getElementById('gaActApareceDia').value = a.aparece_dia;
  document.getElementById('gaActFrecuencia').value = a.frecuencia_dias;
  document.getElementById('gaActAcumula').checked = !!a.acumula;
  document.getElementById('gaActOrden').value = a.orden;
  gaTogglePrecio();
  openModal('gaModal');
}

async function gaGuardarActividad() {
  const editId = document.getElementById('gaEditId').value;
  const sede   = document.getElementById('gaSedeSelect')?.value;
  const tipoAct = document.getElementById('gaActTipoAct').value;
  const payload = {
    sede,
    cod:             document.getElementById('gaActCod').value.trim().toUpperCase(),
    nombre:          document.getElementById('gaActNombre').value.trim(),
    categoria:       tipoAct === 'remunerada' || tipoAct === 'por_puntos' ? 'EXT' : document.getElementById('gaActCat').value,
    tipo_act:        tipoAct,
    peso:            parseInt(document.getElementById('gaActPeso').value)||0,
    precio_unitario: tipoAct === 'remunerada' ? parseFloat(document.getElementById('gaActPrecio').value)||0 : 0,
    turno:           document.getElementById('gaActTurno').value || 'ambos',
    unidad:          document.getElementById('gaActUnidad').value.trim() || 'unidad',
    aparece_dia:     parseInt(document.getElementById('gaActApareceDia').value)||0,
    frecuencia_dias: parseInt(document.getElementById('gaActFrecuencia').value)||0,
    acumula:         document.getElementById('gaActAcumula').checked,
    orden:           parseInt(document.getElementById('gaActOrden').value)||0,
    activa:          true,
  };
  if (!payload.nombre) { showToast('El nombre es requerido','error'); return; }
  let r;
  if (editId) {
    r = await API.req('PUT', `/actividades/${editId}`, payload);
  } else {
    r = await API.req('POST', `/actividades`, payload);
  }
  if (r) {
    showToast(editId ? '✅ Actividad actualizada' : '✅ Actividad creada', 'success');
    closeModal('gaModal');
    gaCargarActividades();
  }
}

async function gaEliminarActividad(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return;
  const r = await API.req('DELETE', `/actividades/${id}`);
  if (r) { showToast('🗑️ Actividad eliminada', 'success'); gaCargarActividades(); }
}

async function gaImportarDefaults() {
  const sede = document.getElementById('gaSedeSelect')?.value;
  if (!confirm(`¿Importar actividades por defecto para la sede ${sede}? Solo se añaden las que no existan.`)) return;
  const r = await API.req('POST', `/actividades/importar-defaults`, { sede });
  if (r) { showToast(`✅ ${r.count} actividades importadas`, 'success'); gaCargarActividades(); }
}
