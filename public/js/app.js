// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/app.js v4.3
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const user = API.user();
  const token = API.token();
  if (user && token) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Token inválido');
      STATE.user = user; STATE.sede = user.sede;
      mostrarApp();
    } catch (e) {
      console.warn('[LuceBien] Sesión expirada:', e.message);
      API.clearToken();
      renderSedeScreen();
    }
  } else {
    renderSedeScreen();
  }
});

// ── SEDE ──────────────────────────────────────────────
function renderSedeScreen() {
  const g = document.getElementById('sedeGrid');
  if (!g) return;
  g.innerHTML = Object.entries(SEDES).map(([cod,s]) => `
    <div class="sede-card" onclick="selectSede('${cod}')">
      <span class="sede-card-icon">${s.icon}</span>
      <div class="sede-card-name">${s.label}</div>
      <div class="sede-card-sub">${s.tipo==='almacen'?'Almacén central':'Punto de venta'}</div>
    </div>`).join('');
}

function selectSede(cod) {
  STATE.sede = cod;
  document.getElementById('sedeScreen').style.display = 'none';
  document.getElementById('loginModal').classList.add('open');
  document.getElementById('loginSedeName').textContent = SEDES[cod].label;
  setTimeout(() => document.getElementById('loginNombre')?.focus(), 120);
}

function volverSedes() {
  API.clearToken();
  clearInterval(STATE.alertasTimer);
  STATE.user = null; STATE.sede = null;
  STATE.fr01 = { bloqueado:false, enviado:false, reportId:null, actividadesRealizadas:[], trabajadoresTurno:[], extras:[], incidencias:[] };
  document.querySelector('.sidebar')?.classList.remove('visible');
  document.querySelector('.main')?.classList.remove('visible');
  document.getElementById('loginModal')?.classList.remove('open');
  document.getElementById('sedeScreen').style.display = 'flex';
  renderSedeScreen();
}

// ── SELECTOR DE SEDE EN SIDEBAR ─────────────────────────────────────
// Popup elegante que aparece al hacer click en el bloque de sede del
// sidebar. Muestra solo las sedes que el usuario tiene asignadas
// (admin/dueño ve las 4). Cambiar de sede recarga la app.
function abrirSelectorSede() {
  var pop = document.getElementById('sbSedePop');
  if (!pop) return;
  // Toggle: si ya está abierto, lo cerramos (segundo click cierra)
  if (pop.style.display === 'block') { pop.style.display = 'none'; return; }
  var u = STATE.user; if (!u) return;
  var sedes = (u.tiendas && u.tiendas.length) ? u.tiendas.slice() : (u.sede ? [u.sede] : []);
  if (u.rol === 'admin' || u.rol === 'dueno' || u.rol === 'dueño') {
    ['LB','ST','TR','AL'].forEach(function(s){ if (sedes.indexOf(s) < 0) sedes.push(s); });
  }
  if (sedes.length <= 1) {
    showToast('Solo tienes una sede asignada', 'info');
    return;
  }
  var actual = STATE.sede;
  pop.innerHTML = '<div class="sb-sede-pop-title">Cambiar a</div>' +
    sedes.map(function(s){
      var lbl = (SEDES[s] && SEDES[s].label) || s;
      var ico = (SEDES[s] && SEDES[s].icon) || '🏢';
      var sel = s === actual ? ' selected' : '';
      return '<button class="sb-sede-pop-item'+sel+'" onclick="cambiarSede(\''+s+'\')">' +
               '<span class="sb-sede-pop-icon">'+ico+'</span>' +
               '<span class="sb-sede-pop-lbl">'+lbl+'</span>' +
               (s === actual ? '<span class="sb-sede-pop-check">✓</span>' : '') +
             '</button>';
    }).join('') +
    '<div class="sb-sede-pop-sep"></div>' +
    '<button class="sb-sede-pop-item sb-sede-pop-back" onclick="volverSedes()">' +
      '<span class="sb-sede-pop-icon">↩</span>' +
      '<span class="sb-sede-pop-lbl">Salir y elegir desde inicio</span>' +
    '</button>';
  pop.style.display = 'block';
  // Cerrar al click fuera
  setTimeout(function(){
    document.addEventListener('click', _cerrarSbSede, { once:true });
  }, 50);
}
function _cerrarSbSede(e){
  if (e.target.closest('#sbSedeFixed, #sbSedePop')) {
    document.addEventListener('click', _cerrarSbSede, { once:true });
    return;
  }
  var pop = document.getElementById('sbSedePop');
  if (pop) pop.style.display = 'none';
}
async function cambiarSede(nuevaSede) {
  if (!STATE.user || nuevaSede === STATE.sede) {
    var pop = document.getElementById('sbSedePop'); if (pop) pop.style.display = 'none';
    return;
  }
  // Re-login con la nueva sede usando el cod del usuario actual
  try {
    var r = await fetch('/api/auth/login-code', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ cod: STATE.user.cod, sede: nuevaSede })
    });
    var d = await r.json();
    if (d && d.token) {
      API.setToken(d.token);
      API.setUser(d.user);
      try { localStorage.setItem('lb_sede', nuevaSede); } catch(e){}
      location.reload();
    } else {
      showToast(d.error || 'No se pudo cambiar de sede', 'error');
    }
  } catch (e) {
    showToast('Error al cambiar de sede', 'error');
  }
}
window.abrirSelectorSede = abrirSelectorSede;
window.cambiarSede = cambiarSede;

// ── LOGIN ─────────────────────────────────────────────
async function doLogin() {
  var nombre=document.getElementById('loginNombre')?.value?.trim()||'';
  var pass=document.getElementById('loginPass')?.value||'';
  var err=document.getElementById('loginError');
  if(!nombre){showToast('Ingresa tu nombre','error');return;}
  if(!pass){showToast('Ingresa tu contraseña','error');return;}
  var res=await API.login(nombre,STATE.sede,pass);
  if(!res){err.style.display='block';setTimeout(function(){err.style.display='none';},3000);return;}
  API.setToken(res.token);
  API.setUser(res.user);
  STATE.user=res.user;
  err.style.display='none';
  closeModal('loginModal');
  mostrarApp();
}

async function mostrarApp() {
  const u    = STATE.user;
  const sede = STATE.sede || u.sede;
  STATE.sede = sede;
  // Ocultar pantalla de sedes (z-index:1000 tapa todo)
  document.getElementById('sedeScreen').style.display = 'none';
  document.querySelector('.sidebar').classList.add('visible');
  document.querySelector('.main').classList.add('visible');
  // sb-sede-badge y sb-user fueron movidos al header global; estos
  // ids ya no existen. Mantengo el código defensivo (si existieran lo
  // pintaría, si no, los chequeos no lanzan).
  var elSede = document.getElementById('sbSedeName'); if (elSede) elSede.textContent = SEDES[sede]?.label || sede;
  var elSedeFix = document.getElementById('sbSedeFixedName'); if (elSedeFix) elSedeFix.textContent = SEDES[sede]?.short || sede;
  var elAv   = document.getElementById('sbAvatar');   if (elAv)   elAv.textContent   = u.iniciales;
  var elNm   = document.getElementById('sbName');     if (elNm)   elNm.textContent   = u.nombre;
  var elRl   = document.getElementById('sbRole');     if (elRl)   elRl.textContent   = (EMP_ROLES_LABEL||{})[u.rol] || u.rol;
  const isAL = sede === 'AL';
  document.querySelectorAll('.nav-tienda').forEach(el=>el.classList.toggle('hidden',isAL));
  document.querySelectorAll('.nav-almacen').forEach(el=>el.classList.toggle('hidden',!isAL));
  document.getElementById('navAdmin').classList.toggle('hidden', u.rol!=='admin'&&u.rol!=='dueno');
  await loadPermisos();
  try { await cargarEmpleados(); } catch(e) { console.error('[mostrarApp] cargarEmpleados:', e); }
  try { await buildActTable(); } catch(e) { console.error('[mostrarApp] buildActTable:', e); }
  updateFR01Sub();
  iniciarAlertas();
  applyPermissions();
  // Verificar si evaluación de valores está habilitada
  await checkEvalValoresHabilitado();
  // Verificar si hay evaluación pendiente para esta sede
  await checkPendingEval();
  if (u.rol==='admin') goTo('dashboard', document.querySelector('[onclick*="dashboard"]'));
  else goTo('reporte', document.querySelector('[onclick*="reporte"]'));
}

// Restaurar evaluación pendiente desde el servidor
async function checkPendingEval() {
  try {
    const reportes = await API.reportes({ sede: STATE.sede });
    if (!reportes) return;
    // Buscar reporte sin evaluar y bloqueado (enviado pero no evaluado) — SOLO de la sede actual
    const pendiente = reportes.find(r => r.evaluado === 0 && r.bloqueado === 1 && r.sede === STATE.sede);
    if (!pendiente) return;
    // Cargar detalles del reporte
    const detalle = await API.get('/reportes/' + encodeURIComponent(pendiente.id) + '/detalle');
    if (!detalle) return;
    // Defensa extra: detalle debe coincidir con sede actual
    if (detalle.sede && detalle.sede !== STATE.sede) {
      console.warn('[checkPendingEval] detalle descartado por sede distinta:', detalle.sede, 'vs', STATE.sede);
      return;
    }
    // Restaurar STATE.fr01 para poder evaluar
    STATE.fr01.reportId = pendiente.id;
    STATE.fr01.bloqueado = true;
    STATE.fr01.enviado = true;
    STATE.fr01.pendFecha = detalle.fecha;
    STATE.fr01.pendTurno = detalle.turno;
    STATE.fr01.trabajadoresTurno = detalle.trabajadores || [];
    STATE.fr01.actividadesRealizadas = (detalle.actividades || []).map(a => ({
      cod: a.cod, nombre: a.nombre, cat: a.cat, peso: a.peso, obs: a.obs || ''
    }));
    // Mostrar UI de evaluación
    document.getElementById('fr01Blocked')?.classList.add('show');
    var ov=document.getElementById('fr01Overlay');if(ov)ov.style.display='';document.getElementById('fr01Content')&&(document.getElementById('fr01Content').style.display='none');
    document.getElementById('btnEnviarFR01').style.display = 'none';
    const ridBox = document.getElementById('fr01ReportId');
    if (ridBox) { ridBox.textContent = pendiente.id; ridBox.classList.remove('hidden'); }
    document.getElementById('fr01Status').textContent = 'Enviado';
    document.getElementById('fr01Status').className = 'badge badge-green';
    const evalBadge = document.getElementById('evalBadge');
    if (evalBadge) { evalBadge.classList.remove('hidden'); evalBadge.textContent = '!'; }
    prepararEval();
    console.log('[LuceBien] Evaluación pendiente restaurada:', pendiente.id);
  } catch (e) {
    console.warn('[LuceBien] Error al verificar evaluaciones pendientes:', e.message);
  }
}

function logout() {
  API.clearToken();
  clearInterval(STATE.alertasTimer);
  STATE.user = null; STATE.sede = null;
  STATE.fr01 = { bloqueado:false, enviado:false, reportId:null, actividadesRealizadas:[], trabajadoresTurno:[], extras:[], incidencias:[] };
  STATE.lavList=[]; STATE.refList=[]; STATE.sessionReportes=[]; STATE.pendingActs=[];
  document.querySelector('.sidebar')?.classList.remove('visible');
  document.querySelector('.main')?.classList.remove('visible');
  var lu=document.getElementById('loginUser')||document.getElementById('loginNombre');if(lu)lu.value='';
  var lp=document.getElementById('loginPass');if(lp)lp.value='';
  document.getElementById('sedeScreen').style.display = 'flex';
  renderSedeScreen();
}

// ── ALERTAS TEMPORALIZADAS ────────────────────────────
function iniciarAlertas() {
  checkAlertas();
  STATE.alertasTimer = setInterval(checkAlertas, 15000); // cada 15s — tiempo real
}

async function checkAlertas() {
  const box = document.getElementById('turnoAlertBox');
  if (!box || !STATE.sede) return;
  const now  = new Date();
  const hh   = now.getHours();
  const data = await API.alertas(STATE.sede);
  if (!data) return;

  const { tieneM, tieneT, pendEval } = data;
  box.innerHTML = '';

  // ── Detección de cambio de día — si el navegador estuvo abierto y cambió la fecha,
  // y no hay reporte propio enviado ni pendiente en servidor, reseteamos el estado local
  // para que el trabajador pueda registrar actividades del nuevo día sin refrescar.
  var hoyStr = data.hoy || hoyLocal();
  if (STATE._lastDate && STATE._lastDate !== hoyStr) {
    console.log('[LuceBien] Cambio de día detectado:', STATE._lastDate, '→', hoyStr);
    if (!pendEval && STATE.fr01.enviado === false) {
      // Día nuevo, sin pendiente — refresca actividades del nuevo día
      try { await buildActTable(); } catch(e) { console.error('[checkAlertas] buildActTable:', e); }
    }
  }
  STATE._lastDate = hoyStr;

  // ── LOCK FORM from server state (syncs across computers) ──
  var ov=document.getElementById('fr01Overlay'),ct=document.getElementById('fr01Content'),sb=document.getElementById('btnEnviarFR01');
  var todosEnviados=(tieneM&&tieneT);
  if((todosEnviados||pendEval)&&!STATE.fr01.enviado){
    if(ov)ov.style.display='';if(ct)ct.style.display='none';
    if(sb)sb.style.display='none';
    document.getElementById('fr01Blocked')?.classList.add('show');
    if(pendEval&&!todosEnviados){
      // Hay evaluación pendiente — usa pendienteEval (puede ser de ayer), fallback a hoyR.
      var lastReport=data.pendienteEval||(data.hoyR||[]).find(function(r){return r.bloqueado&&!r.evaluado;});
      // Defensa: ignorar pendiente si pertenece a otra sede (bug de sesión compartida)
      if(lastReport&&lastReport.sede&&lastReport.sede!==STATE.sede){
        console.warn('[checkAlertas] pendienteEval descartado por sede distinta:',lastReport.sede,'vs',STATE.sede);
        lastReport=null;
      }
      if(lastReport&&STATE.fr01.reportId!==lastReport.id){
        // Carga detalles del pendiente (propio o de ayer) para poder evaluarlo
        try {
          var det = await API.get('/reportes/' + encodeURIComponent(lastReport.id) + '/detalle');
          if (det && det.sede && det.sede !== STATE.sede) {
            console.warn('[checkAlertas] detalle descartado por sede distinta:',det.sede,'vs',STATE.sede);
            det = null;
          }
          if (det) {
            STATE.fr01.reportId = det.id;
            STATE.fr01.bloqueado = true;
            STATE.fr01.enviado = true;
            STATE.fr01.pendFecha = det.fecha;
            STATE.fr01.pendTurno = det.turno;
            STATE.fr01.trabajadoresTurno = det.trabajadores || [];
            STATE.fr01.actividadesRealizadas = (det.actividades||[]).map(function(a){
              return { cod:a.cod, nombre:a.nombre, cat:a.cat, peso:a.peso, obs:a.obs||'' };
            });
            var ridBox = document.getElementById('fr01ReportId');
            if (ridBox) { ridBox.textContent = det.id; ridBox.classList.remove('hidden'); }
            var statusEl = document.getElementById('fr01Status');
            if (statusEl) { statusEl.textContent = 'Enviado'; statusEl.className = 'badge badge-green'; }
            var evalBadge = document.getElementById('evalBadge');
            if (evalBadge) { evalBadge.classList.remove('hidden'); evalBadge.textContent = '!'; }
            if (typeof prepararEval === 'function') prepararEval();
          }
        } catch(e) { console.warn('[checkAlertas] no se pudo cargar pendiente:', e); }
      }
    }
  } else if(!STATE.fr01.bloqueado&&!STATE.fr01.enviado&&!todosEnviados) {
    if(ov)ov.style.display='none';if(ct)ct.style.display='';
    if(sb){sb.style.display='';sb.disabled=false;sb.style.opacity='';}
    document.getElementById('fr01Blocked')?.classList.remove('show');
  }

  // ── Block turno buttons ──
  // Reglas de horario (solo tiendas):
  //   <8      → todo bloqueado (antes de apertura)
  //   8–15    → M + C habilitados, T bloqueado (aún no es tarde)
  //   15–23   → T habilitado, M + C bloqueados (turno tarde corriendo)
  //   23+     → todo bloqueado (cierre)
  // Además: si ya se envió M/T/C hoy, ese botón queda bloqueado.
  var btns=document.querySelectorAll('#fr01TurnoGroup .btn-sel');
  if(btns.length>=3){
    var bM=btns[0],bT=btns[1],bC=btns[2];
    var _reset=function(b){b.disabled=false;b.style.opacity='';b.style.pointerEvents='';b.title='';};
    var _dis=function(b,t){b.disabled=true;b.style.opacity='0.35';b.style.pointerEvents='none';b.title=t;};
    _reset(bM);_reset(bT);_reset(bC);
    var esAlmacenBtn = SEDES[STATE.sede]?.tipo === 'almacen';
    if(!esAlmacenBtn){
      if(hh<8){_dis(bM,'Disponible desde las 8am');_dis(bT,'Turno tarde: desde las 3pm');_dis(bC,'Disponible desde las 8am');}
      else if(hh<15){_dis(bT,'Turno tarde: desde las 3pm');}
      else if(hh<23){_dis(bM,'Cerrado (pasó 3pm) — turno mañana ya no se puede enviar');_dis(bC,'Completo solo se envía de mañana');}
      else {_dis(bM,'Cerrado (pasó 11pm)');_dis(bT,'Cerrado (pasó 11pm)');_dis(bC,'Cerrado (pasó 11pm)');}
    }
    if(tieneM)_dis(bM,'Ya enviado hoy');
    if(tieneT)_dis(bT,'Ya enviado hoy');
    if(tieneM||tieneT)_dis(bC,'Ya hay turno parcial enviado');
    var cur=document.getElementById('fr01Turno')?.value;
    if(bM.disabled&&cur==='M'){if(!bT.disabled)btnSelVal('fr01TurnoGroup','fr01Turno',bT,'T');else if(!bC.disabled)btnSelVal('fr01TurnoGroup','fr01Turno',bC,'C');}
    if(bT.disabled&&cur==='T'){if(!bM.disabled)btnSelVal('fr01TurnoGroup','fr01Turno',bM,'M');else if(!bC.disabled)btnSelVal('fr01TurnoGroup','fr01Turno',bC,'C');}
    if(bC.disabled&&cur==='C'){if(!bT.disabled)btnSelVal('fr01TurnoGroup','fr01Turno',bT,'T');else if(!bM.disabled)btnSelVal('fr01TurnoGroup','fr01Turno',bM,'M');}
    var allBlocked=bM.disabled&&bT.disabled&&bC.disabled;
    if(sb){sb.disabled=allBlocked;if(allBlocked)sb.style.opacity='0.4';else sb.style.opacity='';}
  }

  // ── Alerts ──
  const esAlmacen = SEDES[STATE.sede]?.tipo === "almacen";
  if (!esAlmacen && hh >= 15 && !tieneM) {
    box.innerHTML += '<div class="turno-alert-bar alerta-m" id="alertaM">⏰ <strong>Turno mañana cerrado</strong> — Pasó las 3:00pm<button class="alerta-close" onclick="document.getElementById(\'alertaM\').remove()" title="Cerrar">✕</button></div>';
  }
  if (!esAlmacen && hh >= 20 && !tieneT) {
    box.innerHTML += '<div class="turno-alert-bar alerta-n" id="alertaN">🔴 <strong>Falta el reporte de Tarde/Noche</strong> — La tienda debe quedar limpia para el siguiente turno</div>';
  }
  if (!esAlmacen && hh >= 23 && (!tieneM || !tieneT)) {
    box.innerHTML += '<div class="turno-alert-bar alerta-n">🚫 <strong>Hora límite superada</strong> — Reportes bloqueados después de las 11pm</div>';
  }
  if (pendEval) {
    box.innerHTML += '<div class="turno-alert-bar alerta-m">📋 Hay reportes pendientes de <strong>evaluación</strong></div>';
  }
  if (tieneM && tieneT && !pendEval) {
    box.innerHTML = '<div class="turno-alert-bar alerta-ok">✅ Ambos turnos reportados y evaluados hoy</div>';
  }
}

