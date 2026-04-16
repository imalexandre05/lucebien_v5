// ═══════════════════════════════════════════════════════
// LUCEBIEN · patches-v5.js — Cambios globales del sistema
// Carga DESPUÉS de patches-v4.js
// ═══════════════════════════════════════════════════════
(function(){

// ═══════════════════════════════════════════════════════
// 1. LOGIN: Por nombre (case-insensitive) + contraseña obligatoria
// ═══════════════════════════════════════════════════════
window.doLogin = async function() {
  var nombre = document.getElementById('loginUser')?.value?.trim();
  var pass = document.getElementById('loginPass')?.value || '';
  var err = document.getElementById('loginError');
  if (!nombre) { showToast('Ingresa tu nombre de usuario', 'error'); return; }
  if (!pass) { showToast('Ingresa tu contraseña', 'error'); return; }
  var res = await API.post('/auth/login', { nombre: nombre, sede: STATE.sede, password: pass });
  if (!res) { if (err) err.style.display = 'block'; setTimeout(function() { if (err) err.style.display = 'none'; }, 3000); return; }
  API.setToken(res.token);
  API.setUser(res.user);
  STATE.user = res.user;
  if (err) err.style.display = 'none';
  // Clear fields immediately (no save)
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  closeModal('loginModal');
  mostrarApp();
};

// Toggle password visibility
window.togglePassVis = function(inputId, btn) {
  var inp = document.getElementById(inputId);
  if (!inp) return;
  var show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
};

// Rewrite login box on load
window.addEventListener('DOMContentLoaded', function() {
  var box = document.querySelector('.login-box');
  if (!box) return;
  // Replace code field with username + password
  var oldCode = document.getElementById('loginCode') || document.getElementById('loginNombre');
  var oldPassField = document.getElementById('loginPassField');
  if (oldCode) {
    var parent = oldCode.closest('.field');
    if (parent) {
      parent.innerHTML = '<label>Usuario (tu nombre)</label><input type="text" id="loginUser" placeholder="Ej: Jordan, Janet, Maritza..." autocomplete="off" autocapitalize="off" spellcheck="false" style="font-size:14px" onkeydown="if(event.key===\'Enter\')document.getElementById(\'loginPass\').focus()">';
    }
  }
  if (oldPassField) {
    oldPassField.style.display = '';
    oldPassField.innerHTML = '<label>Contraseña</label><div style="position:relative"><input type="password" id="loginPass" placeholder="••••••" autocomplete="off" onkeydown="if(event.key===\'Enter\')doLogin()" style="padding-right:36px"><button type="button" onclick="togglePassVis(\'loginPass\',this)" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;font-size:16px;padding:2px">👁</button></div>';
  }
  // If no oldPassField (already a visible password field), just ensure loginPass has toggle
  if (!oldPassField) {
    var passField = document.getElementById('loginPass');
    if (passField && !passField.parentElement.querySelector('button')) {
      var wrapper = document.createElement('div');wrapper.style.position='relative';
      passField.parentNode.insertBefore(wrapper, passField);wrapper.appendChild(passField);
      passField.style.paddingRight='36px';
      wrapper.insertAdjacentHTML('beforeend','<button type="button" onclick="togglePassVis(\'loginPass\',this)" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;font-size:16px;padding:2px">👁</button>');
    }
  }
  // Update subtitle
  var sub = document.querySelector('.login-sub');
  if (sub) sub.textContent = 'Ingresa tu nombre y contraseña';
});

// ═══════════════════════════════════════════════════════
// 2. ALERTAS: Luces exteriores 5:30pm y 6:30pm (solo tiendas)
// ═══════════════════════════════════════════════════════
var _origCheckAlertas = window.checkAlertas;
window.checkAlertas = async function() {
  await _origCheckAlertas();
  var box = document.getElementById('turnoAlertBox');
  if (!box || !STATE.sede) return;
  var esAlmacen = SEDES[STATE.sede]?.tipo === 'almacen';
  if (esAlmacen) return;
  var now = new Date(), hh = now.getHours(), mm = now.getMinutes();
  var t = hh * 60 + mm; // minutos del día
  // 5:30pm = 17:30 = 1050min
  if (t >= 1050 && t < 1080 && !document.getElementById('alertaLuces530')) {
    box.insertAdjacentHTML('afterbegin', '<div class="turno-alert-bar" id="alertaLuces530" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1.5px solid #f59e0b;color:#92400e;display:flex;align-items:center;gap:8px;animation:fadeIn .5s">💡 <strong>5:30 PM</strong> — Prender las luces exteriores de la tienda<button style="margin-left:auto;border:none;background:none;cursor:pointer;font-size:14px;color:#92400e" onclick="this.parentElement.remove()">✕</button></div>');
  }
  // 6:30pm = 18:30 = 1110min
  if (t >= 1110 && t < 1140 && !document.getElementById('alertaLuces630')) {
    box.insertAdjacentHTML('afterbegin', '<div class="turno-alert-bar" id="alertaLuces630" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1.5px solid #f59e0b;color:#92400e;display:flex;align-items:center;gap:8px;animation:fadeIn .5s">💡 <strong>6:30 PM</strong> — Verificar que las luces exteriores estén encendidas<button style="margin-left:auto;border:none;background:none;cursor:pointer;font-size:14px;color:#92400e" onclick="this.parentElement.remove()">✕</button></div>');
  }
};

// ═══════════════════════════════════════════════════════
// 3. INCIDENCIAS: tipos completos + no auto-reportarse
// ═══════════════════════════════════════════════════════
window.TIPOS_INCIDENCIA_COMPLETOS = [
  '— Uniforme —',
  'No contar con el uniforme completo',
  'Uniforme sucio o en mal estado',
  '— Seguridad al cerrar —',
  'No colocar candados en su lugar al abrir',
  'Cerrar mal puertas',
  'No cerrar llaves del agua',
  'No bajar cuchillas de luz',
  'No activar alarma de seguridad',
  '— Equipos eléctricos —',
  'Dejar prendida la PC',
  'Dejar prendidas las luces',
  'Dejar prendida la plancha',
  'No desconectar plancha',
  '— Orden y limpieza —',
  'Dejar desordenada la tienda',
  'No limpiar su área de trabajo',
  'Dejar mercadería fuera de lugar',
  '— Documentación —',
  'No actualizar cuadernillos físicos',
  'No subir lista de actividades diarias',
  'No evaluó al turno anterior',
  'No registrar venta en el sistema',
  'No actualizar cobros pendientes',
  '— Atención al cliente —',
  'Mala atención al cliente',
  'No ofrecer productos complementarios',
  'No hacer seguimiento a cliente',
  '— Puntualidad —',
  'Tardanza (sin justificación)',
  'Ausencia injustificada',
  'Salir antes de hora sin permiso',
  '— Graves —',
  'Hurto o robo de prenda',
  'Prenda entregada en mal estado',
  'Accidente dentro del local',
  'Conflicto grave con cliente',
  'Faltante de caja significativo',
  'Pérdida o extravío de documento',
  'Daño en infraestructura',
  'Uso de celular en horario de atención',
  '— Otros —',
  'Otro (especificar en descripción)'
];

// Override addIncidencia to use complete types + prevent self-report
window.addIncidencia = function() {
  var body = document.getElementById('incBody');
  document.getElementById('incPlaceholder')?.remove();
  var empNames = (STATE.empleadosCache || []).filter(function(e) {
    return e.nombre !== STATE.user?.nombre; // No puede reportarse a sí mismo
  }).map(function(e) { return e.nombre; });
  var tipoOpts = TIPOS_INCIDENCIA_COMPLETOS.map(function(t) {
    if (t.startsWith('—')) return '<optgroup label="' + t.replace(/—/g, '').trim() + '">';
    return '<option>' + t + '</option>';
  }).join('');
  var div = document.createElement('div'); div.className = 'inc-row';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:10px;margin-bottom:10px;padding:13px;background:var(--s3);border-radius:var(--r);border:1px solid var(--border-s);align-items:end';
  div.innerHTML = '<div class="field mb-0"><label>Tipo</label><select class="inc-tipo">' + tipoOpts + '</select></div>' +
    '<div class="field mb-0"><label>Descripción</label><input type="text" class="inc-desc" placeholder="Detalla..."></div>' +
    '<div class="field mb-0"><label>Colaborador involucrado</label><select class="inc-resp"><option value="—">— Sin asignar</option>' + empNames.map(function(n) { return '<option value="' + n + '">' + n + '</option>'; }).join('') + '</select></div>' +
    '<div class="field mb-0"><label>Nivel</label><select class="inc-nivel"><option>🔴 Alto</option><option>🟡 Medio</option><option>🟢 Bajo</option></select></div>' +
    '<button class="btn btn-danger btn-xs" onclick="this.closest(\'.inc-row\').remove()">✕</button>';
  body.appendChild(div);
};

// Override incidencia rápida modal — prevent self-report
var _origAbrirIncRap = window.abrirIncidenciaRapidaModal;
window.abrirIncidenciaRapidaModal = function() {
  _origAbrirIncRap();
  setTimeout(function() {
    var sel = document.getElementById('irTrab');
    if (sel && STATE.user) {
      // Remove self from options
      for (var i = sel.options.length - 1; i >= 0; i--) {
        if (sel.options[i].value === STATE.user.nombre) sel.remove(i);
      }
    }
    // Replace tipo select with complete list
    var tipoSel = document.getElementById('irTipo');
    if (tipoSel) {
      tipoSel.innerHTML = TIPOS_INCIDENCIA_COMPLETOS.map(function(t) {
        if (t.startsWith('—')) return '<optgroup label="' + t.replace(/—/g, '').trim() + '">';
        return '<option>' + t + '</option>';
      }).join('');
    }
  }, 50);
};

// ═══════════════════════════════════════════════════════
// 4. DEVICE-BASED SEDE: remember sede per device
// ═══════════════════════════════════════════════════════
// On sede select, save to localStorage
var _origSelectSede = window.selectSede;
window.selectSede = function(cod) {
  localStorage.setItem('lb_device_sede', cod);
  _origSelectSede(cod);
};

// On load, auto-select saved sede
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    var savedSede = localStorage.getItem('lb_device_sede');
    if (savedSede && SEDES[savedSede] && !API.token()) {
      // Auto-go to login for this sede
      selectSede(savedSede);
    }
  }, 300);
});

