// ═══════════════════════════════════════════════════════════
// LUCEBIEN · public/js/horarios-v2.js
// Sistema de horarios: parser Excel real, importación, Mi Horario,
// grilla admin imprimible. Se apoya en XLSX (ya cargado en index.html).
// ═══════════════════════════════════════════════════════════
(function(){
  'use strict';

  // ── Mapeo de secciones del Excel → sede + sector ──────────
  // Clave: texto exacto que aparece como cabecera de sección (puede variar
  // ligeramente; el parser normaliza mayúsculas y tildes antes de buscar).
  var SEC_MAP = {
    'TIENDA LUCE BIEN':  { sede: 'LB', sector: 'tienda' },
    'STAND 101 Y 102':   { sede: 'ST', sector: 'stand' },
    'TRECE':             { sede: 'TR', sector: 'trece' },
    'ALMACEN':           { sede: 'AL', sector: 'almacen' },
    'ALMACÉN':           { sede: 'AL', sector: 'almacen' },
    'CONSULTA CON ENCARGADOS ADMINISTRATIVO': { sede: 'AL', sector: 'consulta' },
    'ENCARGADO DE COMPOSTURAS': { sede: 'AL', sector: 'compostura' },
    'ENCARGADO DE CONFECCION':  { sede: 'AL', sector: 'confeccion' },
    'ENCARGADO DE CONFECCIÓN':  { sede: 'AL', sector: 'confeccion' }
  };
  var SECTOR_LABEL = {
    tienda:'Tienda LuceBien', stand:'Stand 101/102', trece:'Trece', almacen:'Almacén',
    consulta:'Consulta Admin.', compostura:'Composturas', confeccion:'Confección'
  };
  var SECTOR_ICON = { tienda:'🏬', stand:'🏪', trece:'🛍️', almacen:'📦', consulta:'💼', compostura:'🧵', confeccion:'✂️' };
  var DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  var DIA_LABEL = { lunes:'Lun', martes:'Mar', miercoles:'Mié', jueves:'Jue', viernes:'Vie', sabado:'Sáb', domingo:'Dom' };

  // Normalizador: upper + strip tildes + trim + collapse spaces
  function nrm(s) {
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  }

  // Primer nombre (para matching)
  function primerNombre(s) {
    return nrm(s).split(/\s+/)[0] || '';
  }

  // ── Parser de una celda: "ALEXANDER       \n8AM A 1:15PM" ──
  function parseCell(raw) {
    if (!raw) return null;
    var s = String(raw).replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
    if (!s) return null;
    // Detectar "H[H][:MM][AM|PM]? A H[H][:MM][AM|PM]?"
    var hRe = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*A\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i;
    var m = s.match(hRe);
    var hi = null, hf = null;
    if (m) {
      hi = hhmm(m[1], m[2], m[3], 'start');
      hf = hhmm(m[4], m[5], m[6], 'end', hi);
      s = s.replace(hRe, '').trim();
    }
    // Limpiar puntuación residual
    s = s.replace(/[·•\-–—]+\s*$/, '').trim();
    var nombre = s;
    if (!nombre) return null;
    return { nombre_raw: nombre, hora_inicio: hi, hora_fin: hf };
  }

  // Convierte (H, MM, AM/PM) → "HH:MM" 24h
  // Si falta AM/PM en "end" pero "start" tiene AM, asumimos que "end" es PM
  // (caso real: "8 A 1:15PM" → start=08:00 AM, end=13:15 PM).
  function hhmm(h, m, ap, kind, startHM) {
    var H = parseInt(h,10); if (isNaN(H)) return null;
    var M = parseInt(m||'0',10); if (isNaN(M)) M = 0;
    if (ap) {
      var AP = ap.toUpperCase();
      if (AP === 'PM' && H < 12) H += 12;
      if (AP === 'AM' && H === 12) H = 0;
    } else if (kind === 'end' && startHM) {
      // Inferir: si start es AM y end como hora cae antes que start, sumar 12
      var sh = parseInt(startHM.split(':')[0], 10);
      if (H < sh && H < 12) H += 12;
    } else if (kind === 'start' && H>=1 && H<=6) {
      // Heurística para horas 1..6 sin indicador: casi siempre PM en retail
      H += 12;
    }
    return String(H).padStart(2,'0') + ':' + String(M).padStart(2,'0');
  }

  // ── Parser de la hoja completa ────────────────────────────
  // Estrategia:
  //  1) Recorrer filas. Si la fila N es "cabecera de sección" (col[0] match
  //     contra SEC_MAP y columnas 2..15 casi vacías), abrir sección.
  //  2) Las siguientes 2 filas son cabecera (turno | responsable | día×sub).
  //     Extraer el label de sub-columna por día (ej. "CAJA", "VENTAS 1",
  //     "ENCARGADO", "B", "A", "COSTURA").
  //  3) Siguientes filas hasta próxima sección: filas de turno.
  //     col[0] en {TURNO MAÑANA, TURNO TARDE}; procesar pares de columnas.
  function parseHoja(rows) {
    var slots = [];
    var warnings = [];
    var sec = null;           // sección actual
    var subLabelsByDay = null; // [{dia, labels:[a,b]}] para 7 días
    var i = 0;
    while (i < rows.length) {
      var row = rows[i] || [];
      var first = nrm(row[0]);
      var restEmpty = row.slice(1).every(function(c){ return !c || !String(c).trim(); });
      // ¿Cabecera de sección?
      if (first && restEmpty && (SEC_MAP[first] || matchSecPrefix(first))) {
        sec = SEC_MAP[first] || matchSecPrefix(first);
        sec.rawName = first;
        // Las próximas 2 filas son la cabecera
        var hdr1 = rows[i+1] || []; // TURNO | RESPONSABLE | LUNES | '' | MARTES | '' | ...
        var hdr2 = rows[i+2] || []; // '' | '' | CAJA | VENTAS 1 | CAJA | VENTAS 1 | ...
        // Construir subLabelsByDay: columnas 2..15 alternan día×2
        subLabelsByDay = [];
        for (var k=0; k<7; k++) {
          var c1 = 2 + k*2;
          var c2 = c1 + 1;
          // Encontrar el nombre del día en hdr1 (puede estar en c1 o c2)
          var diaRaw = nrm(hdr1[c1]) || nrm(hdr1[c2]);
          var diaMap = {'LUNES':'lunes','MARTES':'martes','MIERCOLES':'miercoles','MIÉRCOLES':'miercoles','JUEVES':'jueves','VIERNES':'viernes','SABADO':'sabado','SÁBADO':'sabado','DOMINGO':'domingo'};
          var dia = diaMap[diaRaw] || DIAS[k];
          subLabelsByDay.push({
            dia: dia,
            labels: [ rolLabel(hdr2[c1]), rolLabel(hdr2[c2]) ]
          });
        }
        i += 3; // avanzar hasta la primera fila de turno
        continue;
      }
      // Fila de turno dentro de sección abierta
      if (sec && subLabelsByDay && /^TURNO (MAÑANA|TARDE|MANANA)/i.test(first)) {
        var turno = /TARDE/.test(first) ? 'T' : 'M';
        // Columnas 2..15 = celdas por día × 2
        for (var k2=0; k2<7; k2++) {
          var c1 = 2 + k2*2;
          var c2 = c1 + 1;
          var slotInfo = subLabelsByDay[k2];
          if (!slotInfo) continue;
          [c1,c2].forEach(function(ci, idx){
            var parsed = parseCell(row[ci]);
            if (!parsed || !parsed.nombre_raw) return;
            slots.push({
              _raw: parsed.nombre_raw,
              sede: sec.sede,
              sector: sec.sector,
              dia: slotInfo.dia,
              turno: turno,
              rol: slotInfo.labels[idx] || null,
              hora_inicio: parsed.hora_inicio,
              hora_fin: parsed.hora_fin
            });
          });
        }
        i++;
        continue;
      }
      i++;
    }
    return { slots: slots, warnings: warnings };
  }

  // Match por prefijo por si el texto de cabecera lleva sufijos extra
  function matchSecPrefix(txt) {
    var keys = Object.keys(SEC_MAP);
    for (var i=0; i<keys.length; i++) {
      if (txt.startsWith(keys[i])) return Object.assign({}, SEC_MAP[keys[i]]);
    }
    return null;
  }

  function rolLabel(x) {
    var s = nrm(x);
    if (!s) return null;
    // Canonicalizar
    if (/^CAJA/.test(s)) return 'caja';
    if (/^VENTAS/.test(s)) return 'ventas';
    if (/^ENCARGADO/.test(s)) return 'encargado';
    if (/^COSTURA/.test(s)) return 'costura';
    if (s === 'A') return 'a';
    if (s === 'B') return 'b';
    return s.toLowerCase();
  }

  // ── Matching difuso de nombres ────────────────────────────
  // Dado parsed.slots + lista de empleados, intenta resolver emp_id para
  // cada slot. Devuelve: {matched:[slots con emp_id], unmatched:[{raw,count}], people:[{raw,emp,slots:n}]}
  function matchNames(parsedSlots, empleados) {
    var byFirst = {};
    empleados.forEach(function(e){
      var f = primerNombre(e.nombre);
      if (!f) return;
      (byFirst[f] = byFirst[f] || []).push(e);
    });
    var unmatched = {};
    var byRaw = {};
    parsedSlots.forEach(function(s){
      var raw = s._raw;
      var key = nrm(raw);
      if (!byRaw[raw]) {
        var first = primerNombre(raw);
        var cands = byFirst[first] || [];
        // Si hay match único, tomarlo
        if (cands.length === 1) {
          byRaw[raw] = { emp: cands[0], candidatos: cands };
        } else if (cands.length > 1) {
          // Varios candidatos con el mismo primer nombre → marcar para desambiguar
          byRaw[raw] = { emp: null, candidatos: cands, needsChoice: true };
        } else {
          // Intentar match por substring: algún apellido/iniciales contenidos
          var hit = empleados.find(function(e){
            var en = nrm(e.nombre);
            return en.indexOf(first) >= 0 && first.length > 3;
          });
          byRaw[raw] = { emp: hit || null, candidatos: hit?[hit]:[] };
          if (!hit) unmatched[raw] = (unmatched[raw]||0) + 1;
        }
      }
      s.emp = byRaw[raw].emp;
      s.emp_id = byRaw[raw].emp ? byRaw[raw].emp.id : null;
      s.candidatos = byRaw[raw].candidatos;
      s.needsChoice = byRaw[raw].needsChoice || false;
    });
    var personas = Object.keys(byRaw).map(function(r){
      return { raw: r, emp: byRaw[r].emp, candidatos: byRaw[r].candidatos, needsChoice: byRaw[r].needsChoice, slots_count: parsedSlots.filter(function(s){return s._raw===r;}).length };
    });
    var unmatchedArr = Object.keys(unmatched).map(function(r){ return {raw:r, count:unmatched[r]}; });
    return { slots: parsedSlots, personas: personas, unmatched: unmatchedArr, byRaw: byRaw };
  }

  window.LB_HORARIOS = {
    parseHoja: parseHoja,
    parseCell: parseCell,
    matchNames: matchNames,
    nrm: nrm,
    primerNombre: primerNombre,
    SEC_MAP: SEC_MAP,
    SECTOR_LABEL: SECTOR_LABEL,
    SECTOR_ICON: SECTOR_ICON,
    DIAS: DIAS,
    DIA_LABEL: DIA_LABEL
  };

  // ═══════════════════════════════════════════════════════
  // UI: IMPORTAR HORARIO DESDE EXCEL REAL
  // ═══════════════════════════════════════════════════════
  window.abrirImportHorarioV2 = function() {
    var prev = document.getElementById('impHorV2Modal'); if (prev) prev.remove();
    var h = '<div id="impHorV2Modal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1200;display:flex;align-items:center;justify-content:center;padding:12px" onclick="if(event.target===this)this.remove()">' +
      '<div style="background:#fff;border-radius:14px;width:98%;max-width:1100px;max-height:94vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>📥 Importar horario desde Excel</h2><button class="modal-close" onclick="document.getElementById(\'impHorV2Modal\').remove()">✕</button></div>' +
      '<div style="padding:12px 16px 0;font-size:11px;color:var(--text3);line-height:1.45">Sube el Excel semanal con el formato de la empresa. Se detectan automáticamente las secciones (Tienda, Stand, Trece, Almacén, Consulta, Composturas, Confección), los turnos y los horarios por colaborador.</div>' +
      '<div style="padding:12px 16px">' +
      '<div class="filter-bar">' +
      '<label class="btn btn-primary btn-sm" style="cursor:pointer">📎 Elegir Excel<input type="file" id="ihv2File" accept=".xlsx,.xls" style="display:none"></label>' +
      '<span id="ihv2FileName" style="font-size:11px;color:var(--text3)">Ningún archivo</span>' +
      '</div>' +
      '<div id="ihv2Preview" style="margin-top:10px"></div>' +
      '</div>' +
      '<div class="modal-footer">' +
      '<button class="btn btn-ghost" onclick="document.getElementById(\'impHorV2Modal\').remove()">Cancelar</button>' +
      '<button class="btn btn-primary" id="ihv2Apply" disabled>Crear periodo y aplicar</button>' +
      '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);

    var parsed = null;
    var empleados = [];
    document.getElementById('ihv2File').addEventListener('change', async function(ev){
      var f = ev.target.files[0]; if (!f) return;
      document.getElementById('ihv2FileName').textContent = f.name;
      if (!window.XLSX) { showToast('Librería XLSX no cargada','error'); return; }
      try {
        var buf = await f.arrayBuffer();
        var wb = XLSX.read(buf, { type:'array' });
        var sheetName = wb.SheetNames[0];
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, defval:'' });
        var res = parseHoja(rows);
        // Cargar empleados (activos)
        empleados = await API.todosEmpleados() || [];
        empleados = empleados.filter(function(e){ return e.activo===1 || e.activo===true || e.estado==='activo' || !e.estado; });
        parsed = matchNames(res.slots, empleados);
        renderPreview(parsed, f.name);
        document.getElementById('ihv2Apply').disabled = false;
      } catch(e) {
        showToast('Error al leer Excel: '+e.message,'error');
        console.error(e);
      }
    });

    function renderPreview(p, fname) {
      var box = document.getElementById('ihv2Preview');
      var today = new Date().toISOString().slice(0,10);
      var defNombre = 'Horario ' + fname.replace(/\.(xlsx|xls)$/i,'').trim();
      var personasHtml = p.personas.map(function(x){
        var tag, color;
        if (x.emp) { tag = '✓ ' + x.emp.nombre + ' (' + x.emp.iniciales + ')'; color = '#16a34a'; }
        else if (x.needsChoice) { tag = '? ambiguo: ' + x.candidatos.map(function(c){return c.nombre;}).join(' / '); color = '#ea580c'; }
        else { tag = '✗ sin match'; color = '#dc2626'; }
        var sel = '';
        if (x.needsChoice || !x.emp) {
          sel = '<select class="ihv2-pick" data-raw="'+x.raw.replace(/"/g,'&quot;')+'" style="font-size:11px;padding:3px 6px;margin-left:8px;border:1px solid var(--border);border-radius:5px">'+
            '<option value="">— elegir —</option>' +
            empleados.map(function(e){ return '<option value="'+e.id+'"'+(x.emp&&x.emp.id===e.id?' selected':'')+'>'+e.nombre+' ('+e.iniciales+')</option>'; }).join('') +
            '</select>';
        }
        return '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid var(--border-s);font-size:11.5px">'+
          '<span style="font-weight:700;font-family:var(--font-m);min-width:140px">'+x.raw+'</span>'+
          '<span style="color:'+color+';font-size:11px;flex:1">'+tag+'</span>'+
          '<span style="font-size:10px;color:var(--text3)">'+x.slots_count+' slots</span>'+
          sel +
          '</div>';
      }).join('');

      // Resumen por sección
      var porSec = {};
      p.slots.forEach(function(s){ var k=s.sede+'/'+s.sector; porSec[k]=(porSec[k]||0)+1; });
      var secLine = Object.keys(porSec).map(function(k){ return k+': '+porSec[k]+' slots'; }).join(' · ');

      box.innerHTML =
        '<div class="grid-2" style="margin-bottom:10px">' +
          '<div class="field"><label>Nombre del periodo</label><input type="text" id="ihv2Nombre" value="'+defNombre.replace(/"/g,'&quot;')+'"></div>' +
          '<div class="field"><label>Fecha desde</label><input type="date" id="ihv2FechaIni" value="'+today+'"></div>' +
        '</div>' +
        '<div class="grid-2" style="margin-bottom:10px">' +
          '<div class="field"><label>Fecha hasta <span style="font-size:10px;color:var(--text3)">(vacío = vigente hasta nuevo aviso)</span></label><input type="date" id="ihv2FechaFin"></div>' +
          '<div class="field"><label>Notas</label><input type="text" id="ihv2Notas" placeholder="ej. Semana 15 abril"></div>' +
        '</div>' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:11.5px;margin-bottom:8px"><input type="checkbox" id="ihv2Activar" checked> Marcar este periodo como vigente al guardar</label>' +
        '<div class="card" style="margin-bottom:10px"><div class="card-header"><span class="card-title">Resumen</span></div><div class="card-body" style="padding:10px 14px;font-size:11px;color:var(--text2);line-height:1.5">' +
          '<b>'+p.slots.length+'</b> slots detectados · <b>'+p.personas.length+'</b> personas únicas · '+p.unmatched.length+' sin match' +
          '<div style="font-size:10px;color:var(--text3);margin-top:3px">'+secLine+'</div>' +
        '</div></div>' +
        '<div class="card"><div class="card-header"><span class="card-title">Personas detectadas</span></div><div style="max-height:260px;overflow-y:auto">'+personasHtml+'</div></div>';

      // Wire up pick selects → actualizar emp_id en slots
      document.querySelectorAll('.ihv2-pick').forEach(function(sel){
        sel.onchange = function(){
          var raw = sel.dataset.raw;
          var empId = sel.value ? parseInt(sel.value,10) : null;
          var emp = empleados.find(function(e){return e.id===empId;});
          parsed.slots.forEach(function(s){ if (s._raw===raw) { s.emp_id = empId; s.emp = emp; } });
          parsed.byRaw[raw] = { emp: emp, candidatos: emp?[emp]:[], needsChoice: false };
        };
      });
    }

    document.getElementById('ihv2Apply').onclick = async function() {
      if (!parsed) return;
      var nombre = document.getElementById('ihv2Nombre').value.trim();
      var fDesde = document.getElementById('ihv2FechaIni').value;
      var fHasta = document.getElementById('ihv2FechaFin').value || null;
      var notas  = document.getElementById('ihv2Notas').value.trim() || null;
      var activar = document.getElementById('ihv2Activar').checked;
      if (!nombre || !fDesde) { showToast('Completa nombre y fecha desde','error'); return; }
      var slotsListos = parsed.slots.filter(function(s){ return s.emp_id; });
      var desc = parsed.slots.length - slotsListos.length;
      if (desc>0) { var ok = await lbConfirm('⚠️ Slots sin empleado', 'Se descartarán <b>'+desc+'</b> turnos sin colaborador asignado. ¿Continuar?', { okLabel:'Sí, continuar' }); if (!ok) return; }
      this.disabled = true; this.textContent = 'Guardando…';
      try {
        var crea = await API.crearPeriodoHorario({ nombre:nombre, fecha_desde:fDesde, fecha_hasta:fHasta, notas:notas, activo:0 });
        if (!crea || !crea.id) throw new Error('No se pudo crear el periodo');
        var res = await API.subirSlotsPeriodo(crea.id, slotsListos.map(function(s){
          return { emp_id:s.emp_id, sede:s.sede, sector:s.sector, dia:s.dia, turno:s.turno, rol:s.rol, hora_inicio:s.hora_inicio, hora_fin:s.hora_fin };
        }));
        if (!res || !res.ok) throw new Error('No se pudieron subir los slots');
        if (activar) await API.activarPeriodoHorario(crea.id);
        showToast('✅ Horario importado: '+res.count+' slots','success');
        document.getElementById('impHorV2Modal').remove();
        if (typeof renderHorariosAdmin==='function') renderHorariosAdmin();
      } catch(e) {
        showToast('Error: '+e.message,'error');
        this.disabled=false; this.textContent='Crear periodo y aplicar';
      }
    };
  };

  // ═══════════════════════════════════════════════════════
  // PÁGINA: MI HORARIO (para todo empleado logueado)
  // ═══════════════════════════════════════════════════════
  window.renderMiHorario = async function() {
    var cont = document.getElementById('miHorarioContent');
    if (!cont) return;
    cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Cargando…</div>';
    var data = await API.miHorario();
    if (!data) { cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">No se pudo cargar tu horario</div>'; return; }
    if (!data.periodo) { cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">No hay ningún periodo de horario vigente</div>'; return; }
    var p = data.periodo;
    var slots = data.slots || [];
    // Agrupar por día → [{dia, M:[slots], T:[slots]}]
    var porDia = DIAS.map(function(d){
      return { dia:d, M: slots.filter(function(s){return s.dia===d && s.turno==='M';}), T: slots.filter(function(s){return s.dia===d && s.turno==='T';}) };
    });
    function fmtSlot(s) {
      var rol = s.rol ? ' · '+rolLabelHuman(s.rol) : '';
      var sede = sedeLabel(s.sede);
      var hr = (s.hora_inicio||'?')+' – '+(s.hora_fin||'?');
      var sec = s.sector ? (SECTOR_ICON[s.sector]||'') + ' ' + (SECTOR_LABEL[s.sector]||s.sector) : sede;
      return '<div style="padding:6px 8px;background:#fff;border-radius:6px;border-left:3px solid '+(s.turno==='M'?'#eab308':'#2563eb')+';margin-bottom:4px">' +
        '<div style="font-size:11px;font-weight:700;color:var(--navy)">'+sec+'</div>' +
        '<div style="font-size:10.5px;color:var(--text2);margin-top:1px">'+hr+rol+'</div>' +
      '</div>';
    }
    var gridHtml = porDia.map(function(d){
      return '<div class="mh-col" style="min-width:0;background:var(--s2);border-radius:8px;padding:8px 8px 10px"><div style="font-size:11px;font-weight:800;color:var(--navy);margin-bottom:6px;text-align:center;text-transform:uppercase;letter-spacing:.5px">'+DIA_LABEL[d.dia]+'</div>' +
        (d.M.length||d.T.length ? (d.M.map(fmtSlot).join('')+d.T.map(fmtSlot).join('')) : '<div style="font-size:10px;color:var(--text3);text-align:center;padding:10px 4px">Día libre</div>') +
      '</div>';
    }).join('');

    cont.innerHTML =
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">' +
        '<div><div style="font-size:13px;font-weight:800;color:var(--navy)">'+p.nombre+'</div>' +
        '<div style="font-size:11px;color:var(--text3)">Vigente desde '+p.fecha_desde+(p.fecha_hasta?' · hasta '+p.fecha_hasta:'')+'</div></div>' +
        '<span style="flex:1"></span>' +
        '<span style="font-size:11px;color:var(--text2)">Total semana: <b>'+data.horas_semana+'h</b></span>' +
        '<button class="btn btn-ghost btn-sm" onclick="imprimirMiHorario()">🖨️ Imprimir</button>' +
      '</div>' +
      '<div id="mhGrid" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px">'+gridHtml+'</div>' +
      '<div style="margin-top:14px;padding:10px 12px;background:var(--s3);border-radius:8px;font-size:10.5px;color:var(--text2);line-height:1.5">' +
        '<b>🟡</b> Turno mañana · <b>🔵</b> Turno tarde · Los horarios están sujetos a cambios con aviso previo. Total semanal programado: <b>'+data.horas_semana+' horas</b>.' +
      '</div>';
  };

  window.imprimirMiHorario = function() {
    var grid = document.getElementById('miHorarioContent');
    if (!grid) return;
    var w = window.open('', '_blank');
    w.document.write('<!DOCTYPE html><html><head><title>Mi Horario — LuceBien</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:20px;color:#0f172a}h1{font-size:18px;margin:0 0 4px}.mh-col{background:#f1f5f9;border-radius:8px;padding:8px}#mhGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}@media print{@page{size:A4 landscape;margin:10mm}}</style>' +
      '</head><body><h1>Mi Horario · LuceBien</h1>' + grid.innerHTML +
      '<script>window.onload=function(){window.print();}<\/script></body></html>');
    w.document.close();
  };

  // ═══════════════════════════════════════════════════════
  // VER HORARIO DE UN COLABORADOR (desde Gestión de Colaboradores)
  // ═══════════════════════════════════════════════════════
  // Renderiza la grilla semanal de UN empleado en un modal, imprimible.
  window.verHorarioEmpleado = async function(empId) {
    var prev = document.getElementById('verHorEmpModal'); if (prev) prev.remove();
    var h = '<div id="verHorEmpModal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1200;display:flex;align-items:center;justify-content:center;padding:12px" onclick="if(event.target===this)this.remove()">' +
      '<div style="background:#fff;border-radius:14px;width:98%;max-width:1050px;max-height:94vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2 id="vheTitle">📅 Horario del colaborador</h2><button class="modal-close" onclick="document.getElementById(\'verHorEmpModal\').remove()">✕</button></div>' +
      '<div style="padding:14px 18px;overflow-y:auto" id="vheBody"><div style="text-align:center;color:var(--text3);padding:30px">Cargando…</div></div>' +
      '<div class="modal-footer">' +
      '<button class="btn btn-ghost" onclick="document.getElementById(\'verHorEmpModal\').remove()">Cerrar</button>' +
      '<button class="btn btn-primary" id="vheBtnPrint" disabled>🖨️ Imprimir</button>' +
      '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);

    var data = await API.horarioEmpleado(empId);
    var body = document.getElementById('vheBody');
    if (!data) { body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3)">No se pudo cargar el horario</div>'; return; }

    var empNombre = (data.empleado && data.empleado.nombre) || 'Colaborador';
    document.getElementById('vheTitle').textContent = '📅 Horario — ' + empNombre;

    if (!data.periodo) {
      body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3);line-height:1.6">' +
        '<div style="font-size:32px;margin-bottom:6px">📭</div>' +
        '<div style="font-weight:700;color:var(--navy);margin-bottom:4px">No hay horario vigente</div>' +
        'Importa un Excel desde <b>Gestión de Horarios</b> y marca el periodo como vigente.</div>';
      return;
    }

    var p = data.periodo;
    var slots = data.slots || [];
    var porDia = DIAS.map(function(d){
      return { dia:d, M: slots.filter(function(s){return s.dia===d && s.turno==='M';}), T: slots.filter(function(s){return s.dia===d && s.turno==='T';}) };
    });
    function fmtSlot(s) {
      var rol = s.rol ? ' · '+rolLabelHuman(s.rol) : '';
      var hr = (s.hora_inicio||'?')+' – '+(s.hora_fin||'?');
      var sec = s.sector ? (SECTOR_ICON[s.sector]||'') + ' ' + (SECTOR_LABEL[s.sector]||s.sector) : sedeLabel(s.sede);
      return '<div style="padding:6px 8px;background:#fff;border-radius:6px;border-left:3px solid '+(s.turno==='M'?'#eab308':'#2563eb')+';margin-bottom:4px">' +
        '<div style="font-size:11px;font-weight:700;color:var(--navy)">'+sec+'</div>' +
        '<div style="font-size:10.5px;color:var(--text2);margin-top:1px">'+hr+rol+'</div></div>';
    }
    var gridHtml = porDia.map(function(d){
      return '<div class="vhe-col" style="min-width:0;background:var(--s2);border-radius:8px;padding:8px 8px 10px"><div style="font-size:11px;font-weight:800;color:var(--navy);margin-bottom:6px;text-align:center;text-transform:uppercase;letter-spacing:.5px">'+DIA_LABEL[d.dia]+'</div>' +
        (d.M.length||d.T.length ? (d.M.map(fmtSlot).join('')+d.T.map(fmtSlot).join('')) : '<div style="font-size:10px;color:var(--text3);text-align:center;padding:10px 4px">Día libre</div>') +
      '</div>';
    }).join('');

    body.innerHTML =
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">' +
        '<div><div style="font-size:13px;font-weight:800;color:var(--navy)">'+empNombre+'</div>' +
        '<div style="font-size:11px;color:var(--text3)">Periodo: <b>'+p.nombre+'</b> · desde '+p.fecha_desde+(p.fecha_hasta?' · hasta '+p.fecha_hasta:'')+'</div></div>' +
        '<span style="flex:1"></span>' +
        '<span style="font-size:11px;color:var(--text2)">Total semana: <b>'+(data.horas_semana||0)+'h</b></span>' +
      '</div>' +
      '<div id="vheGrid" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px">'+gridHtml+'</div>' +
      '<div style="margin-top:12px;padding:10px 12px;background:var(--s3);border-radius:8px;font-size:10.5px;color:var(--text2);line-height:1.5">' +
        '<b>🟡</b> Mañana · <b>🔵</b> Tarde · Horas semanales programadas: <b>'+(data.horas_semana||0)+'h</b>.' +
      '</div>';
    var btn = document.getElementById('vheBtnPrint');
    btn.disabled = false;
    btn.onclick = function(){ imprimirHorarioEmp(empNombre, p, body.innerHTML); };
  };

  function imprimirHorarioEmp(nombre, periodo, htmlInner) {
    var w = window.open('', '_blank');
    w.document.write('<!DOCTYPE html><html><head><title>Horario — '+nombre+'</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:16px;color:#0f172a}h1{font-size:18px;margin:0 0 4px}.vhe-col{background:#f1f5f9;border-radius:8px;padding:8px}#vheGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}@media print{@page{size:A4 landscape;margin:10mm}}</style>' +
      '</head><body><h1>Horario semanal · '+nombre+'</h1><div style="font-size:11px;color:#64748b;margin-bottom:10px">Periodo: '+periodo.nombre+' — desde '+periodo.fecha_desde+(periodo.fecha_hasta?' hasta '+periodo.fecha_hasta:'')+'</div>' +
      htmlInner +
      '<script>window.onload=function(){window.print();}<\/script></body></html>');
    w.document.close();
  }

  // ═══════════════════════════════════════════════════════
  // IN-APP MODAL HELPERS — reemplazo de prompt/confirm nativos
  // ═══════════════════════════════════════════════════════
  function _lbIAModal(opts) {
    return new Promise(function(resolve){
      var prev = document.getElementById('lbIAModal'); if (prev) prev.remove();
      var icon = opts.icon || (opts.type==='confirm' ? '❓' : (opts.type==='danger' ? '⚠️' : '✏️'));
      var fields = (opts.fields||[]).map(function(f,i){
        var val = (f.value==null?'':String(f.value)).replace(/"/g,'&quot;');
        var lbl = f.label ? '<label>'+f.label+'</label>' : '';
        if (f.type==='textarea') return lbl+'<textarea data-field="'+i+'" rows="3" placeholder="'+(f.placeholder||'')+'">'+val+'</textarea>';
        var t = f.type||'text';
        var extras = f.required ? ' required' : '';
        return lbl+'<input data-field="'+i+'" type="'+t+'" value="'+val+'" placeholder="'+(f.placeholder||'')+'"'+extras+(f.min?' min="'+f.min+'"':'')+(f.max?' max="'+f.max+'"':'')+'>';
      }).join('');
      var msgHtml = opts.msg ? '<div class="lb-iamodal-msg">'+opts.msg+'</div>' : '';
      var okLabel = opts.okLabel || (opts.type==='confirm'?'Confirmar':'Guardar');
      var cancelLabel = opts.cancelLabel || 'Cancelar';
      var okClass = opts.danger ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';
      var body = fields ? '<div class="lb-iamodal-body">'+fields+'</div>' : '';
      var h = '<div id="lbIAModal" class="lb-iamodal"><div class="lb-iamodal-box">' +
        '<div class="lb-iamodal-head"><div class="lb-iamodal-icon">'+icon+'</div>' +
        '<div style="flex:1"><div class="lb-iamodal-title">'+(opts.title||'Confirmar')+'</div>'+msgHtml+'</div></div>' +
        body +
        '<div class="lb-iamodal-foot">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="lbIACancel">'+cancelLabel+'</button>' +
        '<button type="button" class="'+okClass+'" id="lbIAOk">'+okLabel+'</button>' +
        '</div></div></div>';
      document.body.insertAdjacentHTML('beforeend', h);
      var modal = document.getElementById('lbIAModal');
      requestAnimationFrame(function(){ modal.classList.add('show'); });
      var firstInput = modal.querySelector('[data-field]');
      if (firstInput) setTimeout(function(){ firstInput.focus(); if (firstInput.select) firstInput.select(); }, 30);
      function cleanup() { modal.classList.remove('show'); setTimeout(function(){ modal.remove(); }, 150); }
      function onOk() {
        if (!opts.fields) { cleanup(); resolve(true); return; }
        var vals = {};
        var ok = true;
        opts.fields.forEach(function(f,i){
          var el = modal.querySelector('[data-field="'+i+'"]');
          var v = el ? el.value : '';
          if (f.required && !String(v).trim()) { el.style.borderColor = '#dc2626'; ok = false; }
          vals[f.name || i] = v;
        });
        if (!ok) return;
        cleanup(); resolve(vals);
      }
      function onCancel() { cleanup(); resolve(null); }
      modal.querySelector('#lbIAOk').onclick = onOk;
      modal.querySelector('#lbIACancel').onclick = onCancel;
      modal.addEventListener('click', function(e){ if (e.target===modal) onCancel(); });
      modal.addEventListener('keydown', function(e){
        if (e.key==='Escape') onCancel();
        else if (e.key==='Enter' && e.target.tagName!=='TEXTAREA') onOk();
      });
    });
  }
  // prompt reemplazo: devuelve string|null
  window.lbPrompt = function(title, placeholder, defaultValue, label) {
    return _lbIAModal({
      title: title, type:'prompt', icon:'✏️',
      fields: [{ name:'v', type:'text', label: label||null, value: defaultValue||'', placeholder: placeholder||'', required: true }]
    }).then(function(r){ return r ? r.v : null; });
  };
  // confirm reemplazo: devuelve boolean
  window.lbConfirm = function(title, msg, opts) {
    opts = opts || {};
    return _lbIAModal({
      title: title, msg: msg, type:'confirm',
      icon: opts.icon || (opts.danger?'⚠️':'❓'),
      okLabel: opts.okLabel || 'Confirmar',
      cancelLabel: opts.cancelLabel || 'Cancelar',
      danger: !!opts.danger
    }).then(function(r){ return !!r; });
  };
  // Formulario multi-campo: devuelve {field:value, ...} | null
  window.lbForm = function(title, fields, opts) {
    opts = opts || {};
    return _lbIAModal({
      title: title, fields: fields, icon: opts.icon||'📝',
      msg: opts.msg, okLabel: opts.okLabel||'Guardar'
    });
  };

  // ═══════════════════════════════════════════════════════
  // PÁGINA ADMIN: GESTIÓN DE HORARIOS — Constructor nativo
  // ═══════════════════════════════════════════════════════
  // Estado local (solo admin)
  var HVSTATE = { empleados: [], periodos: [], openId: null, detalle: null, seccionActiva: null };

  window.renderHorariosAdmin = async function() {
    var cont = document.getElementById('horariosAdminContent'); if (!cont) return;
    cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">Cargando…</div>';
    // Cargar empleados una sola vez
    if (!HVSTATE.empleados.length) {
      var emps = await API.todosEmpleados() || [];
      HVSTATE.empleados = emps.filter(function(e){ return (e.estado||'activo')==='activo'; });
    }
    HVSTATE.periodos = await API.horariosPeriodos() || [];

    // Barra superior con chips de periodos (horizontal scrollable)
    var chips = HVSTATE.periodos.length ? HVSTATE.periodos.map(function(p){
      var isOpen = p.id===HVSTATE.openId;
      var isVig = p.activo===1||p.activo===true;
      var bg = isOpen ? 'var(--navy)' : (isVig ? 'rgba(22,163,74,.12)' : 'var(--s2)');
      var col = isOpen ? '#fff' : (isVig ? '#166534' : 'var(--text2)');
      var border = isOpen ? 'var(--navy)' : (isVig ? 'rgba(22,163,74,.35)' : 'var(--border)');
      var icon = isVig ? '✅ ' : '📝 ';
      return '<button type="button" onclick="hvAbrirPeriodo('+p.id+')" style="flex-shrink:0;padding:8px 12px;border-radius:999px;border:1.5px solid '+border+';background:'+bg+';color:'+col+';font-size:11.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s">' +
        icon + p.nombre +
        '<span style="opacity:.7;font-size:10px;font-weight:400" class="mono">· '+p.fecha_desde+(p.fecha_hasta?' → '+p.fecha_hasta.slice(5):'')+'</span>' +
        '<span style="opacity:.7;font-size:10px">· '+p.total_slots+'</span>' +
      '</button>';
    }).join('') : '';

    var topbar = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">'+
      '<div style="flex:1;min-width:220px"><div style="font-size:14px;font-weight:800;color:var(--navy)">📅 Gestión de Horarios</div>'+
      '<div style="font-size:10.5px;color:var(--text3)">Arma el horario por secciones. El periodo marcado <b>✅ vigente</b> alimenta Mi Horario, reportes, encargados y evaluación mensual.</div></div>'+
      '<button class="btn btn-primary btn-sm" onclick="hvNuevoPeriodo()">+ Nuevo periodo</button>'+
    '</div>';

    var chipBar = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:10px 12px;background:var(--s2);border:1px solid var(--border);border-radius:10px">' +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;font-weight:700;color:var(--text3);flex-shrink:0">Periodos</div>' +
      '<div style="flex:1;display:flex;gap:6px;overflow-x:auto;padding:2px">'+ (chips || '<span style="font-size:11px;color:var(--text3);padding:6px 2px">Sin periodos aún. Crea el primero arriba.</span>') +'</div>' +
    '</div>';

    // Editor (ocupa todo el ancho)
    var editor = '<div id="hvEditor">' + (HVSTATE.openId ? '' :
      '<div class="card"><div class="card-body" style="padding:40px;text-align:center;color:var(--text3)">' +
      (HVSTATE.periodos.length ?
        '<div style="font-size:28px;margin-bottom:6px">👆</div><div style="font-weight:700;color:var(--navy);margin-bottom:4px">Selecciona un periodo</div>' +
        '<div style="font-size:11px">Haz click en cualquier chip de arriba para abrirlo y editar la rejilla.</div>' :
        '<div style="font-size:36px;margin-bottom:6px">📅</div>' +
        '<div style="font-weight:700;color:var(--navy);margin-bottom:4px">Aún no hay horarios</div>' +
        '<div style="font-size:11.5px;line-height:1.6;max-width:580px;margin:0 auto">Crea tu primer periodo con <b>+ Nuevo periodo</b> arriba. Luego irás agregando los turnos de cada colaborador por sección (Tienda, Stand, Trece, Almacén, Consulta, Composturas, Confección).</div>') +
      '</div></div>') + '</div>';

    cont.innerHTML = topbar + chipBar + editor;

    // Si había un periodo abierto, volver a cargarlo
    if (HVSTATE.openId) { var sigue = HVSTATE.periodos.find(function(p){return p.id===HVSTATE.openId;}); if (sigue) hvAbrirPeriodo(HVSTATE.openId); else HVSTATE.openId=null; }
  };

  // ── Crear periodo ─────────────────────────────────────────
  window.hvNuevoPeriodo = async function() {
    var today = new Date().toISOString().slice(0,10);
    var v = await lbForm('📅 Nuevo periodo de horario', [
      { name:'nombre', label:'Nombre del periodo', type:'text', placeholder:'ej. Semana del 13 abril 2026', required:true },
      { name:'desde',  label:'Vigente desde',      type:'date', value: today, required:true },
      { name:'hasta',  label:'Vigente hasta (opcional)', type:'date', value:'' }
    ], { msg:'Los horarios cambian con el tiempo — cada periodo queda versionado.', okLabel:'Crear periodo' });
    if (!v) return;
    var r = await API.crearPeriodoHorario({ nombre:v.nombre.trim(), fecha_desde:v.desde, fecha_hasta:v.hasta||null, activo:0 });
    if (r && r.id) {
      showToast('Periodo creado','success');
      HVSTATE.openId = r.id;
      await renderHorariosAdmin();
    }
  };

  // ── Abrir periodo → editor con secciones ─────────────────
  window.hvAbrirPeriodo = async function(id) {
    HVSTATE.openId = id;
    var det = await API.horarioPeriodo(id);
    if (!det) return;
    HVSTATE.detalle = det;
    // Asegurar que siempre exista al menos una sección visible
    if (!HVSTATE.seccionActiva) HVSTATE.seccionActiva = 'LB/tienda';

    // Refrescar columna izquierda (marca selección)
    document.querySelectorAll('#horariosAdminContent [onclick^="hvAbrirPeriodo"]').forEach(function(el){
      el.style.background = el.getAttribute('onclick').indexOf('('+id+')')>=0 ? 'var(--s2)' : '';
      el.style.borderLeft = el.getAttribute('onclick').indexOf('('+id+')')>=0 ? '3px solid var(--navy)' : '3px solid transparent';
    });

    var ed = document.getElementById('hvEditor'); if (!ed) return;
    ed.innerHTML = hvRenderEditor(det);
  };

  // ── Lista de secciones disponibles ────────────────────────
  var SECCIONES = [
    { key:'LB/tienda',     label:'Tienda LuceBien', sede:'LB', sector:'tienda',     roles:['caja','ventas'] },
    { key:'ST/stand',      label:'Stand 101 / 102', sede:'ST', sector:'stand',      roles:['caja','ventas'] },
    { key:'TR/trece',      label:'Trece',           sede:'TR', sector:'trece',      roles:['caja','ventas'] },
    { key:'AL/almacen',    label:'Almacén',         sede:'AL', sector:'almacen',    roles:['encargado','b'] },
    { key:'AL/consulta',   label:'Consulta Admin.', sede:'AL', sector:'consulta',   roles:['a','b'] },
    { key:'AL/compostura', label:'Composturas',     sede:'AL', sector:'compostura', roles:['a','b'] },
    { key:'AL/confeccion', label:'Confección',      sede:'AL', sector:'confeccion', roles:['encargado','costura'] }
  ];

  function hvRenderEditor(det) {
    var badge = det.activo ? '<span class="badge badge-green">Vigente</span>' : '<span class="badge badge-gray">Borrador</span>';
    var headerRight = det.activo
      ? '<button class="btn btn-ghost btn-xs" onclick="hvDuplicar('+det.id+')">📄 Duplicar</button>' +
        '<button class="btn btn-ghost btn-xs" onclick="imprimirGrillaAdmin('+det.id+')">🖨️ Imprimir</button>'
      : '<button class="btn btn-ghost btn-xs" onclick="hvDuplicar('+det.id+')">📄 Duplicar</button>' +
        '<button class="btn btn-ghost btn-xs" onclick="imprimirGrillaAdmin('+det.id+')">🖨️ Imprimir</button>' +
        '<button class="btn btn-primary btn-xs" onclick="_activarPeriodo('+det.id+')">▶️ Marcar vigente</button>';

    // Cabecera editor + metadata
    var meta = '<div class="card" style="margin-bottom:10px"><div class="card-body" style="padding:10px 14px">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:220px"><div style="display:flex;gap:6px;align-items:center"><input type="text" id="hvPerNombre" value="'+escAttr(det.nombre)+'" style="font-size:14px;font-weight:700;color:var(--navy);border:none;border-bottom:1px dashed var(--border);background:transparent;padding:2px 4px;width:100%"> '+badge+'</div>' +
      '<div style="display:flex;gap:8px;margin-top:6px;align-items:center;font-size:11px;color:var(--text3);flex-wrap:wrap">' +
      'Vigente desde <input type="date" id="hvPerDesde" value="'+(det.fecha_desde||'')+'" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px"> ' +
      'hasta <input type="date" id="hvPerHasta" value="'+(det.fecha_hasta||'')+'" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px"> ' +
      '<span style="font-size:10px;color:var(--text3)">(vacío = sin fecha fin)</span>' +
      '<button class="btn btn-ghost btn-xs" onclick="hvGuardarMeta('+det.id+')">💾 Guardar cambios</button>' +
      '</div></div>' +
      '<div style="display:flex;gap:4px;flex-wrap:wrap">' + headerRight +
      '<button class="btn btn-danger btn-xs" onclick="_borrarPeriodo('+det.id+')">🗑 Borrar</button>' +
      '</div></div></div></div>';

    // Tabs de secciones
    var tabs = '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;border-bottom:2px solid var(--border);padding-bottom:4px">' +
      SECCIONES.map(function(sec){
        var count = det.slots.filter(function(s){ return s.sede===sec.sede && s.sector===sec.sector; }).length;
        var act = sec.key === HVSTATE.seccionActiva;
        return '<button type="button" class="btn" style="padding:6px 10px;font-size:11px;border-radius:6px 6px 0 0;border:none;background:'+(act?'var(--navy)':'var(--s3)')+';color:'+(act?'#fff':'var(--text3)')+';cursor:pointer" onclick="hvCambiarSeccion(\''+sec.key+'\')">'+SECTOR_ICON[sec.sector]+' '+sec.label+' <span style="opacity:.7;font-size:10px">('+count+')</span></button>';
      }).join('') + '</div>';

    // Grilla de la sección activa
    var sec = SECCIONES.find(function(x){return x.key===HVSTATE.seccionActiva;}) || SECCIONES[0];
    var grid = hvRenderGridSeccion(det, sec);

    return meta + tabs + grid;
  }

  window.hvCambiarSeccion = function(key) {
    HVSTATE.seccionActiva = key;
    var det = HVSTATE.detalle; if (!det) return;
    document.getElementById('hvEditor').innerHTML = hvRenderEditor(det);
  };

  // ── Grilla editable por sección ──────────────────────────
  function hvRenderGridSeccion(det, sec) {
    var slots = det.slots.filter(function(s){ return s.sede===sec.sede && s.sector===sec.sector; });
    var turnos = [{k:'M',l:'Turno Mañana',color:'#eab308'},{k:'T',l:'Turno Tarde',color:'#2563eb'}];
    var h = '<div class="card"><div class="card-header" style="padding:8px 12px;display:flex;align-items:center;gap:8px"><span class="card-title">'+SECTOR_ICON[sec.sector]+' '+sec.label+'</span><span style="flex:1"></span>';
    h += '<span style="font-size:10.5px;color:var(--text3)">Click en una celda para agregar un turno. '+slots.length+' slots en esta sección.</span></div>';
    h += '<div style="overflow-x:auto"><table class="data-table" style="min-width:780px"><thead><tr>' +
      '<th style="width:100px">Turno</th>' + DIAS.map(function(d){return '<th style="min-width:105px">'+DIA_LABEL[d]+'</th>';}).join('') + '</tr></thead><tbody>';
    turnos.forEach(function(t){
      h += '<tr><td style="font-weight:700;color:'+t.color+';vertical-align:middle">'+t.l+'</td>';
      DIAS.forEach(function(d){
        var cellSlots = slots.filter(function(s){ return s.turno===t.k && s.dia===d; });
        var cellInner = cellSlots.map(function(s){
          var rol = s.rol ? '<span style="font-size:9px;color:var(--text3)"> ['+rolLabelHuman(s.rol)+']</span>' : '';
          return '<div onclick="event.stopPropagation();hvEditarSlot('+s.id+')" style="background:#fff;border-left:3px solid '+t.color+';border-radius:4px;padding:4px 6px;margin-bottom:3px;cursor:pointer;font-size:10.5px;line-height:1.3">' +
            '<div style="font-weight:700;color:var(--navy)">'+ (s.nombre || s.iniciales || '?') +rol+ '</div>' +
            '<div style="color:var(--text3);font-family:var(--font-m);font-size:9.5px">'+(s.hora_inicio||'?')+' – '+(s.hora_fin||'?')+'</div>' +
          '</div>';
        }).join('');
        h += '<td onclick="hvNuevoSlot(\''+d+'\',\''+t.k+'\',\''+sec.key+'\')" style="vertical-align:top;padding:4px;cursor:pointer;background:'+(cellSlots.length?'':'var(--s3)')+'" title="Click para agregar">' +
          cellInner +
          '<div style="text-align:center;padding:3px;font-size:10px;color:var(--text3);opacity:.6">+ agregar</div>' +
        '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  // ── Guardar metadata ─────────────────────────────────────
  window.hvGuardarMeta = async function(id) {
    var nombre = document.getElementById('hvPerNombre').value.trim();
    var desde  = document.getElementById('hvPerDesde').value;
    var hasta  = document.getElementById('hvPerHasta').value || null;
    if (!nombre || !desde) { showToast('Nombre y fecha desde requeridos','error'); return; }
    var r = await API.editarPeriodoHorario(id, { nombre:nombre, fecha_desde:desde, fecha_hasta:hasta });
    if (r && r.ok) { showToast('Periodo guardado','success'); await renderHorariosAdmin(); }
  };

  // ── Duplicar periodo ─────────────────────────────────────
  window.hvDuplicar = async function(id) {
    var src = HVSTATE.periodos.find(function(p){return p.id===id;}); if (!src) return;
    var v = await lbForm('📄 Duplicar periodo', [
      { name:'nombre', label:'Nombre del nuevo periodo', type:'text', value:(src.nombre||'')+' (copia)', required:true },
      { name:'desde',  label:'Vigente desde',            type:'date', value:new Date().toISOString().slice(0,10), required:true },
      { name:'hasta',  label:'Vigente hasta (opcional)', type:'date', value:'' }
    ], { msg:'Copia los turnos del periodo "'+(src.nombre||'')+'" a un nuevo periodo editable.', okLabel:'Duplicar', icon:'📄' });
    if (!v) return;
    var r = await API.duplicarPeriodoHorario(id, { nombre:v.nombre.trim(), fecha_desde:v.desde, fecha_hasta:v.hasta||null });
    if (r && r.id) { showToast('Periodo duplicado','success'); HVSTATE.openId = r.id; await renderHorariosAdmin(); }
  };

  // ── Modal de slot (nuevo / editar) ───────────────────────
  window.hvNuevoSlot = function(dia, turno, seccionKey) {
    if (!HVSTATE.openId) return;
    var sec = SECCIONES.find(function(x){return x.key===seccionKey;});
    hvAbrirModalSlot({ slot:null, dia:dia, turno:turno, sec:sec });
  };

  window.hvEditarSlot = function(slotId) {
    var det = HVSTATE.detalle; if (!det) return;
    var s = det.slots.find(function(x){return x.id===slotId;}); if (!s) return;
    var sec = SECCIONES.find(function(x){return x.sede===s.sede && x.sector===s.sector;}) || SECCIONES[0];
    hvAbrirModalSlot({ slot:s, dia:s.dia, turno:s.turno, sec:sec });
  };

  function hvAbrirModalSlot(opt) {
    var prev = document.getElementById('hvSlotModal'); if (prev) prev.remove();
    var isNew = !opt.slot;
    var s = opt.slot || {};
    var sec = opt.sec;
    var defInicio = s.hora_inicio || (opt.turno==='M' ? '08:00' : '14:00');
    var defFin    = s.hora_fin    || (opt.turno==='M' ? '14:00' : '21:00');
    var empOpts = '<option value="">— elegir colaborador —</option>' + HVSTATE.empleados.map(function(e){
      return '<option value="'+e.id+'"'+(s.emp_id===e.id?' selected':'')+'>'+e.nombre+' ('+e.iniciales+')</option>';
    }).join('');
    var rolOpts = ['<option value="">—</option>'].concat(sec.roles.map(function(r){
      return '<option value="'+r+'"'+(s.rol===r?' selected':'')+'>'+rolLabelHuman(r)+'</option>';
    })).join('');

    var h = '<div id="hvSlotModal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1300;display:flex;align-items:center;justify-content:center;padding:12px" onclick="if(event.target===this)this.remove()">' +
      '<div style="background:#fff;border-radius:12px;width:96%;max-width:480px;overflow:hidden" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>'+(isNew?'➕ Nuevo turno':'✏️ Editar turno')+'</h2><button class="modal-close" onclick="document.getElementById(\'hvSlotModal\').remove()">✕</button></div>' +
      '<div style="padding:14px 16px">' +
      '<div style="font-size:11px;color:var(--text3);margin-bottom:10px">'+SECTOR_ICON[sec.sector]+' '+sec.label+' · '+DIA_LABEL[opt.dia]+' · '+(opt.turno==='M'?'Turno Mañana':'Turno Tarde')+'</div>' +
      '<div class="field"><label>Colaborador</label><select id="hvfEmp">'+empOpts+'</select></div>' +
      '<div class="grid-2">' +
        '<div class="field"><label>Hora inicio</label><input type="time" id="hvfIni" value="'+defInicio+'"></div>' +
        '<div class="field"><label>Hora fin</label><input type="time" id="hvfFin" value="'+defFin+'"></div>' +
      '</div>' +
      '<div class="field"><label>Rol / puesto</label><select id="hvfRol">'+rolOpts+'</select></div>' +
      '<div class="field"><label>Notas (opcional)</label><input type="text" id="hvfNotas" value="'+escAttr(s.notas||'')+'" placeholder="ej. Refuerzo por feriado"></div>' +
      '</div>' +
      '<div class="modal-footer">' +
      (isNew?'':'<button class="btn btn-danger btn-sm" onclick="hvBorrarSlotConfirm('+s.id+')">🗑 Borrar</button>') +
      '<span style="flex:1"></span>' +
      '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'hvSlotModal\').remove()">Cancelar</button>' +
      '<button class="btn btn-primary btn-sm" onclick="hvGuardarSlot('+(s.id||'null')+',\''+opt.dia+'\',\''+opt.turno+'\',\''+sec.key+'\')">💾 Guardar</button>' +
      '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
  }

  window.hvGuardarSlot = async function(slotId, dia, turno, seccionKey) {
    var sec = SECCIONES.find(function(x){return x.key===seccionKey;});
    var body = {
      emp_id:      parseInt(document.getElementById('hvfEmp').value,10),
      sede:        sec.sede,
      sector:      sec.sector,
      dia:         dia,
      turno:       turno,
      rol:         document.getElementById('hvfRol').value || null,
      hora_inicio: document.getElementById('hvfIni').value || null,
      hora_fin:    document.getElementById('hvfFin').value || null,
      notas:       document.getElementById('hvfNotas').value || null
    };
    if (!body.emp_id) { showToast('Selecciona un colaborador','error'); return; }
    var r;
    if (slotId && slotId!=='null') { r = await API.editarSlotHorario(slotId, body); }
    else { r = await API.crearSlotHorario(HVSTATE.openId, body); }
    if (r && r.ok) {
      showToast(slotId&&slotId!=='null' ? 'Turno actualizado' : 'Turno agregado','success');
      document.getElementById('hvSlotModal').remove();
      // Recargar el periodo
      await hvAbrirPeriodo(HVSTATE.openId);
      // Actualizar lista izq (contadores)
      HVSTATE.periodos = await API.horariosPeriodos() || [];
    }
  };

  window.hvBorrarSlotConfirm = async function(slotId) {
    var ok = await lbConfirm('🗑 Borrar turno', '¿Eliminar este turno del horario?', { danger:true, okLabel:'Sí, borrar' });
    if (!ok) return;
    var r = await API.borrarSlotHorario(slotId);
    if (r && r.ok) {
      showToast('Turno borrado','success');
      document.getElementById('hvSlotModal').remove();
      await hvAbrirPeriodo(HVSTATE.openId);
      HVSTATE.periodos = await API.horariosPeriodos() || [];
    }
  };

  function escAttr(s) { return String(s==null?'':s).replace(/"/g,'&quot;'); }

  function renderGrillaSemanal(det) {
    if (!det || !det.slots || !det.slots.length) return '<div class="card"><div class="card-body" style="padding:20px;color:var(--text3);text-align:center">Sin slots</div></div>';
    // Agrupar por sede+sector
    var groups = {};
    det.slots.forEach(function(s){
      var k = s.sede+'/'+(s.sector||'');
      (groups[k] = groups[k] || { sede:s.sede, sector:s.sector, slots:[] }).slots.push(s);
    });
    var blocks = Object.keys(groups).map(function(k){ return grillaDeSeccion(groups[k], det); }).join('');
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="font-size:13px;font-weight:800;color:var(--navy)">📅 Grilla semanal — '+det.nombre+'</div><span style="flex:1"></span>' +
      '<button class="btn btn-ghost btn-sm" onclick="imprimirGrillaAdmin('+det.id+')">🖨️ Imprimir</button></div>' +
      '<div id="hvGrid">'+blocks+'</div>';
  }

  function grillaDeSeccion(g, det) {
    var h = '<div class="card" style="margin-bottom:14px;break-inside:avoid"><div class="card-header"><span class="card-title">'+(SECTOR_ICON[g.sector]||'')+' '+(SECTOR_LABEL[g.sector]||g.sector)+' <span style="font-size:10px;color:var(--text3);font-weight:400">· sede '+sedeLabel(g.sede)+'</span></span></div>';
    // Construir tabla: filas = Turno M/T; columnas = 7 días
    var turnos = ['M','T'];
    h += '<div style="overflow-x:auto"><table class="data-table" style="min-width:720px"><thead><tr><th style="width:70px">Turno</th>' +
      DIAS.map(function(d){return '<th>'+DIA_LABEL[d]+'</th>';}).join('') + '</tr></thead><tbody>';
    turnos.forEach(function(t){
      h += '<tr><td style="font-weight:700;color:'+(t==='M'?'#ca8a04':'#1d4ed8')+'">'+(t==='M'?'Mañana':'Tarde')+'</td>';
      DIAS.forEach(function(d){
        var cellSlots = g.slots.filter(function(s){return s.turno===t && s.dia===d;});
        if (!cellSlots.length) { h += '<td style="color:#cbd5e1;text-align:center">—</td>'; return; }
        var cellHtml = cellSlots.map(function(s){
          return '<div style="font-size:10.5px;line-height:1.35"><span style="font-weight:700">'+(s.iniciales||s.nombre.split(' ')[0])+'</span>'+
            (s.rol?' <span style="color:var(--text3);font-size:9px">['+rolLabelHuman(s.rol)+']</span>':'')+
            '<div style="font-size:9.5px;color:var(--text3);font-family:var(--font-m)">'+(s.hora_inicio||'?')+'–'+(s.hora_fin||'?')+'</div></div>';
        }).join('<div style="height:4px"></div>');
        h += '<td style="vertical-align:top;padding:5px 6px">'+cellHtml+'</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  window._activarPeriodo = async function(id){
    var ok = await lbConfirm('▶️ Marcar periodo como vigente',
      'Todo el sistema (Mi Horario, reportes FR-01, cálculos de encargado, evaluación mensual) pasará a regirse por este horario. Los periodos que se solapen se desactivarán automáticamente.',
      { okLabel:'Sí, marcar vigente' });
    if (!ok) return;
    var r = await API.activarPeriodoHorario(id);
    if (r && r.ok) { showToast('Periodo activado','success'); HVSTATE.openId = id; renderHorariosAdmin(); }
  };
  window._borrarPeriodo = async function(id){
    var ok = await lbConfirm('🗑 Borrar periodo',
      'Se borrarán este periodo y todos sus turnos. Esta acción no se puede deshacer.',
      { danger:true, okLabel:'Sí, borrar' });
    if (!ok) return;
    var r = await API.borrarPeriodoHorario(id);
    if (r && r.ok) { showToast('Periodo borrado','success'); HVSTATE.openId=null; HVSTATE.detalle=null; renderHorariosAdmin(); }
  };
  window._verPeriodo = async function(id){
    var det = await API.horarioPeriodo(id); if (!det) return;
    var box = document.getElementById('hvGridWrap'); if (!box) return;
    box.innerHTML = renderGrillaSemanal(det);
    box.scrollIntoView({behavior:'smooth', block:'start'});
  };

  window.imprimirGrillaAdmin = async function(id) {
    var det = await API.horarioPeriodo(id); if (!det) return;
    var html = renderGrillaSemanal(det);
    var w = window.open('', '_blank');
    w.document.write('<!DOCTYPE html><html><head><title>Horario LuceBien — '+det.nombre+'</title>'+
      '<style>body{font-family:system-ui,sans-serif;padding:12px;color:#0f172a;font-size:11px}h1{font-size:16px;margin:0 0 8px}.card{border:1px solid #cbd5e1;border-radius:8px;padding:6px;margin-bottom:10px;break-inside:avoid}.card-header{font-weight:700;padding:3px 4px 6px;border-bottom:1px solid #e2e8f0;margin-bottom:6px}.card-title{font-size:12px}.data-table{width:100%;border-collapse:collapse}.data-table th,.data-table td{border:1px solid #e2e8f0;padding:4px 6px;text-align:left;font-size:10px;vertical-align:top}.data-table th{background:#f1f5f9}.badge{font-size:9px}@media print{@page{size:A4 landscape;margin:8mm}}</style>'+
      '</head><body><h1>Horario semanal LuceBien — '+det.nombre+' ('+det.fecha_desde+(det.fecha_hasta?' → '+det.fecha_hasta:'')+')</h1>'+ html +
      '<script>window.onload=function(){window.print();}<\/script></body></html>');
    w.document.close();
  };

  // ── Helpers UI ────────────────────────────────────────────
  function sedeLabel(s) {
    var L = {ST:'Stan', LB:'LuceBien', AL:'Almacén', TR:'Trece'};
    return L[s] || s;
  }
  function rolLabelHuman(r) {
    var L = {caja:'Caja', ventas:'Ventas', encargado:'Encargado', costura:'Costura', a:'A', b:'B'};
    return L[r] || r;
  }
  window._sedeLabel = sedeLabel;

  console.log('[LuceBien] horarios-v2.js — cargado');
})();