// Quitar alerta de noche al enviar reporte
function quitarAlertaNoche() {
  document.getElementById('alertaN')?.remove();
}

// ── EMPLEADOS ─────────────────────────────────────────
async function cargarEmpleados() {
  try {
    const data = await API.empleados(STATE.sede);
    if (!data) return;
    // API returns {propios:[...], otros:[...]}
    var propios = data.propios || data || [];
    var otros = data.otros || [];
    // If API returned flat array (fallback), split manually
    if (Array.isArray(data)) {
      propios = data.filter(e => e.tiendas && e.tiendas.includes(STATE.sede));
      otros = data.filter(e => !e.tiendas || !e.tiendas.includes(STATE.sede));
    }
    STATE.empleadosCache = propios.concat(otros);
    buildPersonaSelect('trabWrap', propios, otros, null);
    // Encargado: filtrar por rol de responsabilidad
    var encPropios = propios.filter(function(e){
      return e.rol==='encargado_tienda'||e.rol==='encargado_almacen'||e.rol==='admin'||e.rol==='dueno';
    });
    var encOtros = propios.filter(function(e){ return encPropios.indexOf(e)<0; }).concat(otros);
    buildPersonaSelect('encWrap', encPropios, encOtros, 1);
  } catch(e) { console.error('[cargarEmpleados]', e); }
}

// ── PERSONA SELECT ────────────────────────────────────
const _ps = {};

function buildPersonaSelect(wrapId, propios, otros, max) {
  if (!document.getElementById(wrapId)) return;
  _ps[wrapId] = { propios:[...propios], otros:[...otros], activos:[...propios], selected:new Set(), max, mostrarOtros:false };
  const inp = document.querySelector(`#${wrapId} .persona-search-input`);
  if (inp) inp.oninput = () => renderPsList(wrapId);
  renderPsList(wrapId);
}

function renderPsList(wrapId) {
  const s = _ps[wrapId]; if (!s) return;
  const listEl = document.getElementById(wrapId === 'trabWrap' ? 'trabList' : 'encList'); if (!listEl) return;
  const inp = document.querySelector(`#${wrapId} .persona-search-input`);
  const q   = inp?.value.toLowerCase() || '';
  const encSel = _ps['encWrap']?.selected || new Set();

  const lista = s.mostrarOtros ? [...s.propios, ...s.otros] : s.propios;
  listEl.innerHTML = lista.filter(e => e.nombre.toLowerCase().includes(q)).map(e => {
    const isSel    = s.selected.has(e.nombre);
    const isLocked = (wrapId==='trabWrap') && encSel.has(e.nombre);
    const esOtra   = !s.propios.find(p=>p.id===e.id);
    return `<div class="persona-opt ${isSel?'selected':''} ${isLocked?'disabled-opt':''} ${esOtra?'otra-tienda':''}"
      onclick="${isLocked?'':`psToggle('${wrapId}','${e.nombre}')`}">
      <div class="persona-avatar">${e.iniciales}</div>
      <span class="persona-name">${e.nombre}</span>
      <span class="persona-tienda-tag">${(e.tiendas||[]).map(t=>SEDES[t]?.short||t).join('/')}</span>
      <div class="persona-check">${isSel?'✓':''}</div>
    </div>`;
  }).join('');
  renderPsTags(wrapId);
}

function psToggle(wrapId, nombre) {
  const s = _ps[wrapId]; if (!s) return;
  if (s.selected.has(nombre)) { s.selected.delete(nombre); }
  else {
    if (s.max && s.max === 1) { s.selected.clear(); } // Radio: replace
    else if (s.max && s.selected.size >= s.max) { showToast(`Máximo ${s.max}`,'error'); return; }
    s.selected.add(nombre);
    if (wrapId==='encWrap') {
      const ts = _ps['trabWrap'];
      if (ts && !ts.selected.has(nombre)) { ts.selected.add(nombre); renderPsList('trabWrap'); }
    }
  }
  renderPsList(wrapId);
}

function psRemove(wrapId, nombre) {
  const s = _ps[wrapId]; if (!s) return;
  if (wrapId==='trabWrap' && _ps['encWrap']?.selected.has(nombre)) {
    showToast(`${nombre} es encargado — quítalo primero`,'error'); return;
  }
  s.selected.delete(nombre);
  if (wrapId==='encWrap') renderPsList('trabWrap');
  renderPsList(wrapId);
}

function renderPsTags(wrapId) {
  const s = _ps[wrapId];
  const id = wrapId==='trabWrap' ? 'trabTags' : 'encTags';
  const cntId = wrapId==='trabWrap' ? 'trabCount' : 'encCount';
  const el = document.getElementById(id); if (!el) return;
  const encSel = _ps['encWrap']?.selected || new Set();
  el.innerHTML = Array.from(s.selected).map(n => {
    const isLocked = (wrapId==='trabWrap') && encSel.has(n);
    return `<span class="persona-tag">${n}
      <span class="persona-tag-remove ${isLocked?'locked':''}" onclick="${isLocked?'':`psRemove('${wrapId}','${n}')`}">✕</span>
    </span>`;
  }).join('');
  const cnt = document.getElementById(cntId);
  if (cnt) cnt.textContent = wrapId==='encWrap' ? `${s.selected.size}/${s.max||1}` : `${s.selected.size} sel.`;
}

function toggleOtrasPersonas(wrapId) {
  const s = _ps[wrapId]; if (!s) return;
  s.mostrarOtros = !s.mostrarOtros;
  const btn = document.getElementById(wrapId==='trabWrap' ? 'btnOtrasTrab' : 'btnOtrasEnc');
  if (btn) btn.textContent = s.mostrarOtros ? '← Solo esta sede' : '+ Agregar de otra tienda';
  renderPsList(wrapId);
}

function getPS(wrapId) { return Array.from(_ps[wrapId]?.selected || []); }

// ── ACTIVIDADES ───────────────────────────────────────
async function buildActTable() {
  let acts = [];
  try {
    var turno = document.getElementById('fr01Turno')?.value || 'M';
    const data = await API.get('/actividades?sede=' + encodeURIComponent(STATE.sede) + '&fecha=' + hoyLocal() + '&turno=' + turno);
    if (data && data.actividades && data.actividades.length > 0) {
      acts = data.actividades.map(a => ({ cod: a.cod, nombre: a.nombre, cat: a.categoria || a.cat || 'PO', peso: a.peso || 0, obs: '', pendiente: a.pendiente_acumulado }));
    }
  } catch(e) {}
  if (!acts.length) acts = getActsBySede(STATE.sede);

  // OL01-05,OL08,OL09 = furniture cleaning → layout map
  // OL06 (tanque agua), OL07 (plancha) → stay in table
  var layoutCods = ['OL01','OL02','OL03','OL04','OL05','OL08','OL09'];
  var otherActs = acts.filter(a => layoutCods.indexOf(a.cod) < 0);
  STATE._olActs = acts.filter(a => layoutCods.indexOf(a.cod) >= 0);

  otherActs.sort((a,b) => (CAT.order[a.cat]||99) - (CAT.order[b.cat]||99));
  STATE._currentActs = otherActs;
  const body = document.getElementById('actBody'); if (!body) return;
  body.innerHTML = otherActs.map(a => `
    <tr id="act-row-${a.cod}" ${a.pendiente ? 'style="background:rgba(234,88,12,.08);border-left:3px solid #ea580c"' : ''}>
      <td class="mono" style="font-size:10px;color:var(--text3)">${a.cod}${a.pendiente ? '<div style="font-size:8px;color:#ea580c;font-weight:700">PEND.</div>' : ''}</td>
      <td style="font-size:12.5px">${a.nombre}
        <span class="mono" style="font-size:9px;color:var(--text3);margin-left:4px">${a.peso}pts</span></td>
      <td style="white-space:nowrap"><span class="act-cat ${CAT.cls[a.cat]||'cat-po'}">${CAT.labels[a.cat]||a.cat}</span></td>
      <td style="text-align:center"><label class="toggle"><input type="checkbox" class="act-chk" data-cod="${a.cod}" data-peso="${a.peso}" id="est-${a.cod}" onchange="updateActCount();updateReportSummary()"><span class="slider"></span></label></td>
      <td><input class="inline-input" id="obs-${a.cod}" placeholder="—"></td>
    </tr>`).join('');
  updateActCount();
  buildExtrasSection();

  // Load layout map for OL/limpieza
  loadLayoutMap(turno);
}

async function loadLayoutMap(turno) {
  var card = document.getElementById('repLayoutCard');
  if (!card) { console.warn('[Layout] card not found'); return; }
  // Don't re-render report layout if report already sent (eval in progress)
  // This prevents overwriting LayoutMap singleton state needed by eval layout
  if (STATE.fr01.bloqueado || STATE.fr01.enviado) return;
  var sede = STATE.sede;
  if (!sede) { console.warn('[Layout] no sede'); card.style.display = 'none'; return; }
  console.log('[Layout] loading for sede:', sede, 'turno:', turno);
  try {
    var zonas = await API.get('/layout?sede=' + encodeURIComponent(sede));
    console.log('[Layout] got', (zonas||[]).length, 'zonas');
    if (!zonas || !zonas.length) { card.style.display = 'none'; return; }
    STATE._layoutZonas = zonas;
    STATE._layoutSelected = {};
    card.style.display = '';
    var turnoName = turno === 'T' ? 'tarde' : turno === 'C' ? 'ambos' : 'mañana';
    LayoutMap.render('repLayoutMap', zonas, {
      turno: turnoName,
      selected: STATE._layoutSelected,
      sidebarId: 'repLayoutSidebar',
      onToggle: function(cod, isSelected) {
        STATE._layoutSelected[cod] = isSelected;
        updateLayoutPts();
      }
    });
    updateLayoutPts();
  } catch(e) { console.error('[Layout] error:', e); card.style.display = 'none'; }
}

function updateLayoutPts() {
  var el = document.getElementById('repLayoutPts');
  if (!el) return;
  var pts = LayoutMap.calcPoints(STATE._layoutZonas || []);
  var turno = document.getElementById('fr01Turno')?.value || 'M';
  var tk = turno === 'T' ? 'tarde' : turno === 'C' ? 'ambos' : 'mañana';
  var totalPts = 0;
  (STATE._layoutZonas||[]).forEach(function(z){
    if(z.tipo==='area') return;
    var zT = (z.turno||'ambos').toLowerCase();
    if(zT === 'ambos' || zT === tk || tk === 'ambos') totalPts += (z.peso||0);
  });
  el.textContent = parseFloat(pts.toFixed(1)) + ' / ' + parseFloat(totalPts.toFixed(1)) + ' pts';
  updateActCount();
  updateReportSummary();
}

// Cargar y renderizar actividades extras (remuneradas + por puntos)
async function buildExtrasSection() {
  const box = document.getElementById('extrasBody'); if (!box) return;
  let extras_p = [], extras_r = [];
  try {
    const data = await API.get('/actividades?sede=' + encodeURIComponent(STATE.sede) + '&fecha=' + hoyLocal());
    if (data) { extras_p = data.extras_puntos || []; extras_r = data.extras_remuneradas || []; }
  } catch(e) {}
  STATE._extras_puntos = extras_p;
  STATE._extras_remuneradas = extras_r;

  // Simple button to open modal + summary of added extras
  let html = '<div style="display:flex;align-items:center;gap:10px">';
  html += '<button class="btn btn-ghost btn-sm" onclick="openExtrasModal()">+ Agregar actividades extras</button>';
  html += '<span id="extrasResumenInline" style="font-size:11px;color:var(--text3)"></span>';
  html += '</div>';
  html += '<div id="extrasAddedList" style="margin-top:8px"></div>';
  box.innerHTML = html;
  updateExtrasResumen();
}