// ═══════════════════════════════════════════════════════
// 5. PREVENT CODE SAVING: autocomplete=off everywhere
// ═══════════════════════════════════════════════════════
// Global: prevent autofill on all code inputs
document.addEventListener('DOMContentLoaded', function() {
  setInterval(function() {
    document.querySelectorAll('.code-masked, input[type="password"]').forEach(function(inp) {
      inp.setAttribute('autocomplete', 'off');
      inp.setAttribute('data-lpignore', 'true');
      inp.setAttribute('data-form-type', 'other');
    });
  }, 2000);
});

// Clear code inputs when they lose focus (shared computers)
document.addEventListener('focusout', function(e) {
  if (e.target && e.target.classList.contains('code-masked') && e.target.id !== 'loginPass') {
    // Don't clear if it's in an active form being submitted
    setTimeout(function() {
      if (document.activeElement !== e.target && !e.target.closest('.modal-footer')) {
        // Keep value for validation but prevent browser from saving
      }
    }, 100);
  }
});

// ═══════════════════════════════════════════════════════
// 6. TERMINOLOGY: "colaborador" everywhere
// ═══════════════════════════════════════════════════════
window.EMP_ROLES_LABEL = {
  admin: '👑 Administrador',
  dueno: '👑 Dueña',
  encargado_tienda: '🏪 Encargado',
  encargado_almacen: '📦 Enc. Almacén',
  ventas_junior: '🛍 Ventas Jr.',
  ventas_junior_2: '🛍 Ventas Jr. 2',
  auxiliar: '📦 Auxiliar',
  confeccionista: '✂️ Confeccionista',
  trabajador: '👤 Colaborador'
};

