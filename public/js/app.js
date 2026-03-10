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
  setTimeout(() => document.getElementById('loginCode').focus(), 120);
}

function volverSedes() {
  closeModal('loginModal');
  STATE.sede = null;
  document.getElementById('sedeScreen').style.display = 'flex';
}

// ── LOGIN ─────────────────────────────────────────────
async function doLogin() {
  const cod = document.getElementById('loginCode').value.trim();
  const err = document.getElementById('loginError');
  if (!cod) return;
  const res = await API.login(cod, STATE.sede);
  if (!res) { err.style.display='block'; setTimeout(()=>err.style.display='none',3000); document.getElementById('loginCode').value=''; return; }
  API.setToken(res.token);
  API.setUser(res.user);
  STATE.user = res.user;
  err.style.display = 'none';
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
  document.getElementById('sbSedeName').textContent = SEDES[sede]?.label || sede;
  document.getElementById('sbAvatar').textContent   = u.iniciales;
  document.getElementById('sbName').textContent     = u.nombre;
  document.getElementById('sbRole').textContent     = u.rol==='admin' ? '👑 Administrador' : '👤 Trabajador';
  const isAL = sede === 'AL';
  document.querySelectorAll('.nav-tienda').forEach(el=>el.classList.toggle('hidden',isAL));
  document.querySelectorAll('.nav-almacen').forEach(el=>el.classList.toggle('hidden',!isAL));
  document.getElementById('navAdmin').classList.toggle('hidden', u.rol!=='admin');
  await cargarEmpleados();
  buildActTable();
  updateFR01Sub();
  iniciarAlertas();
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
    // Buscar reporte sin evaluar y bloqueado (enviado pero no evaluado)
    const pendiente = reportes.find(r => r.evaluado === 0 && r.bloqueado === 1);
    if (!pendiente) return;
    // Cargar detalles del reporte
    const detalle = await API.get('/reportes/' + encodeURIComponent(pendiente.id) + '/detalle');
    if (!detalle) return;
    // Restaurar STATE.fr01 para poder evaluar
    STATE.fr01.reportId = pendiente.id;
    STATE.fr01.bloqueado = true;
    STATE.fr01.enviado = true;
    STATE.fr01.trabajadoresTurno = detalle.trabajadores || [];
    STATE.fr01.actividadesRealizadas = (detalle.actividades || []).map(a => ({
      cod: a.cod, nombre: a.nombre, cat: a.cat, peso: a.peso, obs: a.obs || ''
    }));
    // Mostrar UI de evaluación
    document.getElementById('fr01Blocked')?.classList.add('show');
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
  document.querySelector('.sidebar').classList.remove('visible');
  document.querySelector('.main').classList.remove('visible');
  document.getElementById('loginCode').value = '';
  document.getElementById('sedeScreen').style.display = 'flex';
  renderSedeScreen();
}

// ── ALERTAS TEMPORALIZADAS ────────────────────────────
function iniciarAlertas() {
  checkAlertas();
  STATE.alertasTimer = setInterval(checkAlertas, 60000); // cada minuto
}

async function checkAlertas() {
  const box = document.getElementById('turnoAlertBox');
  if (!box || !STATE.sede) return;
  const now  = new Date();
  const hh   = now.getHours();
  const mm   = now.getMinutes();
  const data = await API.alertas(STATE.sede);
  if (!data) return;

  const { tieneM, tieneT, pendEval } = data;
  box.innerHTML = '';

  // Alerta mañana: aparece a las 13:50 (1:50pm) — se puede cerrar
  const mostrarAlertaM = (hh === 13 && mm >= 50) || hh >= 14;
  if (mostrarAlertaM && !tieneM) {
    box.innerHTML += `
      <div class="turno-alert-bar alerta-m" id="alertaM">
        ⚠️ <strong>Falta el reporte de Mañana</strong> — Es tarde, regístralo antes del cierre
        <button class="alerta-close" onclick="document.getElementById('alertaM').remove()" title="Cerrar">✕</button>
      </div>`;
  }

  // Alerta noche: aparece a las 20:00 — NO se puede cerrar hasta que se envíe reporte
  const mostrarAlertaN = hh >= 20;
  if (mostrarAlertaN && !tieneT && !STATE.fr01.bloqueado) {
    box.innerHTML += `
      <div class="turno-alert-bar alerta-n" id="alertaN">
        🔴 <strong>Falta el reporte de Tarde/Noche</strong> — No se puede cerrar hasta que envíes el reporte
      </div>`;
  }

  // Evaluación pendiente
  if (pendEval) {
    box.innerHTML += `
      <div class="turno-alert-bar alerta-m">
        📋 Hay reportes pendientes de <strong>evaluación</strong>
      </div>`;
  }

  // Si todo OK
  if (tieneM && tieneT && !pendEval) {
    box.innerHTML = `<div class="turno-alert-bar alerta-ok">✅ Ambos turnos reportados y evaluados hoy</div>`;
  }
}

