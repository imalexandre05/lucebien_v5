// ═══════════════════════════════════════════════════════════════════════
// LUCEBIEN · public/js/pagos.js
// UI del módulo Pagos: lista, KPIs, modal de registro/edición,
// sugerencia automática de monto, anulación, comprobante imprimible.
// ═══════════════════════════════════════════════════════════════════════

async function renderPagos() {
  // Inicializar mes filtro a actual si vacío
  var elMes = document.getElementById('pagoFiltroMes');
  if (elMes && !elMes.value) elMes.value = (new Date()).toISOString().slice(0,7);
  var sede = document.getElementById('pagoFiltroSede') ? document.getElementById('pagoFiltroSede').value : '';
  var estado = document.getElementById('pagoFiltroEstado') ? document.getElementById('pagoFiltroEstado').value : '';
  var mes = document.getElementById('pagoFiltroMes') ? document.getElementById('pagoFiltroMes').value : '';
  var qp = [];
  if (sede)   qp.push('sede='+sede);
  if (estado) qp.push('estado='+estado);
  if (mes)    qp.push('mes='+mes);
  var pagos = await API.get('/pagos' + (qp.length ? '?'+qp.join('&') : ''));
  if (!pagos) return;

  // KPIs
  var totalMes = pagos.reduce(function(s,p){ return s+(parseFloat(p.monto)||0); }, 0);
  var pagados   = pagos.filter(function(p){ return p.estado==='pagado';   }).length;
  var pendientes= pagos.filter(function(p){ return p.estado==='pendiente';}).length;
  var totalPend = pagos.filter(function(p){ return p.estado==='pendiente';}).reduce(function(s,p){ return s+(parseFloat(p.monto)||0); }, 0);
  var kpis = document.getElementById('pagosKpis');
  if (kpis) kpis.innerHTML =
    '<div class="dash-kpi accent-navy"><div class="dash-kpi-val">'+pagos.length+'</div><div class="dash-kpi-lbl">Pagos del mes</div><div class="dash-kpi-sub">total registrados</div></div>' +
    '<div class="dash-kpi accent-green"><div class="dash-kpi-val">'+pagados+'</div><div class="dash-kpi-lbl">Pagados</div><div class="dash-kpi-sub">cerrados ya</div></div>' +
    '<div class="dash-kpi accent-gold"><div class="dash-kpi-val">'+pendientes+'</div><div class="dash-kpi-lbl">Pendientes</div><div class="dash-kpi-sub">por entregar</div></div>' +
    '<div class="dash-kpi accent-blue"><div class="dash-kpi-val">S/ '+totalMes.toFixed(0)+'</div><div class="dash-kpi-lbl">Total filtrado</div><div class="dash-kpi-sub">pendiente: S/'+totalPend.toFixed(0)+'</div></div>';

  var body = document.getElementById('pagosBody');
  var cnt  = document.getElementById('pagosCount');
  if (cnt) cnt.textContent = pagos.length + ' registro(s)';
  if (!body) return;
  if (!pagos.length) {
    body.innerHTML = '<tr><td class="empty-cell" colspan="10">Sin pagos con esos filtros</td></tr>';
    return;
  }
  body.innerHTML = pagos.map(function(p){
    var emp = (STATE.empleadosCache||[]).find(function(e){ return e.id===p.emp_id; });
    var sedeLbl = (SEDES[p.emp_sede] && SEDES[p.emp_sede].short) || p.emp_sede || '—';
    var ciclo = (p.ciclo_desde && p.ciclo_hasta) ? (p.ciclo_desde+' → '+p.ciclo_hasta) : (p.mes||'—');
    var nota = (p.nota_final!=null)
        ? '<span class="badge badge-navy" style="font-size:10px">'+p.nota_final+'/20</span>'
        : '<span style="color:var(--text3)">—</span>';
    var estadoCls = 'pago-estado-pill pago-estado-' + (p.estado || 'pendiente');
    var rowCls = p.anulado ? 'pago-anulado' : '';
    var nombre = p.emp_nombre || (emp && emp.nombre) || p.emp_id;
    var rolLbl = (p.emp_rol||'').replace(/_/g,' ');
    return '<tr class="'+rowCls+'">' +
      '<td class="mono">#'+p.id+'</td>' +
      '<td><strong>'+nombre+'</strong><div style="font-size:10px;color:var(--text3)">'+rolLbl+'</div></td>' +
      '<td>'+sedeLbl+'</td>' +
      '<td style="font-size:11px;font-family:var(--font-m)">'+ciclo+'</td>' +
      '<td class="pago-monto-cell">S/ '+(parseFloat(p.monto)||0).toFixed(2)+'</td>' +
      '<td style="font-size:11px">'+(p.metodo||'—').toUpperCase()+'</td>' +
      '<td style="font-size:11px;font-family:var(--font-m)">'+(p.fecha_pago||'—')+'</td>' +
      '<td><span class="'+estadoCls+'">'+(p.estado||'—')+'</span></td>' +
      '<td>'+nota+'</td>' +
      '<td><div class="pago-actions">' +
        '<button class="btn btn-ghost btn-xs" onclick="abrirComprobante('+p.id+')" title="Comprobante">📄</button>' +
        (p.anulado ? '' :
          '<button class="btn btn-ghost btn-xs" onclick="editarPago('+p.id+')" title="Editar">✎</button>' +
          '<button class="btn btn-ghost btn-xs" onclick="anularPago('+p.id+')" title="Anular" style="color:var(--red)">×</button>'
        ) +
      '</div></td>' +
    '</tr>';
  }).join('');
}