// ═══════════════════════════════════════════════════════
// 7. INJECT CSS: Brand colors + no monospace + animations
// ═══════════════════════════════════════════════════════
(function() {
  var style = document.createElement('style');
  style.id = 'lb-brand-override';
  style.textContent = [
    // Brand color overrides
    ':root {',
    '  --navy: #2E3F6F;',
    '  --navy-d: #1e2a4a;',
    '  --navy-xd: #151d35;',
    '  --gold: #C7B400;',
    '  --gold-d: #A89500;',
    '  --gold-l: #D8C94A;',
    '  --blue: #3A4F85;',
    '  --text: #1A1A1A;',
    '  --text2: #3d3d3d;',
    '  --text3: #CCCCCC;',
    '  --s1: #F2F2F2;',
    '  --s2: #eaecf0;',
    '  --s3: #f5f5f0;',
    '  --font-m: "JetBrains Mono", "SF Mono", "Cascadia Code", monospace;',
    '}',
    // Replace mono class usage with brand font
    '.mono { font-family: "Inter", system-ui, sans-serif !important; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; font-weight: 500; }',
    // Badge refinements
    '.badge-navy { background: #2E3F6F; }',
    '.badge-gold { background: linear-gradient(135deg, #C7B400, #D8C94A); color: #1A1A1A; }',
    // Smooth animations
    '@keyframes fadeIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }',
    '.turno-alert-bar { animation: fadeIn .3s ease; }',
    // Sede cards brand feel
    '.sede-card { border: 1.5px solid rgba(46,63,111,.12); }',
    '.sede-card:hover { border-color: #C7B400; box-shadow: 0 8px 24px rgba(199,180,0,.15); }',
    // Score pills
    // Score pills — use original light style from style.css (no gradient overrides)
    // Category colors (keep original)
    '.cat-po { background: rgba(30,58,95,.1); color: #1e3a5f; border: 1px solid rgba(30,58,95,.2); }',
    '.cat-ind { background: rgba(13,105,57,.1); color: #0d6939; border: 1px solid rgba(13,105,57,.2); }',
    '.cat-so { background: rgba(124,94,16,.1); color: #7c5e10; border: 1px solid rgba(124,94,16,.2); }',
    '.cat-ext { background: rgba(109,40,217,.1); color: #6d28d9; border: 1px solid rgba(109,40,217,.2); }',
    // Login styling
    '.login-box { border: 1.5px solid rgba(199,180,0,.3); }',
    '.login-title { color: #2E3F6F; }',
    // Button primary brand
    '.btn-primary { background: linear-gradient(135deg, #2E3F6F, #3A4F85) !important; }',
    '.btn-primary:hover { background: linear-gradient(135deg, #3A4F85, #4a60a0) !important; }',
    // Sidebar brand
    '.sidebar { background: linear-gradient(180deg, #1e2a4a 0%, #2E3F6F 100%); }',
    '.sb-brand { color: #D8C94A; }',
    // Nav active
    '.nav-item.active { background: rgba(199,180,0,.15); border-left-color: #C7B400; }',
    // Code inputs - prevent autofill look
    'input[autocomplete="off"]:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px white inset !important; }',
  ].join('\n');
  document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════
// 8. API.login updated for name-based auth
// ═══════════════════════════════════════════════════════
API.login = function(nombre, sede, password) {
  return this.post('/auth/login', { nombre: nombre, sede: sede, password: password });
};

// Remove checkNeedsPassword (no longer needed)
window.checkNeedsPassword = function() {};

// ═══════════════════════════════════════════════════════
// 9. SIDEBAR COLLAPSE + NAV TOOLTIPS
// ═══════════════════════════════════════════════════════
window.toggleSidebar = function() {
  var sb = document.querySelector('.sidebar');
  if (!sb) return;
  sb.classList.toggle('collapsed');
  var btn = sb.querySelector('.sb-collapse-btn');
  if (btn) btn.innerHTML = sb.classList.contains('collapsed') ? '&#9654;' : '&#9664; Colapsar';
  localStorage.setItem('lb_sidebar_collapsed', sb.classList.contains('collapsed') ? '1' : '');
};

// Restore sidebar state + add tooltip labels
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    if (localStorage.getItem('lb_sidebar_collapsed') === '1') {
      var sb = document.querySelector('.sidebar');
      if (sb) { sb.classList.add('collapsed'); var btn = sb.querySelector('.sb-collapse-btn'); if (btn) btn.innerHTML = '&#9654;'; }
    }
    document.querySelectorAll('.nav-item').forEach(function(item) {
      var text = item.textContent.trim().replace(/[!]/g, '');
      item.setAttribute('data-label', text);
    });
  }, 200);
});