function openExtrasModal() {
  // Remove previous if exists
  var prev = document.getElementById('extrasModalOverlay');
  if (prev) prev.remove();

  var allExtras = (STATE._extras_remuneradas||[]).concat(STATE._extras_puntos||[]);

  var h = '<div id="extrasModalOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px" onclick="this.remove()">';
  h += '<div style="background:#fff;border-radius:14px;width:95%;max-width:550px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()">';
  h += '<div class="modal-header"><h2>⭐ Actividades Extras</h2><button class="modal-close" onclick="document.getElementById(\'extrasModalOverlay\').remove()">✕</button></div>';
  h += '<div style="flex:1;overflow-y:auto;padding:16px">';

  if (STATE._extras_remuneradas?.length) {
    h += '<div style="font-size:11px;font-weight:700;color:var(--gold-d);margin-bottom:8px">💰 Remuneradas</div>';
    STATE._extras_remuneradas.forEach(a => {
      var curVal = document.getElementById('ext-'+a.cod)?.value || '0';
      var curDet = document.getElementById('ext-det-'+a.cod)?.value || '';
      h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05)">';
      h += '<span style="font-size:12px;flex:1">'+a.nombre+'</span>';
      h += '<input type="number" id="extM-'+a.cod+'" min="0" value="'+curVal+'" placeholder="0" style="width:55px;text-align:center;padding:6px;border-radius:6px;border:1.5px solid var(--border);font-size:13px;font-weight:700">';
      h += '<input type="text" id="extM-det-'+a.cod+'" value="'+curDet+'" placeholder="Detalle" style="width:110px;padding:6px;border-radius:6px;border:1.5px solid var(--border);font-size:11px">';
      h += '</div>';
    });
  }
  if (STATE._extras_puntos?.length) {
    h += '<div style="font-size:11px;font-weight:700;color:var(--navy);margin:14px 0 8px">⭐ Por puntos</div>';
    STATE._extras_puntos.forEach(a => {
      var curVal = document.getElementById('ext-'+a.cod)?.value || '0';
      var curDet = document.getElementById('ext-det-'+a.cod)?.value || '';
      h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05)">';
      h += '<span style="font-size:12px;flex:1">'+a.nombre+' <span style="color:var(--text3);font-size:10px">'+a.peso+'pts</span></span>';
      h += '<input type="number" id="extM-'+a.cod+'" min="0" value="'+curVal+'" placeholder="0" style="width:55px;text-align:center;padding:6px;border-radius:6px;border:1.5px solid var(--border);font-size:13px;font-weight:700">';
      h += '<input type="text" id="extM-det-'+a.cod+'" value="'+curDet+'" placeholder="Detalle" style="width:110px;padding:6px;border-radius:6px;border:1.5px solid var(--border);font-size:11px">';
      h += '</div>';
    });
  }

  // Custom extras + code AT TOP
  h += '<div style="padding:10px 12px;background:var(--s3);border-radius:8px;margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;font-weight:700;color:var(--navy)">🔑 Tu código:</span><input type="password" id="extCodeInput" class="code-masked" placeholder="••••" inputmode="numeric" autocomplete="off" onclick="event.stopPropagation()" style="width:70px;padding:6px;text-align:center;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-weight:700" oninput="extCodeCheck()"><span id="extCodeName" style="font-size:10px;color:var(--green)"></span></div>';
  h += '<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">✏️ Otra actividad</div>';
  h += '<div id="customExtrasWrapModal"></div>';
  h += '<button class="btn btn-ghost btn-xs" onclick="addCustomExtraModal()" style="margin-top:4px">+ Agregar otra</button>';
  h += '</div>';
  h += '</div>';
  h += '<div class="modal-footer"><button class="btn btn-ghost" onclick="document.getElementById(\'extrasModalOverlay\').remove()">Cancelar</button>';
  h += '<button class="btn btn-primary" onclick="applyExtrasFromModal()">Aplicar</button></div>';
  h += '</div></div>';
  document.body.insertAdjacentHTML('beforeend', h);

  // Copy existing custom extras
  document.querySelectorAll('.custom-ext-row').forEach(row => {
    var nombre = row.querySelector('.cext-nombre')?.value || '';
    var cant = row.querySelector('.cext-cant')?.value || '1';
    var det = row.querySelector('.cext-det')?.value || '';
    if (nombre) addCustomExtraModal(nombre, cant, det);
  });
}

function addCustomExtraModal(nombre, cant, det) {
  var wrap = document.getElementById('customExtrasWrapModal'); if (!wrap) return;
  var div = document.createElement('div');
  div.className = 'cext-modal-row';
  div.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0';
  div.innerHTML = '<input type="text" class="cext-nombre" placeholder="Nombre" style="flex:1;padding:6px;border-radius:6px;border:1.5px solid var(--border);font-size:12px" value="'+(nombre||'')+'">' +
    '<input type="number" class="cext-cant" min="0" value="'+(cant||'1')+'" style="width:50px;text-align:center;padding:6px;border-radius:6px;border:1.5px solid var(--border)">' +
    '<input type="text" class="cext-det" placeholder="Detalle" style="width:90px;padding:6px;border-radius:6px;border:1.5px solid var(--border);font-size:11px" value="'+(det||'')+'">' +
    '<button class="btn btn-danger btn-xs" onclick="this.parentElement.remove()">✕</button>';
  wrap.appendChild(div);
}

function extCodeCheck(){
  var c=document.getElementById('extCodeInput')?.value?.trim()||'';
  var nm=document.getElementById('extCodeName');
  if(c.length<4){if(nm)nm.textContent='';return;}
  var f=(STATE.empleadosCache||[]).find(function(e){return e.cod===c;});
  if(f){if(nm)nm.textContent='✅ '+f.nombre;}else{if(nm)nm.textContent='❌';}
}

function applyExtrasFromModal() {
  // Validate that at least something was added
  var anyAdded=false;
  var allExtras=(STATE._extras_remuneradas||[]).concat(STATE._extras_puntos||[]);
  allExtras.forEach(function(a){var v=document.getElementById('extM-'+a.cod);if(v&&parseInt(v.value)>0)anyAdded=true;});
  document.querySelectorAll('.cext-modal-row').forEach(function(r){if(r.querySelector('.cext-nombre')?.value?.trim())anyAdded=true;});
  if(anyAdded){
    var cod=document.getElementById('extCodeInput')?.value?.trim()||'';
    var emp=(STATE.empleadosCache||[]).find(function(e){return e.cod===cod;});
    if(!emp){showToast('Ingresa tu código para registrar extras','error');document.getElementById('extCodeInput')?.focus();return;}
    STATE._extrasRegistradoPor=emp.nombre;
  }
  // Copy modal values back to hidden inputs in main form
  var allExtras = (STATE._extras_remuneradas||[]).concat(STATE._extras_puntos||[]);
  allExtras.forEach(a => {
    var mVal = document.getElementById('extM-'+a.cod);
    var mDet = document.getElementById('extM-det-'+a.cod);
    var el = document.getElementById('ext-'+a.cod);
    var elD = document.getElementById('ext-det-'+a.cod);
    if (!el) { // Create hidden inputs
      var inp = document.createElement('input'); inp.type='hidden'; inp.id='ext-'+a.cod; inp.value=mVal?.value||'0';
      document.getElementById('extrasBody').appendChild(inp);
      var inp2 = document.createElement('input'); inp2.type='hidden'; inp2.id='ext-det-'+a.cod; inp2.value=mDet?.value||'';
      document.getElementById('extrasBody').appendChild(inp2);
    } else {
      el.value = mVal?.value || '0';
      if(elD) elD.value = mDet?.value || '';
    }
  });

  // Custom extras
  var wrap = document.getElementById('customExtrasWrap');
  if (!wrap) { var w = document.createElement('div'); w.id='customExtrasWrap'; w.style.display='none'; document.getElementById('extrasBody').appendChild(w); wrap=w; }
  wrap.innerHTML = '';
  document.querySelectorAll('.cext-modal-row').forEach(row => {
    var nombre = row.querySelector('.cext-nombre')?.value || '';
    var cant = row.querySelector('.cext-cant')?.value || '1';
    var det = row.querySelector('.cext-det')?.value || '';
    if (nombre) {
      var div = document.createElement('div'); div.className='custom-ext-row'; div.style.display='none';
      div.innerHTML='<input class="cext-nombre" value="'+nombre+'"><input class="cext-cant" value="'+cant+'"><input class="cext-det" value="'+det+'">';
      wrap.appendChild(div);
    }
  });

  document.getElementById('extrasModalOverlay')?.remove();
  updateExtrasResumen();
  // Show summary of added extras
  renderExtrasAddedList();
}

function renderExtrasAddedList() {
  var list = document.getElementById('extrasAddedList'); if (!list) return;
  var items = [];
  (STATE._extras_remuneradas||[]).concat(STATE._extras_puntos||[]).forEach(a => {
    var n = parseInt(document.getElementById('ext-'+a.cod)?.value) || 0;
    if (n > 0) items.push({ nombre: a.nombre, cantidad: n });
  });
  document.querySelectorAll('.custom-ext-row').forEach(row => {
    var nombre = row.querySelector('.cext-nombre')?.value || '';
    var cant = parseInt(row.querySelector('.cext-cant')?.value) || 0;
    if (nombre && cant > 0) items.push({ nombre: nombre, cantidad: cant });
  });
  if (!items.length) { list.innerHTML = ''; return; }
  list.innerHTML = items.map(i => '<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:var(--s3);font-size:11px;margin:2px">'+i.nombre+' ×'+i.cantidad+'</span>').join('');
}

function toggleExtras() {} // Deprecated — kept for compatibility

function updateExtrasResumen() {
  const el = document.getElementById('extrasResumen'); if (!el) return;
  let montoTotal = 0, puntosTotal = 0, count = 0;
  (STATE._extras_remuneradas||[]).forEach(a => {
    const n = parseInt(document.getElementById('ext-'+a.cod)?.value) || 0;
    if (n > 0) { montoTotal += n * (a.precio_unitario||0); count += n; }
  });
  (STATE._extras_puntos||[]).forEach(a => {
    const n = parseInt(document.getElementById('ext-'+a.cod)?.value) || 0;
    if (n > 0) { puntosTotal += n * (a.peso||0); count += n; }
  });
  const parts = [];
  // Count custom extras too
  document.querySelectorAll('.custom-ext-row').forEach(row=>{
    const n=parseInt(row.querySelector('.cext-cant')?.value)||0;
    const nombre=row.querySelector('.cext-nombre')?.value||'';
    if(n>0&&nombre)count+=n;
  });
  if (count) parts.push(`${count} extras`);
  if (montoTotal) parts.push(`S/${montoTotal.toFixed(2)}`);
  if (puntosTotal) parts.push(`${puntosTotal}pts`);
  el.textContent = parts.length ? parts.join(' · ') : '';
}

function getExtrasData() {
  const extras = [];
  (STATE._extras_remuneradas||[]).forEach(a => {
    const n = parseInt(document.getElementById('ext-'+a.cod)?.value) || 0;
    if (n > 0) extras.push({ tipo:'remunerada', nombre:a.nombre, cantidad:n, precio_unitario:a.precio_unitario||0, monto_total:n*(a.precio_unitario||0), detalle:document.getElementById('ext-det-'+a.cod)?.value||'' });
  });
  (STATE._extras_puntos||[]).forEach(a => {
    const n = parseInt(document.getElementById('ext-'+a.cod)?.value) || 0;
    if (n > 0) extras.push({ tipo:'por_puntos', nombre:a.nombre, cantidad:n, precio_unitario:0, monto_total:0, detalle:document.getElementById('ext-det-'+a.cod)?.value||'' });
  });
  // Custom extras
  document.querySelectorAll('.custom-ext-row').forEach(row=>{
    const nombre=row.querySelector('.cext-nombre')?.value||'';
    const n=parseInt(row.querySelector('.cext-cant')?.value)||0;
    const det=row.querySelector('.cext-det')?.value||'';
    if(nombre&&n>0)extras.push({tipo:'personalizada',nombre,cantidad:n,precio_unitario:0,monto_total:0,detalle:det});
  });
  var regPor=STATE._extrasRegistradoPor||'';
  if(regPor)extras.forEach(function(e){e.registrado_por=regPor;});
  return extras;
}

function marcarTodas(val) {
  (STATE._currentActs||getActsBySede(STATE.sede)).forEach(a => {
    const el = document.getElementById('est-' + a.cod); if (el) el.checked = val;
  });
  updateActCount();
}

function updateActCount() {
  const acts = (STATE._currentActs||getActsBySede(STATE.sede));
  const done = acts.filter(a => document.getElementById('est-'+a.cod)?.checked).length;
  const el   = document.getElementById('fr01ActCount');
  let pts=0, max=0;
  acts.forEach(a => { max+=a.peso; if (document.getElementById('est-'+a.cod)?.checked) pts+=a.peso; });
  if (el) el.textContent = done+'/'+acts.length+' — '+parseFloat(pts.toFixed(1))+'/'+parseFloat(max.toFixed(1))+' pts';
  const pEl = document.getElementById('fr01Puntaje');
  if (pEl) pEl.textContent = '';
}

function updateFR01Sub() {
  const el = document.getElementById('fr01Sub');
  if (el) el.textContent = `${SEDES[STATE.sede]?.label}  ·  ${new Date().toLocaleDateString('es-PE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}`;
}

// ── COLOR DROPDOWN ─────────────────────────────────────
function filterColorDrop(inputId, dropId) {
  const val  = document.getElementById(inputId)?.value.toLowerCase()||'';
  const drop = document.getElementById(dropId); if (!drop) return;
  drop.innerHTML = COLORES_PRENDA.filter(c=>c.toLowerCase().includes(val))
    .map(c=>`<div class="tag-opt" onmousedown="selectColor('${inputId}','${dropId}','${c}')">${c}</div>`).join('');
  drop.classList.add('open');
}
function closeColorDrop(dropId) { setTimeout(()=>document.getElementById(dropId)?.classList.remove('open'),200); }
function selectColor(inputId, dropId, val) {
  const inp = document.getElementById(inputId); if (inp) inp.value=val;
  document.getElementById(dropId)?.classList.remove('open');
}

// ── TAG INPUT con PORTAL (fix overflow card) ──────────
let _obsPortal = null;
let _obsRaf = null;
let _obsAnchorId = null;
function openObsPortal(wrapId, hiddenId, opciones) {
  closeObsPortal();
  var wrap = document.getElementById(wrapId); if (!wrap) return;
  _obsAnchorId = wrapId;
  var inp = wrap.querySelector('.tag-input-inner');
  var val = inp?.value.toLowerCase()||'';
  var opts = opciones.filter(function(o){return o.toLowerCase().includes(val)});
  if (!opts.length) return;
  _obsPortal = document.createElement('div');
  _obsPortal.className = 'obs-dropdown-portal';
  opts.forEach(function(o) {
    var d = document.createElement('div'); d.className='tag-opt'; d.textContent=o;
    d.onmousedown = function(e) { e.preventDefault(); addObsTag(hiddenId,o); renderObsTagsInWrap(wrapId,hiddenId); closeObsPortal(); };
    _obsPortal.appendChild(d);
  });
  document.body.appendChild(_obsPortal);
  positionObsPortal();
}
function positionObsPortal() {
  if (!_obsPortal || !_obsAnchorId) return;
  var wrap = document.getElementById(_obsAnchorId);
  if (!wrap) { closeObsPortal(); return; }
  var rect = wrap.getBoundingClientRect();
  var spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 220) {
    _obsPortal.style.cssText = 'position:fixed;z-index:9990;bottom:'+(window.innerHeight-rect.top+4)+'px;left:'+rect.left+'px;width:'+rect.width+'px;background:var(--s1);border:1.5px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);max-height:200px;overflow-y:auto';
  } else {
    _obsPortal.style.cssText = 'position:fixed;z-index:9990;top:'+(rect.bottom+4)+'px;left:'+rect.left+'px;width:'+rect.width+'px;background:var(--s1);border:1.5px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);max-height:200px;overflow-y:auto';
  }
  _obsRaf = requestAnimationFrame(positionObsPortal);
}
function closeObsPortal() {
  if (_obsRaf) { cancelAnimationFrame(_obsRaf); _obsRaf = null; }
  _obsPortal?.remove(); _obsPortal=null; _obsAnchorId=null;
}
function filterObsPortal(wrapId, hiddenId, opciones) {
  openObsPortal(wrapId, hiddenId, opciones);
}

function tagInputKeydown(e, hiddenId, wrapId) {
  if (e.key==='Enter'||e.key===',') {
    e.preventDefault();
    const val = e.target.value.trim(); if (!val) return;
    e.target.value='';
    addObsTag(hiddenId,val);
    renderObsTagsInWrap(wrapId,hiddenId);
    closeObsPortal();
  }
  if (e.key==='Escape') closeObsPortal();
}

function addObsTag(hiddenId, val) {
  const hidden = document.getElementById(hiddenId); if (!hidden) return;
  let arr=[]; try{arr=JSON.parse(hidden.value);}catch(e){arr=[];}
  if (!arr.includes(val)) { arr.push(val); hidden.value=JSON.stringify(arr); }
}

function renderObsTagsInWrap(wrapId, hiddenId) {
  const wrap = document.getElementById(wrapId); if (!wrap) return;
  const hidden = document.getElementById(hiddenId);
  let arr=[]; try{arr=JSON.parse(hidden?.value||'[]');}catch(e){arr=[];}
  wrap.querySelectorAll('.obs-tag').forEach(t=>t.remove());
  const inp = wrap.querySelector('.tag-input-inner');
  arr.forEach(val=>{
    const span=document.createElement('span'); span.className='obs-tag';
    span.innerHTML=`${val}<span class="obs-tag-remove" onmousedown="removeObsTag('${hiddenId}','${val.replace(/'/g,"\\'")}','${wrapId}',this)">✕</span>`;
    wrap.insertBefore(span,inp);
  });
}

function removeObsTag(hiddenId, val, wrapId, btn) {
  const hidden = document.getElementById(hiddenId);
  let arr=[]; try{arr=JSON.parse(hidden?.value||'[]');}catch(e){arr=[];}
  arr=arr.filter(v=>v!==val);
  if (hidden) hidden.value=JSON.stringify(arr);
  btn.closest('.obs-tag')?.remove();
}