function _llenarSelectEmpleados(elId, current) {
  var sel = document.getElementById(elId);
  if (!sel) return;
  var emps = (STATE.empleadosCache||[]).filter(function(e){ return e.activo!==0; });
  sel.innerHTML = '<option value="">— Elegir colaborador —</option>' +
    emps.map(function(e){
      var sedes = (e.tiendas||[]).map(function(t){ return (SEDES[t] && SEDES[t].short) || t; }).join('/');
      return '<option value="'+e.id+'"' + (current===e.id?' selected':'') + '>' + e.nombre + ' · ' + sedes + '</option>';
    }).join('');
}

function abrirNuevoPago(prefill) {
  prefill = prefill || {};
  document.getElementById('pagoModalTitle').textContent = 'Registrar pago';
  document.getElementById('pagoId').value = '';
  document.getElementById('pagoEvalId').value = prefill.evaluacion_id || '';
  _llenarSelectEmpleados('pagoEmpId', prefill.emp_id || '');
  document.getElementById('pagoMes').value = prefill.mes || (new Date()).toISOString().slice(0,7);
  document.getElementById('pagoCicloDesde').value = prefill.ciclo_desde || '';
  document.getElementById('pagoCicloHasta').value = prefill.ciclo_hasta || '';
  document.getElementById('pagoMontoBase').value = prefill.monto_base != null ? prefill.monto_base : '';
  document.getElementById('pagoBonus').value = prefill.bonus != null ? prefill.bonus : '';
  document.getElementById('pagoDesc').value = prefill.descuentos != null ? prefill.descuentos : '';
  document.getElementById('pagoMonto').value = prefill.monto != null ? prefill.monto : '';
  document.getElementById('pagoMetodo').value = prefill.metodo || 'efectivo';
  document.getElementById('pagoComprobNum').value = prefill.comprobante_num || '';
  document.getElementById('pagoFecha').value = prefill.fecha_pago || hoyLocal();
  document.getElementById('pagoObs').value = prefill.observaciones || '';
  document.getElementById('pagoSugerido').style.display = 'none';
  openModal('pagoModal');
  // Si vino con emp_id precargado, sugerir monto
  if (prefill.emp_id) setTimeout(pagoSugerirMonto, 200);
}

async function editarPago(id) {
  var d = await API.get('/pagos/'+id);
  if (!d || !d.pago) return;
  var p = d.pago;
  document.getElementById('pagoModalTitle').textContent = 'Editar pago #' + p.id;
  document.getElementById('pagoId').value = p.id;
  document.getElementById('pagoEvalId').value = p.evaluacion_id || '';
  _llenarSelectEmpleados('pagoEmpId', p.emp_id);
  document.getElementById('pagoMes').value = p.mes || '';
  document.getElementById('pagoCicloDesde').value = p.ciclo_desde || '';
  document.getElementById('pagoCicloHasta').value = p.ciclo_hasta || '';
  document.getElementById('pagoMontoBase').value = p.monto_base || '';
  document.getElementById('pagoBonus').value = p.bonus || '';
  document.getElementById('pagoDesc').value = p.descuentos || '';
  document.getElementById('pagoMonto').value = p.monto || '';
  document.getElementById('pagoMetodo').value = p.metodo || 'efectivo';
  document.getElementById('pagoComprobNum').value = p.comprobante_num || '';
  document.getElementById('pagoFecha').value = p.fecha_pago || hoyLocal();
  document.getElementById('pagoObs').value = p.observaciones || '';
  document.getElementById('pagoSugerido').style.display = 'none';
  openModal('pagoModal');
}