// Quitar alerta de noche al enviar reporte
function quitarAlertaNoche() {
  document.getElementById('alertaN')?.remove();
}

// ── EMPLEADOS ─────────────────────────────────────────
async function cargarEmpleados() {
  const all = await API.empleados(STATE.sede);
  if (!all) return;
  STATE.empleadosCache = all;
  // Solo los de esta sede aparecen por defecto en los selects del turno
  const propios = all.filter(e => e.tiendas && e.tiendas.includes(STATE.sede));
  const otros   = all.filter(e => !e.tiendas || !e.tiendas.includes(STATE.sede));
  buildPersonaSelect('trabWrap', propios, otros, null);
  buildPersonaSelect('encWrap',  propios, otros, 2);
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
    if (s.max && s.selected.size >= s.max) { showToast(`Máximo ${s.max} encargados`,'error'); return; }
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
  if (cnt) cnt.textContent = wrapId==='encWrap' ? `${s.selected.size}/${s.max||2}` : `${s.selected.size} sel.`;
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
function buildActTable() {
  const acts = getActsBySede(STATE.sede);
  const body = document.getElementById('actBody'); if (!body) return;
  body.innerHTML = acts.map(a => `
    <tr id="act-row-${a.cod}">
      <td class="mono" style="font-size:10px;color:var(--text3)">${a.cod}</td>
      <td style="font-size:12.5px">${a.nombre}
        <span class="mono" style="font-size:9px;color:var(--text3);margin-left:4px">${a.peso}pts</span></td>
      <td style="white-space:nowrap"><span class="act-cat ${CAT.cls[a.cat]}">${CAT.labels[a.cat]}</span></td>
      <td style="text-align:center"><label class="toggle"><input type="checkbox" id="est-${a.cod}" onchange="updateActCount()"><span class="slider"></span></label></td>
      <td><input class="inline-input" id="obs-${a.cod}" placeholder="—"></td>
    </tr>`).join('');
  updateActCount();
  buildExtrasSection();
}

// Cargar y renderizar actividades extras (remuneradas + por puntos)
async function buildExtrasSection() {
  const box = document.getElementById('extrasBody'); if (!box) return;
  // Intentar cargar desde API
  let extras_p = [], extras_r = [];
  try {
    const data = await API.get('/actividades?sede=' + encodeURIComponent(STATE.sede) + '&fecha=' + new Date().toISOString().slice(0,10));
    if (data) { extras_p = data.extras_puntos || []; extras_r = data.extras_remuneradas || []; }
  } catch(e) {}
  // Fallback: si no hay extras en la API, no mostrar nada
  if (!extras_p.length && !extras_r.length) { box.innerHTML = '<div style="font-size:12px;color:var(--text3)">No hay actividades extras configuradas.</div>'; return; }
  STATE._extras_puntos = extras_p;
  STATE._extras_remuneradas = extras_r;

  let html = '';
  if (extras_r.length) {
    html += '<div style="font-size:11px;font-weight:700;color:var(--gold-d);margin-bottom:8px">💰 Remuneradas</div>';
    html += extras_r.map(a => `
      <div class="extra-row" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.04)">
        <span style="font-size:12px;flex:1">${a.nombre} <span style="color:var(--gold-d);font-weight:700">S/${Number(a.precio_unitario||0).toFixed(2)}/${a.unidad||'u'}</span></span>
        <input type="number" id="ext-${a.cod}" class="inline-input" style="width:60px;text-align:center" min="0" value="0" placeholder="0" onchange="updateExtrasResumen()">
        <input type="text" id="ext-det-${a.cod}" class="inline-input" style="width:120px" placeholder="Detalle">
      </div>`).join('');
  }
  if (extras_p.length) {
    html += '<div style="font-size:11px;font-weight:700;color:var(--navy);margin:12px 0 8px">⭐ Por puntos</div>';
    html += extras_p.map(a => `
      <div class="extra-row" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.04)">
        <span style="font-size:12px;flex:1">${a.nombre} <span style="color:var(--text3);font-size:10px">${a.peso}pts/${a.unidad||'u'}</span></span>
        <input type="number" id="ext-${a.cod}" class="inline-input" style="width:60px;text-align:center" min="0" value="0" placeholder="0" onchange="updateExtrasResumen()">
        <input type="text" id="ext-det-${a.cod}" class="inline-input" style="width:120px" placeholder="Detalle">
      </div>`).join('');
  }
  box.innerHTML = html;
  updateExtrasResumen();
}

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
  return extras;
}