document.addEventListener('click', e => { if (!e.target.closest('.tag-input-wrap') && !e.target.closest('.obs-dropdown-portal')) closeObsPortal(); });

// ── MOTIVO REFACCION ───────────────────────────────────
function filterMotivoDrop(inputId, dropId) {
  const val  = document.getElementById(inputId)?.value.toLowerCase()||'';
  const drop = document.getElementById(dropId); if (!drop) return;
  drop.innerHTML = MOTIVOS_REF.filter(o=>o.toLowerCase().includes(val))
    .map(o=>`<div class="tag-opt" onmousedown="selectMotivo('${inputId}','${dropId}','${o.replace(/'/g,"\\'")}')">${o}</div>`).join('');
  drop.classList.add('open');
}
function selectMotivo(inputId, dropId, val) {
  const inp=document.getElementById(inputId); if(inp) inp.value=val;
  document.getElementById(dropId)?.classList.remove('open');
}

// ── LAVANDERÍA ─────────────────────────────────────────
function accInc(id){var el=document.getElementById(id);if(el){el.value=Math.max(0,(parseInt(el.value)||0)+1);}}
function accDec(id){var el=document.getElementById(id);if(el){el.value=Math.max(0,(parseInt(el.value)||0)-1);}}

function agregarLavItem() {
  var cod = document.getElementById('lavCodigo')?.value.trim().toUpperCase();
  var tipo = document.getElementById('lavTipo')?.value;
  var color = document.getElementById('lavColor')?.value;
  var talla = document.getElementById('lavTalla')?.value;
  var destino = document.getElementById('lavDestino')?.value || 'Lavandería';
  var motivo = document.getElementById('lavMotivo')?.value?.trim() || '';
  var obs=[]; try{obs=JSON.parse(document.getElementById('lavObs')?.value||'[]');}catch(e){obs=[];}
  if (!cod) { showToast('Ingresa el código','error'); return; }
  STATE.lavList.push({cod:cod,tipo:tipo,color:color,talla:talla,obs:obs,destino:destino,motivo:motivo,hora:new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})});
  document.getElementById('lavCodigo').value='';
  document.getElementById('lavObs').value='[]';
  if(document.getElementById('lavMotivo'))document.getElementById('lavMotivo').value='';
  renderObsTagsInWrap('lavObsWrap','lavObs');
  renderLavTable(); showToast(tipo+' '+cod+' agregado');
}

function renderLavTable() {
  var body=document.getElementById('lavBody'); if(!body) return;
  var cnt=document.getElementById('lavListCount'); if(cnt) cnt.textContent=STATE.lavList.length;
  var cnt2=document.getElementById('lavListCount2'); if(cnt2) cnt2.textContent=STATE.lavList.length+' prendas en lista';
  var hdrCnt=document.getElementById('lavHeaderCount'); if(hdrCnt) { hdrCnt.textContent=STATE.lavList.length; hdrCnt.style.animation='none'; hdrCnt.offsetHeight; hdrCnt.style.animation='badgeBounce .3s ease'; }
  // Update ticker
  var ticker=document.getElementById('lavTicker');
  var tickerWrap=document.getElementById('lavTickerWrap');
  if(ticker&&tickerWrap){
    if(STATE.lavList.length){
      tickerWrap.style.display='';
      var items=STATE.lavList.map(function(p){return '<span class="tick-item">'+p.cod+'</span>';}).join('');
      ticker.innerHTML=items+items;
      ticker.style.animationDuration=Math.max(5,STATE.lavList.length*3)+'s';
    }else{tickerWrap.style.display='none';ticker.innerHTML='';}
  }
  if (!STATE.lavList.length){body.innerHTML='<tr><td class="empty-cell" colspan="8">Sin prendas</td></tr>';return;}
  body.innerHTML=STATE.lavList.map(function(p,i){
    var db=p.destino==='Compostura'?'<span class="badge badge-gold">Compost.</span>':'<span class="badge badge-blue">Lavand.</span>';
    return '<tr><td style="font-size:10px;color:var(--text3)">'+(i+1)+'</td><td><span class="badge badge-navy">'+p.cod+'</span></td><td>'+p.tipo+'</td><td>'+p.color+'</td><td><span class="badge badge-gold">'+p.talla+'</span></td><td>'+db+'</td><td style="font-size:10px">'+(Array.isArray(p.obs)?p.obs.join(', '):(p.motivo||'—'))+'</td><td><button class="btn btn-danger btn-xs" onclick="STATE.lavList.splice('+i+',1);renderLavTable()">✕</button></td></tr>';
  }).join('');
}

async function enviarListaLav() {
  var gen={camisas:+document.getElementById('lavCamisas')?.value||0,corbatas:+document.getElementById('lavCorbatas')?.value||0,michis:+document.getElementById('lavMichis')?.value||0,corbatones:+document.getElementById('lavCorbatones')?.value||0,porta_ternos:+document.getElementById('lavPortaTernos')?.value||0,zapatos:+document.getElementById('lavZapatos')?.value||0};
  var totalGen=Object.values(gen).reduce(function(s,v){return s+v},0);
  if(!STATE.lavList.length&&!totalGen){showToast('La lista está vacía','error');return;}
  var resp_inv=document.getElementById('lavRespInv')?.value;
  var resp_traslado=document.getElementById('lavRespTraslado')?.value;
  var items=STATE.lavList.map(function(p){return Object.assign({},p,{destino:p.destino==='Compostura'?'compostura':'recepcion'});});
  showConfirm('¿Enviar lista?',STATE.lavList.length+' prendas · '+totalGen+' accesorios',async function(){
    var r=await API.enviarLista({sede:STATE.sede,tipo:'LAV',items:items,generales:gen,resp_inv:resp_inv,resp_traslado:resp_traslado,fecha:hoyLocal()});
    if(r){STATE.lavList=[];['lavCamisas','lavCorbatas','lavMichis','lavCorbatones'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='0';});renderLavTable();showToast('Lista '+r.id+' enviada','success');}
  },'📦');
}

// ── REFACCIÓN ──────────────────────────────────────────
function agregarRefItem() {
  const cod=document.getElementById('refCodigo')?.value.trim().toUpperCase();
  const tipo=document.getElementById('refTipo')?.value;
  const color=document.getElementById('refColor')?.value.trim();
  const talla=document.getElementById('refTalla')?.value;
  const motivo=document.getElementById('refMotivo')?.value.trim();
  const resp=document.getElementById('refResp')?.value;
  if(!cod){showToast('Ingresa el código','error');return;}
  if(!color){showToast('Ingresa el color','error');return;}
  if(!motivo){showToast('Ingresa el motivo','error');return;}
  STATE.refList.push({cod,tipo,color,talla,motivo,resp,hora:new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})});
  document.getElementById('refCodigo').value='';document.getElementById('refColor').value='';document.getElementById('refMotivo').value='';
  renderRefTable();showToast(`${tipo} ${cod} agregado para refacción`);
}

function renderRefTable() {
  const body=document.getElementById('refBody');const cnt=document.getElementById('refCount');if(!body)return;
  if(cnt)cnt.textContent=`${STATE.refList.length} prendas`;
  if(!STATE.refList.length){body.innerHTML='<tr><td class="empty-cell" colspan="9">Sin prendas en la lista</td></tr>';return;}
  body.innerHTML=STATE.refList.map((p,i)=>`
    <tr>
      <td class="mono" style="font-size:10px;color:var(--text3)">${i+1}</td>
      <td><span class="badge badge-navy">${p.cod}</span></td>
      <td>${p.tipo}</td><td>${p.color}</td>
      <td><span class="badge badge-gold">${p.talla}</span></td>
      <td style="font-size:11px;color:var(--text2)">${p.motivo}</td>
      <td style="font-size:11px">${p.resp||'—'}</td>
      <td class="mono" style="font-size:10px;color:var(--text3)">${p.hora}</td>
      <td><button class="btn btn-danger btn-xs" onclick="STATE.refList.splice(${i},1);renderRefTable()">✕</button></td>
    </tr>`).join('');
}

async function enviarListaRef() {
  if(!STATE.refList.length){showToast('La lista está vacía','error');return;}
  showConfirm('¿Enviar lista de refacción?',`${STATE.refList.length} prenda(s)`,async()=>{
    const r=await API.enviarLista({sede:STATE.sede,tipo:'REF',items:STATE.refList.map(function(p){return Object.assign({},p,{destino:'compostura'})}),generales:{},resp_inv:document.getElementById('refRespInv')?.value||'',resp_traslado:document.getElementById('refRespTraslado')?.value||'',fecha:hoyLocal()});
    if(r){STATE.refList=[];renderRefTable();showToast(`✅ Lista ${r.id} enviada`,'success');}
  },'🪡');
}

// ── FR01 ───────────────────────────────────────────────
function genReporteId(sede,turno){
  const h=new Date();
  const d=String(h.getDate()).padStart(2,'0'),m=String(h.getMonth()+1).padStart(2,'0'),y=String(h.getFullYear()).slice(2);
  return `${d}-${m}-${y}_${turno}-${SEDES[sede]?.abrev||sede}`;
}

async function triggerEnviarFR01() {
  if(STATE.fr01.bloqueado){showToast('Completa la Evaluación primero','error');return;}
  const turno=document.getElementById('fr01Turno')?.value;
  // Time restrictions (alineadas con botones de checkAlertas)
  var _now=new Date(),_hh=_now.getHours();
  var esAlmacenSend = SEDES[STATE.sede]?.tipo === 'almacen';
  if(!esAlmacenSend){
    if(_hh<8){showToast('⏰ Reportes disponibles desde las 8:00am','error');return;}
    if((turno==='M'||turno==='C')&&_hh>=15){showToast('⏰ Mañana/Completo solo hasta las 3:00pm — envía turno Tarde','error');return;}
    if(turno==='T'&&_hh<15){showToast('⏰ Turno Tarde: disponible desde las 3:00pm','error');return;}
    if(_hh>=23){showToast('⏰ Cerrado — pasó las 11:00pm','error');return;}
  }
  const emisorEl=document.getElementById('fr01Emisor');
  const emisorCod=emisorEl?.dataset.realCod||emisorEl?.value;

  const hoy=hoyLocal();
  const reportesHoy=await API.reportes({sede:STATE.sede,fecha:hoy});
  if(reportesHoy&&reportesHoy.length>0){
    const turnM=reportesHoy.find(r=>r.turno==='M'||r.turno==='C');
    if(turnM && (turno==='M'||turno==='C')){
      showToast('⚠️ Ya se envió un reporte de mañana/completo hoy.','error');return;
    }
    const turnT=reportesHoy.find(r=>r.turno==='T');
    if(turnT && turno==='T'){
      showToast('⚠️ Ya se envió un reporte de tarde hoy.','error');return;
    }
  }
  const trabs=getPS('trabWrap'),encs=getPS('encWrap');
  const acts=(STATE._currentActs||getActsBySede(STATE.sede));
  const done=acts.filter(a=>document.getElementById('est-'+a.cod)?.checked);
  if(!emisorCod){showToast('Ingresa el código del encargado','error');return;}
  const emisorEmp=STATE.empleadosCache.find(e=>e.cod===emisorCod);
  if(!emisorEmp){showToast('Código inválido','error');return;}
  if(!encs.includes(emisorEmp.nombre)){showToast('❌ El código debe ser del encargado del turno ('+encs.join(' o ')+')','error');return;}
  if(!trabs.length){showToast('Selecciona colaboradores','error');return;}
  if(!encs.length){showToast('Selecciona encargado','error');return;}
  if(!done.length){showToast('Marca al menos una actividad','error');return;}
  const rid=genReporteId(SEDES[STATE.sede].abrev,turno);
  const max=acts.reduce((s,a)=>s+a.peso,0);
  const pts=done.reduce((s,a)=>s+a.peso,0);
  const puntaje=max>0?Math.round(pts/max*100):0;
  showConfirm('¿Enviar reporte?',`ID: ${rid}  ·  ${done.length} actividades  ·  ${emisorEmp.nombre}`,async()=>{
    // Incidencias del formulario
    const incs=[];
    document.querySelectorAll('.inc-row').forEach(row=>{
      const tipo=row.querySelector('.inc-tipo')?.value;
      const desc=row.querySelector('.inc-desc')?.value;
      const resp=row.querySelector('.inc-resp')?.value||'—';
      const nivel=row.querySelector('.inc-nivel')?.value?.replace(/[🔴🟡🟢]/g,'').trim();
      if(tipo)incs.push({tipo,descripcion:desc||'',nivel:nivel||'Medio',responsable:resp});
    });
    const actData=done.map(a=>({cod:a.cod,nombre:a.nombre,cat:a.cat,peso:a.peso,obs:document.getElementById('obs-'+a.cod)?.value||''}));
    // Add layout (cleaning) items as OL activities
    var layoutSel = STATE._layoutSelected || {};
    var layoutZonas = STATE._layoutZonas || [];
    layoutZonas.forEach(function(z) {
      if (layoutSel[z.cod] && z.tipo !== 'area' && z.peso > 0) {
        actData.push({cod: 'OL_' + z.cod, nombre: 'Limpieza: ' + z.nombre, cat: 'IND', peso: z.peso, obs: ''});
      }
    });
    const extrasData=getExtrasData();
    var totalActs = acts.length + layoutZonas.filter(z => z.tipo !== 'area' && z.peso > 0).length;
    var totalDone = done.length + Object.keys(layoutSel).filter(k => layoutSel[k]).length;
    var totalMax = max + layoutZonas.filter(z => z.tipo !== 'area').reduce((s,z) => s + (z.peso||0), 0);
    var totalPts = pts + LayoutMap.calcPoints(layoutZonas);
    var puntajeFinal = totalMax > 0 ? Math.round(totalPts / totalMax * 100) : puntaje;
    const r=await API.enviarReporte({id:rid,sede:STATE.sede,turno,fecha:hoyLocal(),encargado:encs.join(', '),trabajadores:trabs,actividades:actData,extras:extrasData,incidencias:incs,puntaje:puntajeFinal,actTotal:totalActs,actDone:totalDone});
    if(!r)return;
    STATE.fr01.reportId=rid;STATE.fr01.actividadesRealizadas=actData;STATE.fr01.trabajadoresTurno=[...trabs];
    STATE.fr01.bloqueado=true;STATE.fr01.enviado=true;
    STATE.fr01.pendFecha=hoyLocal();
    STATE.fr01.pendTurno=turno;
    document.getElementById('fr01Blocked')?.classList.add('show');
    var ov=document.getElementById('fr01Overlay');if(ov)ov.style.display='';document.getElementById('fr01Content')&&(document.getElementById('fr01Content').style.display='none');
    document.getElementById('btnEnviarFR01').style.display='none';
    const ridBox=document.getElementById('fr01ReportId');ridBox.textContent=rid;ridBox.classList.remove('hidden');
    document.getElementById('fr01Status').textContent='Enviado';document.getElementById('fr01Status').className='badge badge-green';
    const evalBadge=document.getElementById('evalBadge');if(evalBadge){evalBadge.classList.remove('hidden');evalBadge.textContent='!';}
    prepararEval();
    quitarAlertaNoche();
    checkAlertas();
    showToast(`✅ Reporte ${rid} enviado`,'success');
  },'📋');
}

async function limpiarFR01() {
  if(STATE.fr01.bloqueado){showToast('Completa la Evaluación primero','error');return;}
  // Resetear residuos del reporte anterior (post-evaluación)
  STATE.fr01.reportId=null;
  STATE.fr01.pendFecha=null;
  STATE.fr01.pendTurno=null;
  STATE.fr01.actividadesRealizadas=[];
  STATE.fr01.trabajadoresTurno=[];
  STATE.fr01.extras=[];
  STATE.fr01.incidencias=[];
  await buildActTable();
  document.getElementById('fr01Status').textContent='Sin enviar';document.getElementById('fr01Status').className='badge badge-gold';
  var rid=document.getElementById('fr01ReportId');if(rid){rid.textContent='';rid.classList.add('hidden');}
  const b=document.getElementById('incBody');if(b)b.innerHTML='<div id="incPlaceholder" style="font-size:12px;color:var(--text3);font-family:var(--font-m)">Sin incidencias registradas.</div>';
}