function pagoRecalc() {
  var mb = parseFloat(document.getElementById('pagoMontoBase').value) || 0;
  var b  = parseFloat(document.getElementById('pagoBonus').value) || 0;
  var d  = parseFloat(document.getElementById('pagoDesc').value) || 0;
  document.getElementById('pagoMonto').value = Math.max(0, mb + b - d).toFixed(2);
}

async function pagoSugerirMonto() {
  var emp = document.getElementById('pagoEmpId').value;
  var cd  = document.getElementById('pagoCicloDesde').value;
  if (!emp) return;
  var qp = ['emp_id='+encodeURIComponent(emp)];
  if (cd) qp.push('ciclo_desde='+cd);
  var d = await API.get('/pagos/sugerir?'+qp.join('&'));
  if (!d || !d.sugerido) return;
  var s = d.sugerido;
  var msg = '<strong>Monto sugerido:</strong> S/ ' + s.monto_total.toFixed(2);
  if (s.nota_final != null) {
    msg += ' (base ' + s.monto_base + ' × ' + s.nota_final + '/20 + bonus ' + s.bonus + ' − descuentos ' + s.descuentos + ')';
  } else {
    msg += ' (sin evaluación cerrada — usa salario base si está configurado)';
  }
  document.getElementById('pagoSugeridoTxt').innerHTML = msg;
  document.getElementById('pagoSugerido').style.display = '';
  document.getElementById('pagoSugerido').dataset.s = JSON.stringify(s);
  if (d.evaluacion) document.getElementById('pagoEvalId').value = d.evaluacion.id;
}

function pagoUsarSugerido() {
  var raw = document.getElementById('pagoSugerido').dataset.s;
  if (!raw) return;
  try {
    var s = JSON.parse(raw);
    document.getElementById('pagoMontoBase').value = s.monto_base || 0;
    document.getElementById('pagoBonus').value = s.bonus || 0;
    document.getElementById('pagoDesc').value = s.descuentos || 0;
    document.getElementById('pagoMonto').value = (s.monto_total||0).toFixed(2);
  } catch(e) {}
}

async function guardarPago(estado) {
  var emp = document.getElementById('pagoEmpId').value;
  if (!emp) { showToast('Elige colaborador', 'error'); return; }
  var monto = parseFloat(document.getElementById('pagoMonto').value) || 0;
  if (monto < 0) { showToast('Monto inválido', 'error'); return; }
  var body = {
    emp_id:        emp,
    evaluacion_id: document.getElementById('pagoEvalId').value || null,
    mes:           document.getElementById('pagoMes').value || null,
    ciclo_desde:   document.getElementById('pagoCicloDesde').value || null,
    ciclo_hasta:   document.getElementById('pagoCicloHasta').value || null,
    monto:         monto,
    monto_base:    parseFloat(document.getElementById('pagoMontoBase').value) || 0,
    bonus:         parseFloat(document.getElementById('pagoBonus').value) || 0,
    descuentos:    parseFloat(document.getElementById('pagoDesc').value) || 0,
    metodo:        document.getElementById('pagoMetodo').value || 'efectivo',
    comprobante_num: document.getElementById('pagoComprobNum').value || null,
    fecha_pago:    document.getElementById('pagoFecha').value || hoyLocal(),
    estado:        estado,
    observaciones: document.getElementById('pagoObs').value || ''
  };
  var id = document.getElementById('pagoId').value;
  var r;
  if (id) r = await API.put('/pagos/'+id, body);
  else    r = await API.post('/pagos', body);
  if (!r) return;
  showToast('Pago ' + (estado==='pagado' ? 'registrado' : 'guardado como pendiente'), 'success');
  closeModal('pagoModal');
  await renderPagos();
}

