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
  login(cod, sede)       { return this.post('/auth/login', { cod, sede }); },
  empleados(sede)        { return this.get('/empleados/by-sede/' + encodeURIComponent(sede)); },
  todosEmpleados()       { return this.get('/empleados'); },
  desempeno(id)          { return this.get('/empleados/' + encodeURIComponent(id) + '/desempeno'); },
  reportes(params)       { const q = new URLSearchParams(params).toString(); return this.get('/reportes?' + q); },
  alertas(sede)          { return this.get('/reportes/alertas/' + encodeURIComponent(sede)); },
  enviarReporte(body)    { return this.post('/reportes', body); },
  evaluarReporte(id, b)  { return this.put('/reportes/' + encodeURIComponent(id) + '/evaluar', b); },
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
};

// ── Demo mode (sin servidor) ──────────────────────────
// Si falla el fetch, usa datos locales (para prueba de UI)
window._demoMode = false;
