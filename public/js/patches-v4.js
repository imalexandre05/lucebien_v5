// ═══════════════════════════════════════════════════════
// LUCEBIEN · patches-v4.js v3 — FIXES DEFINITIVOS
// Carga DESPUÉS de patches-v3.js en index.html
// ═══════════════════════════════════════════════════════

(function(){
// ═══════════════════════════════════════════════════════
// 1. REPORTE: marcarTodas + updateReportSummary
// ═══════════════════════════════════════════════════════
window.marcarTodas = function(val) {
  (STATE._currentActs || getActsBySede(STATE.sede)).forEach(function(a) {
    var el = document.getElementById('est-' + a.cod);
    if (el) el.checked = val;
  });
  window.updateActCount();
  window.updateReportSummary();
};

window.updateReportSummary = function() {
  var limpPts = LayoutMap.calcPoints(STATE._layoutZonas || []);
  var turno = document.getElementById('fr01Turno')?.value || 'M';
  var tk = turno === 'T' ? 'tarde' : turno === 'C' ? 'ambos' : 'mañana';
  var limpTotal = 0;
  (STATE._layoutZonas || []).forEach(function(z) {
    if (z.tipo === 'area') return;
    var zT = (z.turno || 'ambos').toLowerCase();
    if (zT === 'ambos' || zT === tk || tk === 'ambos') limpTotal += (z.peso || 0);
  });
  var el1 = document.getElementById('fr01ResLimp');
  if (el1) el1.textContent = parseFloat(limpPts.toFixed(1)) + '/' + parseFloat(limpTotal.toFixed(1));
  var done = 0, total = 0, actPts = 0, actTotal = 0;
  document.querySelectorAll('#actBody .act-chk').forEach(function(chk) {
    total++;
    var peso = parseFloat(chk.dataset.peso) || 0;
    actTotal += peso;
    if (chk.checked) { done++; actPts += peso; }
  });
  var el2 = document.getElementById('fr01ResAct');
  if (el2) el2.textContent = done + '/' + total;
  var el3 = document.getElementById('fr01ResTotal');
  if (el3) el3.textContent = parseFloat((limpPts + actPts).toFixed(1));
  var el4 = document.getElementById('fr01ActCount');
  if (el4) el4.textContent = done + '/' + total + ' — ' + parseFloat(actPts.toFixed(1)) + '/' + parseFloat(actTotal.toFixed(1)) + ' pts';
};

// ═══════════════════════════════════════════════════════
// 2. EVALUACIÓN: 3 botones emoji (✅👁❌)
// ═══════════════════════════════════════════════════════
window._evalSelCal = function(btn) {
  var cod = btn.dataset.cod, val = btn.dataset.val;
  document.getElementById('eval-cal-' + cod).value = val;
  var colors = { '1': { bg: '#dcfce7', bd: '#16a34a' }, '0.5': { bg: '#fefce8', bd: '#ca8a04' }, '0': { bg: '#fee2e2', bd: '#dc2626' } };
  document.querySelectorAll('.eval-cal-btn[data-cod="' + cod + '"]').forEach(function(b) {
    var sel = b.dataset.val === val;
    var c = colors[b.dataset.val];
    b.style.border = '2px solid ' + (sel ? c.bd : 'transparent');
    b.style.background = sel ? c.bg : 'var(--s3)';
    b.style.transform = sel ? 'scale(1.15)' : 'scale(1)';
  });
  window.calcEvalPreview();
};

window.prepararEval = function() {
  var realizadas = STATE.fr01.actividadesRealizadas;
  document.getElementById('evalNoReport').style.display = 'none';
  document.getElementById('evalContent').classList.remove('hidden');
  document.getElementById('evalIdDisplay').textContent = STATE.fr01.reportId;
  var ridBox = document.getElementById('evalReportId');
  ridBox.textContent = STATE.fr01.reportId; ridBox.classList.remove('hidden');
  var turnoEmps = STATE.fr01.trabajadoresTurno;
  // Aviso de fecha: destaca si es de AYER o anterior
  var fechaBanner = '';
  if (STATE.fr01.pendFecha) {
    var hoy = new Date().toISOString().slice(0,10);
    var turnoL = {M:'Mañana',T:'Tarde',C:'Completo'}[STATE.fr01.pendTurno] || '';
    if (STATE.fr01.pendFecha < hoy) {
      fechaBanner = '<div style="margin-bottom:10px;padding:10px 12px;background:linear-gradient(90deg,#fef3c7,#fde68a);border:1.5px solid #f59e0b;border-radius:8px;font-size:12px;font-weight:600;color:#92400e">⏰ <strong>Evaluación pendiente de AYER</strong> — Reporte del ' + STATE.fr01.pendFecha + (turnoL?' ('+turnoL+')':'') + '. Debes completarla antes de registrar el reporte de hoy.</div>';
    } else {
      fechaBanner = '<div style="margin-bottom:10px;padding:8px 12px;background:var(--s3);border-radius:6px;font-size:11px;color:var(--text2)">📋 Reporte del ' + STATE.fr01.pendFecha + (turnoL?' — '+turnoL:'') + '</div>';
    }
  }
  var extEl = document.getElementById('evalExtWarning');
  extEl.innerHTML = fechaBanner + '<strong>⚠️ El evaluante NO puede ser:</strong> ' + turnoEmps.map(function(n) { return '<span class="badge badge-navy" style="margin:2px">' + n + '</span>'; }).join('');

  var tableActs = realizadas.filter(function(a) { return !a.cod.startsWith('OL_'); });
  var layoutActs = realizadas.filter(function(a) { return a.cod.startsWith('OL_'); });
  var body = document.getElementById('evalActBody');
  if (!body) return;

  document.getElementById('evalActCount').textContent = tableActs.length + ' actividades';

  // 3 botones emoji por actividad
  if (tableActs.length) {
    body.innerHTML = tableActs.map(function(a) {
      return '<tr>' +
        '<td class="mono" style="font-size:10px;color:var(--text3)">' + a.cod + '</td>' +
        '<td style="font-size:12.5px">' + a.nombre + '<span class="mono" style="font-size:9px;color:var(--text3);margin-left:4px">' + a.peso + 'pts</span></td>' +
        '<td><span class="act-cat ' + (CAT.cls[a.cat] || 'cat-po') + '">' + (CAT.labels[a.cat] || a.cat) + '</span></td>' +
        '<td><div style="display:flex;gap:3px">' +
          '<button type="button" class="eval-cal-btn" data-cod="' + a.cod + '" data-val="1" onclick="_evalSelCal(this)" style="padding:4px 10px;border-radius:6px;border:2px solid #16a34a;background:#dcfce7;cursor:pointer;font-size:16px;transition:all .15s" title="Aprobado">✅</button>' +
          '<button type="button" class="eval-cal-btn" data-cod="' + a.cod + '" data-val="0.5" onclick="_evalSelCal(this)" style="padding:4px 10px;border-radius:6px;border:2px solid transparent;background:var(--s3);cursor:pointer;font-size:16px;transition:all .15s" title="Observado">👁</button>' +
          '<button type="button" class="eval-cal-btn" data-cod="' + a.cod + '" data-val="0" onclick="_evalSelCal(this)" style="padding:4px 10px;border-radius:6px;border:2px solid transparent;background:var(--s3);cursor:pointer;font-size:16px;transition:all .15s" title="Rechazado">❌</button>' +
        '</div><input type="hidden" id="eval-cal-' + a.cod + '" value="1"></td>' +
        '<td><input class="inline-input" id="eval-obs-' + a.cod + '" placeholder="—"></td></tr>';
    }).join('');
  } else {
    body.innerHTML = '<tr><td class="empty-cell" colspan="5">Sin actividades en tabla</td></tr>';
  }

  // Layout eval map
  var elc = document.getElementById('evalLayoutCard');
  if (elc && STATE._layoutZonas && STATE._layoutZonas.length && layoutActs.length) {
    elc.style.display = '';
    var evalSel = {}, evalCals = {};
    layoutActs.forEach(function(a) { var cod = a.cod.replace('OL_', ''); evalSel[cod] = true; evalCals[cod] = 1; });
    STATE._evalLayoutSel = evalSel;
    STATE._evalLayoutCals = evalCals;
    LayoutMap.render('evalLayoutMap', STATE._layoutZonas, {
      turno: 'ambos', selected: evalSel, mode: 'eval', evalCals: evalCals,
      onToggle: function(cod, val) { STATE._evalLayoutCals[cod] = val; window.calcEvalPreview(); if (typeof updateEvalLayoutSummary === 'function') updateEvalLayoutSummary(); }
    });
    if (typeof updateEvalLayoutSummary === 'function') updateEvalLayoutSummary();
  } else if (elc) { elc.style.display = 'none'; }

  window.calcEvalPreview();
};

// ═══════════════════════════════════════════════════════
// 3. EVALUACIÓN: calcEvalPreview null-safe
// ═══════════════════════════════════════════════════════
window.calcEvalPreview = function() {
  var realizadas = STATE.fr01.actividadesRealizadas || [];
  var tableActs = realizadas.filter(function(a) { return !a.cod.startsWith('OL_'); });
  var total = 0, maxT = 0;
  tableActs.forEach(function(a) {
    var el = document.getElementById('eval-cal-' + a.cod);
    var m = el ? parseFloat(el.value) : 1;
    if (isNaN(m)) m = 1;
    total += a.peso * m; maxT += a.peso;
  });
  if (STATE._evalLayoutCals && STATE._evalLayoutSel) {
    (STATE._layoutZonas || []).forEach(function(z) {
      if (STATE._evalLayoutSel[z.cod] && z.tipo !== 'area') {
        var cal = STATE._evalLayoutCals[z.cod];
        if (cal === undefined || cal === null || isNaN(Number(cal))) cal = 1;
        total += (z.peso || 0) * Number(cal); maxT += (z.peso || 0);
      }
    });
  }
  var pct = maxT > 0 ? Math.round(total / maxT * 100) : 0;
  var pEl = document.getElementById('evalPuntajePreview');
  if (pEl) { pEl.className = 'score-pill ' + (pct >= 85 ? 'excellent' : pct >= 70 ? 'good' : pct >= 50 ? 'regular' : 'bad'); pEl.textContent = pct + '%'; }
};

// ═══════════════════════════════════════════════════════
// 4. EVALUACIÓN: evalLayoutMarkAll — PISO + CALLE
// ═══════════════════════════════════════════════════════
window.evalLayoutMarkAll = function(val) {
  if (!STATE._evalLayoutCals || !STATE._evalLayoutSel) return;
  Object.keys(STATE._evalLayoutSel).forEach(function(cod) {
    if (STATE._evalLayoutSel[cod]) STATE._evalLayoutCals[cod] = val;
  });
  var C = { 1: '#16a34a', 0.5: '#ca8a04', 0: '#dc2626' };
  var BG = { 1: '#dcfce7', 0.5: '#fefce8', 0: '#fee2e2' };
  var IC = { 1: '✅', 0.5: '👁', 0: '❌' };
  var ctn = document.getElementById('evalLayoutMap') || document;
  // PISO
  if (STATE._evalLayoutSel['PISO']) {
    var pb = ctn.querySelector('#lm-pb'); if (pb) { pb.style.borderColor = C[val]; pb.style.borderStyle = 'solid'; pb.style.background = BG[val]; }
    var pi = ctn.querySelector('#lm-pb-i'); if (pi) pi.textContent = IC[val];
    var pl = ctn.querySelector('#lm-pb-l'); if (pl) pl.style.color = C[val];
    var cv = ctn.querySelector('#lm-cv'); if (cv) { cv.style.borderColor = C[val]; cv.style.background = BG[val] + '44'; }
  }
  // CALLE
  if (STATE._evalLayoutSel['CALLE']) {
    var st = ctn.querySelector('#lm-st'); if (st) { st.style.borderColor = C[val]; st.style.borderStyle = 'solid'; st.style.background = BG[val]; }
    var si = ctn.querySelector('#lm-st-i'); if (si) si.textContent = IC[val];
    var sl = ctn.querySelector('#lm-st-l'); if (sl) sl.style.color = C[val];
  }
  // Re-render canvas zones
  if (STATE._layoutZonas) {
    LayoutMap._ec = STATE._evalLayoutCals;
    LayoutMap.render('evalLayoutMap', STATE._layoutZonas, {
      turno: 'ambos', selected: STATE._evalLayoutSel, mode: 'eval', evalCals: STATE._evalLayoutCals,
      onToggle: function(cod, v) { STATE._evalLayoutCals[cod] = v; window.calcEvalPreview(); if (typeof updateEvalLayoutSummary === 'function') updateEvalLayoutSummary(); }
    });
    // Re-apply PISO/CALLE after render (render resets DOM)
    setTimeout(function() {
      var ctn2 = document.getElementById('evalLayoutMap') || document;
      if (STATE._evalLayoutSel['PISO']) {
        var pb2 = ctn2.querySelector('#lm-pb'); if (pb2) { pb2.style.borderColor = C[val]; pb2.style.borderStyle = 'solid'; pb2.style.background = BG[val]; }
        var pi2 = ctn2.querySelector('#lm-pb-i'); if (pi2) pi2.textContent = IC[val];
        var pl2 = ctn2.querySelector('#lm-pb-l'); if (pl2) pl2.style.color = C[val];
        var cv2 = ctn2.querySelector('#lm-cv'); if (cv2) { cv2.style.borderColor = C[val]; cv2.style.background = BG[val] + '44'; }
      }
      if (STATE._evalLayoutSel['CALLE']) {
        var st2 = ctn2.querySelector('#lm-st'); if (st2) { st2.style.borderColor = C[val]; st2.style.borderStyle = 'solid'; st2.style.background = BG[val]; }
        var si2 = ctn2.querySelector('#lm-st-i'); if (si2) si2.textContent = IC[val];
        var sl2 = ctn2.querySelector('#lm-st-l'); if (sl2) sl2.style.color = C[val];
      }
    }, 50);
  }
  window.calcEvalPreview();
  if (typeof updateEvalLayoutSummary === 'function') updateEvalLayoutSummary();
  showToast('Limpieza: todo ' + ({ 1: 'aprobado', 0.5: 'observado', 0: 'rechazado' })[val], 'success');
};

// ═══════════════════════════════════════════════════════
// 4b. EVALUACIÓN: evalActMarkAll — compatible con botones emoji
// ═══════════════════════════════════════════════════════
window.evalActMarkAll = function(val) {
  var realizadas = STATE.fr01.actividadesRealizadas || [];
  var tableActs = realizadas.filter(function(a) { return !a.cod.startsWith('OL_'); });
  var colors = { '1': { bg: '#dcfce7', bd: '#16a34a' }, '0.5': { bg: '#fefce8', bd: '#ca8a04' }, '0': { bg: '#fee2e2', bd: '#dc2626' } };
  var sv = String(val);
  tableActs.forEach(function(a) {
    var hidden = document.getElementById('eval-cal-' + a.cod);
    if (hidden) hidden.value = sv;
    document.querySelectorAll('.eval-cal-btn[data-cod="' + a.cod + '"]').forEach(function(b) {
      var sel = b.dataset.val === sv;
      var c = colors[b.dataset.val];
      b.style.border = '2px solid ' + (sel ? c.bd : 'transparent');
      b.style.background = sel ? c.bg : 'var(--s3)';
      b.style.transform = sel ? 'scale(1.15)' : 'scale(1)';
    });
  });
  window.calcEvalPreview();
  var labels = { 1: '✅ aprobado', 0.5: '👁 observado', 0: '❌ rechazado' };
  showToast('Actividades: todo ' + labels[val], 'success');
};

// ═══════════════════════════════════════════════════════
// 5. EVALUACIÓN: triggerEnviarEval null-safe para SQLite
// ═══════════════════════════════════════════════════════
window.triggerEnviarEval = async function() {
  var codigo = document.getElementById('evalCodigo')?.value;
  var emp = STATE.empleadosCache.find(function(e) { return e.cod === codigo; });
  if (!emp) { showToast('Código inválido', 'error'); return; }
  if (STATE.fr01.trabajadoresTurno.includes(emp.nombre)) { showToast('❌ ' + emp.nombre + ' estuvo en el turno', 'error'); return; }
  var realizadas = STATE.fr01.actividadesRealizadas;
  var tableActs = realizadas.filter(function(a) { return !a.cod.startsWith('OL_'); });
  var totalPts = 0, maxPts = 0;
  var cals = tableActs.map(function(a) {
    var el = document.getElementById('eval-cal-' + a.cod);
    var m = el ? parseFloat(el.value) : 1;
    if (isNaN(m) || m === null || m === undefined) m = 1;
    m = Number(m);
    totalPts += a.peso * m; maxPts += a.peso;
    var obsEl = document.getElementById('eval-obs-' + a.cod);
    return { cod: a.cod, cal: m, obs: obsEl ? (obsEl.value || '') : '' };
  });
  if (STATE._evalLayoutCals && STATE._evalLayoutSel) {
    (STATE._layoutZonas || []).forEach(function(z) {
      if (STATE._evalLayoutSel[z.cod] && z.tipo !== 'area') {
        var cal = STATE._evalLayoutCals[z.cod];
        if (cal === undefined || cal === null || isNaN(Number(cal))) cal = 1;
        cal = Number(cal);
        totalPts += (z.peso || 0) * cal; maxPts += (z.peso || 0);
        cals.push({ cod: 'OL_' + z.cod, cal: cal, obs: '' });
      }
    });
  }
  var puntajeEval = maxPts > 0 ? Math.round(totalPts / maxPts * 100) : 0;
  showConfirm('¿Enviar evaluación?', 'Evaluante: ' + emp.nombre + '  ·  ' + puntajeEval + '%', async function() {
    var r = await API.evaluarReporte(STATE.fr01.reportId, { evaluador: emp.nombre, calificaciones: cals, puntajeEval: puntajeEval });
    if (!r) return;
    STATE.fr01.bloqueado = false; STATE.fr01.enviado = false; STATE.fr01.actividadesRealizadas = []; STATE.fr01.trabajadoresTurno = [];
    STATE._evalLayoutCals = null; STATE._evalLayoutSel = null;
    document.getElementById('fr01Blocked')?.classList.remove('show');
    var ov = document.getElementById('fr01Overlay'); if (ov) ov.style.display = 'none';
    var fc = document.getElementById('fr01Content'); if (fc) fc.style.display = '';
    document.getElementById('btnEnviarFR01').style.display = '';
    document.getElementById('fr01ReportId').classList.add('hidden');
    document.getElementById('evalBadge')?.classList.add('hidden');
    document.getElementById('evalNoReport').style.display = 'block';
    document.getElementById('evalContent').classList.add('hidden');
    limpiarFR01(); checkAlertas();
    showToast('✅ Evaluación enviada — ' + puntajeEval + '%', 'success');
  }, '⭐');
};

// ═══════════════════════════════════════════════════════
// 6. GESTIÓN ACTIVIDADES: fixes
// ═══════════════════════════════════════════════════════
window.gaToggleActivo = async function(id, val) {
  var act = (STATE._gaAllActs || []).find(function(x) { return x.id === id; });
  if (!act) { showToast('No encontrada', 'error'); return; }
  var payload = {
    nombre: act.nombre, categoria: act.categoria, tipo_act: act.tipo_act || 'obligatoria',
    peso: act.peso || 0, precio_unitario: act.precio_unitario || 0, unidad: act.unidad || 'unidad',
    turno: act.turno || 'ambos', aparece_dia: act.aparece_dia || 0,
    frecuencia_dias: act.frecuencia_dias || 0, dia_semana: act.dia_semana || '',
    acumula: act.acumula ? 1 : 0, orden: act.orden || 0, descuento: act.descuento || 0,
    activa: val ? 1 : 0
  };
  var r = await API.req('PUT', '/actividades/' + id, payload);
  if (r && r.ok) { showToast(val ? '✅ Activada' : '⏸ Deshabilitada', 'success'); gaCargarActividades(); }
  else { showToast('Error al cambiar estado', 'error'); }
};

window.gaEditarActividad = async function(id) {
  var sede = _gaSedeActiva || document.getElementById('gaSedeSelect')?.value;
  var acts = STATE._gaAllActs || await API.req('GET', '/actividades/admin' + (sede ? '?sede=' + sede : ''));
  var a = acts?.find(function(x) { return x.id === id; });
  if (!a) { showToast('Actividad no encontrada', 'error'); return; }
  document.getElementById('gaEditId').value = id;
  document.getElementById('gaModalTitle').textContent = 'Editar: ' + a.nombre;
  document.getElementById('gaActNombre').value = a.nombre;
  document.getElementById('gaEditId').dataset.cod = a.cod;
  document.getElementById('gaActPeso').value = a.peso;
  document.getElementById('gaActDescuento').value = a.descuento || 0;
  document.getElementById('gaActUnidad').value = a.unidad || 'unidad';
  document.getElementById('gaActOrden').value = a.orden || 0;
  gaSelTipo(a.tipo_act || 'obligatoria');
  document.getElementById('gaActCat').value = a.categoria || 'PO';
  if ((a.cod || '').match(/^[AB]S/)) gaSelSub('S'); else gaSelSub('T');
  var allActs = await API.req('GET', '/actividades/admin');
  var allSedes = (allActs || []).filter(function(x) { return x.cod === a.cod; }).map(function(x) { return x.sede; });
  gaSetSedes(allSedes.length ? allSedes : [a.sede]);
  gaSelTurno(a.turno || 'ambos');
  var freq = parseInt(a.frecuencia_dias) || 0;
  if (freq === 0 || freq === 1) gaSelFreq('diaria');
  else if (freq === 7) { gaSelFreq('semanal'); gaSetDias(a.dia_semana || ''); var sw = document.getElementById('gaActCadaSemanas'); if (sw) sw.value = parseInt(a.aparece_dia) || 1; }
  else { gaSelFreq('custom'); var ci = document.getElementById('gaActFreqCustom'); if (ci) ci.value = freq; document.getElementById('gaActFrecuencia').value = freq; }
  gaSetAcumula(!!a.acumula);
  openModal('gaModal');
};

window.gaGuardarActividad = async function() {
  var editId = document.getElementById('gaEditId').value;
  var tipo = document.getElementById('gaActTipoAct').value;
  var sedes = gaGetSedes();
  if (!sedes.length) { showToast('Selecciona al menos una sede', 'error'); return; }
  var nombre = document.getElementById('gaActNombre').value.trim();
  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }
  var cod;
  if (editId) { cod = document.getElementById('gaEditId').dataset.cod || ''; }
  else { var prefix = gaAutoCode(); var nums = (STATE._gaAllActs || []).filter(function(a) { return a.cod.startsWith(prefix); }).map(function(a) { return parseInt(a.cod.replace(prefix, '')) || 0; }); cod = prefix + String((nums.length ? Math.max.apply(null, nums) : 0) + 1).padStart(2, '0'); }
  var freqVal = document.getElementById('gaActFrecuencia').value;
  var payload = { cod: cod, nombre: nombre, categoria: tipo === 'por_puntos' ? 'EXT' : document.getElementById('gaActCat').value, tipo_act: tipo, peso: parseFloat(document.getElementById('gaActPeso').value) || 0, descuento: parseFloat(document.getElementById('gaActDescuento').value) || 0, turno: document.getElementById('gaActTurno').value || 'ambos', unidad: document.getElementById('gaActUnidad').value.trim() || 'unidad', frecuencia_dias: parseInt(freqVal) || 0, dia_semana: document.getElementById('gaActDiaSemana')?.value || '', aparece_dia: freqVal === '7' ? (parseInt(document.getElementById('gaActCadaSemanas')?.value) || 1) : 0, acumula: document.getElementById('gaActAcumula').checked, orden: parseInt(document.getElementById('gaActOrden').value) || 0, activa: true };
  var r;
  if (editId) {
    r = await API.req('PUT', '/actividades/' + editId, payload);
    if (r) await API.req('POST', '/actividades/sync-sedes', { cod: cod, sedes: sedes, payload: payload });
  } else {
    var ok = true;
    for (var i = 0; i < sedes.length; i++) { var rr = await API.req('POST', '/actividades', Object.assign({}, payload, { sede: sedes[i] })); if (!rr) ok = false; }
    r = ok;
  }
  if (r) { showToast(editId ? '✅ Actualizada' : '✅ Creada en ' + sedes.length + ' sede(s)', 'success'); closeModal('gaModal'); gaCargarActividades(); }
};

// Sync gaSedeSelect
(function() {
  var orig = window.gaSelSede;
  window.gaSelSede = function(s) { orig(s); var sel = document.getElementById('gaSedeSelect'); if (sel) sel.value = s || 'LB'; };
})();

// ═══════════════════════════════════════════════════════
// 7. LAYOUT: Quitar duplicar extra del header (solo 1)
// ═══════════════════════════════════════════════════════
window.gaDuplicarActividades = function() {
  if (!_gaSedeActiva) { showToast('Selecciona sede destino', 'error'); return; }
  var sedes = Object.keys(SEDES).filter(function(s) { return s !== _gaSedeActiva; });
  var prev = document.getElementById('gaDupModal'); if (prev) prev.remove();
  var m = document.createElement('div'); m.id = 'gaDupModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1200;display:flex;align-items:center;justify-content:center;padding:16px';
  m.onclick = function(e) { if (e.target === m) m.remove(); };
  var w = document.createElement('div');
  w.style.cssText = 'background:#fff;border-radius:14px;width:95%;max-width:380px;overflow:hidden';
  w.onclick = function(e) { e.stopPropagation(); };
  w.innerHTML = '<div style="padding:14px 18px;border-bottom:1px solid var(--border);font-weight:700;font-size:14px">Duplicar actividades</div><div style="padding:14px 18px"><div style="font-size:12px;color:var(--text2);margin-bottom:12px">Copiar actividades hacia <strong>' + (_gaSedeActiva ? SEDES[_gaSedeActiva]?.label || _gaSedeActiva : '') + '</strong> desde:</div><div style="display:flex;flex-direction:column;gap:6px">' + sedes.map(function(s) { return '<button class="btn btn-ghost" style="justify-content:flex-start;padding:10px 14px;font-size:13px" onclick="_gaDoDup(\'' + s + '\')">' + (SEDES[s]?.icon || '') + ' ' + (SEDES[s]?.label || s) + '</button>'; }).join('') + '</div></div><div style="padding:10px 18px;border-top:1px solid var(--border);text-align:right"><button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'gaDupModal\').remove()">Cancelar</button></div>';
  m.appendChild(w); document.body.appendChild(m);
};

// ═══════════════════════════════════════════════════════
// 8. LAYOUT: showConfirm con z-index alto para modales
// ═══════════════════════════════════════════════════════
var _origShowConfirm = window.showConfirm;
window.showConfirm = function(title, detail, fn, icon) {
  _origShowConfirm(title, detail, fn, icon || '📋');
  // Si hay modal de layout abierto, subir z-index del confirmModal
  var cm = document.getElementById('confirmModal');
  if (cm) {
    var layoutOpen = document.getElementById('gaLayoutModal') || document.getElementById('gaZonaModal');
    cm.style.zIndex = layoutOpen ? '9999' : '';
  }
};

// ═══════════════════════════════════════════════════════
// 9. LAYOUT: gaLayoutDeleteZona con z-index correcto
// ═══════════════════════════════════════════════════════
window.gaLayoutDeleteZona = function(idx) {
  var z = _gaLayoutZonas[idx]; if (!z) return;
  window.showConfirm('¿Eliminar zona?', z.cod + ' — ' + z.nombre, function() {
    var prefix = z.cod.replace(/[0-9]/g, '');
    _gaLayoutZonas.splice(idx, 1);
    var count = 0;
    _gaLayoutZonas.forEach(function(zz) {
      if (zz.cod.replace(/[0-9]/g, '') === prefix) { count++; zz.cod = prefix + String(count).padStart(2, '0'); }
    });
    _glmR();
    showToast('Eliminado', 'success');
  }, '🗑');
};

// ═══════════════════════════════════════════════════════
// 10. LAYOUT: Áreas atrás + "sobre mueble" con drag limitado
// ═══════════════════════════════════════════════════════
(function() {
  var origApplyVS = LayoutMap._applyVisualStyles;
  LayoutMap._applyVisualStyles = function(cId, zonas, opts) {
    origApplyVS(cId, zonas, opts);
    var box = document.getElementById(cId); if (!box) return;
    var cv = box.querySelector('#lm-cv'); if (!cv) return;

    cv.querySelectorAll('.lz-z').forEach(function(el) {
      var cod = el.dataset.cod; if (!cod) return;
      var z = zonas.find(function(x) { return x.cod === cod; }); if (!z) return;

      // Áreas: siempre z-index:1
      if (z.tipo === 'area') {
        el.style.zIndex = '1';
        el.style.pointerEvents = opts.editable ? 'auto' : 'none';
      }

      // "Sobre mueble": posicionar DENTRO del padre
      if ((z.nivel || 'piso') === 'sobre' && z.sobre_cod) {
        var parentEl = cv.querySelector('.lz-z[data-cod="' + z.sobre_cod + '"]');
        if (parentEl) {
          el.style.zIndex = '25';
          el.style.boxShadow = '0 3px 10px rgba(0,0,0,.35)';
          el.style.outline = '1.5px solid rgba(255,255,255,.5)';
          // Solo reposicionar si NO se movió manualmente (primera carga)
          if (!el.dataset.userMoved) {
            var pL = parseFloat(parentEl.style.left), pT = parseFloat(parentEl.style.top);
            var pW = parseFloat(parentEl.style.width), pH = parseFloat(parentEl.style.height);
            var myW = parseFloat(el.style.width), myH = parseFloat(el.style.height);
            var curL = parseFloat(el.style.left), curT = parseFloat(el.style.top);
            // Si está fuera del padre, moverlo adentro
            if (curL < pL || curL + myW > pL + pW || curT < pT || curT + myH > pT + pH) {
              el.style.left = (pL + (pW - myW) / 2) + '%';
              el.style.top = (pT + (pH - myH) / 2) + '%';
            }
          }
        }
      }
    });
  };

  // Override _drag para limitar "sobre mueble" dentro del padre
  var origDrag = LayoutMap._drag.bind(LayoutMap);
  LayoutMap._drag = function(box) {
    var cv = box.querySelector('#lm-cv'); if (!cv) return;
    var L = LayoutMap, d = null, mode = null, sx, sy, ol, ot, ow, oh, dir, parentBounds = null;

    cv.addEventListener('click', function(e) {
      if (e.target === cv || e.target.id === 'lm-cv') { L._edSel = null; L._updHandles(cv); }
    });

    cv.addEventListener('mousedown', function(e) {
      var handle = e.target.closest('.lz-handle');
      var zone = e.target.closest('[data-draggable]');
      if (!zone || zone === cv) return;
      e.preventDefault(); e.stopPropagation();
      d = zone; sx = e.clientX; sy = e.clientY;
      ol = parseFloat(zone.style.left); ot = parseFloat(zone.style.top);
      ow = parseFloat(zone.style.width); oh = parseFloat(zone.style.height);
      L._edSel = zone.dataset.cod; L._updHandles(cv);

      // Calcular límites del padre si es "sobre mueble"
      parentBounds = null;
      var cod = zone.dataset.cod;
      var z = L._zonas.find(function(x) { return x.cod === cod; });
      if (z && z.nivel === 'sobre' && z.sobre_cod) {
        var parentEl = cv.querySelector('.lz-z[data-cod="' + z.sobre_cod + '"]');
        if (parentEl) {
          parentBounds = {
            left: parseFloat(parentEl.style.left),
            top: parseFloat(parentEl.style.top),
            width: parseFloat(parentEl.style.width),
            height: parseFloat(parentEl.style.height)
          };
        }
      }

      if (handle) { mode = 'resize'; dir = handle.dataset.dir; zone.style.zIndex = '100'; }
      else { mode = 'move'; zone.style.zIndex = '100'; zone.style.opacity = '.7'; }
    });

    document.addEventListener('mousemove', function(e) {
      if (!d) return;
      var r = cv.getBoundingClientRect();
      var dx = (e.clientX - sx) / r.width * 100, dy = (e.clientY - sy) / r.height * 100;

      if (mode === 'move') {
        var newL = ol + dx, newT = ot + dy;

        if (parentBounds) {
          // Limitar dentro del padre
          newL = Math.max(parentBounds.left, Math.min(parentBounds.left + parentBounds.width - ow, newL));
          newT = Math.max(parentBounds.top, Math.min(parentBounds.top + parentBounds.height - oh, newT));
        } else {
          newL = Math.max(0, Math.min(100 - ow, newL));
          newT = Math.max(0, Math.min(100 - oh, newT));
        }

        d.style.left = newL + '%';
        d.style.top = newT + '%';
      } else if (mode === 'resize') {
        var nl = ol, nt = ot, nw = ow, nh = oh;
        if (dir.indexOf('e') >= 0) nw = Math.max(1, ow + dx);
        if (dir.indexOf('w') >= 0) { nl = ol + dx; nw = Math.max(1, ow - dx); }
        if (dir.indexOf('s') >= 0) nh = Math.max(1, oh + dy);
        if (dir.indexOf('n') >= 0) { nt = ot + dy; nh = Math.max(1, oh - dy); }

        if (parentBounds) {
          nl = Math.max(parentBounds.left, nl);
          nt = Math.max(parentBounds.top, nt);
          if (nl + nw > parentBounds.left + parentBounds.width) nw = parentBounds.left + parentBounds.width - nl;
          if (nt + nh > parentBounds.top + parentBounds.height) nh = parentBounds.top + parentBounds.height - nt;
        }

        d.style.left = nl + '%'; d.style.top = nt + '%';
        d.style.width = nw + '%'; d.style.height = nh + '%';
      }
    });

    document.addEventListener('mouseup', function() {
      if (!d) return;
      d.style.opacity = '1'; d.style.zIndex = d.dataset.cod ? '10' : '4';
      d.dataset.userMoved = '1';
      var cod = d.dataset.cod, zIdx = L._zonas.findIndex(function(x){return x.cod===cod}), z = zIdx>=0?L._zonas[zIdx]:null;
      if (z) {
        z.pos_x = parseFloat(d.style.left) / 100 * 800;
        z.pos_y = parseFloat(d.style.top) / 100 * 580;
        z.ancho = parseFloat(d.style.width) / 100 * 800;
        z.alto = parseFloat(d.style.height) / 100 * 580;
        // FIX "mueble encima se revierte": al mover, llevar al final del array y del DOM
        // para garantizar stacking visual por encima de muebles debajo.
        if (mode === 'move' && z.tipo !== 'area') {
          L._zonas.splice(zIdx, 1); L._zonas.push(z);
          if (d.parentNode) d.parentNode.appendChild(d);
        }
        if (L._edCb) L._edCb(mode || 'move', cod, z);
      }
      // Restaurar z-index correcto
      if (z && z.nivel === 'sobre') d.style.zIndex = '25';
      else if (z && z.tipo === 'area') d.style.zIndex = '1';
      d = null; mode = null; parentBounds = null;
    });

    cv.addEventListener('dblclick', function(e) {
      var zone = e.target.closest('[data-draggable]');
      if (!zone || zone === cv) return;
      e.preventDefault();
      if (L._edCb) L._edCb('edit', zone.dataset.cod);
    });
  };
})();


// ═══════════════════════════════════════════════════════
// 11. INJECT: Quitar botón "Duplicar" extra
// ═══════════════════════════════════════════════════════
(function() {
  var origGoTo = window.goTo;
  var _injected = false;
  window.goTo = function(p, el) {
    origGoTo(p, el);
    if (p === 'gestion-actividades' && !_injected) {
      _injected = true;
      setTimeout(function() {
        document.querySelectorAll('#page-gestion-actividades .card-body button').forEach(function(b) {
          if (b.textContent.indexOf('Duplicar desde otra sede') >= 0 || b.textContent.indexOf('🔄') >= 0) b.style.display = 'none';
        });
      }, 100);
    }
  };
})();

console.log('[LuceBien] patches-v4.js v3 — ALL FIXES loaded');
})();