// ═══════════════════════════════════════════════════════
// 10. LAYOUT EDITOR: Recodificar + herramientas de edición
// ═══════════════════════════════════════════════════════

// ── 10a. Recodificar TODOS los muebles por tipo ──
// Excluye PISO y CALLE que son zonas especiales manejadas aparte.
window.gaRecodificarLayout = function() {
  if (!_gaLayoutZonas || !_gaLayoutZonas.length) { showToast('Sin zonas', 'error'); return; }
  var SPECIALS = ['PISO', 'CALLE'];
  var oldToNew = {};
  var counts = {};
  _gaLayoutZonas.forEach(function(z) {
    if (SPECIALS.indexOf(z.cod) >= 0) return; // no tocar PISO/CALLE
    var zt = _ZONA_TIPOS.find(function(t) { return t.v === z.tipo; });
    var prefix = zt ? zt.prefix : 'ZN';
    if (!counts[prefix]) counts[prefix] = 0;
    counts[prefix]++;
    var newCod = prefix + String(counts[prefix]).padStart(2, '0');
    if (z.cod !== newCod) oldToNew[z.cod] = newCod;
    z.cod = newCod;
  });
  // Fix sobre_cod references
  _gaLayoutZonas.forEach(function(z) {
    if (z.sobre_cod && oldToNew[z.sobre_cod]) z.sobre_cod = oldToNew[z.sobre_cod];
  });
  _glmR();
  var n = Object.keys(oldToNew).length;
  if (n) {
    var detail = Object.keys(oldToNew).slice(0, 8).map(function(k) { return k + ' → ' + oldToNew[k]; }).join(', ');
    if (n > 8) detail += '… y ' + (n - 8) + ' más';
    showToast(n + ' códigos corregidos: ' + detail, 'success');
  } else {
    showToast('Códigos ya están correctos', 'success');
  }
};

