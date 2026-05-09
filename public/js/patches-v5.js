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

// Override incidencia rápida modal — prevent self-report + cargar tipos dinámicos
var _origAbrirIncRap = window.abrirIncidenciaRapidaModal;
window.abrirIncidenciaRapidaModal = async function() {
  _origAbrirIncRap();
  // No permitir auto-reportarse
  setTimeout(function() {
    var sel = document.getElementById('irTrab');
    if (sel && STATE.user) {
      for (var i = sel.options.length - 1; i >= 0; i--) {
        if (sel.options[i].value === STATE.user.nombre) sel.remove(i);
      }
    }
  }, 50);
  // Cargar tipos desde catálogo y auto-ajustar puntos/nivel según tipificación
  try {
    var tipos = await API.get('/incidencias/tipos/list');
    if (tipos && tipos.length) {
      setTimeout(function(){
        var tipoSel = document.getElementById('irTipo');
        if (!tipoSel) return;
        // Agrupar por categoría
        var porCat = {};
        tipos.forEach(function(t){ var c=t.categoria||'Otros'; (porCat[c]=porCat[c]||[]).push(t); });
        var html = '';
        Object.keys(porCat).forEach(function(c){
          html += '<optgroup label="'+c+'">';
          porCat[c].forEach(function(t){
            html += '<option value="'+t.tipo.replace(/"/g,'&quot;')+'" data-pts="'+t.puntos_default+'" data-niv="'+t.nivel_default+'">'+t.tipo+'</option>';
          });
          html += '</optgroup>';
        });
        tipoSel.innerHTML = html;
        // Sincronizar puntos + nivel cuando cambia tipo
        tipoSel.addEventListener('change', function(){
          var opt = tipoSel.options[tipoSel.selectedIndex]; if(!opt) return;
          var pts = opt.getAttribute('data-pts'); var niv = opt.getAttribute('data-niv');
          if (niv) { var nivSel=document.getElementById('irNivel'); if (nivSel) nivSel.value = niv; }
          if (pts != null) { var p=document.getElementById('irPuntos'); if (p) p.value = pts; }
        });
        // Disparar primera sincronización
        tipoSel.dispatchEvent(new Event('change'));
      }, 60);
    }
  } catch(e) { console.warn('[tipos] fallback a lista estática'); }
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
  var main = document.querySelector('.main');
  if (!sb) return;
  sb.classList.toggle('collapsed');
  var collapsed = sb.classList.contains('collapsed');
  if (main) main.classList.toggle('sidebar-collapsed', collapsed);
  document.body.classList.toggle('sb-collapsed', collapsed); // header lo lee desde aquí
  var btn = sb.querySelector('.sb-collapse-btn');
  if (btn) btn.innerHTML = collapsed ? '' : '&#9664; Colapsar';
  localStorage.setItem('lb_sidebar_collapsed', collapsed ? '1' : '');
};

// Restore sidebar state + add tooltip labels
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    if (localStorage.getItem('lb_sidebar_collapsed') === '1') {
      var sb = document.querySelector('.sidebar');
      var main = document.querySelector('.main');
      if (sb) { sb.classList.add('collapsed'); var btn = sb.querySelector('.sb-collapse-btn'); if (btn) btn.innerHTML = ''; }
      if (main) main.classList.add('sidebar-collapsed');
      document.body.classList.add('sb-collapsed');
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
// Excluye PISO y CALLE que son zonas especiales de fondo y no deben snaplearse.
window.gaSnapToGrid = function() {
  var gridSize = 10; // px in virtual 800×580
  var SPECIALS = ['PISO', 'CALLE'];
  var snapped = 0;
  _gaLayoutZonas.forEach(function(z) {
    if (SPECIALS.indexOf(z.cod) >= 0) return;
    z.pos_x = Math.round(z.pos_x / gridSize) * gridSize;
    z.pos_y = Math.round(z.pos_y / gridSize) * gridSize;
    z.ancho = Math.round(z.ancho / gridSize) * gridSize || gridSize;
    z.alto = Math.round(z.alto / gridSize) * gridSize || gridSize;
    snapped++;
  });
  _glmR();
  showToast(snapped + ' zonas alineadas a grilla', 'success');
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
    // NOTE: stripping `id` so backend INSERTs fresh rows
    return { cod: z.cod, nombre: z.nombre, turno: z.turno, tipo: z.tipo, peso: z.peso, pos_x: z.pos_x, pos_y: z.pos_y, ancho: z.ancho, alto: z.alto, color: z.color, forma: z.forma, nivel: z.nivel || 'piso', sobre_cod: z.sobre_cod || '', frecuencia_dias: z.frecuencia_dias || 0, dia_semana: z.dia_semana || '' };
  });
  // Clear any stale selection from previous sede — codes may no longer exist
  if (LayoutMap && LayoutMap._sel) LayoutMap._sel = {};
  _glmR();
  if (typeof _gaUpdateStats === 'function') _gaUpdateStats();
  showToast(zonas.length + ' zonas copiadas de ' + (SEDES[desde]?.label || desde) + ' (no olvides guardar)', 'success');
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
    var oldCod = z.cod; // save for sobre_cod reference update
    _gaZonaModal('Editar: ' + z.cod, {
      cod: z.cod, nombre: z.nombre, tipo: z.tipo, turno: z.turno, peso: z.peso,
      ancho: Math.round(z.ancho), alto: Math.round(z.alto),
      nivel: z.nivel || 'piso', sobre_cod: z.sobre_cod || '',
      frecuencia_dias: z.frecuencia_dias || 0, dia_semana: z.dia_semana || '',
      color: z.color || _TC[z.turno] || '#6b7280'
    }, function(r) {
      var color = r._color || z.color || _TC[r.turno] || '#6b7280';
      // Check cod uniqueness if changed
      if (r.cod !== oldCod) {
        var dup = _gaLayoutZonas.find(function(x) { return x !== z && x.cod === r.cod; });
        if (dup) { showToast('Código ' + r.cod + ' ya existe — cambio revertido', 'error'); r.cod = oldCod; }
      }
      z.cod = r.cod; z.nombre = r.nombre || z.nombre; z.tipo = r.tipo; z.turno = r.turno;
      z.peso = (r.peso != null ? r.peso : z.peso); z.ancho = r.ancho; z.alto = r.alto;
      z.nivel = r.nivel || 'piso'; z.sobre_cod = r.sobre_cod || '';
      z.color = color;
      z.forma = (_ZONA_TIPOS.find(function(t) { return t.v === r.tipo; }) || {}).f || 'rect';
      z.frecuencia_dias = r.frecuencia_dias || 0; z.dia_semana = r.dia_semana || '';
      // Update sobre_cod references in other zones if this zone's code changed
      if (r.cod !== oldCod) {
        var updated = 0;
        _gaLayoutZonas.forEach(function(other) {
          if (other !== z && other.sobre_cod === oldCod) { other.sobre_cod = r.cod; updated++; }
        });
        if (updated) showToast(updated + ' referencia(s) actualizada(s)', 'success');
      }
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
    // Defensive: guard undefined opts / zonas
    opts = opts || {};
    zonas = zonas || [];
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

// ── 10m. Fix: gaLayoutDeleteZona renumbers codes but orphans sobre_cod refs ──
// v3 version splices + renumbers siblings by prefix, but doesn't update zones
// whose sobre_cod pointed at the deleted/renumbered codes. Wrap to fix both.
(function() {
  var _origDelete = window.gaLayoutDeleteZona;
  window.gaLayoutDeleteZona = function(idx) {
    var z = _gaLayoutZonas[idx]; if (!z) return;
    // Block deletion of reserved zones
    if (z.cod === 'PISO' || z.cod === 'CALLE') {
      showToast('No se puede eliminar ' + z.cod + ' (zona reservada)', 'error');
      return;
    }
    showConfirm('Eliminar?', z.cod + ' ' + z.nombre, function() {
      // Snapshot old codes for same-prefix siblings BEFORE the splice/renumber
      var prefix = z.cod.replace(/[0-9]/g, '');
      var deletedCod = z.cod;
      var oldCodsByPrefix = _gaLayoutZonas
        .filter(function(zz) { return zz.cod.replace(/[0-9]/g, '') === prefix; })
        .map(function(zz) { return zz.cod; });
      // Do the splice + renumber (mirror of v3 logic)
      _gaLayoutZonas.splice(idx, 1);
      var count = 0, oldToNew = {};
      _gaLayoutZonas.forEach(function(zz) {
        if (zz.cod.replace(/[0-9]/g, '') === prefix) {
          count++;
          var newCod = prefix + String(count).padStart(2, '0');
          if (zz.cod !== newCod) oldToNew[zz.cod] = newCod;
          zz.cod = newCod;
        }
      });
      // Orphaned sobre_cod: zones pointing at the deleted cod → clear + demote to 'piso'
      // Renumbered sobre_cod: point at the new code
      var orphaned = 0, remapped = 0;
      _gaLayoutZonas.forEach(function(zz) {
        if (!zz.sobre_cod) return;
        if (zz.sobre_cod === deletedCod) {
          zz.sobre_cod = ''; zz.nivel = 'piso'; orphaned++;
        } else if (oldToNew[zz.sobre_cod]) {
          zz.sobre_cod = oldToNew[zz.sobre_cod]; remapped++;
        }
      });
      _glmR();
      if (typeof _gaUpdateStats === 'function') _gaUpdateStats();
      var msg = 'Eliminado ' + deletedCod;
      if (orphaned) msg += ' · ' + orphaned + ' hijo(s) demovidos a piso';
      if (remapped) msg += ' · ' + remapped + ' ref(s) actualizadas';
      showToast(msg, 'success');
    });
  };
})();

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAR ACCESOS — rebuild completo (v5.4.1)
// Reemplaza el modal de abrirConfigAccesos con:
//   · Matriz de accesos agrupada por sector
//   · Puestos = rol hardcoded + puestos_custom (del config DB)
//   · Grupos de rangos (bulk apply) con editor propio
//   · Gestión CRUD de puestos personalizados
// Mantiene compatibilidad con el endpoint /config/permisos existente.
// ═══════════════════════════════════════════════════════════════════════════
(function(){
  // Puestos builtin — orden y estilo estable.
  var BUILTIN_PUESTOS = [
    {cod:'dueno',            label:'Dueña',         icon:'👑', sector:'gestion',  builtin:true, admin:true},
    {cod:'admin',            label:'Administrador', icon:'👑', sector:'gestion',  builtin:true, admin:true},
    {cod:'encargado_tienda', label:'Enc. Tienda',   icon:'🏪', sector:'turno',    builtin:true},
    {cod:'encargado_almacen',label:'Enc. Almacén',  icon:'📦', sector:'almacen',  builtin:true},
    {cod:'ventas_junior',    label:'Ventas Jr.',    icon:'🛍', sector:'turno',    builtin:true},
    {cod:'ventas_junior_2',  label:'Ventas Jr. 2',  icon:'🛍', sector:'turno',    builtin:true},
    {cod:'auxiliar',         label:'Auxiliar',      icon:'📦', sector:'almacen',  builtin:true},
    {cod:'confeccionista',   label:'Confección',    icon:'✂️', sector:'personal', builtin:true},
    {cod:'trabajador',       label:'Colaborador',   icon:'👤', sector:'turno',    builtin:true},
  ];

  var _cfgCache = { puestos:[], grupos:[], perms:{} };

  async function _cargarConfig(){
    try{ _cfgCache.perms   = (await API.get('/config/permisos'))||{}; }catch(e){ _cfgCache.perms={}; }
    try{ _cfgCache.puestos = (await API.get('/config/puestos'))||[]; }catch(e){ _cfgCache.puestos=[]; }
    try{ _cfgCache.grupos  = (await API.get('/config/grupos-rangos'))||[]; }catch(e){ _cfgCache.grupos=[]; }
    if(!Array.isArray(_cfgCache.puestos)) _cfgCache.puestos=[];
    if(!Array.isArray(_cfgCache.grupos))  _cfgCache.grupos=[];
  }

  function _todosPuestos(){
    // builtin primero, luego custom (evitando colisiones de cod)
    var out = BUILTIN_PUESTOS.slice();
    var builtCods = {}; out.forEach(function(p){ builtCods[p.cod]=1; });
    (_cfgCache.puestos||[]).forEach(function(p){
      if(p && p.cod && !builtCods[p.cod]) out.push({
        cod:p.cod, label:p.label||p.cod, icon:p.icon||'👤',
        sector:p.sector||'turno', builtin:false
      });
    });
    return out;
  }

  function _permsPara(rol){
    if(_cfgCache.perms && _cfgCache.perms[rol]) return _cfgCache.perms[rol].slice();
    if(window.DEFAULT_PERMS && DEFAULT_PERMS[rol]) return DEFAULT_PERMS[rol].slice();
    return [];
  }

  // ───────────────────── Modal principal ─────────────────────
  window.abrirConfigAccesos = async function(){
    var prev = document.getElementById('accesosModal'); if(prev) prev.remove();
    await _cargarConfig();
    // refresca también la cache de app.js para applyPermissions()
    if(window.STATE) STATE._permisos = Object.keys(_cfgCache.perms).length ? _cfgCache.perms : null;

    var puestos = _todosPuestos();
    var pages   = window.PAGES_CONFIG || {};
    var sections= window.SECTION_META || {
      turno:{label:'Turno',color:'#1e3a5f',bg:'#eff6ff',icon:'📋'},
      personal:{label:'Personal',color:'#7c3aed',bg:'#faf5ff',icon:'🙋'},
      almacen:{label:'Almacén',color:'#0d6939',bg:'#f0fdf4',icon:'📦'},
      gestion:{label:'Gestión',color:'#b45309',bg:'#fffbeb',icon:'👑'},
    };

    var m = document.createElement('div'); m.id='accesosModal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1100;display:flex;align-items:center;justify-content:center;padding:14px';
    m.onclick=function(e){ if(e.target===m) m.remove(); };

    var inner = document.createElement('div');
    inner.style.cssText='background:#fff;border-radius:16px;width:98%;max-width:1100px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 70px rgba(0,0,0,.35)';
    inner.onclick=function(e){e.stopPropagation();};

    // — Header —
    var hdr = document.createElement('div');
    hdr.style.cssText='padding:14px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff';
    hdr.innerHTML =
      '<div>'+
        '<div style="font-size:15px;font-weight:800">⚙ Configurar Accesos</div>'+
        '<div style="font-size:10px;color:#cbd5e1;margin-top:2px">Matriz de permisos · puestos + grupos de rangos</div>'+
      '</div>'+
      '<div style="display:flex;gap:6px;align-items:center">'+
        '<button id="btnGestPuestos" class="btn btn-ghost btn-xs" style="color:#fff;border:1px solid rgba(255,255,255,.25);font-size:10px">👥 Gestionar Puestos</button>'+
        '<button id="btnGestGrupos"  class="btn btn-ghost btn-xs" style="color:#fff;border:1px solid rgba(255,255,255,.25);font-size:10px">🗂 Gestionar Grupos</button>'+
        '<button id="btnCerrarAcc"   class="btn btn-ghost btn-xs" style="color:#fff;font-size:14px">✕</button>'+
      '</div>';
    inner.appendChild(hdr);

    // — Toolbar: grupo shortcut —
    var bar = document.createElement('div');
    bar.style.cssText='padding:10px 20px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;background:#f8fafc;flex-wrap:wrap;font-size:11px';
    var gruposHtml = '<option value="">— Aplicar a grupo —</option>' +
      _cfgCache.grupos.map(function(g){ return '<option value="'+g.id+'">'+g.nombre+' ('+(g.puestos||[]).length+')</option>'; }).join('');
    bar.innerHTML =
      '<span style="font-weight:700;color:var(--text2)">Atajos:</span>'+
      '<select id="accGrupoSel" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:11px">'+gruposHtml+'</select>'+
      '<button id="accGrupoAllOn"  class="btn btn-ghost btn-xs" style="font-size:10px">✅ Todo</button>'+
      '<button id="accGrupoAllOff" class="btn btn-ghost btn-xs" style="font-size:10px">☐ Nada</button>'+
      '<span style="margin-left:auto;color:var(--text3);font-size:10px">Total módulos: <strong>'+Object.keys(pages).length+'</strong> · Puestos: <strong>'+puestos.length+'</strong></span>';
    inner.appendChild(bar);

    // — Body: matriz agrupada por sector —
    var body = document.createElement('div');
    body.style.cssText='flex:1;overflow:auto;padding:14px 20px;background:#fff';

    // Header columnas (sticky)
    var colHdr = '<thead><tr style="position:sticky;top:0;z-index:2;background:#fff;box-shadow:0 2px 0 #e2e8f0">'+
      '<th style="text-align:left;padding:8px 10px;font-size:9px;color:var(--text3);min-width:230px;border-right:2px solid #e2e8f0;background:#fff">MÓDULO</th>';
    puestos.forEach(function(p){
      var adminFlag = p.admin ? ' style="opacity:.55"' : '';
      colHdr += '<th'+adminFlag+' style="text-align:center;padding:6px 3px;font-size:8px;color:var(--text2);min-width:66px;background:#fff;font-weight:700">'+
        '<div style="font-size:12px;margin-bottom:2px">'+p.icon+'</div>'+
        '<div style="font-size:8px">'+p.label+'</div>'+
        (p.builtin?'':'<div style="font-size:6px;color:#7c3aed;margin-top:1px">CUSTOM</div>')+
      '</th>';
    });
    colHdr += '</tr></thead>';

    // Filas agrupadas por sector
    var secOrder = ['turno','personal','almacen','gestion'];
    var pagesBySec = {};
    Object.entries(pages).forEach(function(e){
      var sec = (e[1].section)||'turno';
      (pagesBySec[sec]=pagesBySec[sec]||[]).push([e[0], e[1]]);
    });

    var tbody = '<tbody>';
    secOrder.forEach(function(sec){
      var list = pagesBySec[sec]; if(!list||!list.length) return;
      var meta = sections[sec] || {label:sec,color:'#64748b',bg:'#f1f5f9',icon:'📁'};
      // Sector header row
      tbody += '<tr style="background:'+meta.bg+'"><td colspan="'+(puestos.length+1)+'" style="padding:8px 12px;font-weight:800;font-size:11px;color:'+meta.color+';border-top:2px solid '+meta.color+'33">'+
        meta.icon+' '+meta.label+
        ' <span style="font-weight:500;color:var(--text3);font-size:9px">· '+list.length+' módulo(s)</span>'+
        ' <button class="accSecAll" data-sec="'+sec+'" data-val="1" style="float:right;margin-left:4px;font-size:9px;padding:2px 7px;border-radius:4px;border:1px solid '+meta.color+'55;background:#fff;color:'+meta.color+';cursor:pointer;font-weight:700">✅ Todo</button>'+
        ' <button class="accSecAll" data-sec="'+sec+'" data-val="0" style="float:right;font-size:9px;padding:2px 7px;border-radius:4px;border:1px solid '+meta.color+'55;background:#fff;color:'+meta.color+';cursor:pointer;font-weight:700">☐ Nada</button>'+
      '</td></tr>';
      // Module rows
      list.forEach(function(pair){
        var pid=pair[0], pg=pair[1];
        tbody += '<tr class="accRow" data-sec="'+sec+'" style="border-bottom:1px solid #f1f5f9">';
        tbody += '<td style="padding:7px 10px;font-weight:600;font-size:11px;border-right:1px solid #f1f5f9"><span style="font-size:13px;margin-right:4px">'+pg.icon+'</span>'+pg.label+'<div style="font-size:8px;color:var(--text3);font-family:var(--font-m)">'+pid+'</div></td>';
        puestos.forEach(function(p){
          var allowed = p.admin ? true : (_permsPara(p.cod).indexOf(pid)>=0);
          var disabled = p.admin?'disabled':'';
          var cls = p.admin?'accCbAdmin':'acc-cb';
          tbody += '<td style="text-align:center;padding:3px"><input type="checkbox" class="'+cls+'" data-role="'+p.cod+'" data-page="'+pid+'" '+(allowed?'checked':'')+' '+disabled+' style="width:15px;height:15px;accent-color:'+meta.color+';cursor:'+(p.admin?'not-allowed':'pointer')+'"></td>';
        });
        tbody += '</tr>';
      });
    });
    tbody += '</tbody>';

    body.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px">'+colHdr+tbody+'</table>';
    inner.appendChild(body);

    // — Footer —
    var ftr = document.createElement('div');
    ftr.style.cssText='padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:space-between;align-items:center;background:#f8fafc';
    ftr.innerHTML =
      '<div style="font-size:10px;color:var(--text3)">👑 Admin y Dueña tienen acceso total y no son editables.</div>'+
      '<div style="display:flex;gap:8px">'+
        '<button id="accReset" class="btn btn-ghost btn-sm">↺ Restaurar defaults</button>'+
        '<button id="accSave"  class="btn btn-primary btn-sm">💾 Guardar Accesos</button>'+
      '</div>';
    inner.appendChild(ftr);

    m.appendChild(inner);
    document.body.appendChild(m);

    // — Handlers —
    document.getElementById('btnCerrarAcc').onclick = function(){ m.remove(); };
    document.getElementById('btnGestPuestos').onclick = function(){ abrirGestionPuestos(); };
    document.getElementById('btnGestGrupos').onclick  = function(){ abrirGestionGrupos(); };

    // "Todo / Nada" por sector
    body.querySelectorAll('.accSecAll').forEach(function(b){
      b.onclick = function(){
        var sec=b.dataset.sec, val=b.dataset.val==='1';
        body.querySelectorAll('tr.accRow[data-sec="'+sec+'"] .acc-cb').forEach(function(cb){ cb.checked=val; });
      };
    });

    // Shortcut por grupo
    document.getElementById('accGrupoAllOn').onclick  = function(){ _accAplicarGrupo(body, true);  };
    document.getElementById('accGrupoAllOff').onclick = function(){ _accAplicarGrupo(body, false); };

    document.getElementById('accReset').onclick = function(){
      body.querySelectorAll('.acc-cb').forEach(function(cb){
        var r=cb.dataset.role, p=cb.dataset.page;
        cb.checked = ((window.DEFAULT_PERMS||{})[r]||[]).indexOf(p)>=0;
      });
      showToast('Defaults restaurados — guarda para aplicar','info');
    };

    document.getElementById('accSave').onclick = _accGuardar;
  };

  function _accAplicarGrupo(body, valor){
    var sel = document.getElementById('accGrupoSel');
    var gid = sel ? sel.value : '';
    if(!gid){ showToast('Selecciona un grupo primero','warn'); return; }
    var g = _cfgCache.grupos.find(function(x){ return x.id===gid; });
    if(!g){ return; }
    (g.puestos||[]).forEach(function(cod){
      body.querySelectorAll('.acc-cb[data-role="'+cod+'"]').forEach(function(cb){ cb.checked=valor; });
    });
    showToast((valor?'✅ Todo':'☐ Nada')+' aplicado a '+g.nombre,'success');
  }

  async function _accGuardar(){
    var perms = {};
    document.querySelectorAll('#accesosModal .acc-cb').forEach(function(cb){
      var r=cb.dataset.role, p=cb.dataset.page;
      (perms[r]=perms[r]||[]);
      if(cb.checked) perms[r].push(p);
    });
    var r = await API.put('/config/permisos', perms);
    if(r && r.ok){
      _cfgCache.perms = perms;
      if(window.STATE) STATE._permisos = perms;
      document.getElementById('accesosModal')?.remove();
      if(typeof applyPermissions==='function') applyPermissions();
      showToast('✅ Accesos actualizados','success');
    } else {
      showToast('Error al guardar accesos','error');
    }
  }

  // ═══════════════════ Gestión de Puestos ════════════════════
  window.abrirGestionPuestos = async function(){
    var prev = document.getElementById('puestosModal'); if(prev) prev.remove();
    if(!_cfgCache.puestos.length && !_cfgCache.grupos.length) await _cargarConfig();

    var m = document.createElement('div'); m.id='puestosModal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1200;display:flex;align-items:center;justify-content:center;padding:14px';
    m.onclick=function(e){ if(e.target===m) m.remove(); };

    var inner=document.createElement('div');
    inner.style.cssText='background:#fff;border-radius:16px;width:95%;max-width:640px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column';
    inner.onclick=function(e){e.stopPropagation();};

    var hdr=document.createElement('div');
    hdr.style.cssText='padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:#1e3a5f;color:#fff';
    hdr.innerHTML='<div><div style="font-size:14px;font-weight:800">👥 Gestión de Puestos</div><div style="font-size:10px;color:#cbd5e1;margin-top:2px">Agrega o elimina puestos personalizados</div></div>'+
      '<button id="pClose" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer">✕</button>';
    inner.appendChild(hdr);

    var body=document.createElement('div'); body.id='puestosBody';
    body.style.cssText='flex:1;overflow:auto;padding:14px 18px;background:#fff;font-size:12px';
    inner.appendChild(body);

    var ftr=document.createElement('div');
    ftr.style.cssText='padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:space-between;align-items:center;background:#f8fafc';
    ftr.innerHTML='<button id="pAdd" class="btn btn-primary btn-sm">➕ Agregar Puesto</button>'+
      '<button id="pSave" class="btn btn-primary btn-sm" style="background:#16a34a">💾 Guardar Cambios</button>';
    inner.appendChild(ftr);

    m.appendChild(inner); document.body.appendChild(m);

    document.getElementById('pClose').onclick=function(){ m.remove(); };

    var listaTmp = _cfgCache.puestos.slice();  // solo editables (custom)
    function renderList(){
      var h='<div style="margin-bottom:10px;padding:8px 10px;background:#eff6ff;border-left:3px solid #1e3a5f;border-radius:4px;font-size:10px;color:#1e3a5f">'+
        '<strong>Puestos del sistema</strong> (no editables): '+BUILTIN_PUESTOS.filter(function(p){return !p.admin}).map(function(p){return p.icon+' '+p.label;}).join(' · ')+'</div>';
      if(!listaTmp.length){
        h += '<div style="text-align:center;padding:30px 20px;color:var(--text3);font-size:11px">Sin puestos personalizados. Usa <strong>Agregar Puesto</strong> para crear uno.</div>';
      } else {
        h += '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#f8fafc"><th style="padding:6px 8px;text-align:left;font-size:9px;color:var(--text3)">ICON</th><th style="padding:6px 8px;text-align:left;font-size:9px;color:var(--text3)">NOMBRE</th><th style="padding:6px 8px;text-align:left;font-size:9px;color:var(--text3)">CÓDIGO</th><th style="padding:6px 8px;text-align:left;font-size:9px;color:var(--text3)">SECTOR</th><th style="width:30px"></th></tr></thead><tbody>';
        listaTmp.forEach(function(p,i){
          h+='<tr style="border-bottom:1px solid #f1f5f9">'+
            '<td style="padding:4px 6px"><input data-i="'+i+'" data-k="icon" value="'+(p.icon||'👤')+'" style="width:40px;text-align:center;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:14px"></td>'+
            '<td style="padding:4px 6px"><input data-i="'+i+'" data-k="label" value="'+(p.label||'').replace(/"/g,'&quot;')+'" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:11px"></td>'+
            '<td style="padding:4px 6px"><input data-i="'+i+'" data-k="cod" value="'+(p.cod||'').replace(/"/g,'&quot;')+'" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:10px;font-family:monospace"></td>'+
            '<td style="padding:4px 6px"><select data-i="'+i+'" data-k="sector" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:10px">'+
              ['turno','personal','almacen','gestion'].map(function(s){return '<option value="'+s+'" '+(p.sector===s?'selected':'')+'>'+s+'</option>';}).join('')+
            '</select></td>'+
            '<td style="text-align:center"><button data-del="'+i+'" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:14px">✕</button></td>'+
          '</tr>';
        });
        h += '</tbody></table>';
      }
      body.innerHTML=h;
      body.querySelectorAll('input,select').forEach(function(el){
        el.oninput = el.onchange = function(){
          var i=+el.dataset.i, k=el.dataset.k;
          if(!listaTmp[i]) return;
          listaTmp[i][k] = el.value;
        };
      });
      body.querySelectorAll('button[data-del]').forEach(function(b){
        b.onclick=function(){
          var i=+b.dataset.del; listaTmp.splice(i,1); renderList();
        };
      });
    }
    renderList();

    document.getElementById('pAdd').onclick=function(){
      listaTmp.push({cod:'nuevo_'+Date.now().toString(36).slice(-4), label:'Nuevo Puesto', icon:'👤', sector:'turno'});
      renderList();
    };
    document.getElementById('pSave').onclick=async function(){
      // Validar: cod único, label no vacío
      var seen={}, err=null;
      listaTmp.forEach(function(p){
        if(!p.cod||!p.label){ err='Código y nombre son obligatorios'; return; }
        p.cod = String(p.cod).toLowerCase().replace(/[^a-z0-9_]/g,'_');
        if(seen[p.cod]){ err='Código duplicado: '+p.cod; return; }
        seen[p.cod]=1;
      });
      if(err){ showToast(err,'error'); return; }
      var r = await API.put('/config/puestos', listaTmp);
      if(r && r.ok){
        _cfgCache.puestos = r.puestos||listaTmp;
        showToast('✅ Puestos actualizados','success');
        m.remove();
        // refrescar modal de accesos si sigue abierto
        if(document.getElementById('accesosModal')) abrirConfigAccesos();
      } else showToast('Error al guardar puestos','error');
    };
  };

  // ═══════════════════ Gestión de Grupos ═════════════════════
  window.abrirGestionGrupos = async function(){
    var prev=document.getElementById('gruposModal'); if(prev) prev.remove();
    if(!_cfgCache.puestos.length) await _cargarConfig();

    var m=document.createElement('div'); m.id='gruposModal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1200;display:flex;align-items:center;justify-content:center;padding:14px';
    m.onclick=function(e){ if(e.target===m) m.remove(); };

    var inner=document.createElement('div');
    inner.style.cssText='background:#fff;border-radius:16px;width:95%;max-width:700px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column';
    inner.onclick=function(e){e.stopPropagation();};

    var hdr=document.createElement('div');
    hdr.style.cssText='padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:#7c3aed;color:#fff';
    hdr.innerHTML='<div><div style="font-size:14px;font-weight:800">🗂 Gestión de Grupos de Rangos</div><div style="font-size:10px;color:#e9d5ff;margin-top:2px">Agrupa puestos para aplicar permisos en lote</div></div>'+
      '<button id="gClose" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer">✕</button>';
    inner.appendChild(hdr);

    var body=document.createElement('div'); body.id='gruposBody';
    body.style.cssText='flex:1;overflow:auto;padding:14px 18px;background:#fff;font-size:12px';
    inner.appendChild(body);

    var ftr=document.createElement('div');
    ftr.style.cssText='padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:space-between;align-items:center;background:#f8fafc';
    ftr.innerHTML='<button id="gAdd" class="btn btn-primary btn-sm" style="background:#7c3aed">➕ Agregar Grupo</button>'+
      '<button id="gSave" class="btn btn-primary btn-sm" style="background:#16a34a">💾 Guardar Cambios</button>';
    inner.appendChild(ftr);

    m.appendChild(inner); document.body.appendChild(m);
    document.getElementById('gClose').onclick=function(){ m.remove(); };

    var listaTmp = _cfgCache.grupos.slice();
    var puestosAll = _todosPuestos().filter(function(p){ return !p.admin; });

    function renderList(){
      if(!listaTmp.length){
        body.innerHTML='<div style="text-align:center;padding:30px 20px;color:var(--text3);font-size:11px">Sin grupos. Usa <strong>Agregar Grupo</strong> para crear uno.<br><br>Ejemplo: crea un grupo <em>"Ventas"</em> con todos los puestos de ventas para aplicar permisos en lote.</div>';
        return;
      }
      var h=listaTmp.map(function(g,i){
        var chips = puestosAll.map(function(p){
          var on = (g.puestos||[]).indexOf(p.cod)>=0;
          return '<label style="display:inline-flex;align-items:center;gap:3px;padding:3px 7px;margin:2px;border-radius:14px;background:'+(on?'#ede9fe':'#f1f5f9')+';border:1px solid '+(on?'#7c3aed':'#e2e8f0')+';font-size:10px;cursor:pointer;font-weight:'+(on?'700':'400')+';color:'+(on?'#7c3aed':'var(--text2)')+'">'+
            '<input type="checkbox" data-gi="'+i+'" data-cod="'+p.cod+'" '+(on?'checked':'')+' style="margin:0;width:11px;height:11px;accent-color:#7c3aed">'+
            p.icon+' '+p.label+'</label>';
        }).join('');
        return '<div style="margin-bottom:14px;border:1px solid var(--border);border-radius:10px;padding:10px;background:#fafbfc">'+
          '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">'+
            '<input data-gi="'+i+'" data-k="nombre" value="'+(g.nombre||'').replace(/"/g,'&quot;')+'" placeholder="Nombre del grupo" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-weight:700">'+
            '<input type="color" data-gi="'+i+'" data-k="color" value="'+(g.color||'#7c3aed')+'" style="width:36px;height:32px;padding:2px;border:1px solid var(--border);border-radius:6px;cursor:pointer">'+
            '<button data-gdel="'+i+'" style="background:#fee2e2;border:1px solid #fecaca;color:#dc2626;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:11px">Eliminar</button>'+
          '</div>'+
          '<div style="font-size:9px;color:var(--text3);margin-bottom:4px;font-weight:700">PUESTOS DEL GRUPO</div>'+
          '<div>'+chips+'</div>'+
        '</div>';
      }).join('');
      body.innerHTML=h;

      body.querySelectorAll('input[data-k]').forEach(function(el){
        el.oninput=el.onchange=function(){
          var i=+el.dataset.gi, k=el.dataset.k;
          if(!listaTmp[i]) return;
          listaTmp[i][k]=el.value;
        };
      });
      body.querySelectorAll('input[type=checkbox][data-cod]').forEach(function(cb){
        cb.onchange=function(){
          var i=+cb.dataset.gi, cod=cb.dataset.cod;
          if(!listaTmp[i]) return;
          listaTmp[i].puestos = listaTmp[i].puestos||[];
          var idx = listaTmp[i].puestos.indexOf(cod);
          if(cb.checked && idx<0) listaTmp[i].puestos.push(cod);
          else if(!cb.checked && idx>=0) listaTmp[i].puestos.splice(idx,1);
          renderList(); // re-render para refrescar chip styles
        };
      });
      body.querySelectorAll('button[data-gdel]').forEach(function(b){
        b.onclick=function(){ listaTmp.splice(+b.dataset.gdel,1); renderList(); };
      });
    }
    renderList();

    document.getElementById('gAdd').onclick=function(){
      listaTmp.push({id:'grupo_'+Date.now().toString(36).slice(-4), nombre:'Nuevo Grupo', color:'#7c3aed', puestos:[]});
      renderList();
    };
    document.getElementById('gSave').onclick=async function(){
      var r=await API.put('/config/grupos-rangos', listaTmp);
      if(r && r.ok){
        _cfgCache.grupos = r.grupos||listaTmp;
        showToast('✅ Grupos actualizados','success');
        m.remove();
        if(document.getElementById('accesosModal')) abrirConfigAccesos();
      } else showToast('Error al guardar grupos','error');
    };
  };

  console.log('[LuceBien] Configurar Accesos v2 — cargado (sectores + puestos + grupos)');
})();

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT/EXPORT EXCEL DE HORARIOS (v5.4.1)
// Requisito: SheetJS (XLSX) cargado globalmente vía CDN en index.html.
// Formato esperado del Excel:
//   Col A: Nombre del colaborador (match case-insensitive contra empleados.nombre)
//   Cols B-O: sede code por slot, orden fijo:
//     lunes_M, lunes_T, martes_M, martes_T, ..., domingo_M, domingo_T
//   Valores válidos por celda: ST, LB, AL, TR, o vacío (= libre)
//   Primera fila = encabezados (se ignora).
// ═══════════════════════════════════════════════════════════════════════════
(function(){
  var DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  var SEDES_VALIDAS = ['ST','LB','AL','TR'];

  function _colHeaders(){
    var out = ['Nombre'];
    DIAS.forEach(function(d){
      out.push(d+'_M');
      out.push(d+'_T');
    });
    return out;
  }

  window.descargarPlantillaHorarios = async function(){
    if (typeof XLSX === 'undefined') { showToast('Librería Excel no cargó (sin conexión?)','error'); return; }
    // Construir plantilla con empleados actuales (si los hay) y slots vacíos
    var empleados = [];
    try { empleados = await API.get('/empleados')||[]; } catch(e){}
    if (!Array.isArray(empleados)) empleados = [];
    var headers = _colHeaders();
    var rows = [headers];
    empleados
      .filter(function(e){ return (e.estado||'activo')==='activo'; })
      .sort(function(a,b){ return String(a.nombre||'').localeCompare(String(b.nombre||'')); })
      .forEach(function(e){
        var row = [e.nombre||''];
        for (var i=0; i<14; i++) row.push('');
        rows.push(row);
      });
    var ws = XLSX.utils.aoa_to_sheet(rows);
    // Ancho de columnas
    ws['!cols'] = [{wch:28}].concat(headers.slice(1).map(function(){return{wch:10};}));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Horarios');
    // Hoja de referencia
    var refRows = [
      ['Valores permitidos por celda:'],
      ['ST = Stan'],
      ['LB = LuceBien'],
      ['AL = Almacén'],
      ['TR = Trece'],
      ['(vacío) = Libre / no trabaja'],
      [''],
      ['Formato de columnas:'],
      ['<día>_M = turno Mañana'],
      ['<día>_T = turno Tarde'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(refRows), 'Instrucciones');
    XLSX.writeFile(wb, 'plantilla_horarios_lucebien.xlsx');
    showToast('📥 Plantilla descargada','success');
  };

  window.abrirImportHorariosExcel = function(){
    if (typeof XLSX === 'undefined') {
      showToast('Librería Excel no cargó — revisa conexión a Internet','error');
      return;
    }
    var prev = document.getElementById('impHorModal'); if (prev) prev.remove();

    var m = document.createElement('div'); m.id='impHorModal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1200;display:flex;align-items:center;justify-content:center;padding:14px';
    m.onclick=function(e){ if(e.target===m) m.remove(); };

    var inner = document.createElement('div');
    inner.style.cssText='background:#fff;border-radius:16px;width:96%;max-width:880px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column';
    inner.onclick=function(e){e.stopPropagation();};

    inner.innerHTML =
      '<div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:#1e3a5f;color:#fff">'+
        '<div><div style="font-size:15px;font-weight:800">📎 Importar Horarios desde Excel</div><div style="font-size:10px;color:#cbd5e1">Sobrescribe horarios de los empleados que aparezcan en el archivo</div></div>'+
        '<button id="ihClose" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer">✕</button>'+
      '</div>'+
      '<div style="padding:16px 20px;flex:1;overflow:auto;background:#fafbfc">'+
        '<div style="padding:10px 14px;border:1px dashed #94a3b8;border-radius:10px;background:#fff;margin-bottom:12px">'+
          '<div style="font-size:11px;color:var(--text2);margin-bottom:8px"><strong>Paso 1:</strong> Descarga la plantilla, complétala y sube el archivo aquí.</div>'+
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
            '<button id="ihPlantilla" class="btn btn-ghost btn-sm">📥 Descargar plantilla</button>'+
            '<input id="ihFile" type="file" accept=".xlsx,.xls,.csv" style="font-size:11px">'+
          '</div>'+
        '</div>'+
        '<div id="ihPreview"></div>'+
      '</div>'+
      '<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:space-between;align-items:center;background:#f8fafc">'+
        '<div id="ihStats" style="font-size:11px;color:var(--text3)"></div>'+
        '<div style="display:flex;gap:8px">'+
          '<button id="ihCancel" class="btn btn-ghost btn-sm">Cancelar</button>'+
          '<button id="ihApply"  class="btn btn-primary btn-sm" disabled style="background:#16a34a;opacity:.5">Aplicar Horarios</button>'+
        '</div>'+
      '</div>';

    m.appendChild(inner);
    document.body.appendChild(m);

    document.getElementById('ihClose').onclick=function(){ m.remove(); };
    document.getElementById('ihCancel').onclick=function(){ m.remove(); };
    document.getElementById('ihPlantilla').onclick=descargarPlantillaHorarios;

    var _parsed = null; // [{emp_id, nombre, slots:[...], matched:bool, reason}]

    document.getElementById('ihFile').onchange = async function(ev){
      var file = ev.target.files[0]; if (!file) return;
      var buf  = await file.arrayBuffer();
      var wb;
      try { wb = XLSX.read(buf, {type:'array'}); }
      catch(err){ showToast('No se pudo leer el archivo: '+err.message,'error'); return; }

      var sheet = wb.Sheets[wb.SheetNames[0]];
      var rows  = XLSX.utils.sheet_to_json(sheet, {header:1, raw:false, defval:''});
      if (!rows || rows.length<2) { showToast('Archivo vacío o sin filas de datos','error'); return; }

      // Validar encabezado (flexible: ignora mayúsculas/acentos)
      var expected = _colHeaders();
      var header = (rows[0]||[]).map(function(c){return String(c||'').trim().toLowerCase();});
      var expectedLower = expected.map(function(c){return c.toLowerCase();});
      var headerOk = expectedLower.every(function(h,i){ return (header[i]||'').indexOf(h)===0 || h==='nombre' && /nombre|colab/.test(header[0]||''); });

      // Cargar empleados
      var empleados = [];
      try { empleados = await API.get('/empleados')||[]; } catch(e){ empleados = []; }
      var byNombre = {};
      empleados.forEach(function(e){
        if (e && e.nombre) byNombre[String(e.nombre).trim().toLowerCase()] = e;
      });

      _parsed = [];
      for (var i=1; i<rows.length; i++){
        var r = rows[i]; if (!r || !r[0]) continue;
        var nombre = String(r[0]).trim(); if (!nombre) continue;
        var emp = byNombre[nombre.toLowerCase()];
        var slots = [];
        var warns = [];
        for (var j=0; j<DIAS.length; j++){
          ['M','T'].forEach(function(turno, kk){
            var idx = 1 + j*2 + kk;
            var val = String(r[idx]||'').trim().toUpperCase();
            if (!val) return;
            if (SEDES_VALIDAS.indexOf(val) < 0){
              warns.push(DIAS[j]+' '+turno+'="'+val+'" inválido');
              return;
            }
            slots.push({dia:DIAS[j], turno:turno, sede:val});
          });
        }
        _parsed.push({
          nombre:nombre,
          emp_id: emp ? emp.id : null,
          matched: !!emp,
          slots: slots,
          warns: warns,
        });
      }

      // Render preview
      var preview = document.getElementById('ihPreview');
      var matched = _parsed.filter(function(x){return x.matched;}).length;
      var unmatched = _parsed.length - matched;
      var totalSlots = _parsed.reduce(function(s,x){return s+x.slots.length;}, 0);
      var headerHtml = '<div style="margin-bottom:8px;display:flex;gap:12px;font-size:11px">'+
        '<div style="padding:6px 10px;border-radius:6px;background:#dcfce7;color:#166534;font-weight:700">✓ '+matched+' reconocidos</div>'+
        (unmatched ? '<div style="padding:6px 10px;border-radius:6px;background:#fee2e2;color:#991b1b;font-weight:700">✗ '+unmatched+' no encontrados</div>' : '')+
        '<div style="padding:6px 10px;border-radius:6px;background:#e0e7ff;color:#3730a3;font-weight:700">∑ '+totalSlots+' slots</div>'+
        (!headerOk ? '<div style="padding:6px 10px;border-radius:6px;background:#fef3c7;color:#92400e;font-weight:700">⚠ Encabezado no estándar</div>' : '')+
      '</div>';

      var rowsHtml = '<table style="width:100%;border-collapse:collapse;font-size:10px">'+
        '<thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:5px 8px">Colaborador</th><th style="text-align:center">Estado</th><th style="text-align:center">Slots</th><th style="text-align:left">Observaciones</th></tr></thead><tbody>';
      _parsed.forEach(function(x){
        var statusBg = x.matched ? '#dcfce7' : '#fee2e2';
        var statusFg = x.matched ? '#166534' : '#991b1b';
        var status   = x.matched ? '✓ OK' : '✗ No encontrado';
        rowsHtml += '<tr style="border-bottom:1px solid #f1f5f9">'+
          '<td style="padding:5px 8px;font-weight:600">'+x.nombre+'</td>'+
          '<td style="padding:5px 8px;text-align:center"><span style="padding:2px 7px;border-radius:5px;font-weight:700;background:'+statusBg+';color:'+statusFg+'">'+status+'</span></td>'+
          '<td style="padding:5px 8px;text-align:center">'+x.slots.length+'</td>'+
          '<td style="padding:5px 8px;color:#92400e">'+(x.warns.length?x.warns.join(' · '):'—')+'</td>'+
        '</tr>';
      });
      rowsHtml += '</tbody></table>';

      preview.innerHTML = headerHtml + rowsHtml;
      document.getElementById('ihStats').textContent = matched+' de '+_parsed.length+' empleados aplicables · '+totalSlots+' slots';

      var applyBtn = document.getElementById('ihApply');
      applyBtn.disabled = !matched;
      applyBtn.style.opacity = matched ? '1' : '.5';
    };

    document.getElementById('ihApply').onclick = async function(){
      if (!_parsed) return;
      var aplicables = _parsed.filter(function(x){return x.matched;});
      if (!aplicables.length){ showToast('Nada para aplicar','warn'); return; }
      if (!confirm('Se sobrescribirán los horarios de '+aplicables.length+' colaborador(es). ¿Continuar?')) return;
      var payload = { empleados: aplicables.map(function(x){ return {emp_id:x.emp_id, slots:x.slots}; }) };
      var btn = document.getElementById('ihApply'); btn.disabled=true; btn.textContent='Aplicando…';
      try {
        var r = await API.post('/asistencias/horarios/bulk', payload);
        if (r && r.ok){
          showToast('✅ '+r.empleados+' horarios actualizados ('+r.slots+' slots)','success');
          m.remove();
          // Si el editor de horario está visible para algún empleado, recargar
          if (typeof cargarAsistencias === 'function') {
            try { cargarAsistencias(); } catch(e){}
          }
        } else {
          showToast((r&&r.error)||'Error al aplicar horarios','error');
          btn.disabled=false; btn.textContent='Aplicar Horarios';
        }
      } catch(err){
        showToast('Error: '+err.message,'error');
        btn.disabled=false; btn.textContent='Aplicar Horarios';
      }
    };
  };

  console.log('[LuceBien] Import Excel Horarios — cargado');
})();

// ═══════════════════════════════════════════════════════
// EDITOR DE TIPIFICACIONES DE INCIDENCIAS (admin)
// ═══════════════════════════════════════════════════════
// Cada tipificación define: tipo (descripción corta), categoría, nivel por
// defecto y puntos que descuenta. Si una incidencia creada no coincide con
// ninguna tipificación, en la evaluación mensual se calificará manualmente.
(function(){
  window.abrirEditorTiposIncidencia = async function() {
    var prev = document.getElementById('tipInModal'); if (prev) prev.remove();
    var tipos = await API.get('/incidencias/tipos/list?all=1');
    if (!tipos) return;
    var h = '<div id="tipInModal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1050;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)this.remove()">' +
      '<div style="background:#fff;border-radius:14px;width:96%;max-width:940px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>⚙️ Tipificaciones de Incidencias</h2><button class="modal-close" onclick="document.getElementById(\'tipInModal\').remove()">✕</button></div>' +
      '<div style="padding:10px 14px 0;font-size:11px;color:var(--text3);line-height:1.45">' +
      'Cada tipificación define los puntos que descuenta en la evaluación mensual. ' +
      'Si una incidencia creada <b>no está tipificada</b>, deberá calificarse manualmente al evaluar al colaborador.' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:12px 14px">' +
      '<div class="filter-bar" style="margin-bottom:8px">' +
      '<button class="btn btn-primary btn-xs" id="tipInAdd">＋ Nueva tipificación</button>' +
      '<span class="filter-sep"></span>' +
      '<span class="filter-label">Categoría</span>' +
      '<select id="tipInCatFilt" class="filter-ctrl"><option value="">Todas</option></select>' +
      '<span class="filter-label">Estado</span>' +
      '<select id="tipInEstFilt" class="filter-ctrl"><option value="">Todos</option><option value="1">Activos</option><option value="0">Inactivos</option></select>' +
      '</div>' +
      '<div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th style="width:30%">Tipo</th><th>Categoría</th><th>Nivel</th><th>Puntos</th><th>Activa</th><th></th>' +
      '</tr></thead><tbody id="tipInBody"></tbody></table></div>' +
      '</div>' +
      '<div class="modal-footer">' +
      '<button class="btn btn-ghost" onclick="document.getElementById(\'tipInModal\').remove()">Cancelar</button>' +
      '<button class="btn btn-primary" id="tipInSave">💾 Guardar todo</button>' +
      '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);

    var body = document.getElementById('tipInBody');
    function rowHtml(t, idx) {
      return '<tr data-idx="'+idx+'">' +
        '<td><input type="text" class="t-tipo" value="'+ (t.tipo||'').replace(/"/g,'&quot;') +'" style="width:100%;font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:6px"></td>' +
        '<td><input type="text" class="t-cat" value="'+ (t.categoria||'').replace(/"/g,'&quot;') +'" style="width:130px;font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:6px"></td>' +
        '<td><select class="t-niv" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:6px">' +
          ['Alto','Medio','Bajo'].map(function(n){return '<option'+(t.nivel_default===n?' selected':'')+'>'+n+'</option>';}).join('') +
        '</select></td>' +
        '<td><input type="number" class="t-pts" min="0" max="20" step="0.5" value="'+ (t.puntos_default!=null?t.puntos_default:2) +'" style="width:70px;font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:6px;font-weight:700;color:var(--red);text-align:center"></td>' +
        '<td style="text-align:center"><input type="checkbox" class="t-act"'+ (t.activo!==0?' checked':'') +'></td>' +
        '<td><button class="btn btn-danger btn-xs" onclick="this.closest(\'tr\').remove()">✕</button></td>' +
      '</tr>';
    }
    function render(list) {
      body.innerHTML = list.length ? list.map(rowHtml).join('') : '<tr><td class="empty-cell" colspan="6">Sin tipificaciones</td></tr>';
    }
    render(tipos);

    // Filtro de categoría
    var cats = {};
    tipos.forEach(function(t){ if(t.categoria) cats[t.categoria]=1; });
    var catSel = document.getElementById('tipInCatFilt');
    Object.keys(cats).sort().forEach(function(c){ catSel.insertAdjacentHTML('beforeend','<option>'+c+'</option>'); });
    function applyFilter() {
      var cat = catSel.value;
      var est = document.getElementById('tipInEstFilt').value;
      var list = tipos.filter(function(t){
        if (cat && t.categoria !== cat) return false;
        if (est === '1' && t.activo === 0) return false;
        if (est === '0' && t.activo !== 0) return false;
        return true;
      });
      render(list);
    }
    catSel.onchange = applyFilter;
    document.getElementById('tipInEstFilt').onchange = applyFilter;

    document.getElementById('tipInAdd').onclick = function() {
      var nuevo = {tipo:'Nueva incidencia', categoria:'Otros', nivel_default:'Medio', puntos_default:2, activo:1};
      tipos.push(nuevo);
      applyFilter();
    };

    document.getElementById('tipInSave').onclick = async function() {
      // Tomar el DOM actual (respetando ediciones en vista filtrada)
      var rows = Array.from(body.querySelectorAll('tr[data-idx]'));
      var acumulado = [];
      rows.forEach(function(tr){
        var tipo = tr.querySelector('.t-tipo').value.trim();
        if (!tipo) return;
        acumulado.push({
          tipo: tipo,
          categoria: tr.querySelector('.t-cat').value.trim() || 'Otros',
          nivel_default: tr.querySelector('.t-niv').value,
          puntos_default: parseFloat(tr.querySelector('.t-pts').value)||0,
          activo: tr.querySelector('.t-act').checked ? 1 : 0
        });
      });
      // Dedupe por tipo (case-insensitive): se queda con la última ocurrencia
      var seen={};var limpio=[];
      for (var i=acumulado.length-1;i>=0;i--){var k=acumulado[i].tipo.toLowerCase();if(seen[k])continue;seen[k]=1;limpio.unshift(acumulado[i]);}
      var btn = this; btn.disabled=true; btn.textContent='Guardando…';
      var r = await API.put('/incidencias/tipos/list', { tipos: limpio });
      btn.disabled=false; btn.textContent='💾 Guardar todo';
      if (r && r.ok) {
        showToast('✅ '+r.count+' tipificaciones guardadas','success');
        document.getElementById('tipInModal').remove();
      }
    };
  };
  console.log('[LuceBien] Editor de Tipificaciones de Incidencias — cargado');
})();

// ═══════════════════════════════════════════════════════
// LAYOUT TOOLTIPS — carga al boot + editor en Config del Layout
// ═══════════════════════════════════════════════════════
(function(){
  // Cargar tooltips custom al iniciar (no requiere auth para GET)
  window.LB_LAYOUT_TOOLTIPS = window.LB_LAYOUT_TOOLTIPS || {byTipo:{},byPrefix:{}};
  async function _loadTips(){
    try{
      var t = await API.get('/config/layout-tooltips');
      if (t && (t.byTipo||t.byPrefix)) window.LB_LAYOUT_TOOLTIPS = t;
    }catch(e){}
  }
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(_loadTips, 600); });

  // Editor de tooltips del layout (solo admin)
  window.abrirEditorTooltipsLayout = async function(){
    var t = await API.get('/config/layout-tooltips') || {byTipo:{},byPrefix:{}};
    var tipos = [
      ['maniqui','Maniquí','Desempolvar con escobilla para ternos'],
      ['vitrina','Vitrina','Limpiar con limpiavidrios y trapo especial para vidrios'],
      ['espejo','Espejo','Limpiar con limpiavidrios y paño seco'],
      ['mueble','Mueble','Limpiar superficie con trapo húmedo y limpiatodo'],
      ['riel','Riel','Desempolvar ternos colgados y limpiar el tubo/varilla'],
      ['silla','Silla','Limpiar cojín con trapo si hay suciedad'],
      ['equipo','Equipo','Limpiar mesa de plancha y tanque de agua'],
      ['area','Área','Limpiar y ordenar el área'],
      ['piso','Piso','Barrer y trapear todo el interior'],
      ['calle','Calle','Barrer y baldear con agua y detergente']
    ];
    var prefs = [
      ['MC','Máquinas de costura','Limpiar mesa de máquina de costura con trapo'],
      ['CB','Cajones/cubetas','Limpiar mueble colgante y todos los objetos que contiene'],
      ['CT','Cortineros/techo','Desempolvar rieles colgantes del techo (cada 2 semanas)'],
      ['PC','Computadora','Limpiar computadora y mueble donde está ubicada'],
      ['CO','Corbateros','Limpiar corbatero con trapo'],
      ['ME','Estantes','Limpiar estante y reorganizar contenido']
    ];
    var esc=function(s){return (s||'').replace(/"/g,'&quot;');};
    var rowsTipo = tipos.map(function(r){
      var val = (t.byTipo&&t.byTipo[r[0]]) || '';
      return '<tr><td style="font-weight:700;font-size:11px;padding:5px 6px">'+r[1]+'</td>'+
        '<td style="font-size:10px;color:var(--text3);padding:5px 6px;width:34%">'+r[2]+'</td>'+
        '<td style="padding:3px 4px"><input type="text" data-tipo="'+r[0]+'" placeholder="(usar por defecto)" value="'+esc(val)+'" style="width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:5px;font-size:11px"></td></tr>';
    }).join('');
    var rowsPref = prefs.map(function(r){
      var val = (t.byPrefix&&t.byPrefix[r[0]]) || '';
      return '<tr><td style="font-weight:700;font-family:var(--font-m);font-size:11px;padding:5px 6px">'+r[0]+'</td>'+
        '<td style="font-size:11px;padding:5px 6px">'+r[1]+'</td>'+
        '<td style="font-size:10px;color:var(--text3);padding:5px 6px;width:30%">'+r[2]+'</td>'+
        '<td style="padding:3px 4px"><input type="text" data-pref="'+r[0]+'" placeholder="(usar por defecto)" value="'+esc(val)+'" style="width:100%;padding:5px 7px;border:1px solid var(--border);border-radius:5px;font-size:11px"></td></tr>';
    }).join('');
    var h = '<div id="tipLayModal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1250;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)this.remove()">' +
      '<div style="background:#fff;border-radius:14px;width:96%;max-width:820px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>💬 Mensajes de tooltip del Layout</h2><button class="modal-close" onclick="document.getElementById(\'tipLayModal\').remove()">✕</button></div>' +
      '<div style="padding:10px 14px 0;font-size:11px;color:var(--text3);line-height:1.45">Edita lo que aparece cuando el usuario pasa el mouse sobre un elemento del layout. Dejar vacío = usar el texto por defecto.</div>' +
      '<div style="flex:1;overflow-y:auto;padding:12px 14px">' +
      '<div style="font-size:11px;font-weight:700;color:var(--navy);margin-bottom:6px">POR TIPO DE ELEMENTO</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px"><thead><tr style="background:var(--s2)"><th style="padding:5px 6px;text-align:left">Tipo</th><th style="padding:5px 6px;text-align:left">Default</th><th style="padding:5px 6px;text-align:left">Mensaje custom</th></tr></thead><tbody>'+rowsTipo+'</tbody></table>' +
      '<div style="font-size:11px;font-weight:700;color:var(--navy);margin-bottom:6px">POR PREFIJO DE CÓDIGO <span style="font-weight:400;color:var(--text3);font-size:10px">(las 2 primeras letras del código)</span></div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:var(--s2)"><th style="padding:5px 6px;text-align:left">Prefijo</th><th style="padding:5px 6px;text-align:left">Familia</th><th style="padding:5px 6px;text-align:left">Default</th><th style="padding:5px 6px;text-align:left">Mensaje custom</th></tr></thead><tbody>'+rowsPref+'</tbody></table>' +
      '</div>' +
      '<div class="modal-footer"><button class="btn btn-ghost" onclick="document.getElementById(\'tipLayModal\').remove()">Cancelar</button><button class="btn btn-primary" id="tipLaySave">💾 Guardar</button></div>' +
      '</div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
    document.getElementById('tipLaySave').onclick = async function(){
      var payload = {byTipo:{},byPrefix:{}};
      document.querySelectorAll('#tipLayModal input[data-tipo]').forEach(function(i){
        var v=i.value.trim(); if(v) payload.byTipo[i.dataset.tipo]=v;
      });
      document.querySelectorAll('#tipLayModal input[data-pref]').forEach(function(i){
        var v=i.value.trim(); if(v) payload.byPrefix[i.dataset.pref]=v;
      });
      this.disabled=true; this.textContent='Guardando…';
      var r = await API.put('/config/layout-tooltips', payload);
      if (r && r.ok){
        window.LB_LAYOUT_TOOLTIPS = payload;
        showToast('✅ Tooltips actualizados','success');
        document.getElementById('tipLayModal').remove();
        if (typeof _glmR==='function') try{_glmR();}catch(e){}
      } else {
        this.disabled=false; this.textContent='💾 Guardar';
      }
    };
  };

  // Inyectar botón "Mensajes tooltip" en el modal de Configuración del Layout
  document.addEventListener('click', function(e){
    if (e.target && e.target.closest && e.target.closest('[onclick*="_gaLayoutConfig"]')) {
      setTimeout(function(){
        var mc = document.getElementById('gaConfigModal'); if (!mc) return;
        if (mc.querySelector('#tipLayInjectBtn')) return;
        var body = mc.querySelector('.modal-footer')?.previousElementSibling || mc.querySelector('div[style*="overflow-y:auto"]');
        if (!body) return;
        var sec = document.createElement('div');
        sec.innerHTML = '<div style="margin-top:16px;padding:10px 12px;background:var(--s3);border-radius:8px;border-left:3px solid var(--navy)"><div style="font-size:11px;font-weight:700;color:var(--navy);margin-bottom:4px">💬 MENSAJES DE TOOLTIP</div><div style="font-size:10px;color:var(--text3);margin-bottom:8px;line-height:1.4">Edita el texto que aparece al pasar el mouse sobre cada elemento del layout (por tipo y por prefijo de código).</div><button id="tipLayInjectBtn" class="btn btn-primary btn-xs" onclick="abrirEditorTooltipsLayout()">Abrir editor de tooltips</button></div>';
        body.appendChild(sec);
      }, 80);
    }
  });

  console.log('[LuceBien] Layout tooltips editor — cargado');
})();

console.log('[LuceBien] patches-v5.js — Global system changes + Layout tools loaded');
})();