function marcarTodas(val) {
  getActsBySede(STATE.sede).forEach(a => {
    const el = document.getElementById('est-' + a.cod); if (el) el.checked = val;
  });
  updateActCount();
}

function updateActCount() {
  const acts = getActsBySede(STATE.sede);
  const done = acts.filter(a => document.getElementById('est-'+a.cod)?.checked).length;
  const el   = document.getElementById('fr01ActCount');
  if (el) el.textContent = `${done}/${acts.length} completadas`;
  let pts=0, max=0;
  acts.forEach(a => { max+=a.peso; if (document.getElementById('est-'+a.cod)?.checked) pts+=a.peso; });
  const pEl = document.getElementById('fr01Puntaje');
  if (pEl) pEl.textContent = max>0 ? `Puntaje máximo: ${Math.round(pts/max*100)}% (sin evaluar)` : '';
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
function openObsPortal(wrapId, hiddenId, opciones) {
  closeObsPortal();
  const wrap = document.getElementById(wrapId); if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  _obsPortal = document.createElement('div');
  _obsPortal.className = 'obs-dropdown-portal';
  _obsPortal.style.cssText = `top:${rect.bottom+4+window.scrollY}px;left:${rect.left}px;width:${rect.width}px`;
  const inp = wrap.querySelector('.tag-input-inner');
  const val = inp?.value.toLowerCase()||'';
  const opts = opciones.filter(o=>o.toLowerCase().includes(val));
  if (!opts.length) return;
  opts.forEach(o => {
    const d = document.createElement('div'); d.className='tag-opt'; d.textContent=o;
    d.onmousedown = e => { e.preventDefault(); addObsTag(hiddenId,o); renderObsTagsInWrap(wrapId,hiddenId); _obsPortal?.remove(); _obsPortal=null; };
    _obsPortal.appendChild(d);
  });
  document.body.appendChild(_obsPortal);
}
function closeObsPortal() { _obsPortal?.remove(); _obsPortal=null; }
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
function agregarLavItem() {
  const cod   = document.getElementById('lavCodigo')?.value.trim().toUpperCase();
  const tipo  = document.getElementById('lavTipo')?.value;
  const color = document.getElementById('lavColor')?.value.trim();
  const talla = document.getElementById('lavTalla')?.value;
  let obs=[]; try{obs=JSON.parse(document.getElementById('lavObs')?.value||'[]');}catch(e){obs=[];}
  if (!cod)   { showToast('Ingresa el código','error'); return; }
  if (!color) { showToast('Ingresa el color','error'); return; }
  STATE.lavList.push({ cod, tipo, color, talla, obs, hora:new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}) });
  document.getElementById('lavCodigo').value=''; document.getElementById('lavColor').value='';
  document.getElementById('lavObs').value='[]';
  renderObsTagsInWrap('lavObsWrap','lavObs');
  renderLavTable(); showToast(`${tipo} ${cod} agregado`);
}

function renderLavTable() {
  const body=document.getElementById('lavBody'); if(!body) return;
  const cnt=document.getElementById('lavListCount'); if(cnt) cnt.textContent=STATE.lavList.length;
  if (!STATE.lavList.length){body.innerHTML='<tr><td class="empty-cell" colspan="8">Sin prendas en la lista</td></tr>';return;}
  body.innerHTML=STATE.lavList.map((p,i)=>`
    <tr>
      <td class="mono" style="font-size:10px;color:var(--text3)">${i+1}</td>
      <td><span class="badge badge-navy">${p.cod}</span></td>
      <td>${p.tipo}</td><td>${p.color}</td>
      <td><span class="badge badge-gold">${p.talla}</span></td>
      <td style="font-size:11px">${Array.isArray(p.obs)?p.obs.join(', '):(p.obs||'—')}</td>
      <td class="mono" style="font-size:10px;color:var(--text3)">${p.hora}</td>
      <td><button class="btn btn-danger btn-xs" onclick="STATE.lavList.splice(${i},1);renderLavTable()">✕</button></td>
    </tr>`).join('');
}