// ── 10b. Rotar zona (swap ancho/alto) ──
window.gaRotarZona = function(idx) {
  var z = _gaLayoutZonas[idx]; if (!z) return;
  var tmp = z.ancho; z.ancho = z.alto; z.alto = tmp;
  _glmR();
  showToast(z.cod + ' rotado', 'success');
};

// ── 10c. Enviar al frente / atrás ──
window.gaMoverZonaAlFrente = function(idx) {
  var z = _gaLayoutZonas[idx]; if (!z) return;
  _gaLayoutZonas.splice(idx, 1);
  _gaLayoutZonas.push(z);
  _glmR();
};
window.gaMoverZonaAlFondo = function(idx) {
  var z = _gaLayoutZonas[idx]; if (!z) return;
  _gaLayoutZonas.splice(idx, 1);
  _gaLayoutZonas.unshift(z);
  _glmR();
};

// ── 10d. Alinear a grilla (snap to 10px grid) ──
window.gaSnapToGrid = function() {
  var gridSize = 10; // px in virtual 800×580
  _gaLayoutZonas.forEach(function(z) {
    z.pos_x = Math.round(z.pos_x / gridSize) * gridSize;
    z.pos_y = Math.round(z.pos_y / gridSize) * gridSize;
    z.ancho = Math.round(z.ancho / gridSize) * gridSize || gridSize;
    z.alto = Math.round(z.alto / gridSize) * gridSize || gridSize;
  });
  _glmR();
  showToast('Zonas alineadas a grilla', 'success');
};

// ── 10e. Clonar layout de otra sede ──
window.gaClonarLayout = function() {
  var sede = _gaSedeActiva;
  if (!sede) { showToast('Selecciona sede destino', 'error'); return; }
  var sedes = Object.keys(SEDES).filter(function(s) { return s !== sede; });
  var prev = document.getElementById('gaCloneLayoutModal'); if (prev) prev.remove();
  var m = document.createElement('div'); m.id = 'gaCloneLayoutModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1200;display:flex;align-items:center;justify-content:center;padding:16px';
  m.onclick = function(e) { if (e.target === m) m.remove(); };
  var w = document.createElement('div');
  w.style.cssText = 'background:#fff;border-radius:14px;width:95%;max-width:380px;overflow:hidden';
  w.onclick = function(e) { e.stopPropagation(); };
  w.innerHTML = '<div style="padding:14px 18px;border-bottom:1px solid var(--border);font-weight:700;font-size:14px">Clonar layout completo</div>' +
    '<div style="padding:14px 18px"><div style="font-size:12px;color:var(--text2);margin-bottom:12px">Traer layout de otra sede hacia <strong>' + (SEDES[sede]?.label || sede) + '</strong>:</div>' +
    '<div style="padding:8px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;font-size:10px;color:#92400e;margin-bottom:12px">⚠ Esto reemplazará TODAS las zonas actuales</div>' +
    '<div style="display:flex;flex-direction:column;gap:6px">' + sedes.map(function(s) {
      return '<button class="btn btn-ghost" style="justify-content:flex-start;padding:10px 14px;font-size:13px" onclick="_gaDoCloneLayout(\'' + s + '\')">' + (SEDES[s]?.icon || '') + ' ' + (SEDES[s]?.label || s) + '</button>';
    }).join('') + '</div></div>' +
    '<div style="padding:10px 18px;border-top:1px solid var(--border);text-align:right"><button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'gaCloneLayoutModal\').remove()">Cancelar</button></div>';
  m.appendChild(w); document.body.appendChild(m);
};
window._gaDoCloneLayout = async function(desde) {
  document.getElementById('gaCloneLayoutModal')?.remove();
  var zonas = await API.get('/layout?sede=' + desde);
  if (!zonas || !zonas.length) { showToast('La sede origen no tiene layout', 'error'); return; }
  _gaLayoutZonas = zonas.map(function(z) {
    return { cod: z.cod, nombre: z.nombre, turno: z.turno, tipo: z.tipo, peso: z.peso, pos_x: z.pos_x, pos_y: z.pos_y, ancho: z.ancho, alto: z.alto, color: z.color, forma: z.forma, nivel: z.nivel || 'piso', sobre_cod: z.sobre_cod || '', frecuencia_dias: z.frecuencia_dias || 0, dia_semana: z.dia_semana || '' };
  });
  _glmR();
  showToast(zonas.length + ' zonas copiadas de ' + (SEDES[desde]?.label || desde), 'success');
};