// ── EVALUACIÓN ─────────────────────────────────────────
function prepararEval() {
  const realizadas=STATE.fr01.actividadesRealizadas;
  document.getElementById('evalNoReport').style.display='none';
  document.getElementById('evalContent').classList.remove('hidden');
  document.getElementById('evalIdDisplay').textContent=STATE.fr01.reportId;
  const ridBox=document.getElementById('evalReportId');ridBox.textContent=STATE.fr01.reportId;ridBox.classList.remove('hidden');
  const turnoEmps=STATE.fr01.trabajadoresTurno;
  document.getElementById('evalExtWarning').innerHTML=`<strong>⚠️ El evaluante NO puede ser:</strong> ${turnoEmps.map(n=>`<span class="badge badge-navy" style="margin:2px">${n}</span>`).join('')}`;
  const body=document.getElementById('evalActBody');if(!body)return;

  // Separate layout items from table items
  var tableActs = realizadas.filter(a => !a.cod.startsWith('OL_'));
  var layoutActs = realizadas.filter(a => a.cod.startsWith('OL_'));

  document.getElementById('evalActCount').textContent=`${tableActs.length} actividades`;

  if(!tableActs.length){body.innerHTML='<tr><td class="empty-cell" colspan="5">Sin actividades en tabla</td></tr>';}
  else {
    body.innerHTML=tableActs.map(a=>`
    <tr>
      <td class="mono" style="font-size:10px;color:var(--text3)">${a.cod}</td>
      <td style="font-size:12.5px">${a.nombre}<span class="mono" style="font-size:9px;color:var(--text3);margin-left:4px">${a.peso}pts</span></td>
      <td><span class="act-cat ${CAT.cls[a.cat]||'cat-po'}">${CAT.labels[a.cat]||a.cat}</span></td>
      <td><select class="inline-select" id="eval-cal-${a.cod}" onchange="_evalStyleSel(this);calcEvalPreview()">
        <option value="1">✅ Aprobado</option><option value="0.5">👁 Observado</option><option value="0">❌ Rechazado</option>
      </select></td>
      <td><input class="inline-input" id="eval-obs-${a.cod}" placeholder="—"></td>
    </tr>`).join('');
  }

  // Show layout eval map
  console.log('[Eval] layoutActs:', layoutActs.length, 'layoutZonas:', (STATE._layoutZonas||[]).length);
  var elc = document.getElementById('evalLayoutCard');
  if (elc && STATE._layoutZonas && STATE._layoutZonas.length && layoutActs.length) {
    elc.style.display = '';
    var evalSel = {}, evalCals = {};
    layoutActs.forEach(function(a) { var cod=a.cod.replace('OL_',''); evalSel[cod]=true; evalCals[cod]=1; });
    STATE._evalLayoutSel = evalSel;
    STATE._evalLayoutCals = evalCals;
    LayoutMap.render('evalLayoutMap', STATE._layoutZonas, {
      turno:'ambos', selected:evalSel, mode:'eval', evalCals:evalCals,
      onToggle:function(cod,val){ STATE._evalLayoutCals[cod]=val; calcEvalPreview(); updateEvalLayoutSummary(); }
    });
    updateEvalLayoutSummary();
  } else if (elc) { elc.style.display='none'; }

  calcEvalPreview();
}

function calcEvalPreview() {
  const realizadas=STATE.fr01.actividadesRealizadas;
  var tableActs = realizadas.filter(a => !a.cod.startsWith('OL_'));
  let total=0,maxT=0;
  tableActs.forEach(a=>{const m=parseFloat(document.getElementById('eval-cal-'+a.cod)?.value||'1');total+=a.peso*m;maxT+=a.peso;});
  if (STATE._evalLayoutCals && STATE._evalLayoutSel) {
    (STATE._layoutZonas||[]).forEach(function(z){
      if(STATE._evalLayoutSel[z.cod]&&z.tipo!=='area'){
        var cal=STATE._evalLayoutCals[z.cod];if(cal===undefined)cal=1;
        total+=(z.peso||0)*cal; maxT+=(z.peso||0);
      }
    });
  }
  const pct=maxT>0?Math.round(total/maxT*100):0;
  const pEl=document.getElementById('evalPuntajePreview');
  if(pEl){
    var cls=pct>=85?'excellent':pct>=70?'good':pct>=50?'regular':'bad';
    pEl.className='score-pill '+cls;
    pEl.style.background='';pEl.style.color='';
    pEl.textContent=pct+'%';
  }
}

function evalActMarkAll(val) {
  var realizadas=STATE.fr01.actividadesRealizadas||[];
  var tableActs=realizadas.filter(function(a){return !a.cod.startsWith('OL_');});
  tableActs.forEach(function(a){
    var sel=document.getElementById('eval-cal-'+a.cod);
    if(sel){sel.value=String(val);_evalStyleSel(sel);}
  });
  calcEvalPreview();
  var labels={1:'✅ aprobado',0.5:'👁 observado',0:'❌ rechazado'};
  showToast('Actividades: todo '+labels[val],'success');
}
function _evalStyleSel(sel){if(!sel)return;var v=parseFloat(sel.value);sel.style.background=v===1?'#dcfce7':v===0.5?'#fef9c3':v===0?'#fee2e2':'';sel.style.borderColor=v===1?'#16a34a':v===0.5?'#ca8a04':v===0?'#dc2626':'var(--border)';sel.style.fontWeight=v!==1?'700':'';}

function evalLayoutMarkAll(val) {
  if (!STATE._evalLayoutCals || !STATE._evalLayoutSel) return;
  Object.keys(STATE._evalLayoutSel).forEach(function(cod) {
    if (STATE._evalLayoutSel[cod]) STATE._evalLayoutCals[cod] = val;
  });
  if (STATE._layoutZonas) {
    LayoutMap.render('evalLayoutMap', STATE._layoutZonas, {
      turno:'ambos', selected:STATE._evalLayoutSel, mode:'eval', evalCals:STATE._evalLayoutCals,
      onToggle:function(cod,v){ STATE._evalLayoutCals[cod]=v; calcEvalPreview(); updateEvalLayoutSummary(); }
    });
  }
  updateEvalLayoutSummary();
  calcEvalPreview();
  var labels={1:'aprobado',0.5:'observado',0:'rechazado'};
  showToast('Limpieza: todo marcado como '+labels[val],'success');
}

function layoutMarcarTodo(val) {
  if (!STATE._layoutZonas || !STATE._layoutSelected) return;
  STATE._layoutZonas.forEach(function(z) {
    if (z.tipo !== 'area') STATE._layoutSelected[z.cod] = val;
  });
  // Re-render
  var turno = document.getElementById('fr01Turno')?.value || 'M';
  var turnoName = turno === 'T' ? 'tarde' : turno === 'C' ? 'ambos' : 'mañana';
  LayoutMap.render('repLayoutMap', STATE._layoutZonas, {
    turno: turnoName,
    selected: STATE._layoutSelected,
    sidebarId: 'repLayoutSidebar',
    onToggle: function(cod, isSelected) {
      STATE._layoutSelected[cod] = isSelected;
      updateLayoutPts();
    }
  });
  updateLayoutPts();
  showToast(val ? 'Todo marcado como limpio' : 'Limpieza reiniciada', 'success');
}

function layoutMarcarTurno() {
  if (!STATE._layoutZonas || !STATE._layoutSelected) return;
  var turno = document.getElementById('fr01Turno')?.value || 'M';
  var tk = turno === 'T' ? 'tarde' : turno === 'C' ? 'ambos' : 'mañana';
  STATE._layoutZonas.forEach(function(z) {
    if (z.tipo === 'area') return;
    var zT = (z.turno||'ambos').toLowerCase();
    STATE._layoutSelected[z.cod] = (zT === 'ambos' || zT === tk || tk === 'ambos');
  });
  var turnoName = turno === 'T' ? 'tarde' : turno === 'C' ? 'ambos' : 'mañana';
  LayoutMap.render('repLayoutMap', STATE._layoutZonas, {
    turno: turnoName, selected: STATE._layoutSelected, sidebarId: 'repLayoutSidebar',
    onToggle: function(cod, isSelected) { STATE._layoutSelected[cod] = isSelected; updateLayoutPts(); }
  });
  updateLayoutPts();
  showToast('Marcadas zonas del turno', 'success');
}


function updateEvalLayoutSummary() {
  var sb = document.getElementById('evalLayoutSummary');
  if (!sb || !STATE._evalLayoutSel || !STATE._evalLayoutCals) return;
  var zonas = STATE._layoutZonas || [];
  var items = [];
  var totPts = 0, maxPts = 0;
  zonas.forEach(function(z) {
    if (!STATE._evalLayoutSel[z.cod] || z.tipo === 'area') return;
    var cal = STATE._evalLayoutCals[z.cod]; if (cal === undefined) cal = 1;
    var icon = cal === 0 ? '❌' : cal === 0.5 ? '👁' : '✅';
    var col = cal === 0 ? '#dc2626' : cal === 0.5 ? '#ca8a04' : '#16a34a';
    var bg = cal === 0 ? '#fef2f2' : cal === 0.5 ? '#fefce8' : '#dcfce7';
    totPts += (z.peso || 0) * cal;
    maxPts += (z.peso || 0);
    items.push('<div style="display:flex;align-items:center;gap:4px;padding:3px 5px;margin-bottom:2px;border-radius:5px;background:' + bg + '"><span style="font-size:10px">' + icon + '</span><span style="flex:1;font-size:8px;font-weight:600;color:' + col + '">' + z.cod + '</span><span style="font-size:8px;font-weight:700;color:' + col + '">' + parseFloat((z.peso * cal).toFixed(1)) + '/' + z.peso + '</span></div>');
  });
  var pct = maxPts > 0 ? Math.round(totPts / maxPts * 100) : 0;
  totPts = parseFloat(totPts.toFixed(1));
  maxPts = parseFloat(maxPts.toFixed(1));
  var html = '<div style="font-size:8px;font-weight:700;color:#475569;margin-bottom:4px">CALIFICACIÓN LIMPIEZA</div>';
  html += '<div style="height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-bottom:6px"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#16a34a,#4ade80);border-radius:3px;transition:width .3s"></div></div>';
  html += '<div style="overflow-y:auto;max-height:250px">' + items.join('') + '</div>';
  html += '<div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;display:flex;justify-content:space-between;font-weight:800;font-size:11px"><span style="color:#166534">Limpieza</span><span style="color:#16a34a">' + totPts + '/' + maxPts + '</span></div>';
  sb.innerHTML = html;
}

async function triggerEnviarEval() {
  const codigo=document.getElementById('evalCodigo')?.value;
  const emp=STATE.empleadosCache.find(e=>e.cod===codigo);
  if(!emp){showToast('Código inválido','error');return;}
  if(STATE.fr01.trabajadoresTurno.includes(emp.nombre)){showToast(`❌ ${emp.nombre} estuvo en el turno — debe ser alguien externo`,'error');return;}
  const realizadas=STATE.fr01.actividadesRealizadas;
  var tableActs = realizadas.filter(a => !a.cod.startsWith('OL_'));
  let totalPts=0, maxPts=0;
  var cals=tableActs.map(a=>{const m=parseFloat(document.getElementById('eval-cal-'+a.cod)?.value||'1');totalPts+=a.peso*m;maxPts+=a.peso;return{cod:a.cod,cal:m,obs:document.getElementById('eval-obs-'+a.cod)?.value||''};});
  // Include layout califications
  if (STATE._evalLayoutCals && STATE._evalLayoutSel) {
    (STATE._layoutZonas||[]).forEach(function(z){
      if(STATE._evalLayoutSel[z.cod]&&z.tipo!=='area'){
        var cal=STATE._evalLayoutCals[z.cod];if(cal===undefined)cal=1;
        totalPts+=(z.peso||0)*cal;maxPts+=(z.peso||0);
        cals.push({cod:'OL_'+z.cod,cal:cal,obs:''});
      }
    });
  }
  const puntajeEval=maxPts>0?Math.round(totalPts/maxPts*100):0;
  showConfirm('¿Enviar evaluación?',`Evaluante: ${emp.nombre}  ·  ${puntajeEval}%`,async()=>{
    const r=await API.evaluarReporte(STATE.fr01.reportId,{evaluador:emp.nombre,calificaciones:cals,puntajeEval});
    if(!r)return;
    STATE.fr01.bloqueado=false;STATE.fr01.enviado=false;STATE.fr01.actividadesRealizadas=[];STATE.fr01.trabajadoresTurno=[];
    STATE._evalLayoutCals=null;STATE._evalLayoutSel=null;
    document.getElementById('fr01Blocked')?.classList.remove('show');
    var ov=document.getElementById('fr01Overlay');if(ov)ov.style.display='none';document.getElementById('fr01Content')&&(document.getElementById('fr01Content').style.display='');
    document.getElementById('btnEnviarFR01').style.display='';
    document.getElementById('fr01ReportId').classList.add('hidden');
    document.getElementById('evalBadge')?.classList.add('hidden');
    document.getElementById('evalNoReport').style.display='block';
    document.getElementById('evalContent').classList.add('hidden');
    limpiarFR01();checkAlertas();
    showToast(`✅ Evaluación enviada — ${puntajeEval}%`,'success');
  },'⭐');
}

function validarCodigo(inputId, iconId, nameId) {
  const el=document.getElementById(inputId);
  const val=el?.value;
  const icon=document.getElementById(iconId),name=document.getElementById(nameId);
  if(!icon||!name)return;
  const emp=STATE.empleadosCache.find(e=>e.cod===val);
  if(emp){
    icon.textContent='✅';name.textContent=emp.nombre;name.style.color='var(--green)';
    if(inputId==='fr01Emisor') el.dataset.realCod=val;
    if(inputId==='evalCodigo'&&STATE.fr01.trabajadoresTurno.includes(emp.nombre)){icon.textContent='❌';name.textContent=`${emp.nombre} — en el turno`;name.style.color='var(--red)';}
  } else {
    icon.textContent=val&&val.length>3?'❌':'—';name.textContent='';
    if(inputId==='fr01Emisor') el.dataset.realCod='';
  }
}

// ── INCIDENCIAS ────────────────────────────────────────
function addIncidencia() {
  const body=document.getElementById('incBody');
  document.getElementById('incPlaceholder')?.remove();
  const empNames=STATE.empleadosCache.map(e=>e.nombre);
  const div=document.createElement('div');div.className='inc-row';
  div.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:10px;margin-bottom:10px;padding:13px;background:var(--s3);border-radius:var(--r);border:1px solid var(--border-s);align-items:end';
  div.innerHTML=`
    <div class="field mb-0"><label>Tipo</label><select class="inc-tipo">${TIPOS_INCIDENCIA.map(t=>`<option>${t}</option>`).join('')}</select></div>
    <div class="field mb-0"><label>Descripci&oacute;n</label><input type="text" class="inc-desc" placeholder="Detalla..."></div>
    <div class="field mb-0"><label>Responsable</label><select class="inc-resp"><option value="—">— Sin asignar</option>${empNames.map(n=>`<option value="${n}">${n}</option>`).join('')}</select></div>
    <div class="field mb-0"><label>Nivel</label><select class="inc-nivel"><option>🔴 Alto</option><option>🟡 Medio</option><option>🟢 Bajo</option></select></div>
    <button class="btn btn-danger btn-xs" onclick="this.closest('.inc-row').remove()">✕</button>`;
  body.appendChild(div);
}

// ── RETORNO ────────────────────────────────────────────
async function initRetorno() {
  const listas=await API.listas({sede:STATE.sede,estado:'Devuelto'});
  if(!listas)return;
  const box=document.getElementById('retListasPendientes');if(!box)return;
  const pend=listas.filter(l=>!l.validado_tienda);
  if(!pend.length){box.innerHTML='<div style="text-align:center;color:var(--text3);font-family:var(--font-m);font-size:12px;padding:32px">Sin listas pendientes de validación</div>';return;}
  box.innerHTML=pend.map(l=>`
    <div class="card" style="margin-bottom:12px;cursor:pointer" onclick="abrirRetornoLista('${l.id}')">
      <div class="card-body" style="display:flex;align-items:center;gap:14px">
        <span class="badge ${l.tipo==='LAV'?'badge-blue':'badge-gold'}" style="font-size:13px;padding:6px 12px">${l.tipo}</span>
        <div style="flex:1"><div style="font-weight:700;font-family:var(--font-m);font-size:13px;color:var(--navy)">${l.id}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${l.prendas} prendas · ${l.fecha}</div></div>
        <span class="badge badge-yellow">Pendiente validación</span>
        <span style="color:var(--text3);font-size:18px">›</span>
      </div>
    </div>`).join('');
  STATE.listasCache=listas;
}