async function enviarListaLav() {
  const gen={camisas:+document.getElementById('lavCamisas')?.value||0,corbatas:+document.getElementById('lavCorbatas')?.value||0,michis:+document.getElementById('lavMichis')?.value||0,corbatones:+document.getElementById('lavCorbatones')?.value||0};
  const totalGen=Object.values(gen).reduce((s,v)=>s+v,0);
  if (!STATE.lavList.length&&!totalGen){showToast('La lista está vacía','error');return;}
  const resp_inv=document.getElementById('lavRespInv')?.value;
  const resp_traslado=document.getElementById('lavRespTraslado')?.value;
  showConfirm('¿Enviar lista a lavandería?',`${STATE.lavList.length} individuales · ${totalGen} generales`,async()=>{
    const r=await API.enviarLista({sede:STATE.sede,tipo:'LAV',items:STATE.lavList,generales:gen,resp_inv,resp_traslado,fecha:new Date().toISOString().slice(0,10)});
    if(r){STATE.lavList=[];['lavCamisas','lavCorbatas','lavMichis','lavCorbatones'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='0';});renderLavTable();showToast(`✅ Lista ${r.id} enviada`,'success');}
  },'🧺');
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
    const r=await API.enviarLista({sede:STATE.sede,tipo:'REF',items:STATE.refList,generales:{},fecha:new Date().toISOString().slice(0,10)});
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
  const emisorCod=document.getElementById('fr01Emisor')?.value;
  const trabs=getPS('trabWrap'),encs=getPS('encWrap');
  const acts=getActsBySede(STATE.sede);
  const done=acts.filter(a=>document.getElementById('est-'+a.cod)?.checked);
  if(!emisorCod){showToast('Ingresa tu código','error');return;}
  const emisorEmp=STATE.empleadosCache.find(e=>e.cod===emisorCod);
  if(!emisorEmp){showToast('Código inválido','error');return;}
  if(!trabs.includes(emisorEmp.nombre)){showToast(`❌ ${emisorEmp.nombre} no está en el turno — el código debe ser de un trabajador seleccionado`,'error');return;}
  if(!trabs.length){showToast('Selecciona trabajadores','error');return;}
  if(!encs.length){showToast('Selecciona encargados','error');return;}
  if(!done.length){showToast('Marca al menos una actividad','error');return;}
  const rid=genReporteId(SEDES[STATE.sede].abrev,turno);
  const max=acts.reduce((s,a)=>s+a.peso,0);
  const pts=done.reduce((s,a)=>s+a.peso,0);
  const puntaje=max>0?Math.round(pts/max*100):0;
  showConfirm('¿Enviar reporte?',`ID: ${rid}  ·  ${done.length} actividades  ·  ${emisorEmp.nombre}`,async()=>{
    // Incidencias del formulario
    const incs=[];
    document.querySelectorAll('.inc-row').forEach(row=>{
      const tipo=row.querySelector('select')?.value;
      const desc=row.querySelectorAll('input')[0]?.value;
      const nivel=row.querySelectorAll('select')[1]?.value?.replace(/[🔴🟡🟢]/g,'').trim();
      if(tipo)incs.push({tipo,descripcion:desc||'',nivel:nivel||'Medio',responsable:'—'});
    });
    const actData=done.map(a=>({cod:a.cod,nombre:a.nombre,cat:a.cat,peso:a.peso,obs:document.getElementById('obs-'+a.cod)?.value||''}));
    const extrasData=getExtrasData();
    const r=await API.enviarReporte({id:rid,sede:STATE.sede,turno,fecha:new Date().toISOString().slice(0,10),encargado:encs.join(', '),trabajadores:trabs,actividades:actData,extras:extrasData,incidencias:incs,puntaje,actTotal:acts.length,actDone:done.length});
    if(!r)return;
    STATE.fr01.reportId=rid;STATE.fr01.actividadesRealizadas=actData;STATE.fr01.trabajadoresTurno=[...trabs];
    STATE.fr01.bloqueado=true;STATE.fr01.enviado=true;
    document.getElementById('fr01Blocked')?.classList.add('show');
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

function limpiarFR01() {
  if(STATE.fr01.bloqueado){showToast('Completa la Evaluación primero','error');return;}
  buildActTable();
  document.getElementById('fr01Status').textContent='Sin enviar';document.getElementById('fr01Status').className='badge badge-gold';
  const b=document.getElementById('incBody');if(b)b.innerHTML='<div id="incPlaceholder" style="font-size:12px;color:var(--text3);font-family:var(--font-m)">Sin incidencias registradas.</div>';
}

// ── EVALUACIÓN ─────────────────────────────────────────
function prepararEval() {
  const realizadas=STATE.fr01.actividadesRealizadas;
  document.getElementById('evalNoReport').style.display='none';
  document.getElementById('evalContent').classList.remove('hidden');
  document.getElementById('evalIdDisplay').textContent=STATE.fr01.reportId;
  const ridBox=document.getElementById('evalReportId');ridBox.textContent=STATE.fr01.reportId;ridBox.classList.remove('hidden');
  document.getElementById('evalActCount').textContent=`${realizadas.length} actividades`;
  const turnoEmps=STATE.fr01.trabajadoresTurno;
  document.getElementById('evalExtWarning').innerHTML=`<strong>⚠️ El evaluante NO puede ser:</strong> ${turnoEmps.map(n=>`<span class="badge badge-navy" style="margin:2px">${n}</span>`).join('')}`;
  const body=document.getElementById('evalActBody');if(!body)return;
  if(!realizadas.length){body.innerHTML='<tr><td class="empty-cell" colspan="5">Sin actividades</td></tr>';return;}
  body.innerHTML=realizadas.map(a=>`
    <tr>
      <td class="mono" style="font-size:10px;color:var(--text3)">${a.cod}</td>
      <td style="font-size:12.5px">${a.nombre}<span class="mono" style="font-size:9px;color:var(--text3);margin-left:4px">${a.peso}pts</span></td>
      <td><span class="act-cat ${CAT.cls[a.cat]}">${CAT.labels[a.cat]}</span></td>
      <td><select class="inline-select" id="eval-cal-${a.cod}" onchange="calcEvalPreview()">
        <option value="1">✅ Aprobado (×1)</option>
        <option value="0.5">👁 Observado (×0.5)</option>
        <option value="0">❌ Rechazado (×0)</option>
      </select></td>
      <td><input class="inline-input" id="eval-obs-${a.cod}" placeholder="—"></td>
    </tr>`).join('');
  calcEvalPreview();
}

function calcEvalPreview() {
  const realizadas=STATE.fr01.actividadesRealizadas;
  let total=0,maxTotal=0;
  realizadas.forEach(a=>{const mult=parseFloat(document.getElementById('eval-cal-'+a.cod)?.value||'1');total+=a.peso*mult;maxTotal+=a.peso;});
  const allMax=getActsBySede(STATE.sede).reduce((s,a)=>s+a.peso,0);
  const pct=allMax>0?Math.round(total/allMax*100):0;
  const pEl=document.getElementById('evalPuntajePreview');
  if(pEl){const cls=pct>=85?'excellent':pct>=70?'good':pct>=50?'regular':'bad';pEl.className=`score-pill ${cls}`;pEl.textContent=`${pct}%`;}
}

async function triggerEnviarEval() {
  const codigo=document.getElementById('evalCodigo')?.value;
  const emp=STATE.empleadosCache.find(e=>e.cod===codigo);
  if(!emp){showToast('Código inválido','error');return;}
  if(STATE.fr01.trabajadoresTurno.includes(emp.nombre)){showToast(`❌ ${emp.nombre} estuvo en el turno — debe ser alguien externo`,'error');return;}
  const realizadas=STATE.fr01.actividadesRealizadas;
  let totalPts=0;
  realizadas.forEach(a=>{const mult=parseFloat(document.getElementById('eval-cal-'+a.cod)?.value||'1');totalPts+=a.peso*mult;});
  const allMax=getActsBySede(STATE.sede).reduce((s,a)=>s+a.peso,0);
  const puntajeEval=allMax>0?Math.round(totalPts/allMax*100):0;
  const cals=realizadas.map(a=>({cod:a.cod,cal:parseFloat(document.getElementById('eval-cal-'+a.cod)?.value||'1')}));
  showConfirm('¿Enviar evaluación?',`Evaluante: ${emp.nombre}  ·  ${puntajeEval}%`,async()=>{
    const r=await API.evaluarReporte(STATE.fr01.reportId,{evaluador:emp.nombre,calificaciones:cals,puntajeEval});
    if(!r)return;
    STATE.fr01.bloqueado=false;STATE.fr01.enviado=false;STATE.fr01.actividadesRealizadas=[];STATE.fr01.trabajadoresTurno=[];
    document.getElementById('fr01Blocked')?.classList.remove('show');
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
  const val=document.getElementById(inputId)?.value;
  const icon=document.getElementById(iconId),name=document.getElementById(nameId);
  if(!icon||!name)return;
  const emp=STATE.empleadosCache.find(e=>e.cod===val);
  if(emp){
    icon.textContent='✅';name.textContent=emp.nombre;name.style.color='var(--green)';
    if(inputId==='evalCodigo'&&STATE.fr01.trabajadoresTurno.includes(emp.nombre)){icon.textContent='❌';name.textContent=`${emp.nombre} — en el turno`;name.style.color='var(--red)';}
  } else {
    icon.textContent=val&&val.length>3?'❌':'—';name.textContent='';
  }
}

// ── INCIDENCIAS ────────────────────────────────────────
function addIncidencia() {
  const body=document.getElementById('incBody');
  document.getElementById('incPlaceholder')?.remove();
  const div=document.createElement('div');div.className='inc-row';
  div.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;margin-bottom:10px;padding:13px;background:var(--s3);border-radius:var(--r);border:1px solid var(--border-s);align-items:end';
  div.innerHTML=`
    <div class="field mb-0"><label>Tipo</label><select>${TIPOS_INCIDENCIA.map(t=>`<option>${t}</option>`).join('')}</select></div>
    <div class="field mb-0"><label>Descripción</label><input type="text" placeholder="Detalla..."></div>
    <div class="field mb-0"><label>Nivel</label><select><option>🔴 Alto</option><option>🟡 Medio</option><option>🟢 Bajo</option></select></div>
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
async function initEvalValores() {
  const mes=document.getElementById('evalVMes')?.value||new Date().toISOString().slice(0,7);
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

function abrirEvalValores(empId, nombre, iniciales) {
  document.getElementById('evalVEmpNombre').textContent=nombre;
  document.getElementById('evalVEmpId').value=empId;
  const form=document.getElementById('evalVForm');
  form.innerHTML=VALORES_NOMBRES.map((v,i)=>`
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
  // Inicializar con 3
  VALORES_NOMBRES.forEach((_,i)=>setLikert(i,3));
  openModal('evalVModal');
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
  const mes=document.getElementById('evalVMes')?.value||new Date().toISOString().slice(0,7);
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

function goTo(pageId,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+pageId)?.classList.add('active');
  if(el)el.classList.add('active');
  else document.querySelectorAll('.nav-item').forEach(n=>{if(n.getAttribute('onclick')?.includes(`'${pageId}'`))n.classList.add('active');});
  if(pageId==='almacen')renderAlmacenListas();
  if(pageId==='dashboard')renderDashboard();
  if(pageId==='empleados')renderEmpleados();
  if(pageId==='incidencias-admin')renderIncidenciasAdmin();
  if(pageId==='retorno')initRetorno();
  if(pageId==='evaluacion-mensual')initEvalMensual();
  if(pageId==='eval-valores')initEvalValores();
  if(pageId==='mi-desempeno')renderMiDesempeno();
  if(pageId==='prestamos'){renderPrestamos();renderBajas();}
  if(pageId==='garantias')renderGarantias();
  if(pageId==='pipeline')renderPipeline();
  if(pageId==='pipeline-envios')renderEnviosRecibidos();
  if(pageId==='solicitudes')renderSolicitudes();
}

function showToast(msg,type='success'){
  const t=document.getElementById('toast');
  const icons={success:'✅',error:'❌',info:'ℹ️',warning:'⚠️'};
  document.getElementById('toastIcon').textContent=icons[type]||'✅';
  document.getElementById('toastMsg').textContent=msg;
  t.className=`toast ${type} show`;
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3800);
}