// ── 10f. Expanded context menu with new tools ──
// Uses capture phase + stopImmediatePropagation to override the patches-v3.js handler
(function() {
  document._lzCtxHandler = function(e) {
    var zone = e.target.closest('.lz-z[data-draggable]');
    if (!zone) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // block the old patches-v3.js handler
    var cod = zone.dataset.cod, z = (_gaLayoutZonas || []).find(function(x) { return x.cod === cod; }), idx = (_gaLayoutZonas || []).indexOf(z);
    if (!z || idx < 0) return;
    var old = document.getElementById('lzCtxMenu'); if (old) old.remove();
    var menu = document.createElement('div'); menu.id = 'lzCtxMenu';
    menu.style.cssText = 'position:fixed;z-index:9999;background:#fff;border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);padding:4px 0;min-width:180px;font-size:11px;left:' + e.clientX + 'px;top:' + e.clientY + 'px';
    menu.addEventListener('mouseleave', function() { setTimeout(function() { if (document.getElementById('lzCtxMenu')) menu.remove(); }, 300); });
    var nv = z.nivel || 'piso';
    var items = [
      { t: 1, l: '<b>' + z.cod + '</b> · ' + z.nombre + '<br><span style="font-size:8px;color:var(--text3)">' + z.tipo + ' · ' + (z.turno || 'ambos') + ' · ' + z.peso + 'pts · ' + nv + '</span>' },
      0,
      { l: '✏️ Editar propiedades', fn: function() { gaLayoutEditZonaIdx(idx); } },
      { l: '📋 Duplicar', fn: function() { var nz = Object.assign({}, z); nz.cod = _gzAutoCode(z.tipo); nz.pos_x += 30; nz.pos_y += 20; nz.nombre += ' (copia)'; _gaLayoutZonas.push(nz); _glmR(); } },
      { l: '🔄 Rotar (swap ancho/alto)', fn: function() { gaRotarZona(idx); } },
      0,
      { l: '⬆ Traer al frente', fn: function() { gaMoverZonaAlFrente(idx); } },
      { l: '⬇ Enviar al fondo', fn: function() { gaMoverZonaAlFondo(idx); } },
      0,
      { l: (nv === 'piso' ? '● ' : '') + 'Piso', fn: function() { z.nivel = 'piso'; z.sobre_cod = ''; _glmR(); } },
      { l: (nv === 'sobre' ? '● ' : '') + 'Sobre mueble…', fn: function() { z.nivel = 'sobre'; gaLayoutEditZonaIdx(idx); setTimeout(function() { _gzSelNivel(document.querySelector('.gz-n-btn[data-val="sobre"]')); }, 100); } },
      { l: (nv === 'techo' ? '● ' : '') + 'Techo', fn: function() { z.nivel = 'techo'; z.pos_y = 30; z.sobre_cod = ''; _glmR(); } },
      0,
      { l: '<span style="color:var(--red)">🗑 Eliminar</span>', fn: function() { gaLayoutDeleteZona(idx); } }
    ];
    menu.innerHTML = items.map(function(it) {
      if (!it) return '<div style="border-top:1px solid var(--border-s);margin:2px 0"></div>';
      if (it.t) return '<div style="padding:6px 12px;font-size:10px;color:var(--text2);line-height:1.4">' + it.l + '</div>';
      return '<div class="lz-ctx-item" style="padding:6px 12px;cursor:pointer" onmouseenter="this.style.background=\'var(--s3)\'" onmouseleave="this.style.background=\'\'">' + it.l + '</div>';
    }).join('');
    document.body.appendChild(menu);
    // Reposition if off-screen
    var mr = menu.getBoundingClientRect();
    if (mr.right > window.innerWidth) menu.style.left = (window.innerWidth - mr.width - 8) + 'px';
    if (mr.bottom > window.innerHeight) menu.style.top = (window.innerHeight - mr.height - 8) + 'px';
    var btns = menu.querySelectorAll('.lz-ctx-item'), fns = items.filter(function(it) { return it && it.fn; });
    btns.forEach(function(btn, i) { if (fns[i]) btn.onclick = function() { menu.remove(); fns[i].fn(); }; });
  };
  document.addEventListener('contextmenu', document._lzCtxHandler, true); // capture phase
})();

