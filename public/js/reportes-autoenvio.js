// ═══════════════════════════════════════════════════════════════
// LUCEBIEN · reportes-autoenvio.js — Auto-envío + drafts + alertas
// v1 — 2026-04
//
// Funciones principales:
//   1) Lock del FR-01 hasta que se elija encargado (lo ancla para auto-envío).
//   2) Autosave de draft cada 45s y en cada cambio relevante.
//   3) Restaurar draft al entrar al FR-01 (incluyendo encargado_id).
//   4) Alertas de deadline (14:00 turno M/C, 20:00 turno T/C).
//   5) Pre-fill encargado + colaboradores desde horario vigente.
//
// Dependencias globales: API (api.js), STATE, SEDES, showToast (app.js).
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var RA = {
    autosaveTimer: null,
    alertTimer: null,
    loaded: false,          // draft cargado para este turno
    currentKey: null,       // "sede|fecha|turno"
    alertsShown: {}         // { key: { '14':true, '20':true } }
  };
  window.LB_ReportesAutoEnvio = RA;

  function hoyLocalClient(){
    var d = new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  function curKey(){
    var turno = document.getElementById('fr01Turno')?.value || 'M';
    var sede = (window.STATE && STATE.sede) || '';
    return sede+'|'+hoyLocalClient()+'|'+turno;
  }

  // ── LOCK UI hasta que se elija encargado ──────────────────
  function aplicarLockEncargado(){
    if (!window.STATE || !STATE.fr01) return;
    if (STATE.fr01.bloqueado || STATE.fr01.enviado) return; // no interferir si ya envió
    var encs = (typeof getPS === 'function') ? getPS('encWrap') : [];
    var hayEnc = encs.length > 0;
    var content = document.getElementById('fr01Content');
    if (!content) return;
    // Cards a bloquear: todo dentro de fr01Content excepto la primera (Info General)
    var cards = content.querySelectorAll(':scope > .card');
    for (var i=1; i<cards.length; i++){
      cards[i].classList.toggle('fr01-locked-card', !hayEnc);
    }
    // Banner guía
    var guideId = 'fr01GuideEncargado';
    var guide = document.getElementById(guideId);
    if (!hayEnc) {
      if (!guide) {
        guide = document.createElement('div');
        guide.id = guideId;
        guide.className = 'fr01-guide-banner';
        guide.innerHTML = '<strong>👤 Elige al encargado del turno para continuar.</strong> ' +
          '<span style="opacity:.85">Si el turno se cierra sin enviar, el sistema enviará automáticamente el reporte en su nombre.</span>';
        content.insertBefore(guide, cards[1] || null);
      }
      guide.style.display = '';
    } else if (guide) {
      guide.style.display = 'none';
    }
  }

  // ── PRE-FILL desde horario vigente (encargado + colaboradores) ──
  async function prefillDesdeHorario(){
    if (!window.STATE || !STATE.sede) return;
    if (STATE.fr01.bloqueado || STATE.fr01.enviado) return;
    var turno = document.getElementById('fr01Turno')?.value || 'M';
    var fecha = hoyLocalClient();
    try{
      var enc = await API.req('GET', '/horarios/encargado?sede='+encodeURIComponent(STATE.sede)+'&fecha='+encodeURIComponent(fecha)+'&turno='+encodeURIComponent(turno));
      var slots = await API.req('GET', '/horarios/del-dia?sede='+encodeURIComponent(STATE.sede)+'&fecha='+encodeURIComponent(fecha)+'&turno='+encodeURIComponent(turno));
      if (enc && enc.emp_id) {
        // Marcar en PS el encargado si aún no hay selección
        var cur = (typeof getPS==='function') ? getPS('encWrap') : [];
        if (!cur.length && window._ps && _ps.encWrap) {
          _ps.encWrap.selected.add(enc.nombre);
          if (typeof renderPsList==='function') renderPsList('encWrap');
        }
      }
      if (slots && slots.length) {
        var trabCur = (typeof getPS==='function') ? getPS('trabWrap') : [];
        if (!trabCur.length && window._ps && _ps.trabWrap) {
          slots.forEach(function(s){ if (s && s.nombre) _ps.trabWrap.selected.add(s.nombre); });
          if (typeof renderPsList==='function') renderPsList('trabWrap');
        }
      }
    }catch(e){ /* silencioso — no todos tienen horario cargado */ }
    aplicarLockEncargado();
  }

  // ── DRAFT: recolectar payload del DOM ─────────────────────
  function recolectarPayload(){
    var trabs = (typeof getPS==='function') ? getPS('trabWrap') : [];
    var encs  = (typeof getPS==='function') ? getPS('encWrap')  : [];
    var acts  = STATE._currentActs || [];
    var actividades = [];
    acts.forEach(function(a){
      var chk = document.getElementById('est-'+a.cod);
      if (chk && chk.checked) {
        actividades.push({
          cod:a.cod, nombre:a.nombre, cat:a.cat, peso:a.peso, realizada:1,
          obs: (document.getElementById('obs-'+a.cod)?.value || '')
        });
      }
    });
    var extras = (typeof getExtrasData === 'function') ? getExtrasData() : [];
    var incidencias = [];
    document.querySelectorAll('.inc-row').forEach(function(row){
      var tipo = row.querySelector('.inc-tipo')?.value;
      if (!tipo) return;
      var desc = row.querySelector('.inc-desc')?.value || '';
      var resp = row.querySelector('.inc-resp')?.value || '—';
      var nivel = (row.querySelector('.inc-nivel')?.value || '').replace(/[🔴🟡🟢]/g,'').trim() || 'Medio';
      incidencias.push({tipo:tipo, descripcion:desc, nivel:nivel, responsable:resp});
    });
    return { trabajadores:trabs, actividades:actividades, extras:extras, incidencias:incidencias, encargados:encs };
  }

  // ── DRAFT: guardar ────────────────────────────────────────
  var _saveInFlight = false;
  async function guardarDraft(){
    if (!window.STATE || !STATE.sede || !STATE.fr01) return;
    if (STATE.fr01.bloqueado || STATE.fr01.enviado) return;
    if (_saveInFlight) return;
    var turno = document.getElementById('fr01Turno')?.value || 'M';
    var fecha = hoyLocalClient();
    var payload = recolectarPayload();
    // Si no hay encargado elegido y no hay contenido, no molestes al backend
    if (!payload.encargados.length && !payload.actividades.length && !payload.trabajadores.length) return;
    var encId = null, encNombre = null;
    if (payload.encargados.length && window.STATE.empleadosCache) {
      var e = STATE.empleadosCache.find(function(x){ return x.nombre === payload.encargados[0]; });
      if (e) { encId = e.id; encNombre = e.nombre; }
    }
    _saveInFlight = true;
    try{
      await API.saveDraft({
        sede:STATE.sede, fecha:fecha, turno:turno,
        encargado_id:encId, encargado_nombre:encNombre,
        payload:payload
      });
    }catch(e){ /* silencioso */ }
    finally{ _saveInFlight = false; }
  }

  // ── DRAFT: cargar al entrar ───────────────────────────────
  async function cargarDraft(){
    if (!window.STATE || !STATE.sede) return;
    var turno = document.getElementById('fr01Turno')?.value || 'M';
    var fecha = hoyLocalClient();
    var key = STATE.sede+'|'+fecha+'|'+turno;
    if (RA.currentKey === key && RA.loaded) return;
    RA.currentKey = key;
    try{
      var d = await API.getDraft(STATE.sede, fecha, turno);
      if (!d) { RA.loaded = true; return; }
      RA.loaded = true;
      var p = d.payload || {};
      // Restaurar encargado
      if (d.encargado_nombre && window._ps && _ps.encWrap && !_ps.encWrap.selected.has(d.encargado_nombre)) {
        _ps.encWrap.selected.add(d.encargado_nombre);
        if (typeof renderPsList==='function') renderPsList('encWrap');
      }
      // Restaurar trabajadores
      if (p.trabajadores && p.trabajadores.length && window._ps && _ps.trabWrap) {
        p.trabajadores.forEach(function(n){ _ps.trabWrap.selected.add(n); });
        if (typeof renderPsList==='function') renderPsList('trabWrap');
      }
      // Restaurar actividades check + obs
      (p.actividades||[]).forEach(function(a){
        var chk = document.getElementById('est-'+a.cod);
        if (chk) chk.checked = true;
        var obs = document.getElementById('obs-'+a.cod);
        if (obs && a.obs) obs.value = a.obs;
      });
      if (typeof updateActCount==='function') updateActCount();
      if (typeof updateReportSummary==='function') updateReportSummary();
      showToast('Borrador recuperado','success');
    }catch(e){}
  }

  // ── ALERTAS de deadline ───────────────────────────────────
  function verificarAlertas(){
    if (!window.STATE || !STATE.fr01) return;
    if (STATE.fr01.enviado) return;
    if (document.getElementById('page-fr01')?.classList.contains('hidden')) return;
    var now = new Date();
    var h = now.getHours(), m = now.getMinutes();
    var turno = document.getElementById('fr01Turno')?.value || 'M';
    var key = curKey();
    if (!RA.alertsShown[key]) RA.alertsShown[key] = {};
    // 14:00 → turno M o C sin enviar
    if ((turno==='M'||turno==='C') && h===14 && !RA.alertsShown[key]['14']) {
      RA.alertsShown[key]['14'] = true;
      showToast('⏰ Turno mañana: el reporte se cerrará a las 3:00pm. Completa y envía antes.','error');
    }
    // 20:00 → turno T o C sin enviar
    if ((turno==='T'||turno==='C') && h===20 && !RA.alertsShown[key]['20']) {
      RA.alertsShown[key]['20'] = true;
      showToast('⏰ Turno tarde: el reporte se cerrará a las 11:00pm. Completa y envía antes.','error');
    }
  }

  // ── Hook al entrar al FR-01 ───────────────────────────────
  function onEnterFR01(){
    setTimeout(function(){
      aplicarLockEncargado();
      cargarDraft().then(prefillDesdeHorario);
    }, 400); // esperar a que PS y actividades terminen de renderizar
    if (RA.autosaveTimer) clearInterval(RA.autosaveTimer);
    RA.autosaveTimer = setInterval(guardarDraft, 45*1000);
    if (RA.alertTimer) clearInterval(RA.alertTimer);
    RA.alertTimer = setInterval(verificarAlertas, 60*1000);
  }
  function onLeaveFR01(){
    if (RA.autosaveTimer) { clearInterval(RA.autosaveTimer); RA.autosaveTimer = null; }
    if (RA.alertTimer)    { clearInterval(RA.alertTimer);    RA.alertTimer = null; }
    // Flush final
    guardarDraft();
  }
  window.lbOnEnterFR01 = onEnterFR01;
  window.lbOnLeaveFR01 = onLeaveFR01;

  // Observar cambios en encargado (lock) y autosave ocasional
  document.addEventListener('click', function(ev){
    // Si clic cayó dentro de encWrap, re-verificar lock después del tick
    var t = ev.target;
    if (t && (t.closest && t.closest('#encWrap'))) {
      setTimeout(aplicarLockEncargado, 50);
      setTimeout(guardarDraft, 200);
    }
    if (t && (t.closest && t.closest('#trabWrap'))) {
      setTimeout(guardarDraft, 200);
    }
  });
  document.addEventListener('change', function(ev){
    var t = ev.target;
    if (!t) return;
    // Checkbox de actividad o input de obs
    if (t.classList && (t.classList.contains('act-chk') || t.id && t.id.indexOf('obs-')===0)) {
      setTimeout(guardarDraft, 100);
    }
    if (t.id === 'fr01Turno') {
      RA.loaded = false;
      RA.currentKey = null;
      setTimeout(function(){ cargarDraft(); aplicarLockEncargado(); }, 200);
    }
  });

  // Hook goTo sin romper comportamiento existente: wrap después de que app.js se cargue
  document.addEventListener('DOMContentLoaded', function(){
    try{
      var origGoTo = window.goTo;
      if (typeof origGoTo !== 'function') return;
      window.goTo = function(pageId, subId){
        var prev = document.querySelector('.page:not(.hidden)')?.id || '';
        var r = origGoTo.apply(this, arguments);
        try{
          if (pageId === 'fr01') onEnterFR01();
          else if (prev === 'page-fr01') onLeaveFR01();
        }catch(e){}
        return r;
      };
    }catch(e){}
  });
})();
