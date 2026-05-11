// ═══════════════════════════════════════════════════════════════════════
// LUCEBIEN · public/js/asistencia-dia.js
//
// Pantalla "Asistencia Diaria" (S3 de la auditoría). Lista todos los
// turnos esperados del día (cruzando horario) y permite al admin/encargado:
//   - Marcar presente manualmente a quien olvidó enviar reporte
//   - Ajustar la hora de entrada (calcula tardanza)
//   - Anotar observación / justificación
//   - Borrar un registro mal hecho
//
// Cuando llegue el huellero, los registros con fuente='huellero' tendrán
// prioridad y los manuales pasarán a ser correcciones puntuales.
// ═══════════════════════════════════════════════════════════════════════

(function(){
  function fmtMin(m){
    if (!m) return '0';
    if (m<60) return m+' min';
    var h = Math.floor(m/60), r = m%60;
    return h+'h '+ (r?r+'m':'');
  }

  async function renderAsistDia() {
    var elFecha = document.getElementById('asistDiaFecha');
    if (elFecha && !elFecha.value) elFecha.value = hoyLocal();
    var fecha = elFecha ? elFecha.value : hoyLocal();
    var sede = document.getElementById('asistDiaSede') ? document.getElementById('asistDiaSede').value : '';
    var qp = ['fecha='+fecha];
    if (sede) qp.push('sede='+sede);
    var d = await API.get('/asistencias/del-dia?'+qp.join('&'));
    if (!d) return;

    // KPIs
    var k = d.resumen || {};
    var kpis = document.getElementById('asistDiaKpis');
    if (kpis) kpis.innerHTML =
      '<div class="dash-kpi accent-navy"><div class="dash-kpi-val">'+k.total+'</div><div class="dash-kpi-lbl">Turnos del día</div><div class="dash-kpi-sub">'+(d.dia_semana||'')+'</div></div>' +
      '<div class="dash-kpi accent-green"><div class="dash-kpi-val">'+k.presentes+'</div><div class="dash-kpi-lbl">Presentes</div><div class="dash-kpi-sub">marcados ya</div></div>' +
      '<div class="dash-kpi accent-red"><div class="dash-kpi-val">'+k.ausentes+'</div><div class="dash-kpi-lbl">Sin marcar</div><div class="dash-kpi-sub">ausentes / pendientes</div></div>' +
      '<div class="dash-kpi accent-gold"><div class="dash-kpi-val">'+k.con_tardanza+'</div><div class="dash-kpi-lbl">Con tardanza</div><div class="dash-kpi-sub">total: '+fmtMin(k.total_min_tardanza||0)+'</div></div>';

    var body = document.getElementById('asistDiaBody');
    var cnt  = document.getElementById('asistDiaCount');
    if (cnt) cnt.textContent = (d.rows||[]).length + ' turno(s) listados';
    if (!body) return;
    if (!(d.rows||[]).length) {
      body.innerHTML = '<tr><td class="empty-cell" colspan="9">Sin turnos programados ni asistencias para esta fecha</td></tr>';
      return;
    }

    body.innerHTML = d.rows.map(function(r){
      var a = r.asistencia;
      var estado = a ? 'Presente' : 'Ausente';
      var estadoCls = a ? 'badge-green' : 'badge-red';
      var fuente = a ? a.fuente : '—';
      var fuenteCls = fuente==='huellero' ? 'badge-green' : (fuente==='reporte' ? 'badge-navy' : (fuente==='manual' ? 'badge-gold' : ''));
      var hora = a && a.hora_entrada ? a.hora_entrada : '';
      var tard = a ? (a.minutos_tardanza||0) : 0;
      var tardCls = tard===0 ? '' : (tard<=15 ? 'color:var(--yellow)' : 'color:var(--red);font-weight:800');
      var obs = a && a.obs ? a.obs : '';
      var sedeLbl = r.sede_esperada ? ((SEDES[r.sede_esperada] && SEDES[r.sede_esperada].short) || r.sede_esperada) : '—';

      return '<tr data-emp="'+r.emp_id+'" data-turno="'+r.turno+'">' +
        '<td><strong>'+r.nombre+'</strong><div style="font-size:9px;color:var(--text3)">'+(r.rol||'').replace(/_/g,' ')+'</div></td>' +
        '<td><span class="badge badge-navy" style="font-size:10px">'+(r.turno==='M'?'Mañana':'Tarde')+'</span></td>' +
        '<td style="font-size:11px">'+sedeLbl+'</td>' +
        '<td><span class="badge '+estadoCls+'" style="font-size:10px">'+estado+'</span></td>' +
        '<td><input type="time" class="asist-hora" value="'+hora+'" style="width:100px;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px"></td>' +
        '<td style="text-align:center;font-family:var(--font-m);font-weight:700;'+tardCls+'">'+(tard ? tard+' min' : '—')+'</td>' +
        '<td>'+(fuente==='—' ? '<span style="color:var(--text3);font-size:10px">—</span>' : '<span class="badge '+fuenteCls+'" style="font-size:9px">'+fuente+'</span>')+'</td>' +
        '<td><input type="text" class="asist-obs" value="'+(obs.replace(/"/g,'&quot;'))+'" placeholder="Justificación / nota..." style="width:100%;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px"></td>' +
        '<td><div style="display:flex;gap:3px">' +
          '<button class="btn btn-primary btn-xs" onclick="guardarAsistFila(this)" title="Guardar fila">Guardar</button>' +
          (a ? '<button class="btn btn-ghost btn-xs" onclick="borrarAsistFila('+a.id+')" style="color:var(--red)" title="Borrar registro">×</button>' : '') +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  async function guardarAsistFila(btn) {
    var tr = btn.closest('tr');
    var emp = tr.dataset.emp;
    var turno = tr.dataset.turno;
    var fecha = document.getElementById('asistDiaFecha').value || hoyLocal();
    var hora = tr.querySelector('.asist-hora').value || null;
    var obs = tr.querySelector('.asist-obs').value || '';
    var r = await API.post('/asistencias', {
      emp_id: emp, fecha: fecha, turno: turno,
      hora_entrada: hora, fuente: 'manual', obs: obs
    });
    if (!r) return;
    showToast('Asistencia guardada · tardanza: '+(r.minutos_tardanza||0)+' min', 'success');
    renderAsistDia();
  }

  async function borrarAsistFila(id) {
    if (!confirm('¿Borrar este registro de asistencia? Solo si fue un error.')) return;
    var r = await API.del('/asistencias/'+id);
    if (!r) return;
    showToast('Registro borrado', 'success');
    renderAsistDia();
  }

  // Hook a goTo para auto-renderizar al entrar
  function hookOnce(){
    if (window._goToAsistHooked) return;
    var orig = window.goTo;
    if (typeof orig !== 'function') {
      var iv = setInterval(function(){
        if (typeof window.goTo === 'function') {
          clearInterval(iv);
          var o = window.goTo;
          window.goTo = function(pageId, btn){
            var r = o.apply(this, arguments);
            if (pageId === 'asistencias') { try { renderAsistDia(); } catch(e){} }
            return r;
          };
          window._goToAsistHooked = true;
        }
      }, 200);
      return;
    }
    window.goTo = function(pageId, btn){
      var r = orig.apply(this, arguments);
      if (pageId === 'asistencias') { try { renderAsistDia(); } catch(e){} }
      return r;
    };
    window._goToAsistHooked = true;
  }
  hookOnce();

  window.renderAsistDia = renderAsistDia;
  window.guardarAsistFila = guardarAsistFila;
  window.borrarAsistFila = borrarAsistFila;
})();