// ── 10g. Enhanced layout modal header with tools toolbar ──
(function() {
  var _origAbrir = window.gaAbrirLayoutModal;
  window.gaAbrirLayoutModal = function() {
    _origAbrir();
    setTimeout(function() {
      var modal = document.getElementById('gaLayoutModal');
      if (!modal) return;
      // Find header buttons area
      var hdr = modal.querySelector('[style*="display:flex"][style*="gap:4px"]');
      if (!hdr || hdr.querySelector('.ga-tools-row')) return;
      // Add a tools row below header
      var headerParent = hdr.closest('div[style*="border-bottom"]');
      if (!headerParent) return;
      var toolsRow = document.createElement('div');
      toolsRow.className = 'ga-tools-row';
      toolsRow.style.cssText = 'padding:4px 12px;border-bottom:1px solid var(--border-s);display:flex;gap:3px;flex-wrap:wrap;align-items:center;background:var(--s3);font-size:9px';
      toolsRow.innerHTML =
        '<span style="font-weight:700;color:var(--text3);margin-right:4px">Herramientas:</span>' +
        '<button class="btn btn-ghost btn-xs" onclick="gaRecodificarLayout()" title="Reasignar códigos correctos a cada zona según su tipo" style="font-size:9px;padding:2px 6px">🔢 Recodificar</button>' +
        '<button class="btn btn-ghost btn-xs" onclick="gaSnapToGrid()" title="Alinear todas las zonas a una grilla de 10px" style="font-size:9px;padding:2px 6px">⊞ Alinear grilla</button>' +
        '<button class="btn btn-ghost btn-xs" onclick="gaClonarLayout()" title="Copiar layout completo de otra sede" style="font-size:9px;padding:2px 6px">📥 Clonar de sede</button>' +
        '<span style="width:1px;height:12px;background:var(--border);margin:0 2px"></span>' +
        '<button class="btn btn-ghost btn-xs" onclick="_gaSelectAll()" title="Seleccionar todas las zonas" style="font-size:9px;padding:2px 6px">☑ Sel. todo</button>' +
        '<button class="btn btn-ghost btn-xs" onclick="_gaDeselectAll()" title="Quitar selección" style="font-size:9px;padding:2px 6px">☐ Des. todo</button>' +
        '<span style="flex:1"></span>' +
        '<span id="glmStats" style="font-size:8px;color:var(--text3)"></span>';
      headerParent.after(toolsRow);
      _gaUpdateStats();
    }, 150);
  };
})();

// ── 10h. Layout stats ──
window._gaUpdateStats = function() {
  var el = document.getElementById('glmStats'); if (!el) return;
  var z = _gaLayoutZonas || [];
  var tipos = {}; z.forEach(function(zz) { tipos[zz.tipo] = (tipos[zz.tipo] || 0) + 1; });
  var sobre = z.filter(function(zz) { return zz.nivel === 'sobre'; }).length;
  var techo = z.filter(function(zz) { return zz.nivel === 'techo'; }).length;
  var totalPts = z.reduce(function(s, zz) { return s + (zz.tipo !== 'area' ? (zz.peso || 0) : 0); }, 0);
  el.innerHTML = z.length + ' zonas · ' + totalPts + ' pts total' +
    (sobre ? ' · ' + sobre + ' sobre mueble' : '') +
    (techo ? ' · ' + techo + ' techo' : '');
};

// ── 10i. Select/deselect all (for admin review) ──
window._gaSelectAll = function() {
  (_gaLayoutZonas || []).forEach(function(z) { if (z.tipo !== 'area') LayoutMap._sel[z.cod] = true; });
  LayoutMap._sel['PISO'] = true;
  LayoutMap._sel['CALLE'] = true;
  _glmR(); showToast('Todas seleccionadas', 'success');
};
window._gaDeselectAll = function() {
  LayoutMap._sel = {};
  _glmR(); showToast('Selección limpia', 'success');
};

// ── 10j. Override gaLayoutSave to update stats + persist nivel/sobre_cod ──
(function() {
  var _origSave = window.gaLayoutSave;
  window.gaLayoutSave = async function() {
    // Ensure zonas have nivel/sobre_cod before saving (defensive)
    (_gaLayoutZonas || []).forEach(function(z) {
      if (!z.nivel) z.nivel = 'piso';
      if (!z.sobre_cod) z.sobre_cod = '';
      if (!z.frecuencia_dias) z.frecuencia_dias = 0;
      if (!z.dia_semana) z.dia_semana = '';
    });
    await _origSave();
    _gaUpdateStats();
  };
})();