async function abrirRetornoLista(listId) {
  const lista=STATE.listasCache.find(l=>l.id===listId);if(!lista)return;
  STATE.almCurrentId=listId;
  document.getElementById('retDetallId').textContent=listId;
  document.getElementById('retDetallPanel').classList.remove('hidden');
  document.getElementById('retListasPendientes').style.display='none';
  document.getElementById('retBack').style.display='block';
  const body=document.getElementById('retDetallBody');
  if(!lista.items||!lista.items.length){body.innerHTML='<tr><td class="empty-cell" colspan="6">Sin ternos individuales</td></tr>';}
  else {
    body.innerHTML=lista.items.map((p,i)=>`
      <tr>
        <td><span class="badge badge-navy">${p.cod}</span></td>
        <td>${p.tipo}</td><td>${p.color}</td>
        <td><span class="badge badge-gold">${p.talla}</span></td>
        <td style="font-size:11px">${p.obs?p.obs.split('|').join(', '):'—'}</td>
        <td><select class="inline-select" id="ret-est-${p.id}">
          <option value="bien">✅ Buen estado</option>
          <option value="mal_lavado">❌ Mal lavado</option>
          <option value="mal_planchado">❌ Mal planchado</option>
          <option value="danado">❌ Llegó dañado</option>
          <option value="incompleto">⚠️ Incompleto</option>
        </select></td>
        <td><input class="inline-input" id="ret-obs-${p.id}" placeholder="Obs." style="width:110px"></td>
      </tr>`).join('');
  }
  const genBox=document.getElementById('retDetallGenerales');
  if(genBox){
    const g=lista.generales||{};const total=Object.values(g).reduce((s,v)=>s+(v||0),0);
    genBox.innerHTML=total>0?Object.entries(g).filter(([,v])=>v>0).map(([k,v])=>`<span class="badge badge-navy" style="margin:3px">${v} ${k}</span>`).join(''):'<span style="color:var(--text3);font-size:12px">Sin generales</span>';
  }
}

async function validarRetornoLista() {
  const lista=STATE.listasCache.find(l=>l.id===STATE.almCurrentId);if(!lista)return;
  const itemsEstado=(lista.items||[]).map(p=>({id:p.id,estado:document.getElementById('ret-est-'+p.id)?.value||'bien'}));
  const hayProblemas=itemsEstado.some(i=>i.estado!=='bien');
  const r=await API.validarRetorno(STATE.almCurrentId,{itemsEstado,obs_retorno:''});
  if(!r)return;
  cerrarRetornoDetall();
  await initRetorno();
  showToast(hayProblemas?'⚠️ Lista devuelta al almacén con observaciones':'✅ Lista validada correctamente',hayProblemas?'warning':'success');
}

function cerrarRetornoDetall(){
  document.getElementById('retDetallPanel').classList.add('hidden');
  document.getElementById('retListasPendientes').style.display='block';
  document.getElementById('retBack').style.display='none';
}

// ── ALMACÉN ────────────────────────────────────────────
async function renderAlmacenListas() {
  const listas=await API.listas({});
  STATE.listasCache=listas||[];
  const body=document.getElementById('almListasBody');const badge=document.getElementById('almPendBadge');if(!body)return;
  const pend=STATE.listasCache.filter(l=>l.estado==='En proceso');
  if(badge)badge.textContent=`${pend.length} pendientes`;
  if(!STATE.listasCache.length){body.innerHTML='<tr><td class="empty-cell" colspan="8">Sin listas</td></tr>';return;}
  const stB={'En proceso':'badge-yellow','Procesado':'badge-blue','Devuelto':'badge-green','Validado':'badge-navy','Devuelto-Observado':'badge-red'};
  body.innerHTML=STATE.listasCache.map(l=>`
    <tr>
      <td><span class="badge badge-navy mono">${l.id}</span></td>
      <td><span class="badge ${l.tipo==='LAV'?'badge-blue':'badge-gold'}">${l.tipo}</span></td>
      <td>${SEDES[l.sede]?.label||l.sede}</td><td>${l.prendas}</td>
      <td style="font-size:11px;color:var(--text3)">${Object.entries(l.generales||{}).filter(([,v])=>v>0).map(([k,v])=>`${v} ${k}`).join(', ')||'—'}</td>
      <td class="mono" style="font-size:11px">${l.fecha}</td>
      <td><span class="badge ${stB[l.estado]||'badge-gray'}">${l.estado}</span>${l.validado_tienda?'<span class="badge badge-green" style="margin-left:4px">✓ Tienda</span>':''}</td>
      <td><button class="btn btn-ghost btn-xs" onclick="verDetalleAlm('${l.id}')">Ver</button></td>
    </tr>`).join('');
}

async function verDetalleAlm(listId) {
  STATE.almCurrentId=listId;
  const lista=STATE.listasCache.find(l=>l.id===listId);if(!lista)return;
  document.getElementById('almDetallId').textContent=listId;
  document.getElementById('almDetallCard').style.display='block';
  const steps=['En proceso','Procesado','Devuelto','Validado'];
  const curStep=steps.indexOf(lista.estado);
  document.querySelectorAll('#almSteps .step').forEach((el,i)=>{el.classList.toggle('done',i<curStep);el.classList.toggle('active',i===curStep);});
  const body=document.getElementById('almDetallBody');
  if(!lista.items||!lista.items.length){body.innerHTML='<tr><td class="empty-cell" colspan="7">Sin ternos individuales</td></tr>';}
  else body.innerHTML=lista.items.map((p,i)=>`
    <tr>
      <td><span class="badge badge-navy">${p.cod}</span></td>
      <td>${p.tipo}</td><td>${p.color}</td>
      <td><span class="badge badge-gold">${p.talla}</span></td>
      <td style="font-size:11px">${p.obs?p.obs.split('|').join(', '):'—'}</td>
      <td><select class="inline-select" id="alm-dev-${i}" ${lista.estado!=='En proceso'?'disabled':''}>
        <option value="si">✅ Se devuelve</option><option value="no">❌ No se devuelve</option></select></td>
      <td><select class="inline-select" id="alm-est-${i}" ${lista.estado!=='En proceso'?'disabled':''}>
        <option>Lavado ✓</option><option>Planchado ✓</option><option>Refaccionado ✓</option><option>En proceso</option>
      </select></td>
    </tr>`).join('');
  const btnBox=document.getElementById('almDetallBtns');
  if(btnBox){
    if(lista.estado==='En proceso')btnBox.innerHTML=`<button class="btn btn-primary btn-sm" onclick="avanzarAlmEstado('Procesado')">✅ Marcar Procesado</button>`;
    else if(lista.estado==='Procesado')btnBox.innerHTML=`<button class="btn btn-primary btn-sm" onclick="avanzarAlmEstado('Devuelto')">📦 Devolver a Tienda</button>`;
    else if(lista.estado==='Devuelto-Observado')btnBox.innerHTML=`<button class="btn btn-primary btn-sm" onclick="avanzarAlmEstado('En proceso')">🔄 Reprocesar</button>`;
    else btnBox.innerHTML=`<span class="badge ${lista.validado_tienda?'badge-green':'badge-gold'}">${lista.validado_tienda?'✓ Validado':'Esperando validación'}</span>`;
  }
}

async function avanzarAlmEstado(nuevoEstado) {
  const r=await API.cambiarEstado(STATE.almCurrentId,nuevoEstado);
  if(!r)return;
  document.getElementById('almDetallCard').style.display='none';
  await renderAlmacenListas();
  showToast(`✅ Lista → ${nuevoEstado}`,'success');
}

// ── EVALUACIÓN VALORES 360 (todos) ────────────────────
async function checkEvalValoresHabilitado() {
  try {
    // Usar el endpoint nuevo que respeta modo manual/auto + días programados
    const cfg = await API.get('/valores/config');
    const habilitado = cfg && cfg.activo_hoy === true;
    const navEl = document.querySelector('.nav-eval-valores');
    const badge = document.querySelector('.eval-v-badge');
    if (navEl) navEl.classList.toggle('hidden', !habilitado);
    if (!habilitado) { if (badge) badge.classList.add('hidden'); return; }
    // Si está habilitado, contar pendientes del mes actual y mostrar badge
    try {
      const mes = mesLocal();
      const compañeros = await API.misValores(mes);
      if (compañeros && Array.isArray(compañeros)) {
        const pend = compañeros.filter(e => !e.evaluado).length;
        if (badge) {
          if (pend > 0) {
            badge.textContent = pend;
            badge.classList.remove('hidden');
          } else {
            badge.classList.add('hidden');
          }
        }
      }
    } catch (e2) { /* fail-safe: deja el badge oculto */ }
  } catch(e) {}
}

async function initEvalValores() {
  const mes=document.getElementById('evalVMes')?.value||mesLocal();
  // Cargar mi resumen primero (paralelo a los compañeros para ahorrar tiempo)
  cargarMiResumenValores(mes);
  const compañeros=await API.misValores(mes);
  if(!compañeros)return;
  const box=document.getElementById('evalVList');if(!box)return;
  const pendientes=compañeros.filter(e=>!e.evaluado);
  document.getElementById('evalVProgreso').textContent=`${compañeros.length-pendientes.length}/${compañeros.length} evaluados`;
  box.innerHTML=compañeros.map(e=>`
    <div class="valores-emp-card ${e.evaluado?'completado':''}" onclick="${e.evaluado?'':`abrirEvalValores('${e.id}','${e.nombre}','${e.iniciales}')`}">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="persona-avatar" style="width:38px;height:38px;font-size:13px">${e.iniciales}</div>
        <div style="flex:1"><div style="font-weight:600;font-size:13px">${e.nombre}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${e.evaluado?'✅ Ya evaluado este mes':'Pendiente de evaluación'}</div>
        </div>
        <span style="font-size:20px">${e.evaluado?'✓':'›'}</span>
      </div>
    </div>`).join('');
}

// ── Mi resumen del mes ─────────────────────────────────
// Muestra al colaborador el promedio que sus compañeros le dieron en
// cada valor + nota /20. Privacidad: no muestra QUIÉN lo evaluó.
async function cargarMiResumenValores(mes) {
  const box = document.getElementById('evalVMiResumen');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--text3);font-size:12px">Cargando...</div>';
  try {
    const r = await API.get('/valores/mi-resumen/' + encodeURIComponent(mes));
    if (!r || !r.recibidas) {
      box.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:14px">A&uacute;n no recibiste evaluaciones este mes.</div>';
      return;
    }
    const p = r.promedios || {};
    const nota = r.nota20;
    const cls = nota >= 17 ? 'excellent' : nota >= 14 ? 'good' : nota >= 11 ? 'regular' : 'bad';
    let html = '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px">' +
               '<div class="score-pill ' + cls + '" style="font-size:18px;padding:8px 16px">' + nota + '/20</div>' +
               '<div style="font-size:11px;color:var(--text3)">Basado en <strong>' + r.recibidas + '</strong> evaluaci&oacute;n(es) de tus compa&ntilde;eros</div>' +
               '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    VALORES_NOMBRES.forEach((v, i) => {
      const k = VALORES_KEYS[i];
      const val = p[k];
      if (val == null) {
        html += '<span style="padding:4px 10px;border-radius:6px;background:var(--s3);color:var(--text3);font-size:11px">' + v + ': —</span>';
      } else {
        const bg = val >= 4 ? 'rgba(26,122,82,.1)' : val >= 3 ? 'rgba(184,134,11,.1)' : 'rgba(192,57,43,.1)';
        const fg = val >= 4 ? 'var(--green)' : val >= 3 ? 'var(--yellow)' : 'var(--red)';
        html += '<span style="padding:4px 10px;border-radius:6px;background:' + bg + ';color:' + fg + ';font-size:11px;font-weight:600">' + v + ': <strong>' + val + '</strong></span>';
      }
    });
    html += '</div>';
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = '<div style="color:var(--text3);font-size:12px">Sin datos a&uacute;n.</div>';
  }
}

function abrirEvalValores(empId, nombre, iniciales) {
  document.getElementById('evalVEmpNombre').textContent=nombre;
  document.getElementById('evalVEmpId').value=empId;
  const form=document.getElementById('evalVForm');
  // Atajos rápidos: aplicar mismo valor a todos los 6 likert
  let html = '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center">' +
             '<span style="font-size:11px;color:var(--text3);font-weight:600">Atajos:</span>';
  [1,2,3,4,5].forEach(n => {
    const lbl = LIKERT_LABELS[n-1];
    html += '<button class="btn btn-ghost btn-xs" type="button" onclick="setLikertAll(' + n + ')" title="' + lbl + '" style="font-size:10px">Todos a ' + n + '</button>';
  });
  html += '</div>';
  html += VALORES_NOMBRES.map((v,i)=>`
    <div style="margin-bottom:16px;padding:12px;background:var(--s3);border-radius:var(--r)">
      <div style="font-size:12.5px;font-weight:600;margin-bottom:8px">${v}</div>
      <div class="likert-stars" id="stars-${i}">
        ${[1,2,3,4,5].map(n=>`<span class="likert-star" onclick="setLikert(${i},${n})" data-val="${n}">⭐</span>`).join('')}
      </div>
      <input type="hidden" id="lk-${i}" value="3">
      <div style="font-size:10px;color:var(--text3);margin-top:4px;font-family:var(--font-m)">
        <span id="lk-label-${i}">A veces (3)</span>
      </div>
    </div>`).join('');
  form.innerHTML = html;
  // Inicializar con 3
  VALORES_NOMBRES.forEach((_,i)=>setLikert(i,3));
  openModal('evalVModal');
}

function setLikertAll(val) {
  VALORES_NOMBRES.forEach((_, i) => setLikert(i, val));
}

function setLikert(idx, val) {
  document.querySelectorAll(`#stars-${idx} .likert-star`).forEach((s,i)=>{
    s.classList.toggle('active',i<val);
    s.style.opacity=i<val?'1':'0.3';
  });
  const hidden=document.getElementById(`lk-${idx}`);if(hidden)hidden.value=val;
  const label=document.getElementById(`lk-label-${idx}`);
  if(label)label.textContent=`${LIKERT_LABELS[val-1]} (${val})`;
}

async function enviarEvalValores() {
  const empId=document.getElementById('evalVEmpId')?.value;
  const mes=document.getElementById('evalVMes')?.value||mesLocal();
  const vals={};
  VALORES_KEYS.forEach((k,i)=>{vals[k]=parseInt(document.getElementById(`lk-${i}`)?.value||3);});
  const r=await API.enviarValores({evaluado_id:empId,mes,...vals});
  if(!r)return;
  closeModal('evalVModal');
  await initEvalValores();
  showToast('✅ Evaluación de valores enviada','success');
}

