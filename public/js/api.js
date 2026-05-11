// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/api.js — Cliente API con JWT
// v4.3-fix — IDs codificados en URL
// ═══════════════════════════════════════════════════════
const API = {
  base: '/api',

  token() { return localStorage.getItem('lb_token'); },
  setToken(t) { localStorage.setItem('lb_token', t); },
  clearToken() { localStorage.removeItem('lb_token'); localStorage.removeItem('lb_user'); },
  user() { try { return JSON.parse(localStorage.getItem('lb_user')); } catch(e) { return null; } },
  setUser(u) { localStorage.setItem('lb_user', JSON.stringify(u)); },

  headers() {
    const h = { 'Content-Type': 'application/json' };
    const t = this.token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  },

  async request(method, path, body) {
    try {
      const opts = { method, headers: this.headers() };
      if (body) opts.body = JSON.stringify(body);
      const res  = await fetch(this.base + path, opts);
      const data = await res.json();
      if (res.status === 401) { this.clearToken(); location.reload(); return null; }
      if (!res.ok) throw new Error(data.error || 'Error de servidor');
      return data;
    } catch (e) {
      console.error('[API]', method, path, e.message);
      showToast(e.message, 'error');
      return null;
    }
  },

  get(path)         { return this.request('GET',    path); },
  post(path, body)  { return this.request('POST',   path, body); },
  put(path, body)   { return this.request('PUT',    path, body); },
  del(path)         { return this.request('DELETE', path); },

  // Método genérico para rutas no tipadas
  req(method, path, body) { return this.request(method, path, body); },

  // Atajos específicos — IDs codificados con encodeURIComponent para evitar problemas con / y espacios
  // Login por usuario + contraseña + sede. cod (4 dígitos) NO es para login, solo operaciones.
  login(nombre, sede, password) { return this.post('/auth/login', { nombre: nombre, sede: sede, password: password }); },
  empleados(sede)        { return this.get('/empleados/by-sede/' + encodeURIComponent(sede)); },
  todosEmpleados()       { return this.get('/empleados'); },
  credencialesEmpleados(){ return this.get('/empleados/credentials/all'); },
  desempeno(id)          { return this.get('/empleados/' + encodeURIComponent(id) + '/desempeno'); },
  reportes(params)       { const q = new URLSearchParams(params).toString(); return this.get('/reportes?' + q); },
  alertas(sede)          { return this.get('/reportes/alertas/' + encodeURIComponent(sede)); },
  enviarReporte(body)    { return this.post('/reportes', body); },
  evaluarReporte(id, b)  { return this.put('/reportes/' + encodeURIComponent(id) + '/evaluar', b); },
  // ── Drafts FR-01 (autosave + auto-envío al vencer deadline) ──
  getDraft(sede, fecha, turno)    { return this.get('/reportes/drafts/' + encodeURIComponent(sede) + '/' + encodeURIComponent(fecha) + '/' + encodeURIComponent(turno)); },
  saveDraft(body)                 { return this.post('/reportes/drafts', body); },
  borrarDraft(sede, fecha, turno) { return this.del('/reportes/drafts/' + encodeURIComponent(sede) + '/' + encodeURIComponent(fecha) + '/' + encodeURIComponent(turno)); },
  permitirReenvio(body)           { return this.post('/reportes/permitir-reenvio', body); },
  // ── Pipeline · historial unificado + envíos de accesorios ──
  pipeHistorial(params)           { const q = new URLSearchParams(params||{}).toString(); return this.get('/pipeline/historial' + (q?'?'+q:'')); },
  pipeListaTraza(id)              { return this.get('/pipeline/lista/' + encodeURIComponent(id) + '/trazabilidad'); },
  pipeEnviosAccesorios(params)    { const q = new URLSearchParams(params||{}).toString(); return this.get('/pipeline/envios-accesorios' + (q?'?'+q:'')); },
  pipeCrearEnvioAcc(body)         { return this.post('/pipeline/envios-accesorios', body); },
  pipeValidarEnvioAcc(id, body)   { return this.put('/pipeline/envios-accesorios/' + encodeURIComponent(id) + '/validar', body||{}); },
  listas(params)         { const q = new URLSearchParams(params).toString(); return this.get('/lavanderia?' + q); },
  enviarLista(body)      { return this.post('/lavanderia', body); },
  cambiarEstado(id, est) { return this.put('/lavanderia/' + encodeURIComponent(id) + '/estado', { estado: est }); },
  validarRetorno(id, b)  { return this.put('/lavanderia/' + encodeURIComponent(id) + '/validar', b); },
  incidencias(params)    { const q = new URLSearchParams(params||{}).toString(); return this.get('/incidencias?' + q); },
  crearIncidencia(body)  { return this.post('/incidencias', body); },
  misValores(mes)        { return this.get('/valores/mis-pendientes/' + encodeURIComponent(mes)); },
  enviarValores(body)    { return this.post('/valores', body); },
  resumenValores(eid, m) { return this.get('/valores/resumen/' + encodeURIComponent(eid) + '/' + encodeURIComponent(m)); },
  evalsMensuales(p)      { const q = new URLSearchParams(p).toString(); return this.get('/evaluaciones/mensual?' + q); },
  guardarEvalMensual(b)  { return this.post('/evaluaciones/mensual', b); },
  // ── Horarios v1 ──────────────────────────────────────
  horariosPeriodos()               { return this.get('/horarios/periodos'); },
  horarioPeriodo(id)               { return this.get('/horarios/periodos/' + encodeURIComponent(id)); },
  crearPeriodoHorario(b)           { return this.post('/horarios/periodos', b); },
  activarPeriodoHorario(id)        { return this.put('/horarios/periodos/' + encodeURIComponent(id) + '/activar', {}); },
  borrarPeriodoHorario(id)         { return this.del('/horarios/periodos/' + encodeURIComponent(id)); },
  subirSlotsPeriodo(id, slots)     { return this.post('/horarios/periodos/' + encodeURIComponent(id) + '/slots/bulk', { slots: slots }); },
  horarioVigente(params)           { const q = new URLSearchParams(params||{}).toString(); return this.get('/horarios/vigente' + (q?'?'+q:'')); },
  miHorario()                      { return this.get('/horarios/mi-horario'); },
  horarioEmpleado(id)              { return this.get('/horarios/empleado/' + encodeURIComponent(id)); },
  horarioDelDia(params)            { const q = new URLSearchParams(params||{}).toString(); return this.get('/horarios/del-dia' + (q?'?'+q:'')); },
  encargadoTurno(params)           { const q = new URLSearchParams(params||{}).toString(); return this.get('/horarios/encargado' + (q?'?'+q:'')); },
  horasMensuales(emp_id, mes)      { return this.get('/horarios/horas-mes?emp_id=' + encodeURIComponent(emp_id) + '&mes=' + encodeURIComponent(mes)); },
  // ── Pesos de Evaluación Mensual ─────────────────────
  evalPesos()                      { return this.get('/config/eval-pesos'); },
  guardarEvalPesos(pesos)          { return this.put('/config/eval-pesos', pesos); },
  // ── Constructor v2: CRUD por slot ────────────────────
  crearSlotHorario(periodoId, b)   { return this.post('/horarios/periodos/' + encodeURIComponent(periodoId) + '/slots', b); },
  editarSlotHorario(slotId, b)     { return this.put('/horarios/slots/' + encodeURIComponent(slotId), b); },
  borrarSlotHorario(slotId)        { return this.del('/horarios/slots/' + encodeURIComponent(slotId)); },
  duplicarPeriodoHorario(id, b)    { return this.post('/horarios/periodos/' + encodeURIComponent(id) + '/duplicar', b); },
  editarPeriodoHorario(id, b)      { return this.put('/horarios/periodos/' + encodeURIComponent(id), b); },
};

// ── Demo mode (sin servidor) ──────────────────────────
// Si falla el fetch, usa datos locales (para prueba de UI)
window._demoMode = false;