// ── 10k. Zone modal: make code editable + add color picker ──
// The original _gaZonaModal calls m.remove() BEFORE onSave(r), so we must
// capture extra fields (color) before the modal is destroyed.
(function() {
  var _origZonaModal = window._gaZonaModal;
  var _savedColor = null; // captured just before modal closes

  window._gaZonaModal = function(title, data, onSave) {
    _origZonaModal(title, data, function(r) {
      r._color = _savedColor; // attach color captured pre-removal
      if (onSave) onSave(r);
    });
    // After modal renders, enhance the code field + add color + patch save button
    setTimeout(function() {
      // Make code field editable for existing zones
      var codField = document.getElementById('gzCod');
      if (codField && data && data.cod) {
        codField.readOnly = false;
        codField.style.background = '#fff';
        codField.style.cursor = 'text';
        codField.title = 'Editable — cambiar código manualmente';
      }
      // Add color picker after the Pts/Ancho/Alto row
      var pesoField = document.getElementById('gzPeso');
      if (pesoField) {
        var row = pesoField.closest('div[style*="display:flex"]');
        if (row && !document.getElementById('gzColor')) {
          var colorDiv = document.createElement('div');
          colorDiv.className = 'field';
          colorDiv.style.cssText = 'flex:1;margin:0';
          colorDiv.innerHTML = '<label>Color</label><input type="color" id="gzColor" value="' + (data.color || _TC[data.turno || 'ambos'] || '#3b82f6') + '" style="width:100%;height:32px;padding:2px;border:1px solid var(--border);border-radius:4px;cursor:pointer">';
          row.appendChild(colorDiv);
        }
      }
      // Patch save button to capture color BEFORE the modal is removed
      var saveBtn = document.getElementById('gzSave');
      if (saveBtn) {
        var origClick = saveBtn.onclick;
        saveBtn.onclick = function() {
          _savedColor = document.getElementById('gzColor')?.value || null;
          origClick.call(this);
        };
      }
    }, 50);
  };

  window.gaLayoutAddZona = function() {
    _gaZonaModal('+ Nueva Zona', {}, function(r) {
      var color = r._color || _TC[r.turno] || '#6b7280';
      _gaLayoutZonas.push({
        cod: r.cod, nombre: r.nombre || r.cod, turno: r.turno, tipo: r.tipo, peso: r.peso,
        pos_x: 350, pos_y: r.nivel === 'techo' ? 30 : 300, ancho: r.ancho, alto: r.alto,
        color: color, forma: (_ZONA_TIPOS.find(function(t) { return t.v === r.tipo; }) || {}).f || 'rect',
        nivel: r.nivel || 'piso', sobre_cod: r.sobre_cod || '',
        frecuencia_dias: r.frecuencia_dias || 0, dia_semana: r.dia_semana || ''
      });
      _glmR(); _gaUpdateStats();
      showToast(r.cod + ' agregado', 'success');
    });
  };

  window.gaLayoutEditZonaIdx = function(idx) {
    var z = _gaLayoutZonas[idx]; if (!z) return;
    _gaZonaModal('Editar: ' + z.cod, {
      cod: z.cod, nombre: z.nombre, tipo: z.tipo, turno: z.turno, peso: z.peso,
      ancho: Math.round(z.ancho), alto: Math.round(z.alto),
      nivel: z.nivel || 'piso', sobre_cod: z.sobre_cod || '',
      frecuencia_dias: z.frecuencia_dias || 0, dia_semana: z.dia_semana || '',
      color: z.color || _TC[z.turno] || '#6b7280'
    }, function(r) {
      var color = r._color || z.color || _TC[r.turno] || '#6b7280';
      z.cod = r.cod; z.nombre = r.nombre || z.nombre; z.tipo = r.tipo; z.turno = r.turno;
      z.peso = r.peso; z.ancho = r.ancho; z.alto = r.alto;
      z.nivel = r.nivel || 'piso'; z.sobre_cod = r.sobre_cod || '';
      z.color = color;
      z.forma = (_ZONA_TIPOS.find(function(t) { return t.v === r.tipo; }) || {}).f || 'rect';
      z.frecuencia_dias = r.frecuencia_dias || 0; z.dia_semana = r.dia_semana || '';
      // Auto-snap sobre zones to parent position
      if (z.nivel === 'sobre' && z.sobre_cod) {
        var parent = _gaLayoutZonas.find(function(p) { return p.cod === z.sobre_cod; });
        if (parent) {
          z.pos_x = parent.pos_x + (parent.ancho || 60) * 0.15;
          z.pos_y = parent.pos_y - (z.alto || 30) * 0.3;
        }
      }
      _glmR(); _gaUpdateStats();
    });
  };
})();

// ── 10l. Ensure "sobre mueble" zones render on top in collaborator reports ──
// The _applyVisualStyles already handles zIndex=25 for sobre zones.
// This patch ensures the DOM order respects nivel after any render.
(function() {
  var _origRender = LayoutMap.render.bind(LayoutMap);
  LayoutMap.render = function(cId, zonas, opts) {
    // Sort zonas so 'sobre' zones are last in array = rendered on top in DOM
    // Don't mutate original array for editor mode
    var sortedZonas = zonas;
    if (!opts.editable) {
      sortedZonas = zonas.slice().sort(function(a, b) {
        var na = a.nivel === 'sobre' ? 2 : a.nivel === 'techo' ? 0 : 1;
        var nb = b.nivel === 'sobre' ? 2 : b.nivel === 'techo' ? 0 : 1;
        return na - nb;
      });
    }
    _origRender(cId, sortedZonas, opts);
  };
})();

console.log('[LuceBien] patches-v5.js — Global system changes + Layout tools loaded');
})();