// ── MODAL / NAV ────────────────────────────────────────
function openModal(id){document.getElementById(id)?.classList.add('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
document.addEventListener('click',e=>{if(e.target.classList.contains('modal-overlay')&&e.target.id!=='loginModal')closeModal(e.target.id);});

function showConfirm(title,detail,fn,icon='📋'){
  document.getElementById('confirmIcon').textContent=icon;
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmDetail').textContent=detail;
  STATE.pendingConfirmFn=fn;openModal('confirmModal');
}
function doConfirm(){closeModal('confirmModal');if(STATE.pendingConfirmFn){STATE.pendingConfirmFn();STATE.pendingConfirmFn=null;}}
function showPrompt(title,placeholder,callback,icon){
  icon=icon||'✏️';
  var prev=document.getElementById('promptModal');if(prev)prev.remove();
  var m=document.createElement('div');m.id='promptModal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px';
  m.innerHTML='<div style="background:#fff;border-radius:14px;width:95%;max-width:400px;overflow:hidden" onclick="event.stopPropagation()"><div style="padding:16px 20px;border-bottom:1px solid var(--border);font-weight:700;font-size:14px">'+icon+' '+title+'</div><div style="padding:16px 20px"><input type="text" id="promptInput" placeholder="'+(placeholder||'')+'" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;outline:none"></div><div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost btn-sm" id="promptCancel">Cancelar</button><button class="btn btn-primary btn-sm" id="promptOk">Aceptar</button></div></div>';
  m.onclick=function(e){if(e.target===m)m.remove();};
  document.body.appendChild(m);
  document.getElementById('promptCancel').onclick=function(){m.remove();};
  document.getElementById('promptOk').onclick=function(){var v=document.getElementById('promptInput').value;m.remove();if(callback)callback(v);};
  document.getElementById('promptInput').addEventListener('keydown',function(e){if(e.key==='Enter'){var v=this.value;m.remove();if(callback)callback(v);}});
  setTimeout(function(){document.getElementById('promptInput')?.focus()},50);
}



// ═══ ROLE-BASED ACCESS CONTROL ═══
var EMP_ROLES_LABEL = {admin:'👑 Administrador',dueno:'👑 Dueña',encargado_tienda:'🏪 Encargado',encargado_almacen:'📦 Enc. Almacén',ventas_junior:'🛍 Ventas Jr.',ventas_junior_2:'🛍 Ventas Jr. 2',auxiliar:'📦 Auxiliar',confeccionista:'✂️ Confeccionista',trabajador:'👤 Colaborador'};
// ──────────────────────────────────────────────────────────────────────────
// PAGES_CONFIG — Inventario REAL de módulos.
// Cada id debe coincidir con el argumento de goTo('...') en el nav del HTML.
// `section` agrupa visualmente en el modal de Configurar Accesos.
// Sectores:
//   turno     → operación diaria del turno (reporte, eval, lavandería, solicitudes)
//   personal  → vistas propias del colaborador
//   almacen   → flujos de almacén/pipeline (kanban, envíos, retornos, garantías)
//   gestion   → panel admin (colaboradores, incidencias, auditoría)
// ──────────────────────────────────────────────────────────────────────────
var PAGES_CONFIG = {
  // — Turno —
  'reporte':            {label:'Reporte de Actividades',icon:'📋',section:'turno'},
  'evaluacion':         {label:'Evaluación de Reporte', icon:'⭐',section:'turno'},
  'lavanderia':         {label:'Envío a Lavandería',    icon:'👔',section:'turno'},
  'solicitudes':        {label:'Solicitudes',           icon:'📩',section:'turno'},
  'prestamos':          {label:'Préstamo de Prendas',   icon:'🔄',section:'turno'},
  // — Personal —
  'mi-desempeno':       {label:'Mi Desempeño',          icon:'📊',section:'personal'},
  'eval-valores':       {label:'Evaluar Compañeros',    icon:'💎',section:'personal'},
  // — Almacén / Pipeline —
  'kanban-almacen':     {label:'Prendas Recibidas (Almacén)',icon:'📦',section:'almacen'},
  'pipeline-envios':    {label:'Envíos Recibidos (Tienda)',  icon:'📬',section:'almacen'},
  'retorno':            {label:'Retorno de Prendas',    icon:'↩️',section:'almacen'},
  'garantias':          {label:'Garantías',             icon:'🛡️',section:'almacen'},
  'config-pipeline':    {label:'Configurar Pipeline',   icon:'⚙️',section:'almacen'},
  // — Gestión (admin) —
  'dashboard':          {label:'Dashboard',             icon:'📊',section:'gestion'},
  'empleados':          {label:'Colaboradores',         icon:'👥',section:'gestion'},
  'incidencias-admin':  {label:'Incidencias',           icon:'⚡',section:'gestion'},
  'gestion-actividades':{label:'Gestión Actividades',   icon:'📝',section:'gestion'},
  'admin-reportes':     {label:'Reportes de Actividad', icon:'📈',section:'gestion'},
  'evaluacion-mensual': {label:'Evaluación Mensual',    icon:'🏆',section:'gestion'},
  'pagos':              {label:'Pagos',                 icon:'💵',section:'gestion'},
  'asistencias':        {label:'Asistencia diaria',     icon:'📅',section:'gestion'},
  'horarios-admin':     {label:'Horarios',              icon:'📅',section:'gestion'},
  'audit-log':          {label:'Auditoría',             icon:'🔍',section:'gestion'},
};

// Etiqueta legible + color por sector para la UI de configuración.
var SECTION_META = {
  turno:    {label:'Operación de Turno', icon:'📋', color:'#1e3a5f', bg:'#eff6ff'},
  personal: {label:'Vista Personal',     icon:'🙋', color:'#7c3aed', bg:'#faf5ff'},
  almacen:  {label:'Almacén y Pipeline', icon:'📦', color:'#0d6939', bg:'#f0fdf4'},
  gestion:  {label:'Gestión (Admin)',    icon:'👑', color:'#b45309', bg:'#fffbeb'},
};

var DEFAULT_PERMS = {
  dueno:              Object.keys(PAGES_CONFIG),
  admin:              Object.keys(PAGES_CONFIG),
  encargado_tienda:   ['reporte','evaluacion','lavanderia','solicitudes','prestamos','mi-desempeno','eval-valores','pipeline-envios','retorno','incidencias-admin'],
  encargado_almacen:  ['reporte','evaluacion','solicitudes','prestamos','mi-desempeno','eval-valores','kanban-almacen','retorno','garantias','incidencias-admin'],
  ventas_junior:      ['reporte','evaluacion','lavanderia','solicitudes','mi-desempeno','eval-valores','pipeline-envios'],
  ventas_junior_2:    ['reporte','evaluacion','lavanderia','solicitudes','mi-desempeno','eval-valores','pipeline-envios'],
  auxiliar:           ['reporte','evaluacion','solicitudes','mi-desempeno','eval-valores','kanban-almacen'],
  confeccionista:     ['mi-desempeno','solicitudes','eval-valores'],
  trabajador:         ['reporte','evaluacion','mi-desempeno','solicitudes','eval-valores'],
};

STATE._permisos = null;

async function loadPermisos() {
  try {
    var custom = await API.get('/config/permisos');
    STATE._permisos = custom && Object.keys(custom).length ? custom : null;
  } catch(e) { STATE._permisos = null; }
}

function canAccess(pageId) {
  if (!STATE.user) return false;
  var rol = STATE.user.rol;
  if (rol === 'admin' || rol === 'dueno') return true;
  var perms = STATE._permisos && STATE._permisos[rol] ? STATE._permisos[rol] : DEFAULT_PERMS[rol] || [];
  return perms.indexOf(pageId) >= 0;
}

function applyPermissions() {
  // Hide nav items the user can't access
  document.querySelectorAll('.nav-item').forEach(function(el) {
    var onclick = el.getAttribute('onclick') || '';
    var match = onclick.match(/goTo\('([^']+)'/);
    if (match) {
      var pageId = match[1];
      el.style.display = canAccess(pageId) ? '' : 'none';
    }
  });
  // Hide admin section header if no admin pages visible
  document.querySelectorAll('.nav-section').forEach(function(el) {
    var items = el.nextElementSibling;
    // Check if any visible nav-items follow
  });
}

function goTo(pageId,el){
  if(!canAccess(pageId)&&pageId!=='login'){showToast('No tienes acceso a esta sección','error');return;}
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+pageId)?.classList.add('active');
  if(el)el.classList.add('active');
  else document.querySelectorAll('.nav-item').forEach(n=>{if(n.getAttribute('onclick')?.includes(`'${pageId}'`))n.classList.add('active');});
  if(pageId==='almacen')renderAlmacenListas();
  if(pageId==='dashboard')renderDashboard();
  if(pageId==='admin-reportes')renderAdminReportes();
  if(pageId==='audit-log')renderAuditLog();
  if(pageId==='config-pipeline')renderCfgPipeline();
  if(pageId==='gestion-actividades')gaCargarActividades();
  if(pageId==='empleados')renderEmpleados();
  if(pageId==='incidencias-admin')renderIncidenciasAdmin();
  if(pageId==='retorno')initRetorno();
  if(pageId==='evaluacion-mensual')initEvalMensual();
  if(pageId==='eval-valores')initEvalValores();
  if(pageId==='lavanderia')initLavResponsables();
  if(pageId==='mi-desempeno')renderMiDesempeno();
  if(pageId==='horarios-admin'&&typeof renderHorariosAdmin==='function')renderHorariosAdmin();
  if(pageId==='evaluacion'&&STATE.fr01.reportId&&STATE.fr01.actividadesRealizadas&&STATE.fr01.actividadesRealizadas.length)prepararEval();
  if(pageId==='prestamos'){renderPrestamos();renderBajas();}

  if(pageId==='garantias')renderGarantias();
  if(pageId==='pipeline-envios')renderEnviosRecibidos();
  if(pageId==='solicitudes')renderSolicitudes();
  if(pageId==='empleados')applyPermissions();
}

// ── Populate responsable selects in lavandería/refacción ──
function initLavResponsables() {
  var allEmps = STATE.empleadosCache || [];
  var sedeEmps = allEmps.filter(function(e) { return (e.tiendas||[]).includes(STATE.sede); });
  var otherEmps = allEmps.filter(function(e) { return !(e.tiendas||[]).includes(STATE.sede); });

  ['lavRespInv','lavRespTraslado'].forEach(function(id) {
    var list = document.getElementById(id + 'List');
    if (!list || list.dataset.built) return;
    list.dataset.built = '1';

    function render(q) {
      var html = '';
      var all = q ? sedeEmps.concat(otherEmps) : sedeEmps;
      all.filter(function(e){return !q||e.nombre.toLowerCase().includes(q);}).forEach(function(e) {
        var isSel = document.getElementById(id).value === e.nombre;
        var esOtra = !(e.tiendas||[]).includes(STATE.sede);
        html += '<div class="persona-opt'+(isSel?' selected':'')+(esOtra?' otra-tienda':'')+'" onclick="lavRespPick(\''+id+'\',\''+e.nombre.replace(/'/g,"\\'")+'\')">';
        html += '<div class="persona-avatar">'+(e.iniciales||e.nombre.slice(0,2).toUpperCase())+'</div>';
        html += '<span class="persona-name">'+e.nombre+'</span>';
        html += '<span class="persona-tienda-tag">'+(e.tiendas||[]).map(function(t){return SEDES[t]?.short||t}).join('/')+'</span>';
        html += '<div class="persona-check">'+(isSel?'\u2713':'')+'</div></div>';
      });
      if (!q && otherEmps.length) {
        html += '<div style="font-size:9px;color:var(--text3);padding:6px 9px;text-align:right;cursor:pointer;border-top:1px dashed var(--border)" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">+ Agregar de otra tienda</div><div style="display:none">';
        otherEmps.forEach(function(e) {
          var isSel = document.getElementById(id).value === e.nombre;
          html += '<div class="persona-opt otra-tienda'+(isSel?' selected':'')+'" onclick="lavRespPick(\''+id+'\',\''+e.nombre.replace(/'/g,"\\'")+'\')">';
          html += '<div class="persona-avatar">'+(e.iniciales||e.nombre.slice(0,2).toUpperCase())+'</div>';
          html += '<span class="persona-name">'+e.nombre+'</span>';
          html += '<span class="persona-tienda-tag">'+(e.tiendas||[]).map(function(t){return SEDES[t]?.short||t}).join('/')+'</span>';
          html += '<div class="persona-check">'+(isSel?'\u2713':'')+'</div></div>';
        });
        html += '</div>';
      }
      list.innerHTML = html;
    }
    list._render = render;
    render('');
  });

  var destGrp = document.getElementById('lavDestinoGroup');
  if (destGrp) destGrp.addEventListener('click', function() {
    setTimeout(function() {
      var m = document.getElementById('lavMotivoWrap');
      if (m) m.style.display = document.getElementById('lavDestino')?.value === 'Compostura' ? '' : 'none';
    }, 50);
  });
  initColorDots();
}

function lavRespPick(id, nombre) {
  document.getElementById(id).value = nombre;
  var list = document.getElementById(id + 'List');
  if (list && list._render) list._render('');
}

function initColorDots() {
  document.addEventListener('click', function(e) {
    var dd = document.getElementById('lavColorDropdown');
    if (dd && dd.classList.contains('open') && !dd.contains(e.target) && !e.target.closest('.color-input-row')) dd.classList.remove('open');
  });
  // Reposition dropdown on open
  var row = document.querySelector('#lavColorWrap .color-input-row');
  if (row) {
    row.onclick = function() {
      var dd = document.getElementById('lavColorDropdown');
      if (!dd) return;
      var rect = row.getBoundingClientRect();
      var spaceBelow = window.innerHeight - rect.bottom;
      dd.style.position = 'fixed';
      dd.style.left = rect.left + 'px';
      dd.style.width = rect.width + 'px';
      if (spaceBelow < 240) {
        dd.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        dd.style.top = 'auto';
      } else {
        dd.style.top = (rect.bottom + 4) + 'px';
        dd.style.bottom = 'auto';
      }
      dd.classList.toggle('open');
      if (dd.classList.contains('open')) document.getElementById('lavColorSearch')?.focus();
    };
  }
}

function pickColor(name, hex) {
  document.getElementById('lavColor').value = name;
  document.getElementById('lavColorLabel').textContent = name;
  var dot = document.getElementById('lavColorDot');
  if (dot) dot.style.background = hex || '#ccc';
  document.getElementById('lavColorDropdown')?.classList.remove('open');
  document.getElementById('lavColorSearch').value = '';
  filterColorDropdown();
}

function filterColorDropdown() {
  var q = (document.getElementById('lavColorSearch')?.value || '').toLowerCase();
  document.querySelectorAll('#lavColorOpts .color-dropdown-item').forEach(function(el) {
    el.style.display = !q || el.dataset.value.toLowerCase().includes(q) ? '' : 'none';
  });
}


function filterWorkerList(listId, query) {
  var list = document.getElementById(listId);
  if (list && list._render) list._render(query.toLowerCase());
}


// ═══════════════════════════════════════════════════════
// DETALLE DE REPORTE — Modal al hacer clic en cualquier reporte
// Muestra: actividades, categoría, hecho/no, obs turno, calificación eval, obs eval
// ═══════════════════════════════════════════════════════
async function anularReporte(reporteId) {
  showConfirm('¿Anular reporte '+reporteId+'?','Esta acción eliminará el reporte y todos sus datos asociados. No se puede deshacer.',async function(){
    var r=await API.del('/reportes/'+reporteId+'/anular');
    if(r&&r.ok){
      document.getElementById('modalReporteDetalle')?.remove();
      showToast('🗑 Reporte '+reporteId+' anulado','success');
      // Reset local state if it was the current report
      if(STATE.fr01.reportId===reporteId){
        STATE.fr01={bloqueado:false,enviado:false,reportId:null,actividadesRealizadas:[],trabajadoresTurno:[],extras:[],incidencias:[]};
        STATE._evalLayoutCals=null;STATE._evalLayoutSel=null;
        var ov=document.getElementById('fr01Overlay');if(ov)ov.style.display='none';
        var ct=document.getElementById('fr01Content');if(ct)ct.style.display='';
        document.getElementById('fr01Blocked')?.classList.remove('show');
        document.getElementById('evalNoReport').style.display='block';
        document.getElementById('evalContent').classList.add('hidden');
        document.getElementById('evalBadge')?.classList.add('hidden');
      }
      checkAlertas();
      // Refresh visible tables
      if(typeof renderAdminReportes==='function'&&document.getElementById('page-admin-reportes')?.classList.contains('active'))renderAdminReportes();
      if(typeof renderDashboard==='function'&&document.getElementById('page-dashboard')?.classList.contains('active'))renderDashboard();
    }
  });
}

async function anularEvaluacion(reporteId) {
  showConfirm('¿Anular evaluación de '+reporteId+'?','Se borrarán las calificaciones pero el reporte quedará pendiente de evaluación.',async function(){
    var r=await API.del('/reportes/'+reporteId+'/anular-eval');
    if(r&&r.ok){
      document.getElementById('modalReporteDetalle')?.remove();
      showToast('↩ Evaluación anulada — reporte pendiente','success');
      // Restore eval state so user can re-evaluate
      checkPendingEval();
      checkAlertas();
      // Refresh visible tables
      if(typeof renderAdminReportes==='function'&&document.getElementById('page-admin-reportes')?.classList.contains('active'))renderAdminReportes();
      if(typeof renderDashboard==='function'&&document.getElementById('page-dashboard')?.classList.contains('active'))renderDashboard();
    }
  });
}

async function verReporteDetalle(reporteId) {
  var prev = document.getElementById('modalReporteDetalle');
  if (prev) prev.remove();
  var det = await API.get('/reportes/' + reporteId + '/detalle');
  if (!det) { showToast('No se pudo cargar el reporte','error'); return; }
  var turnoL = {M:'Mañana',T:'Tarde',C:'Completo'}[det.turno] || det.turno;
  var pct = det.puntaje || 0;
  var cls = pct>=85?'excellent':pct>=70?'good':pct>=50?'regular':'bad';
  var catL = {PO:'Primer Orden',IND:'Indispensable',SO:'Segundo Orden',EXT:'Extra'};
  var catC = {PO:'#1e3a5f',IND:'#0d6939',SO:'#7c5e10',EXT:'#6d28d9'};
  var h = '';
  h += '<div id="modalReporteDetalle" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px" onclick="this.remove()">';
  h += '<div style="background:#fff;border-radius:16px;width:95%;max-width:780px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)" onclick="event.stopPropagation()">';
  // Header
  h += '<div style="padding:18px 24px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">';
  h += '<div><div style="font-size:17px;font-weight:800">📋 '+det.id+'</div><div style="font-size:11px;color:#64748b;margin-top:2px">'+(SEDES[det.sede]?.label||det.sede)+' · '+turnoL+' · '+det.fecha+'</div></div>';
  h += '<div style="text-align:right"><div class="score-pill '+cls+'" style="font-size:16px;padding:8px 14px">'+pct+'%</div>';
  if(det.evaluado) h += '<div style="font-size:9px;color:#64748b;margin-top:3px">Evaluó: <strong>'+(det.evaluador||'—')+'</strong></div>';
  h += '</div></div>';
  // Body
  h += '<div style="flex:1;overflow-y:auto;padding:18px 24px">';
  h += '<div style="display:flex;gap:14px;margin-bottom:14px;flex-wrap:wrap;font-size:12px">';
  h += '<div><span style="font-size:9px;font-weight:700;color:#94a3b8;display:block">ENCARGADO</span><strong>'+(det.encargado||'—')+'</strong></div>';
  h += '<div><span style="font-size:9px;font-weight:700;color:#94a3b8;display:block">COLABORADORES</span>'+(det.trabajadores||[]).join(', ')+'</div>';
  h += '<div><span style="font-size:9px;font-weight:700;color:#94a3b8;display:block">ACTIVIDADES</span><strong>'+(det.act_done||0)+'/'+(det.act_total||0)+'</strong></div>';
  h += '</div>';
  // Table
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">';
  h += '<thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">';
  h += '<th style="padding:7px 10px;text-align:left;font-size:9px;color:#94a3b8">CÓD</th>';
  h += '<th style="padding:7px 10px;text-align:left;font-size:9px;color:#94a3b8">ACTIVIDAD</th>';
  h += '<th style="padding:7px 10px;text-align:center;font-size:9px;color:#94a3b8">CATEG.</th>';
  h += '<th style="padding:7px 10px;text-align:center;font-size:9px;color:#94a3b8">HECHO</th>';
  h += '<th style="padding:7px 10px;text-align:left;font-size:9px;color:#94a3b8">OBS. TURNO</th>';
  if(det.evaluado){
    h += '<th style="padding:7px 10px;text-align:center;font-size:9px;color:#94a3b8">CALIFICACIÓN</th>';
    h += '<th style="padding:7px 10px;text-align:left;font-size:9px;color:#94a3b8">OBS. EVALUACIÓN</th>';
  }
  h += '</tr></thead><tbody>';
  (det.actividades||[]).filter(function(a){return !a.cod.startsWith('OL_')}).forEach(function(a){
    var cv=a.calificacion, ct='—', cb='#f1f5f9', cf='#64748b';
    if(cv===1||cv==='1'){ct='✅ Aprobado';cb='#dcfce7';cf='#166534';}
    else if(cv==0.5||cv==='0.5'){ct='👁 Observado';cb='#fef3c7';cf='#92400e';}
    else if(cv===0||cv==='0'){ct='❌ Rechazado';cb='#fee2e2';cf='#991b1b';}
    var cc=catC[a.cat]||'#64748b';
    h += '<tr style="border-bottom:1px solid #f1f5f9">';
    h += '<td style="padding:7px 10px;font-family:monospace;font-size:9px;color:#94a3b8">'+a.cod+'</td>';
    h += '<td style="padding:7px 10px;font-weight:600">'+a.nombre+' <span style="font-size:8px;color:#94a3b8">('+a.peso+'pts)</span></td>';
    h += '<td style="padding:7px 10px;text-align:center"><span style="padding:2px 5px;border-radius:4px;font-size:8px;font-weight:700;background:'+cc+'18;color:'+cc+'">'+(catL[a.cat]||a.cat)+'</span></td>';
    h += '<td style="padding:7px 10px;text-align:center">'+(a.realizada?'<span style="color:#16a34a;font-weight:800">✓</span>':'<span style="color:#dc2626;font-weight:800">✗</span>')+'</td>';
    h += '<td style="padding:7px 10px;font-size:10px;color:#64748b;max-width:140px">'+(a.obs||'—')+'</td>';
    if(det.evaluado){
      h += '<td style="padding:7px 10px;text-align:center"><span style="padding:2px 7px;border-radius:5px;font-size:9px;font-weight:700;background:'+cb+';color:'+cf+'">'+ct+'</span></td>';
      h += '<td style="padding:7px 10px;font-size:10px;color:'+cf+';max-width:140px">'+(a.obs_eval||'—')+'</td>';
    }
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  // Layout items (OL_ prefixed)
  var layoutItems = (det.actividades||[]).filter(function(a){return a.cod.startsWith('OL_')});
  if(layoutItems.length){
    h += '<div style="margin-top:14px;font-weight:700;font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:6px">🧹 Limpieza <span style="font-size:10px;font-weight:500;color:#64748b">('+layoutItems.length+' zonas)</span></div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:4px;margin-bottom:14px">';
    layoutItems.forEach(function(a){
      var cv=a.calificacion,bg='#f1f5f9',cf='#64748b',icon='✓';
      if(cv===1||cv==='1'){bg='#dcfce7';cf='#166534';icon='✅';}
      else if(cv==0.5||cv==='0.5'){bg='#fef3c7';cf='#92400e';icon='👁';}
      else if(cv===0||cv==='0'){bg='#fee2e2';cf='#991b1b';icon='❌';}
      var name=a.nombre.replace('Limpieza: ','');
      h+='<div style="display:flex;align-items:center;gap:5px;padding:5px 8px;background:'+bg+';border-radius:6px;font-size:10px"><span>'+icon+'</span><span style="flex:1;font-weight:600;color:'+cf+'">'+name+'</span><span style="color:'+cf+';font-weight:700">'+a.peso+'p</span></div>';
    });
    h += '</div>';
  }
  if(det.extras&&det.extras.length){
    h += '<div style="margin-top:14px;font-weight:700;font-size:12px;margin-bottom:6px">⭐ Extras</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">';
    det.extras.forEach(function(e){var v=e.monto_total>0?'S/'+Number(e.monto_total).toFixed(2):(e.cantidad||1)+'pts';h+='<div style="display:flex;justify-content:space-between;padding:5px 8px;background:#f8fafc;border-radius:5px;font-size:10px"><span>'+e.nombre+' ×'+(e.cantidad||1)+'</span><strong>'+v+'</strong></div>';});
    h += '</div>';
  }
  if(det.incidencias&&det.incidencias.length){
    h += '<div style="margin-top:14px;font-weight:700;font-size:12px;color:#dc2626;margin-bottom:6px">🚨 Incidencias</div>';
    det.incidencias.forEach(function(i){h+='<div style="padding:6px 8px;background:#fef2f2;border-radius:5px;border-left:3px solid #ef4444;margin-bottom:3px;font-size:10px"><strong>'+i.tipo+'</strong>: '+(i.descripcion||'—')+'</div>';});
  }
  h += '</div>';
  // Footer
  var isAdm=STATE.user&&(STATE.user.rol==='admin'||STATE.user.rol==='dueno');
  h += '<div style="padding:12px 24px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">';
  if(isAdm){
    h+='<div style="display:flex;gap:6px;align-items:center">';
    if(det.evaluado)h+='<button onclick="anularEvaluacion(\''+det.id+'\')" style="padding:7px 14px;border-radius:7px;border:1.5px solid #ca8a04;background:#fefce8;color:#92400e;font-weight:700;font-size:11px;cursor:pointer">↩ Anular Evaluación</button>';
    h+='<button onclick="anularReporte(\''+det.id+'\')" style="padding:7px 14px;border-radius:7px;border:1.5px solid #dc2626;background:#fef2f2;color:#dc2626;font-weight:700;font-size:11px;cursor:pointer">🗑 Anular Reporte</button>';
    h+='</div>';
  } else { h+='<div></div>'; }
  h+='<button onclick="document.getElementById(\'modalReporteDetalle\').remove()" style="padding:7px 18px;border-radius:7px;border:none;background:#f1f5f9;color:#475569;font-weight:700;font-size:11px;cursor:pointer">Cerrar</button></div>';
  h += '</div></div>';
  document.body.insertAdjacentHTML('beforeend', h);
}

function showToast(msg,type='success'){
  const t=document.getElementById('toast');
  const icons={success:'✅',error:'❌',info:'ℹ️',warning:'⚠️'};
  document.getElementById('toastIcon').textContent=icons[type]||'✅';
  document.getElementById('toastMsg').textContent=msg;
  t.className=`toast ${type} show`;
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3800);
}

// ═══════════════════════════════════════════════════════
// INCIDENCIA RÁPIDA — Modal (ya no es página)
// ═══════════════════════════════════════════════════════
function abrirIncidenciaRapidaModal(){
  var prev=document.getElementById('incRapModal');if(prev)prev.remove();
  var emps=STATE.empleadosCache||[];
  var empOpts=emps.map(function(e){return '<option value="'+e.nombre+'">'+e.nombre+' ('+(e.tiendas||[])[0]+')</option>';}).join('');
  var h='<div id="incRapModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px" onclick="this.remove()"><div style="background:#fff;border-radius:14px;width:95%;max-width:520px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()"><div class="modal-header"><h2>🚨 Agregar Incidencia</h2><button class="modal-close" onclick="document.getElementById(\'incRapModal\').remove()">✕</button></div><div style="flex:1;overflow-y:auto;padding:16px">';
  h+='<div class="grid-2"><div class="field"><label>Sede</label><select id="irSede"><option value="ST">Stan</option><option value="LB">LuceBien</option><option value="AL">Almacén</option><option value="TR">Trece</option></select></div>';
  h+='<div class="field"><label>Fecha</label><input type="date" id="irFecha" value="'+hoyLocal()+'"></div></div>';
  h+='<div class="field"><label>Colaborador involucrado</label><select id="irTrab"><option value="">— Seleccionar —</option>'+empOpts+'</select></div>';
  h+='<div class="field"><label>Tipo</label><select id="irTipo"><optgroup label="Uniforme"><option>No contar con el uniforme completo</option></optgroup><optgroup label="Seguridad al cerrar"><option>No colocar candados en su lugar al abrir</option><option>Cerrar mal puertas</option><option>No cerrar llaves del agua</option><option>No bajar cuchillas de luz</option></optgroup><optgroup label="Equipos eléctricos"><option>Dejar prendida la PC</option><option>Dejar prendidas las luces</option><option>Dejar prendida la plancha</option><option>No desconectar plancha</option></optgroup><optgroup label="Orden y limpieza"><option>Dejar desordenada la tienda</option></optgroup><optgroup label="Documentación"><option>No actualizar cuadernillos físicos</option><option>No subir lista de actividades diarias</option><option>No evaluó al turno anterior</option></optgroup><optgroup label="Graves"><option>Hurto o robo de prenda</option><option>Prenda entregada en mal estado</option><option>Accidente dentro del local</option><option>Conflicto grave con cliente</option><option>Faltante de caja significativo</option><option>Pérdida o extravío de documento</option><option>Daño en infraestructura</option></optgroup><optgroup label="Otros"><option>Otro (especificar)</option></optgroup></select></div>';
  h+='<div class="field"><label>Descripción</label><textarea id="irDesc" placeholder="Detalla lo ocurrido..." style="min-height:50px"></textarea></div>';
  h+='<div class="grid-2"><div class="field"><label>Nivel</label><select id="irNivel" onchange="document.getElementById(\'irPuntos\').value={Bajo:1,Medio:2,Alto:5}[this.value]||2"><option>Bajo</option><option selected>Medio</option><option>Alto</option></select></div>';
  h+='<div class="field"><label>Puntos penalidad</label><input type="number" id="irPuntos" min="0" max="20" value="2" step="0.5" style="font-weight:700;color:var(--red)"></div></div>';
  h+='<div class="field"><label>Tu código</label><input type="password" id="irCod" class="code-masked" placeholder="••••" inputmode="numeric" autocomplete="off"></div>';
  h+='</div><div class="modal-footer"><button class="btn btn-ghost" onclick="document.getElementById(\'incRapModal\').remove()">Cancelar</button><button class="btn btn-primary" onclick="enviarIncRapModal()">🚨 Registrar</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend',h);
  document.getElementById('irSede').value=STATE.sede||'ST';
  if(STATE.user?.cod)document.getElementById('irCod').value=STATE.user.cod;
}
async function enviarIncRapModal(){
  var sede=document.getElementById('irSede').value;
  var fecha=document.getElementById('irFecha').value;
  var trab=document.getElementById('irTrab').value;
  var tipo=document.getElementById('irTipo').value;
  var desc=document.getElementById('irDesc').value.trim();
  var nivel=document.getElementById('irNivel').value;
  var cod=document.getElementById('irCod').value.trim();
  if(!trab){showToast('Selecciona al colaborador involucrado','error');return;}
  if(!desc&&tipo==='Otro (especificar)'){showToast('Describe la incidencia','error');return;}
  if(!cod){showToast('Ingresa tu código','error');return;}
  var reporter=(STATE.empleadosCache||[]).find(function(e){return e.cod===cod;});
  if(!reporter){showToast('Código inválido','error');return;}
  var r=await API.crearIncidencia({sede:sede,fecha:fecha,tipo:tipo,descripcion:desc||tipo,nivel:nivel,responsable:trab,reportado_por:reporter.nombre,puntos_penalidad:parseFloat(document.getElementById('irPuntos')?.value)||0});
  if(r){document.getElementById('incRapModal')?.remove();showToast('🚨 Incidencia registrada para '+trab,'success');}
}


// ═══ EVAL TABS ═══
function switchEvalTab(tab, btn) {
  var ids = ['dashboard','evaluar','asistencias','pagos','valores','config'];
  ids.forEach(function(t){
    var el = document.getElementById('evalTab'+t.charAt(0).toUpperCase()+t.slice(1));
    if (el) el.style.display = (tab === t ? '' : 'none');
  });
  document.querySelectorAll('.eval-tab').forEach(function(t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  if (tab === 'dashboard' && typeof renderEvalMDashboard === 'function') renderEvalMDashboard();
  if (tab === 'asistencias') initAsistencias();
  if (tab === 'config') renderConfigEval();
  if (tab === 'pagos' && typeof renderEvalPagos === 'function') renderEvalPagos();
  if (tab === 'valores' && typeof cargarSeguimientoValores === 'function') {
    var inp = document.getElementById('evalVAdminMes');
    if (inp && !inp.value) inp.value = mesLocal();
    cargarSeguimientoValores();
  }
}

// ═══════════════════════════════════════════════════════
// BUTTON SELECT HELPERS
// ═══════════════════════════════════════════════════════
function btnSel(groupId, btn) {
  var container = btn.closest('.card-body') || btn.closest('.modal-body') || btn.parentElement.parentElement;
  container.querySelectorAll('[onclick*="' + groupId + '"]').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  var hiddenId = groupId.replace('Group', '');
  var hidden = document.getElementById(hiddenId);
  if (hidden) { hidden.value = btn.textContent.trim(); if (hidden.onchange) hidden.onchange(); }
  // Hide "Otro" text input if not Otro
  if (groupId === 'lavTipoGroup') {
    var otroInput = document.getElementById('lavTipoOtroInput');
    if (otroInput && btn.textContent.trim() !== 'Otro') otroInput.style.display = 'none';
  }
}

function btnColor(groupId, btn, color) {
  var container = document.getElementById(groupId);
  if (container) container.querySelectorAll('.btn-sel-color,.btn-color').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  var hiddenId = groupId.replace('Group', '');
  var hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = color;
}

function btnSelVal(groupId, hiddenId, btn, val) {
  var parent = btn.parentElement;
  parent.querySelectorAll('.btn-turno,.btn-sel').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  var hidden = document.getElementById(hiddenId);
  if (hidden) { hidden.value = val; if (hidden.onchange) hidden.onchange(); }
  // Trigger buildActTable for turno
  if (hiddenId === 'fr01Turno') buildActTable();
}


function updateReportSummary(){
  // Layout points
  var limpPts = LayoutMap.calcPoints(STATE._layoutZonas||[]);
  var turno = document.getElementById('fr01Turno')?.value || 'M';
  var tk = turno === 'T' ? 'tarde' : turno === 'C' ? 'ambos' : 'mañana';
  var limpTotal = 0;
  (STATE._layoutZonas||[]).forEach(function(z){
    if(z.tipo==='area') return;
    var zT = (z.turno||'ambos').toLowerCase();
    if(zT === 'ambos' || zT === tk || tk === 'ambos') limpTotal += (z.peso||0);
  });
  var el1 = document.getElementById('fr01ResLimp');
  if(el1) el1.textContent = parseFloat(limpPts.toFixed(1)) + '/' + parseFloat(limpTotal.toFixed(1));
  // Activities
  var done = 0, total = 0, actPts = 0, actTotal = 0;
  document.querySelectorAll('#actBody .act-chk').forEach(function(chk){
    total++;
    var peso = parseFloat(chk.dataset.peso)||0;
    actTotal += peso;
    if(chk.checked){ done++; actPts += peso; }
  });
  var el2 = document.getElementById('fr01ResAct');
  if(el2) el2.textContent = done + '/' + total;
  var el3 = document.getElementById('fr01ResTotal');
  if(el3) el3.textContent = parseFloat((limpPts + actPts).toFixed(1));
}