async function anularPago(id) {
  var motivo = prompt('Motivo de la anulación:');
  if (!motivo || !motivo.trim()) return;
  var r = await API.req('DELETE', '/pagos/' + id + '?motivo=' + encodeURIComponent(motivo.trim()));
  if (!r) return;
  showToast('Pago anulado', 'success');
  renderPagos();
}

function abrirComprobante(id) {
  // El endpoint /api/pagos/:id/comprobante requiere auth. Como abre en
  // pestaña nueva, no podemos enviar Authorization; pasamos el token por
  // query string acotado al uso inmediato.
  var token = API.token();
  // Nota: el server actualmente acepta el token solo por header — una mejora
  // posterior puede aceptar ?token= en este endpoint específico para poder
  // imprimir. Por ahora abrimos en blank y pegamos el contenido vía fetch.
  fetch('/api/pagos/'+id+'/comprobante', {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(function(r){ return r.text(); }).then(function(html){
    var w = window.open('', '_blank');
    if (!w) { showToast('El navegador bloqueó la ventana emergente', 'error'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }).catch(function(e){ showToast('No se pudo abrir el comprobante: '+e.message, 'error'); });
}

// Hook al routing principal para auto-renderizar al entrar
(function(){
  if (window._goToPagosHooked) return;
  var orig = window.goTo;
  if (typeof orig !== 'function') {
    // Esperar a que goTo esté disponible
    var iv = setInterval(function(){
      if (typeof window.goTo === 'function') {
        clearInterval(iv);
        var o = window.goTo;
        window.goTo = function(pageId, btn){
          var r = o.apply(this, arguments);
          if (pageId === 'pagos') { try { renderPagos(); } catch(e){} }
          return r;
        };
        window._goToPagosHooked = true;
      }
    }, 200);
    return;
  }
  window.goTo = function(pageId, btn){
    var r = orig.apply(this, arguments);
    if (pageId === 'pagos') { try { renderPagos(); } catch(e){} }
    return r;
  };
  window._goToPagosHooked = true;
})();

// ── Integración con Evaluación Mensual ────────────────────────────────
// Guarda la evaluación y abre el modal de pago precargado con los datos
// del ciclo + monto sugerido (calculado por el backend con la fórmula
// salario_base × nota/20 + bonus − descuentos).
async function cerrarEvalYRegistrarPago() {
  if (typeof guardarEvalMensual !== 'function') {
    showToast('No se puede cerrar — falta la función de guardado', 'error');
    return;
  }
  // 1. Guardar primero la evaluación
  await guardarEvalMensual();
  // 2. Abrir modal de pago con prefill
  var empId = STATE.evalMensualEmp;
  var desde = STATE.evalMensualDesde;
  var hasta = STATE.evalMensualHasta;
  if (!empId) { showToast('Selecciona colaborador antes de registrar pago', 'error'); return; }
  // Pequeño delay para asegurar que la evaluación quedó persistida
  setTimeout(function(){
    abrirNuevoPago({
      emp_id: empId,
      mes: (desde||'').slice(0,7),
      ciclo_desde: desde || null,
      ciclo_hasta: hasta || null
    });
  }, 250);
}
window.cerrarEvalYRegistrarPago = cerrarEvalYRegistrarPago;

// ── Tab "Pagos" dentro del módulo Evaluación Mensual ─────────────────
// Lista los pagos del colaborador seleccionado en el selector global de
// la página y permite registrar un nuevo pago precargado con su ciclo.
async function renderEvalPagos() {
  var empId = STATE.evalMensualEmp;
  var info = document.getElementById('evalPagosInfo');
  var btn  = document.getElementById('evalPagoBtnNuevo');
  var body = document.getElementById('evalPagosBody');
  if (!empId) {
    if (info) info.textContent = 'Selecciona un colaborador arriba';
    if (btn)  btn.disabled = true;
    if (body) body.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:30px">Selecciona un colaborador para ver y registrar sus pagos.</div>';
    return;
  }
  var emp = (STATE.empleadosCache||[]).find(function(e){return e.id===empId;}) || {};
  if (info) info.textContent = 'Pagos de ' + (emp.nombre||empId);
  if (btn)  btn.disabled = false;
  if (!body) return;
  body.innerHTML = '<div style="color:var(--text3);font-size:12px">Cargando...</div>';

  var pagos = await API.get('/pagos?emp_id=' + encodeURIComponent(empId));
  if (!pagos) { body.innerHTML = '<div style="color:var(--red);font-size:12px">No se pudo cargar</div>'; return; }
  if (!pagos.length) {
    body.innerHTML = '<div style="text-align:center;padding:24px"><div style="font-size:13px;color:var(--text2);margin-bottom:8px">Aún no se ha registrado ningún pago para este colaborador.</div>' +
                     '<button class="btn btn-primary btn-sm" onclick="evalPagoAbrirNuevo()">+ Registrar primer pago</button></div>';
    return;
  }
  // KPIs cortos
  var totalPagado = pagos.filter(function(p){return p.estado==='pagado'&&!p.anulado;}).reduce(function(s,p){return s+(parseFloat(p.monto)||0);},0);
  var pendientes  = pagos.filter(function(p){return p.estado==='pendiente'&&!p.anulado;}).length;
  var ultimo = pagos[0];
  body.innerHTML =
    '<div class="dash-kpis-grid" style="margin-bottom:14px">' +
      '<div class="dash-kpi accent-green"><div class="dash-kpi-val">S/ '+totalPagado.toFixed(0)+'</div><div class="dash-kpi-lbl">Total pagado</div><div class="dash-kpi-sub">acumulado histórico</div></div>' +
      '<div class="dash-kpi accent-gold"><div class="dash-kpi-val">'+pendientes+'</div><div class="dash-kpi-lbl">Pagos pendientes</div><div class="dash-kpi-sub">por entregar</div></div>' +
      '<div class="dash-kpi accent-navy"><div class="dash-kpi-val">'+pagos.length+'</div><div class="dash-kpi-lbl">Registros</div><div class="dash-kpi-sub">último: '+(ultimo.fecha_pago||ultimo.mes||'—')+'</div></div>' +
    '</div>' +
    '<div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th>#</th><th>Ciclo / Mes</th><th style="text-align:right">Monto</th><th>Método</th><th>Fecha pago</th><th>Estado</th><th>Nota</th><th></th>' +
    '</tr></thead><tbody>' +
    pagos.map(function(p){
      var ciclo = (p.ciclo_desde&&p.ciclo_hasta)?(p.ciclo_desde+' → '+p.ciclo_hasta):(p.mes||'—');
      var nota = (p.nota_final!=null)?'<span class="badge badge-navy" style="font-size:10px">'+p.nota_final+'/20</span>':'<span style="color:var(--text3)">—</span>';
      var estCls = 'pago-estado-pill pago-estado-'+(p.estado||'pendiente');
      return '<tr'+(p.anulado?' class="pago-anulado"':'')+'>' +
        '<td class="mono">#'+p.id+'</td>' +
        '<td style="font-size:11px;font-family:var(--font-m)">'+ciclo+'</td>' +
        '<td class="pago-monto-cell">S/ '+(parseFloat(p.monto)||0).toFixed(2)+'</td>' +
        '<td style="font-size:11px">'+(p.metodo||'—').toUpperCase()+'</td>' +
        '<td style="font-size:11px;font-family:var(--font-m)">'+(p.fecha_pago||'—')+'</td>' +
        '<td><span class="'+estCls+'">'+(p.estado||'—')+'</span></td>' +
        '<td>'+nota+'</td>' +
        '<td><div class="pago-actions">' +
          '<button class="btn btn-ghost btn-xs" onclick="abrirComprobante('+p.id+')" title="Comprobante">📄</button>' +
          (p.anulado?'':'<button class="btn btn-ghost btn-xs" onclick="editarPago('+p.id+')" title="Editar">✎</button>') +
        '</div></td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';
}

function evalPagoAbrirNuevo() {
  var empId = STATE.evalMensualEmp;
  if (!empId) { showToast('Selecciona un colaborador arriba','error'); return; }
  abrirNuevoPago({
    emp_id: empId,
    mes: (STATE.evalMensualDesde||'').slice(0,7),
    ciclo_desde: STATE.evalMensualDesde || null,
    ciclo_hasta: STATE.evalMensualHasta || null
  });
}
window.renderEvalPagos = renderEvalPagos;
window.evalPagoAbrirNuevo = evalPagoAbrirNuevo;
