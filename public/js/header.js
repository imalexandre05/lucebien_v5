// ═══════════════════════════════════════════════════════════════════════
// LUCEBIEN · public/js/header.js
//
// Header global fijo. Se muestra cuando hay sesión activa (STATE.user) y
// se oculta automáticamente en la pantalla de selección de sede / login.
// El reloj y la conexión arrancan apenas el header es visible — no
// esperan datos del usuario.
// ═══════════════════════════════════════════════════════════════════════

(function(){
  var DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  function pad(n){ return n<10?'0'+n:''+n; }
  function fmtDate(d){ return DIAS[d.getDay()]+' '+d.getDate()+' '+MESES[d.getMonth()]+' '+d.getFullYear(); }
  function fmtTime(d){ return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()); }

  var _ticksStarted = false;
  var _bellInterval = null;
  var _bellOpen = false, _userOpen = false, _bellData = null;

  // ── Mostrar/ocultar header según haya usuario ──────────────────────
  function ensureVisible(){
    var hdr = document.getElementById('lbHeader');
    if (!hdr) return false;
    var u = (typeof STATE !== 'undefined' && STATE.user) || null;
    var visible = !!u;
    hdr.style.display = visible ? '' : 'none';
    var main = document.querySelector('.main');
    if (main) {
      if (visible) main.classList.add('lb-main-shifted');
      else main.classList.remove('lb-main-shifted');
    }
    return visible;
  }

  // ── Reloj + estado de turno ────────────────────────────────────────
  function getHorariosTurno(){
    var cfg = (window._evalConfig || {});
    return {
      iM: cfg.hora_inicio_m || '08:00',
      fM: cfg.hora_fin_m    || '14:00',
      iT: cfg.hora_inicio_t || '14:00',
      fT: cfg.hora_fin_t    || '20:00'
    };
  }
  function parseHM(hm){ var p=(hm||'').split(':'); return {h:parseInt(p[0])||0,m:parseInt(p[1])||0}; }
  function calcTurnoActual(){
    var H = getHorariosTurno();
    var now = new Date();
    function dt(hm){ var p=parseHM(hm); var d=new Date(now); d.setHours(p.h,p.m,0,0); return d; }
    var iM=dt(H.iM), fM=dt(H.fM), iT=dt(H.iT), fT=dt(H.fT);
    if (now>=iM && now<fM) return { turno:'M', deadline:fM, msRestantes:fM-now };
    if (now>=iT && now<fT) return { turno:'T', deadline:fT, msRestantes:fT-now };
    return { turno:'cerrado', deadline:null, msRestantes:0 };
  }
  function fmtRestante(ms){
    if (ms<=0) return '—';
    var totalMin = Math.floor(ms/60000);
    var h = Math.floor(totalMin/60);
    var m = totalMin%60;
    if (h>0) return 'cierra en '+h+'h '+pad(m)+'m';
    return 'cierra en '+m+'m';
  }
  function tickClock(){
    var clock = document.getElementById('lbhClock');
    var fecha = document.getElementById('lbhFecha');
    if (!clock) return;
    var now = new Date();
    clock.textContent = fmtTime(now);
    if (fecha) fecha.textContent = fmtDate(now);

    var t = calcTurnoActual();
    var box = document.getElementById('lbhTurno');
    var val = document.getElementById('lbhTurnoVal');
    var dl  = document.getElementById('lbhTurnoDeadline');
    if (box && val && dl){
      box.classList.remove('warn','closed');
      if (t.turno==='cerrado'){
        val.textContent = 'Cerrado';
        dl.textContent  = '';
        box.classList.add('closed');
      } else {
        val.textContent = t.turno==='M' ? 'Mañana' : 'Tarde';
        dl.textContent  = '· '+fmtRestante(t.msRestantes);
        if (t.msRestantes>0 && t.msRestantes<=30*60*1000) box.classList.add('warn');
      }
    }
  }

  // ── Datos de usuario / sede ────────────────────────────────────────
  // Refrescamos las tiendas del user desde /api/auth/me cada vez que se
  // pinta. Esto resuelve el caso de "agregué una sede en gestión de
  // colaboradores y el selector del header no la mostró".
  var _meRefreshing = false;
  async function refrescarUserDesdeServer(){
    if (_meRefreshing) return;
    var u = (typeof STATE !== 'undefined' && STATE.user) || null;
    if (!u) return;
    _meRefreshing = true;
    try {
      var token = localStorage.getItem('lb_token');
      if (!token) { _meRefreshing = false; return; }
      var r = await fetch('/api/auth/me', { headers: { 'Authorization':'Bearer '+token } });
      if (r.ok) {
        var data = await r.json();
        if (data && data.user) {
          // Persistimos cambios en STATE.user (mantiene id/cod/sede pero refresca tiendas/rol)
          var oldKeyTiendas = (STATE.user.tiendas||[]).join(',');
          var newKeyTiendas = (data.user.tiendas||[]).join(',');
          STATE.user = Object.assign({}, STATE.user, data.user);
          try { localStorage.setItem('lb_user', JSON.stringify(STATE.user)); } catch(e){}
          if (oldKeyTiendas !== newKeyTiendas) paintUserAndSede();
        }
      }
    } catch(e) {}
    _meRefreshing = false;
  }

  function paintUserAndSede(){
    var u = (typeof STATE !== 'undefined' && STATE.user) || null;
    if (!u) return;
    var nm = document.getElementById('lbhUserName');
    var rl = document.getElementById('lbhUserRole');
    var av = document.getElementById('lbhAvatar');
    if (nm) nm.textContent = u.nombre || u.cod || '—';
    if (rl) rl.textContent = (u.rol || '').replace(/_/g,' ');
    if (av) av.textContent = (u.iniciales) || (u.nombre||u.cod||'?').slice(0,2).toUpperCase();

    // El selector de sede del header se oculta — la sede ahora vive en
    // el sidebar como botón clickeable elegante (abrirSelectorSede en
    // app.js). Mantenemos el wrap por compat pero siempre escondido.
    var wrap = document.getElementById('lbhSedeWrap');
    if (wrap) wrap.style.display='none';
  }
  window.lbhCambiarSede = function(s){
    if (typeof STATE === 'undefined') return;
    STATE.sede = s;
    try { localStorage.setItem('lb_sede', s); } catch(e){}
    location.reload();
  };

  // ── Título de la página ────────────────────────────────────────────
  function paintPageTitle(pageId){
    var el = document.getElementById('lbhPageTitle');
    if (!el) return;
    var meta = (window.PAGES_CONFIG && PAGES_CONFIG[pageId]) || null;
    if (meta) el.textContent = meta.label;
    else if (pageId) el.textContent = pageId.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
    else el.textContent = '—';
  }
  window.lbhSetPage = paintPageTitle;
  function syncCurrentPage(){
    var active = document.querySelector('.page.active');
    if (active) paintPageTitle((active.id||'').replace('page-',''));
  }

  // ── Conexión ───────────────────────────────────────────────────────
  async function tickConn(){
    var box = document.getElementById('lbhConn');
    if (!box) return;
    var lbl = box.querySelector('.lbh-conn-lbl');
    try {
      var ctrl = new AbortController();
      var to = setTimeout(function(){ ctrl.abort(); }, 4000);
      var r = await fetch('/api/test', { cache:'no-store', signal:ctrl.signal });
      clearTimeout(to);
      if (r.ok){ box.classList.remove('off'); box.classList.add('ok'); if(lbl) lbl.textContent='en línea'; return; }
      throw new Error('no ok');
    } catch(e) {
      box.classList.remove('ok'); box.classList.add('off');
      if (lbl) lbl.textContent='sin conexión';
    }
  }

  // ── Campana ────────────────────────────────────────────────────────
  var LBL_MIS = {
    solicitudes_por_confirmar: 'Solicitudes entregadas por confirmar',
    prendas_observadas:        'Prendas mías observadas',
    envios_sin_validar:        'Envíos a tu tienda sin validar',
    envios_acc_sin_validar:    'Envíos de accesorios sin validar',
    valores_pendientes:        'Compañeros que te falta evaluar',
    reporte_turno_pendiente:   'Reporte del turno pendiente'
  };
  var GO_MIS = {
    solicitudes_por_confirmar: 'solicitudes',
    prendas_observadas:        'kanban-almacen',
    envios_sin_validar:        'pipeline-envios',
    envios_acc_sin_validar:    'pipeline-envios',
    valores_pendientes:        'eval-valores',
    reporte_turno_pendiente:   'reporte'
  };
  var LBL_SIS = {
    reportes_sin_evaluar:        'Reportes sin evaluar',
    solicitudes_pendientes:      'Solicitudes pendientes',
    solicitudes_sin_confirmar:   'Solicitudes sin confirmar',
    envios_sin_validar:          'Envíos sin validar',
    incidencias_hoy:             'Incidencias de hoy',
    prendas_observadas:          'Prendas observadas',
    empleados_sin_fecha_ingreso: 'Empleados sin fecha de ingreso'
  };
  var GO_SIS = {
    reportes_sin_evaluar:      'reporte',
    solicitudes_pendientes:    'solicitudes',
    solicitudes_sin_confirmar: 'solicitudes',
    envios_sin_validar:        'pipeline-envios',
    incidencias_hoy:           'incidencias-admin',
    prendas_observadas:        'kanban-almacen',
    empleados_sin_fecha_ingreso:'empleados'
  };

  async function tickBell(){
    if (typeof STATE === 'undefined' || !STATE.user) return;
    try {
      var token = localStorage.getItem('lb_token');
      if (!token) return;
      var r = await fetch('/api/notificaciones/pendientes', {
        headers: { 'Authorization':'Bearer '+token },
        cache:'no-store'
      });
      if (!r.ok) return;
      var d = await r.json();
      _bellData = d;
      // Calcular el badge SOLO con lo accesible para este usuario
      // (canAccess filtra módulos no permitidos).
      function _sumAccesibles(bag, gotos){
        if (!bag) return 0;
        var s = 0;
        Object.keys(bag).forEach(function(k){
          var n = bag[k]||0; if (!n) return;
          var g = gotos[k] || 'reporte';
          if (typeof canAccess !== 'function' || canAccess(g)) s += n;
        });
        return s;
      }
      var total = _sumAccesibles(d.mis, GO_MIS) + _sumAccesibles(d.sistema, GO_SIS);
      var btn = document.getElementById('lbhBell');
      var bdg = document.getElementById('lbhBellBadge');
      if (btn && bdg) {
        if (total>0){
          bdg.style.display='';
          bdg.textContent = total>99 ? '99+' : String(total);
          btn.classList.add('has-pend');
        } else {
          bdg.style.display='none';
          btn.classList.remove('has-pend');
        }
      }
      if (_bellOpen) renderBellPop();
    } catch(e) {}
  }

  // Verificación de acceso real al módulo destino: si el usuario no
  // puede entrar a la página `goto`, no tiene sentido mostrarle la
  // notificación. Si canAccess no está disponible, asumimos true.
  function userCanAccess(pageId){
    try { if (typeof canAccess === 'function') return canAccess(pageId); }
    catch(e){}
    return true;
  }

  function renderBellPop(){
    var pop = document.getElementById('lbhBellPop');
    if (!pop || !_bellData) return;
    var html = '';
    html += '<div class="lbh-pop-section">';
    html += '<div class="lbh-pop-title">Mis pendientes</div>';
    var any = false;
    Object.keys(_bellData.mis||{}).forEach(function(k){
      var n = _bellData.mis[k]; if (!n) return;
      var goto = GO_MIS[k] || 'reporte';
      if (!userCanAccess(goto)) return; // ocultar si no tiene permiso
      any = true;
      var cls = n>=5?' urg':n>=2?' warn':'';
      html += '<div class="lbh-pop-item'+cls+'" onclick="goTo(\''+goto+'\');lbhCloseAll()">'+
              '<div class="lbh-pop-item-lbl">'+(LBL_MIS[k]||k)+'</div>'+
              '<div class="lbh-pop-item-num">'+n+'</div></div>';
    });
    if (!any) html += '<div class="lbh-pop-empty">Sin pendientes accionables ✓</div>';
    html += '</div>';
    if (_bellData.sistema){
      html += '<div class="lbh-pop-section">';
      html += '<div class="lbh-pop-title">Sistema (supervisión)</div>';
      var any2 = false;
      Object.keys(_bellData.sistema).forEach(function(k){
        var n = _bellData.sistema[k]; if (!n) return;
        var goto = GO_SIS[k] || 'reporte';
        if (!userCanAccess(goto)) return;
        any2 = true;
        var cls = n>=10?' urg':n>=3?' warn':'';
        html += '<div class="lbh-pop-item'+cls+'" onclick="goTo(\''+goto+'\');lbhCloseAll()">'+
                '<div class="lbh-pop-item-lbl">'+(LBL_SIS[k]||k)+'</div>'+
                '<div class="lbh-pop-item-num">'+n+'</div></div>';
      });
      if (!any2) html += '<div class="lbh-pop-empty">Sistema al día ✓</div>';
      html += '</div>';
    }
    pop.innerHTML = html;
  }

  window.lbhToggleBell = function(){
    _bellOpen = !_bellOpen;
    var pop = document.getElementById('lbhBellPop');
    if (pop) pop.style.display = _bellOpen ? '' : 'none';
    if (_bellOpen) {
      _userOpen = false;
      var up = document.getElementById('lbhUserPop'); if (up) up.style.display='none';
      renderBellPop();
      tickBell(); // refresh on open
    }
  };
  window.lbhToggleUser = function(){
    _userOpen = !_userOpen;
    var pop = document.getElementById('lbhUserPop');
    if (pop) pop.style.display = _userOpen ? '' : 'none';
    if (_userOpen) {
      _bellOpen = false;
      var bp = document.getElementById('lbhBellPop'); if (bp) bp.style.display='none';
    }
  };
  window.lbhCloseAll = function(){
    _bellOpen = false; _userOpen = false;
    var bp = document.getElementById('lbhBellPop'); if (bp) bp.style.display='none';
    var up = document.getElementById('lbhUserPop'); if (up) up.style.display='none';
  };

  document.addEventListener('click', function(e){
    if (e.target.closest('#lbhBell, #lbhBellPop, #lbhUser, #lbhUserPop')) return;
    lbhCloseAll();
  });

  // ── Hook a goTo para sincronizar título ────────────────────────────
  function hookGoTo(){
    if (typeof window.goTo !== 'function' || window._goToHooked) return;
    var orig = window.goTo;
    window.goTo = function(pageId, btn){
      try { paintPageTitle(pageId); } catch(e){}
      return orig.apply(this, arguments);
    };
    window._goToHooked = true;
  }

  // ── Arranque ────────────────────────────────────────────────────────
  function startTicksOnce(){
    if (_ticksStarted) return;
    _ticksStarted = true;
    tickClock();   setInterval(tickClock, 1000);
    tickConn();    setInterval(tickConn,  20000);
  }

  function watchUser(){
    var prevUser = null;
    var prevPage = null;
    setInterval(function(){
      var visible = ensureVisible();
      if (!visible){
        if (_bellInterval){ clearInterval(_bellInterval); _bellInterval = null; }
        prevUser = null;
        return;
      }
      // Header visible → garantizar reloj/conexión activos
      startTicksOnce();
      hookGoTo();

      var u = (typeof STATE !== 'undefined' && STATE.user) || null;
      var sig = u ? (u.id+'|'+u.nombre+'|'+u.rol+'|'+u.sede+'|'+((u.tiendas||[]).join(','))) : null;
      if (sig !== prevUser){
        paintUserAndSede();
        prevUser = sig;
        // Arrancar campana si aún no
        if (!_bellInterval){
          tickBell();
          _bellInterval = setInterval(tickBell, 30000);
        }
      }
      // Cada ~30s refrescamos el user contra el server para captar
      // cambios hechos en gestión de colaboradores (ej. nueva sede asignada)
      if (!window._meLastRefresh || (Date.now() - window._meLastRefresh) > 30000) {
        window._meLastRefresh = Date.now();
        refrescarUserDesdeServer();
      }

      // Sincronizar título de página actual (por si cambió fuera de goTo)
      var active = document.querySelector('.page.active');
      var pageId = active ? (active.id||'').replace('page-','') : null;
      if (pageId && pageId !== prevPage){
        paintPageTitle(pageId);
        prevPage = pageId;
      }
    }, 800);
  }

  function start(){
    // Header empieza oculto hasta que haya user
    var hdr = document.getElementById('lbHeader');
    if (hdr) hdr.style.display = 'none';
    watchUser();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 100);
  } else {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(start, 100); });
  }
})();
