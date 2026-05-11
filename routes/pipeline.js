const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getDB, hoyLocal } = require('../database/db');
const SECRET = process.env.JWT_SECRET || 'lucebien-secret-2026-xK9mP3qR';

function auth(req,res,next){try{var h=req.headers['authorization'];if(!h||!h.startsWith('Bearer '))return res.status(401).json({error:'Token requerido'});req.user=jwt.verify(h.slice(7),SECRET);next();}catch(e){return res.status(401).json({error:'Token invalido'});}}
function safe(fn){return function(req,res){try{fn(req,res);}catch(e){console.error('[Pipeline]',e.message);res.status(500).json({error:e.message});}};}

// ════════════════════════════════════════════════════════════════════
// SSE — broadcast de eventos del pipeline a clientes suscritos
// ════════════════════════════════════════════════════════════════════
// Set de respuestas SSE activas. Cada cliente se identifica con un id
// numérico para limpieza. Heartbeat cada 25s evita que proxies cierren
// la conexión por inactividad.
var sseClients = new Set();
var sseId = 0;

function ssePing(){
  sseClients.forEach(function(c){
    try{ c.res.write(':ping\n\n'); }catch(e){ try{ sseClients.delete(c); }catch(_){} }
  });
}
setInterval(ssePing, 25000);

function broadcast(event, payload){
  var data = JSON.stringify(Object.assign({ts:new Date().toISOString()}, payload||{}));
  var msg = 'event: '+event+'\ndata: '+data+'\n\n';
  sseClients.forEach(function(c){
    try{ c.res.write(msg); }catch(e){ try{ sseClients.delete(c); }catch(_){} }
  });
}

// GET /api/pipeline/stream  — SSE. Token vía query (?token=...) porque
// EventSource no permite headers personalizados. Solo broadcast, no
// devuelve estado: el cliente sigue usando /kanban para poblar la UI.
router.get('/stream', function(req, res){
  var user = null;
  try{
    var tk = req.query.token || (req.headers['authorization']||'').replace(/^Bearer /,'');
    if(tk) user = jwt.verify(tk, SECRET);
  }catch(e){ /* permitir conexión anónima — solo recibe eventos, no envía */ }

  res.set({
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache, no-transform',
    'Connection':'keep-alive',
    'X-Accel-Buffering':'no'
  });
  res.flushHeaders && res.flushHeaders();
  res.write('retry: 5000\n\n');
  res.write('event: connected\ndata: '+JSON.stringify({user:user?{nombre:user.nombre,cod:user.cod,rol:user.rol}:null,ts:new Date().toISOString()})+'\n\n');

  var client = { id: ++sseId, res: res, user: user };
  sseClients.add(client);

  req.on('close', function(){ try{ sseClients.delete(client); }catch(e){} });
});

// ── helper: extrae actor (responsable + cod validado) desde el JWT
//    y descarta cualquier valor diferente que un no-supervisor envíe.
//    Resuelve B3: evita suplantación de identidad.
function actor(q){
  var u = q.user || {};
  var rol = (u.rol||'').toLowerCase();
  var sup = rol==='admin' || rol==='dueno' || rol==='dueño' || rol==='encargado_almacen';
  var b = q.body || {};
  // Para no-supervisores forzamos identidad del JWT.
  // Los supervisores pueden actuar a nombre de un operario (modo registro asistido).
  if (sup) {
    return {
      cod: b.cod_responsable || b.cod_operario || u.cod || '',
      nombre: b.responsable || b.operario_nombre || u.nombre || '',
      esSupervisor: true,
      jwt_cod: u.cod || '',
      jwt_nombre: u.nombre || ''
    };
  }
  return {
    cod: u.cod || '',
    nombre: u.nombre || '',
    esSupervisor: false,
    jwt_cod: u.cod || '',
    jwt_nombre: u.nombre || ''
  };
}

function getPts(db,etapa,tipoLav){
  try{
    if(etapa==='lavado'){var k='pts_lavado_'+(tipoLav||'normal');var r=db.prepare('SELECT valor FROM config WHERE clave=?').get(k);return r?parseFloat(r.valor):1;}
    var k2='pts_'+etapa;var r2=db.prepare('SELECT valor FROM config WHERE clave=?').get(k2);return r2?parseFloat(r2.valor):1;
  }catch(e){return 1;}
}
function recPts(db,cod,nombre,pid,etapa,pts,det){
  var fecha=hoyLocal();
  db.prepare('INSERT INTO pipeline_puntos (emp_cod,emp_nombre,prenda_id,etapa,puntos,detalle,fecha) VALUES (?,?,?,?,?,?,?)').run(cod,nombre,pid,etapa,pts,det||'',fecha);
}

// ════════════════════════════════════════════════════════════════════
// Migraciones idempotentes — se ejecutan al cargar el módulo. Cada
// ALTER va envuelto en try/catch porque SQLite no soporta IF NOT EXISTS
// en ADD COLUMN. Los CREATE INDEX sí son idempotentes.
// ════════════════════════════════════════════════════════════════════
(function migrarPipeline(){
  try{
    var db=getDB();
    // accesorios_log: columnas adicionales
    try{ db.exec("ALTER TABLE accesorios_log ADD COLUMN sede_origen TEXT DEFAULT 'AL'"); }catch(e){}
    try{ db.exec("ALTER TABLE accesorios_log ADD COLUMN enviado INTEGER DEFAULT 0"); }catch(e){}
    try{ db.exec("ALTER TABLE accesorios_log ADD COLUMN envio_id INTEGER"); }catch(e){}
    try{ db.exec("ALTER TABLE accesorios_log ADD COLUMN sustento TEXT DEFAULT ''"); }catch(e){}
    try{ db.exec("ALTER TABLE accesorios_log ADD COLUMN origen TEXT DEFAULT 'almacen'"); }catch(e){}
    // prendas: marcado de división (B5) sin DELETE
    try{ db.exec("ALTER TABLE prendas ADD COLUMN dividida INTEGER DEFAULT 0"); }catch(e){}
    try{ db.exec("ALTER TABLE prendas ADD COLUMN dividida_en TEXT"); }catch(e){}
    // prenda_historial: cod_responsable para evitar colisión por homónimos (B6)
    try{ db.exec("ALTER TABLE prenda_historial ADD COLUMN cod_responsable TEXT"); }catch(e){}
    // Tablas de envíos de accesorios
    db.exec(
      "CREATE TABLE IF NOT EXISTS envios_accesorios (" +
      "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "  sede_destino TEXT NOT NULL," +
      "  fecha TEXT NOT NULL," +
      "  responsable TEXT," +
      "  responsable_cod TEXT," +
      "  validado_tienda INTEGER DEFAULT 0," +
      "  validado_por TEXT," +
      "  fecha_validado TEXT," +
      "  obs TEXT," +
      "  created_at TEXT DEFAULT (datetime('now','localtime'))" +
      ")"
    );
    db.exec(
      "CREATE TABLE IF NOT EXISTS envio_accesorios_items (" +
      "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "  envio_id INTEGER NOT NULL," +
      "  tipo TEXT NOT NULL," +
      "  cantidad INTEGER DEFAULT 0," +
      "  obs TEXT," +
      "  FOREIGN KEY (envio_id) REFERENCES envios_accesorios(id)" +
      ")"
    );
    // Índices de performance
    try{ db.exec("CREATE INDEX IF NOT EXISTS idx_prenda_hist_fecha ON prenda_historial(fecha)"); }catch(e){}
    try{ db.exec("CREATE INDEX IF NOT EXISTS idx_prenda_hist_resp  ON prenda_historial(responsable)"); }catch(e){}
    try{ db.exec("CREATE INDEX IF NOT EXISTS idx_prenda_hist_pid   ON prenda_historial(prenda_id)"); }catch(e){}
    try{ db.exec("CREATE INDEX IF NOT EXISTS idx_acc_log_fecha     ON accesorios_log(fecha)"); }catch(e){}
    try{ db.exec("CREATE INDEX IF NOT EXISTS idx_prendas_etapa     ON prendas(etapa)"); }catch(e){}
    try{ db.exec("CREATE INDEX IF NOT EXISTS idx_prendas_envio     ON prendas(envio_id)"); }catch(e){}
    try{ db.exec("CREATE INDEX IF NOT EXISTS idx_envios_sede       ON envios_prendas(sede_destino, validado_tienda)"); }catch(e){}
  }catch(e){ console.warn('[pipeline] migración:', e.message); }
})();

// ── helper: es admin/dueño/encargado_almacén?
function esSupervisor(u){
  if(!u) return false;
  var rol = (u.rol||'').toLowerCase();
  return rol==='admin'||rol==='dueno'||rol==='dueño'||rol==='encargado_almacen';
}

// ════════════════════════════════════════════════════════════════════
// GET endpoints (públicos / lectura)
// ════════════════════════════════════════════════════════════════════
router.get('/',safe(function(q,r){var db=getDB();var s='SELECT * FROM prendas WHERE 1=1';var p=[];if(q.query.sede_origen){s+=' AND sede_origen=?';p.push(q.query.sede_origen);}if(q.query.etapa){s+=' AND etapa=?';p.push(q.query.etapa);}if(q.query.no_enviado)s+=" AND etapa!='enviado'";s+=' ORDER BY fecha_ingreso DESC,id DESC';if(q.query.limit){s+=' LIMIT ?';p.push(parseInt(q.query.limit)||200);}r.json(db.prepare(s).all(...p));}));

router.get('/kanban',safe(function(q,r){
  var db=getDB();
  // Excluimos enviadas y divididas (que ya no operan en el kanban)
  var prendas=db.prepare("SELECT * FROM prendas WHERE etapa!='enviado' AND COALESCE(dividida,0)=0 ORDER BY fecha_ingreso,id").all();
  var kanban={};
  prendas.forEach(function(p){if(!kanban[p.etapa])kanban[p.etapa]=[];kanban[p.etapa].push(p);});
  var acc=[];try{acc=db.prepare("SELECT li.* FROM lista_items li JOIN listas_lavanderia ll ON li.lista_id=ll.id WHERE li.tipo IN ('corbata','michi','corbaton') AND ll.estado!='Validado' ORDER BY ll.fecha DESC LIMIT 100").all();}catch(e){}
  var pendGen={};try{var gl=db.prepare("SELECT SUM(camisas) as cam,SUM(corbatas) as cor,SUM(michis) as mic,SUM(corbatones) as cbt FROM listas_lavanderia WHERE estado!='Validado'").get();if(gl){pendGen={'Camisas':gl.cam||0,'Corbatas':gl.cor||0,'Michis':gl.mic||0,'Corbatones':gl.cbt||0};}}catch(e){}
  var procHoy=[];try{procHoy=db.prepare("SELECT tipo,SUM(cantidad) as total FROM accesorios_log WHERE fecha=? GROUP BY tipo").all(hoyLocal());}catch(e){}
  var stats={};prendas.forEach(function(p){stats[p.etapa]=(stats[p.etapa]||0)+1;});
  // enviados (todas las históricamente enviadas, para tarjeta de stat)
  try{ stats.enviados = db.prepare("SELECT COUNT(*) as n FROM prendas WHERE etapa='enviado'").get().n; }catch(e){ stats.enviados=0; }
  r.json({kanban:kanban,prendas:prendas,accesorios:acc,pendientes_generales:pendGen,accesorios_hoy:procHoy,stats:stats,total:prendas.length});
}));

router.get('/stats',safe(function(q,r){var db=getDB();var rows=db.prepare("SELECT etapa,COUNT(*) as n FROM prendas WHERE etapa!='enviado' AND COALESCE(dividida,0)=0 GROUP BY etapa").all();var st={};rows.forEach(function(x){st[x.etapa]=x.n});r.json({stats:st,total:db.prepare("SELECT COUNT(*) as n FROM prendas WHERE etapa!='enviado' AND COALESCE(dividida,0)=0").get().n,enviados:db.prepare("SELECT COUNT(*) as n FROM prendas WHERE etapa='enviado'").get().n});}));

router.get('/:id/historial',safe(function(q,r){
  // /stream comparte prefijo numérico no posible, pero por seguridad
  // este handler ya tenía el patrón /:id/historial — Express resuelve
  // primero la ruta declarada anteriormente para /stream, así que OK.
  if(q.params.id==='stream') return r.status(404).end();
  r.json(getDB().prepare('SELECT * FROM prenda_historial WHERE prenda_id=? ORDER BY fecha').all(q.params.id));
}));

router.get('/envios',safe(function(q,r){var db=getDB();var s='SELECT * FROM envios_prendas WHERE COALESCE(cancelado,0)=0';var p=[];if(q.query.sede_destino){s+=' AND sede_destino=?';p.push(q.query.sede_destino);}s+=' ORDER BY fecha DESC LIMIT 50';var envios=db.prepare(s).all(...p);envios.forEach(function(e){e.prendas=db.prepare('SELECT * FROM prendas WHERE envio_id=?').all(e.id);e.count=e.prendas.length;});r.json(envios);}));

router.get('/accesorios',safe(function(q,r){r.json(getDB().prepare('SELECT * FROM accesorios_log ORDER BY fecha DESC,id DESC LIMIT 200').all());}));

router.get('/ranking',safe(function(q,r){
  var db=getDB();var desde=new Date();desde.setDate(desde.getDate()-desde.getDay());var desdeStr=desde.toISOString().slice(0,10);
  var ranking=db.prepare("SELECT emp_nombre,emp_cod,SUM(puntos) as total_pts,COUNT(*) as acciones FROM pipeline_puntos WHERE fecha>=? AND puntos>0 GROUP BY emp_cod ORDER BY total_pts DESC LIMIT 15").all(desdeStr);
  r.json({ranking:ranking,desde:desdeStr});
}));

router.get('/bitacora',safe(function(q,r){r.json(getDB().prepare('SELECT * FROM pipeline_puntos ORDER BY created_at DESC LIMIT ?').all(parseInt(q.query.limit)||100));}));

// ── Config de puntajes ──
router.get('/config-puntos',safe(function(q,r){
  var db=getDB();
  var keys=['pts_lavado_normal','pts_lavado_seco','pts_lavado_especializado','pts_empatado','pts_refaccion','pts_compostura','pts_planchado','pts_control_calidad','pts_accesorio','precio_camisa','pts_envio'];
  var cfg={};keys.forEach(function(k){try{var v=db.prepare('SELECT valor FROM config WHERE clave=?').get(k);cfg[k]=v?parseFloat(v.valor):1;}catch(e){cfg[k]=1;}});
  r.json(cfg);
}));

router.put('/config-puntos',auth,safe(function(q,r){
  var db=getDB();var b=q.body;
  var upd=db.prepare('INSERT OR REPLACE INTO config (clave,valor) VALUES (?,?)');
  db.transaction(function(){Object.entries(b).forEach(function(e){if(e[0].startsWith('pts_')||e[0].startsWith('precio_'))upd.run(e[0],String(e[1]));});})();
  r.json({ok:true});
}));

// ════════════════════════════════════════════════════════════════════
// WRITE endpoints (auth required)
// ════════════════════════════════════════════════════════════════════
router.post('/',auth,safe(function(q,r){
  var db=getDB();var b=q.body;if(!b.codigo||!b.sede_origen)return r.status(400).json({error:'Codigo y sede requeridos'});
  var act=actor(q);
  var x=db.prepare("INSERT INTO prendas (codigo,tipo,color,talla,sede_origen,etapa,tipo_lavado,fecha_ingreso,obs_general) VALUES (?,?,?,?,?,?,?,?,?)").run(b.codigo,b.tipo||'',b.color||'',b.talla||'',b.sede_origen,b.etapa_inicial||'recepcion',b.tipo_lavado||'normal',b.fecha_ingreso||hoyLocal(),b.obs||'');
  db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?)').run(x.lastInsertRowid,b.etapa_inicial||'recepcion',act.nombre,act.cod,b.obs||'Ingreso');
  broadcast('prenda-creada',{prenda_id:x.lastInsertRowid,codigo:b.codigo,etapa:b.etapa_inicial||'recepcion',responsable:act.nombre,cod:act.cod});
  r.json({id:x.lastInsertRowid,ok:true});
}));

router.post('/batch',auth,safe(function(q,r){
  var db=getDB();var items=q.body.prendas;var sede=q.body.sede_origen;var fecha=q.body.fecha_ingreso||hoyLocal();var lid=q.body.lista_id||null;
  if(!items||!items.length||!sede)return r.status(400).json({error:'Prendas y sede requeridos'});
  var act=actor(q);
  var ins=db.prepare("INSERT INTO prendas (codigo,tipo,color,talla,sede_origen,etapa,tipo_lavado,fecha_ingreso,lista_lavanderia_id,obs_general) VALUES (?,?,?,?,?,?,?,?,?,?)");
  var insH=db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?)');
  var ids=[];
  db.transaction(function(){for(var i=0;i<items.length;i++){var p=items[i];
    var et=p.destino==='compostura'?'compostura':p.destino==='refaccion'?'refaccion':'recepcion';
    var x=ins.run(p.codigo||'',p.tipo||'',p.color||'',p.talla||'',sede,et,p.tipo_lavado||'normal',fecha,lid,p.obs||'');
    insH.run(x.lastInsertRowid,et,act.nombre,act.cod,'Batch '+(lid||''));ids.push(x.lastInsertRowid);
  }})();
  broadcast('prendas-registradas',{ids:ids,count:ids.length,sede:sede,responsable:act.nombre,cod:act.cod});
  r.json({ids:ids,count:ids.length,ok:true});
}));

// ── AVANZAR prenda ────────────────────────────────────────────────
router.put('/:id/avanzar',auth,safe(function(q,r){
  var db=getDB();var b=q.body;var pr=db.prepare('SELECT * FROM prendas WHERE id=?').get(q.params.id);
  if(!pr)return r.status(404).json({error:'No encontrada'});
  if(pr.dividida)return r.status(409).json({error:'Prenda dividida — usar piezas separadas'});
  var dest=b.etapa_destino;if(!dest)return r.status(400).json({error:'etapa_destino requerida'});
  var act=actor(q);
  // FIX B11 (DQS): comillas SIMPLES en string literals SQL
  var sets=["etapa=?","fecha_actualizado=datetime('now','localtime')"];var vals=[dest];
  if(act.cod){
    sets.push("cod_lavador=CASE WHEN etapa='recepcion' THEN ? ELSE cod_lavador END");vals.push(act.cod);
    sets.push("cod_planchador=CASE WHEN etapa='planchado' THEN ? ELSE cod_planchador END");vals.push(act.cod);
  }
  if(b.obs){var obsField={refaccion:'obs_refaccion',compostura:'obs_compostura',control_calidad:'obs_calidad'};
    if(obsField[dest]){sets.push(obsField[dest]+'=?');vals.push(b.obs);}}
  if(b.tipo_lavado){sets.push('tipo_lavado=?');vals.push(b.tipo_lavado);}
  if(dest==='listo'){sets.push('aprobada=1');}
  vals.push(q.params.id);
  db.prepare('UPDATE prendas SET '+sets.join(',')+' WHERE id=?').run(...vals);
  db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_anterior,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?,?)').run(q.params.id,pr.etapa,dest,act.nombre,act.cod,b.obs||'');
  // Puntos — mitad para prendas no completas
  var pts=getPts(db,pr.etapa,pr.tipo_lavado);
  var tipo=(pr.tipo||'').toLowerCase();
  var isHalf=tipo&&tipo!=='terno completo'&&tipo!=='terno'&&(tipo.indexOf('saco')>=0||tipo.indexOf('pantal')>=0||tipo.indexOf('falda')>=0||tipo.indexOf('chaleco')>=0||tipo.indexOf('blazer')>=0);
  if(isHalf)pts=parseFloat((pts/2).toFixed(1));
  if(pts>0)recPts(db,act.cod,act.nombre,parseInt(q.params.id),pr.etapa,pts,pr.codigo+': '+pr.etapa+'→'+dest+(isHalf?' (½)':''));
  broadcast('prenda-avanzada',{prenda_id:parseInt(q.params.id),codigo:pr.codigo,etapa_anterior:pr.etapa,etapa_nueva:dest,responsable:act.nombre,cod:act.cod,puntos:pts});
  r.json({ok:true,puntos:pts,etapa_anterior:pr.etapa,etapa_nueva:dest,prenda_id:parseInt(q.params.id)});
}));

// ── DESHACER última acción (5 seg) ────────────────────────────────
router.put('/:id/deshacer',auth,safe(function(q,r){
  var db=getDB();var b=q.body;var pr=db.prepare('SELECT * FROM prendas WHERE id=?').get(q.params.id);
  if(!pr)return r.status(404).json({error:'No encontrada'});
  if(!b.etapa_anterior)return r.status(400).json({error:'etapa_anterior requerida'});
  var act=actor(q);
  db.prepare("UPDATE prendas SET etapa=?,fecha_actualizado=datetime('now','localtime') WHERE id=?").run(b.etapa_anterior,q.params.id);
  db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_anterior,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?,?)').run(q.params.id,pr.etapa,b.etapa_anterior,act.nombre,act.cod,'DESHACER');
  try{db.prepare("DELETE FROM pipeline_puntos WHERE id=(SELECT MAX(id) FROM pipeline_puntos WHERE prenda_id=? AND emp_cod=?)").run(q.params.id,act.cod);}catch(e){}
  broadcast('prenda-deshecha',{prenda_id:parseInt(q.params.id),codigo:pr.codigo,etapa_anterior:pr.etapa,etapa_nueva:b.etapa_anterior,responsable:act.nombre,cod:act.cod});
  r.json({ok:true});
}));

// ── RECHAZAR a cualquier etapa con descuento de puntos ───────────
router.put('/:id/rechazar',auth,safe(function(q,r){
  var db=getDB();var b=q.body;var pr=db.prepare('SELECT * FROM prendas WHERE id=?').get(q.params.id);
  if(!pr)return r.status(404).json({error:'No encontrada'});
  var act=actor(q);
  var dest=b.etapa_destino||'recepcion';
  db.prepare("UPDATE prendas SET etapa=?,aprobada=0,fecha_actualizado=datetime('now','localtime') WHERE id=?").run(dest,q.params.id);
  db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_anterior,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?,?)').run(q.params.id,pr.etapa,dest,act.nombre,act.cod,b.obs||('Rechazado → '+dest));
  var deducidos=[];
  if(b.descontar_puntos!==false){
    var hist=db.prepare("SELECT * FROM prenda_historial WHERE prenda_id=? AND etapa_nueva=? ORDER BY fecha DESC LIMIT 1").get(q.params.id,dest);
    if(hist&&hist.responsable){
      var pts=getPts(db,dest,pr.tipo_lavado);
      if(pts>0){
        recPts(db,hist.cod_responsable||'',hist.responsable,parseInt(q.params.id),dest+'_rechazo',-pts,'Rechazo: '+pr.codigo+' de '+pr.etapa+' a '+dest);
        deducidos.push({nombre:hist.responsable,cod:hist.cod_responsable||'',etapa:dest,puntos:-pts});
      }
    }
  }
  broadcast('prenda-rechazada',{prenda_id:parseInt(q.params.id),codigo:pr.codigo,etapa_anterior:pr.etapa,etapa_nueva:dest,responsable:act.nombre,cod:act.cod,deducidos:deducidos});
  r.json({ok:true,deducidos:deducidos});
}));

// ── ENVIAR a tienda ──────────────────────────────────────────────
router.post('/enviar',auth,safe(function(q,r){
  var db=getDB();var b=q.body;if(!b.prenda_ids||!b.prenda_ids.length||!b.sede_destino)return r.status(400).json({error:'Prendas y destino requeridos'});
  var act=actor(q);
  var fecha=hoyLocal();
  // Pre-chequeo: separar prendas listo de las que no están listas (FIX B2)
  var enviadasIds=[]; var omitidas=[];
  b.prenda_ids.forEach(function(pid){
    var p = db.prepare('SELECT id,codigo,etapa FROM prendas WHERE id=?').get(pid);
    if(!p) omitidas.push({id:pid, codigo:'?', razon:'no existe'});
    else if(p.etapa!=='listo') omitidas.push({id:pid, codigo:p.codigo, razon:'etapa='+p.etapa});
    else enviadasIds.push(pid);
  });
  if(!enviadasIds.length){
    return r.status(400).json({error:'Ninguna prenda en estado "listo"', omitidas:omitidas});
  }
  var env=db.prepare('INSERT INTO envios_prendas (sede_destino,fecha,responsable) VALUES (?,?,?)').run(b.sede_destino,fecha,act.nombre);
  var eid=env.lastInsertRowid;
  db.transaction(function(){
    var u=db.prepare("UPDATE prendas SET etapa='enviado',envio_id=?,fecha_actualizado=datetime('now','localtime') WHERE id=? AND etapa='listo'");
    var h=db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_anterior,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?,?)');
    for(var i=0;i<enviadasIds.length;i++){
      u.run(eid,enviadasIds[i]);
      h.run(enviadasIds[i],'listo','enviado',act.nombre,act.cod,'Envio #'+eid+' → '+b.sede_destino);
    }
  })();
  broadcast('envio-creado',{envio_id:eid,sede_destino:b.sede_destino,count:enviadasIds.length,prenda_ids:enviadasIds,responsable:act.nombre,cod:act.cod});
  r.json({envio_id:eid,enviadas:enviadasIds,omitidas:omitidas,count:enviadasIds.length,ok:true});
}));

// ── CALIFICAR envío recibido en tienda ────────────────────────────
router.put('/envios/:id/calificar',auth,safe(function(q,r){
  var db=getDB();
  // FIX B7: validar que la sede del usuario coincida con la del envío
  var env = db.prepare('SELECT * FROM envios_prendas WHERE id=?').get(q.params.id);
  if(!env) return r.status(404).json({error:'Envío no encontrado'});
  if(!esSupervisor(q.user) && env.sede_destino !== (q.user.sede||'')){
    return r.status(403).json({error:'No autorizado para calificar envíos de otra sede'});
  }
  var act = actor(q);
  var cals=q.body.calificaciones||[];
  var rechazos = 0;
  db.transaction(function(){
    var ins=db.prepare('INSERT INTO prenda_calificacion (prenda_id,envio_id,aceptada,obs,calificador) VALUES (?,?,?,?,?)');
    var insH=db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_anterior,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?,?)');
    for(var i=0;i<cals.length;i++){var c=cals[i];
      ins.run(c.prenda_id,q.params.id,c.aceptada?1:0,c.obs||'',act.nombre);
      if(!c.aceptada){
        rechazos++;
        // FIX B1: si el modal pasó etapa_destino, devolver allí; si no, default 'recepcion'
        var dest=c.etapa_destino||'recepcion';
        db.prepare("UPDATE prendas SET etapa=?,envio_id=NULL,aprobada=0,obs_calidad=? WHERE id=?").run(dest,c.obs||'',c.prenda_id);
        insH.run(c.prenda_id,'enviado',dest,act.nombre,act.cod,'Obs: '+(c.obs||'')+' → '+dest);
      }
    }
  })();
  db.prepare('UPDATE envios_prendas SET validado_tienda=1,obs_tienda=? WHERE id=?').run(q.body.obs_tienda||'',q.params.id);
  broadcast('envio-calificado',{envio_id:parseInt(q.params.id),calificador:act.nombre,cod:act.cod,sede:env.sede_destino,total:cals.length,rechazos:rechazos});
  r.json({ok:true,rechazos:rechazos});
}));

// ── ACCESORIOS (registro local) ──────────────────────────────────
router.post('/accesorios',auth,safe(function(q,r){
  var db=getDB();var b=q.body;var items=b.items;
  if(!items&&b.tipo&&b.cantidad)items=[{tipo:b.tipo,cantidad:b.cantidad}];
  if(!items||!items.length)return r.status(400).json({error:'Items requeridos'});
  var act=actor(q);
  var fecha=hoyLocal();var pa=getPts(db,'accesorio',null)||0.5;var tp=0;var dinero=0;
  var precioCamisa=1;try{var pc=db.prepare("SELECT valor FROM config WHERE clave='precio_camisa'").get();if(pc)precioCamisa=parseFloat(pc.valor);}catch(e){}
  var sedeOri = b.sede_origen || (q.user&&q.user.sede) || 'AL';
  db.transaction(function(){
    var ins=db.prepare('INSERT INTO accesorios_log (tipo,cantidad,responsable,fecha,sede_origen,origen,sustento) VALUES (?,?,?,?,?,?,?)');
    for(var i=0;i<items.length;i++){
      var it = items[i];
      if(!it || !(it.cantidad>0)) continue;
      ins.run(it.tipo, it.cantidad, act.nombre, fecha, sedeOri, b.origen||'almacen', it.sustento||'');
      if(it.tipo==='Camisas'){
        var d=it.cantidad*precioCamisa;dinero+=d;
        recPts(db,act.cod,act.nombre,0,'camisa_incentivo',0,it.cantidad+'x Camisas = S/'+d.toFixed(2));
      }else{
        var p=it.cantidad*pa;tp+=p;
        recPts(db,act.cod,act.nombre,0,'acc_'+it.tipo,p,it.cantidad+'x '+it.tipo);
      }
    }
  })();
  broadcast('accesorio-registrado',{items:items,sede:sedeOri,responsable:act.nombre,cod:act.cod,puntos:tp,dinero:dinero});
  r.json({ok:true,puntos:tp,dinero:dinero});
}));

// ── DIVIDIR TERNO (saco + pantalón) ───────────────────────────────
// FIX B5: ya no DELETE de la prenda original. Se marca dividida=1
// para preservar historial, calificaciones y puntos de la prenda matriz.
router.post('/:id/dividir',auth,safe(function(q,r){
  var db=getDB();var pr=db.prepare('SELECT * FROM prendas WHERE id=?').get(q.params.id);
  if(!pr)return r.status(404).json({error:'No encontrada'});
  if(pr.dividida)return r.status(409).json({error:'Esta prenda ya fue dividida'});
  var b=q.body;
  var act=actor(q);
  var resultado={};
  db.transaction(function(){
    var s=db.prepare("INSERT INTO prendas (codigo,tipo,color,talla,sede_origen,etapa,tipo_lavado,fecha_ingreso,lista_lavanderia_id,obs_general) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(pr.codigo+'-S','Saco',pr.color,pr.talla,pr.sede_origen,pr.etapa,b.lavado_saco||pr.tipo_lavado,pr.fecha_ingreso,pr.lista_lavanderia_id,'Dividido de terno #'+pr.id);
    db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?)').run(s.lastInsertRowid,pr.etapa,act.nombre,act.cod,'Dividido: Saco de terno '+pr.codigo);
    var p=db.prepare("INSERT INTO prendas (codigo,tipo,color,talla,sede_origen,etapa,tipo_lavado,fecha_ingreso,lista_lavanderia_id,obs_general) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(pr.codigo+'-P','Pantalon',pr.color,pr.talla,pr.sede_origen,pr.etapa,b.lavado_pantalon||pr.tipo_lavado,pr.fecha_ingreso,pr.lista_lavanderia_id,'Dividido de terno #'+pr.id);
    db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?)').run(p.lastInsertRowid,pr.etapa,act.nombre,act.cod,'Dividido: Pantalon de terno '+pr.codigo);
    // Marcar la prenda original como dividida (no DELETE) — preserva historial
    db.prepare("UPDATE prendas SET dividida=1, etapa='dividido', dividida_en=?, fecha_actualizado=datetime('now','localtime') WHERE id=?")
      .run(s.lastInsertRowid+','+p.lastInsertRowid, q.params.id);
    db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_anterior,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?,?)').run(q.params.id,pr.etapa,'dividido',act.nombre,act.cod,'Terno dividido en Saco+Pantalon (ids '+s.lastInsertRowid+','+p.lastInsertRowid+')');
    resultado.saco_id=s.lastInsertRowid;
    resultado.pantalon_id=p.lastInsertRowid;
  })();
  broadcast('prenda-dividida',{prenda_id:parseInt(q.params.id),codigo:pr.codigo,saco_id:resultado.saco_id,pantalon_id:resultado.pantalon_id,responsable:act.nombre,cod:act.cod});
  r.json(Object.assign({ok:true},resultado));
}));

// GET log diario procesado
router.get('/diario',safe(function(q,r){
  var db=getDB();var fecha=q.query.fecha||hoyLocal();
  var movs=db.prepare("SELECT h.*,p.codigo,p.tipo,p.color,p.talla FROM prenda_historial h JOIN prendas p ON p.id=h.prenda_id WHERE DATE(h.fecha)=? ORDER BY h.fecha DESC").all(fecha);
  var porOp={};movs.forEach(function(m){var k=m.responsable||'?';if(!porOp[k])porOp[k]={nombre:k,acciones:0,etapas:{}};porOp[k].acciones++;porOp[k].etapas[m.etapa_nueva]=(porOp[k].etapas[m.etapa_nueva]||0)+1;});
  r.json({fecha:fecha,total:movs.length,movimientos:movs.slice(0,200),por_operario:Object.values(porOp)});
}));

// Registrar prendas directamente en almacén
router.post('/registrar-local',auth,safe(function(q,r){
  var db=getDB();var b=q.body;if(!b.items||!b.items.length)return r.status(400).json({error:'items requeridos'});
  var act=actor(q);
  var fecha=hoyLocal();var count=0; var ids=[];
  var ins=db.prepare("INSERT INTO prendas (codigo,tipo,color,talla,sede_origen,etapa,tipo_lavado,fecha_ingreso,obs_general) VALUES (?,?,?,?,?,?,?,?,?)");
  var insH=db.prepare('INSERT INTO prenda_historial (prenda_id,etapa_nueva,responsable,cod_responsable,obs) VALUES (?,?,?,?,?)');
  db.transaction(function(){b.items.forEach(function(it){var res=ins.run(it.cod||'',it.tipo||'',it.color||'',it.talla||'','AL','recepcion',it.tipo_lavado||'normal',fecha,it.obs||'Registro local');insH.run(res.lastInsertRowid,'recepcion',act.nombre,act.cod,'Registro directo');count++;ids.push(res.lastInsertRowid);});})();
  broadcast('prendas-registradas',{ids:ids,count:count,sede:'AL',responsable:act.nombre,cod:act.cod});
  r.json({ok:true,count:count,ids:ids});
}));

// Registrar accesorios extra con sustento (pendientes de aprobación)
router.post('/accesorios-extra',auth,safe(function(q,r){
  var db=getDB();var b=q.body;
  if(!b.tipo||!b.cantidad)return r.status(400).json({error:'tipo y cantidad requeridos'});
  var act=actor(q);
  db.prepare('INSERT INTO accesorios_log (tipo,cantidad,responsable,fecha,sustento,origen) VALUES (?,?,?,?,?,?)').run(b.tipo,b.cantidad,act.nombre,hoyLocal(),b.sustento||'','local');
  broadcast('accesorio-extra-pendiente',{tipo:b.tipo,cantidad:b.cantidad,sustento:b.sustento||'',responsable:act.nombre,cod:act.cod});
  r.json({ok:true});
}));

// Avance diario por operario (header)
router.get('/mi-avance',safe(function(q,r){
  var db=getDB();var fecha=hoyLocal();var cod=q.query.cod||'';
  if(!cod)return r.json({pts:0,acciones:0,detalle:[]});
  var pts=db.prepare("SELECT COALESCE(SUM(puntos),0) as t FROM pipeline_puntos WHERE emp_cod=? AND fecha=? AND puntos>0").get(cod,fecha);
  pts=pts?pts.t:0;
  var acciones=db.prepare("SELECT COUNT(*) as n FROM pipeline_puntos WHERE emp_cod=? AND fecha=? AND puntos>0").get(cod,fecha);
  acciones=acciones?acciones.n:0;
  var detalle=db.prepare("SELECT etapa,SUM(puntos) as pts,COUNT(*) as n FROM pipeline_puntos WHERE emp_cod=? AND fecha=? AND puntos>0 GROUP BY etapa ORDER BY pts DESC").all(cod,fecha);
  r.json({pts:pts,acciones:acciones,detalle:detalle,fecha:fecha});
}));

// ════════════════════════════════════════════════════════════════════
// HISTORIAL UNIFICADO — solo supervisores. Multi-fuente.
// ════════════════════════════════════════════════════════════════════
router.get('/historial', auth, safe(function(q,r){
  if (!esSupervisor(q.user)) return r.status(403).json({error:'Acceso restringido al encargado de almacén o administrador'});
  var db = getDB();
  var qp = q.query || {};
  var desde = qp.desde || '';
  var hasta = qp.hasta || '';
  var sede  = qp.sede  || '';
  var resp  = qp.responsable || '';
  var tipo  = qp.tipo || '';
  var sort  = qp.sort || 'fecha_desc';
  var limit = Math.min(parseInt(qp.limit)||500, 2000);
  var eventos = [];

  if (!tipo || tipo==='prenda') {
    var s = 'SELECT h.fecha as fecha, h.responsable as responsable, h.cod_responsable as cod, h.etapa_anterior as etapa_anterior, ' +
            '       h.etapa_nueva as etapa_nueva, h.obs as obs, h.prenda_id as ref_id, ' +
            '       p.codigo as codigo, p.tipo as tipo_prenda, p.color as color, p.talla as talla, ' +
            '       p.sede_origen as sede, p.lista_lavanderia_id as lista_id ' +
            'FROM prenda_historial h JOIN prendas p ON p.id=h.prenda_id WHERE 1=1';
    var p = [];
    if (desde) { s+=' AND DATE(h.fecha)>=?'; p.push(desde); }
    if (hasta) { s+=' AND DATE(h.fecha)<=?'; p.push(hasta); }
    if (sede)  { s+=' AND p.sede_origen=?'; p.push(sede); }
    if (resp)  { s+=' AND h.responsable LIKE ?'; p.push('%'+resp+'%'); }
    db.prepare(s).all(...p).forEach(function(row){
      eventos.push({
        tipo:'prenda',
        fecha:row.fecha, sede:row.sede, responsable:row.responsable, cod:row.cod||'',
        accion:(row.etapa_anterior?row.etapa_anterior+'→':'')+row.etapa_nueva,
        ref_id:row.ref_id,
        ref:row.codigo+' ('+(row.tipo_prenda||'?')+' '+(row.color||'')+' '+(row.talla||'')+')',
        obs:row.obs||'',
        lista_id:row.lista_id||null
      });
    });
  }

  if (!tipo || tipo==='accesorio') {
    var s2 = "SELECT id, fecha, responsable, tipo, cantidad, COALESCE(sede_origen,'AL') as sede, COALESCE(origen,'almacen') as origen, COALESCE(sustento,'') as sustento, COALESCE(enviado,0) as enviado FROM accesorios_log WHERE 1=1";
    var p2 = [];
    if (desde) { s2+=' AND DATE(fecha)>=?'; p2.push(desde); }
    if (hasta) { s2+=' AND DATE(fecha)<=?'; p2.push(hasta); }
    if (sede)  { s2+=' AND sede_origen=?'; p2.push(sede); }
    if (resp)  { s2+=' AND responsable LIKE ?'; p2.push('%'+resp+'%'); }
    db.prepare(s2).all(...p2).forEach(function(row){
      eventos.push({
        tipo:'accesorio', fecha:row.fecha, sede:row.sede, responsable:row.responsable,
        accion:'procesado',
        ref_id:row.id,
        ref:row.cantidad+'× '+row.tipo,
        obs:row.sustento||row.origen,
        enviado:!!row.enviado
      });
    });
  }

  if (!tipo || tipo==='lista') {
    var s3 = "SELECT id, sede, tipo as tipo_lista, estado, fecha, resp_inv, resp_traslado, camisas, corbatas, michis, corbatones, COALESCE(porta_ternos,0) as porta_ternos, COALESCE(zapatos,0) as zapatos, created_at FROM listas_lavanderia WHERE 1=1";
    var p3 = [];
    if (desde) { s3+=' AND DATE(fecha)>=?'; p3.push(desde); }
    if (hasta) { s3+=' AND DATE(fecha)<=?'; p3.push(hasta); }
    if (sede)  { s3+=' AND sede=?'; p3.push(sede); }
    if (resp)  { s3+=' AND (resp_inv LIKE ? OR resp_traslado LIKE ?)'; p3.push('%'+resp+'%','%'+resp+'%'); }
    db.prepare(s3).all(...p3).forEach(function(row){
      var totalG = (row.camisas||0)+(row.corbatas||0)+(row.michis||0)+(row.corbatones||0)+(row.porta_ternos||0)+(row.zapatos||0);
      eventos.push({
        tipo:'lista', fecha:row.created_at||row.fecha, sede:row.sede,
        responsable:row.resp_traslado||row.resp_inv,
        accion:'envío a lavandería ('+row.tipo_lista+')',
        ref_id:row.id, ref:row.id,
        obs:'Generales: '+totalG+' · Estado: '+row.estado,
        extra:{ camisas:row.camisas, corbatas:row.corbatas, michis:row.michis, corbatones:row.corbatones, porta_ternos:row.porta_ternos, zapatos:row.zapatos }
      });
    });
  }

  if (!tipo || tipo==='envio') {
    var s4 = "SELECT id, sede_destino, fecha, responsable, estado, validado_tienda, created_at FROM envios_prendas WHERE 1=1";
    var p4 = [];
    if (desde) { s4+=' AND DATE(fecha)>=?'; p4.push(desde); }
    if (hasta) { s4+=' AND DATE(fecha)<=?'; p4.push(hasta); }
    if (sede)  { s4+=' AND sede_destino=?'; p4.push(sede); }
    if (resp)  { s4+=' AND responsable LIKE ?'; p4.push('%'+resp+'%'); }
    db.prepare(s4).all(...p4).forEach(function(row){
      var n = 0; try{ n = db.prepare("SELECT COUNT(*) as n FROM prendas WHERE envio_id=?").get(row.id).n||0; }catch(e){}
      eventos.push({
        tipo:'envio', fecha:row.created_at||row.fecha, sede:row.sede_destino,
        responsable:row.responsable,
        accion:'envío a tienda (#'+row.id+')',
        ref_id:row.id, ref:'#'+row.id+' · '+n+' prendas',
        obs:'Estado: '+row.estado+(row.validado_tienda?' · validado':' · sin validar')
      });
    });
  }

  if (!tipo || tipo==='envio_acc') {
    try{
      var s5 = "SELECT e.id, e.sede_destino as sede, e.fecha, e.responsable, e.validado_tienda, e.obs, e.created_at FROM envios_accesorios e WHERE 1=1";
      var p5 = [];
      if (desde) { s5+=' AND DATE(e.fecha)>=?'; p5.push(desde); }
      if (hasta) { s5+=' AND DATE(e.fecha)<=?'; p5.push(hasta); }
      if (sede)  { s5+=' AND e.sede_destino=?'; p5.push(sede); }
      if (resp)  { s5+=' AND e.responsable LIKE ?'; p5.push('%'+resp+'%'); }
      db.prepare(s5).all(...p5).forEach(function(row){
        var items = db.prepare("SELECT tipo, cantidad FROM envio_accesorios_items WHERE envio_id=?").all(row.id);
        eventos.push({
          tipo:'envio_acc', fecha:row.created_at||row.fecha, sede:row.sede,
          responsable:row.responsable,
          accion:'envío accesorios (#'+row.id+')',
          ref_id:row.id,
          ref:items.map(function(it){return it.cantidad+'× '+it.tipo;}).join(', ')||'—',
          obs:(row.obs||'')+(row.validado_tienda?' · validado':' · sin validar')
        });
      });
    }catch(e){}
  }

  eventos.sort(function(a,b){
    if (sort==='fecha_asc') return (a.fecha||'').localeCompare(b.fecha||'');
    return (b.fecha||'').localeCompare(a.fecha||'');
  });
  eventos = eventos.slice(0, limit);

  var stats = { total: eventos.length, por_tipo: {} };
  eventos.forEach(function(e){ stats.por_tipo[e.tipo] = (stats.por_tipo[e.tipo]||0)+1; });

  r.json({ eventos:eventos, stats:stats, filtros:{desde:desde, hasta:hasta, sede:sede, responsable:resp, tipo:tipo, sort:sort, limit:limit} });
}));

// ════════════════════════════════════════════════════════════════════
// DETALLE de lista de lavandería (trazabilidad lista→prendas)
// ════════════════════════════════════════════════════════════════════
router.get('/lista/:id/trazabilidad', auth, safe(function(q,r){
  var db = getDB();
  var lista = db.prepare('SELECT * FROM listas_lavanderia WHERE id=?').get(q.params.id);
  if (!lista) return r.status(404).json({error:'Lista no encontrada'});
  var items = db.prepare('SELECT * FROM lista_items WHERE lista_id=?').all(q.params.id);
  var prendas = db.prepare('SELECT * FROM prendas WHERE lista_lavanderia_id=?').all(q.params.id);
  prendas.forEach(function(p){
    try{ p.historial = db.prepare('SELECT * FROM prenda_historial WHERE prenda_id=? ORDER BY fecha').all(p.id); }catch(e){ p.historial=[]; }
  });
  r.json({ lista:lista, items:items, prendas:prendas });
}));

// ════════════════════════════════════════════════════════════════════
// ENVÍO de accesorios almacén → tienda
// ════════════════════════════════════════════════════════════════════
router.post('/envios-accesorios', auth, safe(function(q,r){
  var db = getDB();
  var b = q.body || {};
  if (!b.sede_destino) return r.status(400).json({error:'sede_destino requerida'});
  var items = (b.items||[]).filter(function(it){ return it && it.tipo && parseInt(it.cantidad)>0; });
  if (!items.length) return r.status(400).json({error:'Agrega al menos un accesorio con cantidad'});
  var act = actor(q);
  var fecha = b.fecha || hoyLocal();
  var resultado = {};
  db.transaction(function(){
    var insE = db.prepare('INSERT INTO envios_accesorios (sede_destino,fecha,responsable,responsable_cod,obs) VALUES (?,?,?,?,?)');
    var e = insE.run(b.sede_destino, fecha, act.nombre, act.cod, b.obs||'');
    var eid = e.lastInsertRowid;
    var insI = db.prepare('INSERT INTO envio_accesorios_items (envio_id,tipo,cantidad,obs) VALUES (?,?,?,?)');
    items.forEach(function(it){ insI.run(eid, it.tipo, parseInt(it.cantidad)||0, it.obs||''); });
    var upd = db.prepare("UPDATE accesorios_log SET enviado=1, envio_id=? WHERE id=?");
    items.forEach(function(it){
      var restante = parseInt(it.cantidad)||0;
      if (restante<=0) return;
      var disponibles = db.prepare(
        "SELECT id, cantidad FROM accesorios_log WHERE tipo=? AND COALESCE(enviado,0)=0 ORDER BY fecha ASC, id ASC"
      ).all(it.tipo);
      for (var k=0; k<disponibles.length && restante>0; k++){
        upd.run(eid, disponibles[k].id);
        restante -= (disponibles[k].cantidad||0);
      }
    });
    resultado.envio_id = eid;
  })();
  broadcast('envio-accesorios-creado',{envio_id:resultado.envio_id,sede_destino:b.sede_destino,items:items,responsable:act.nombre,cod:act.cod});
  r.json(Object.assign({ok:true}, resultado));
}));

router.get('/envios-accesorios', auth, safe(function(q,r){
  var db = getDB();
  var s = 'SELECT * FROM envios_accesorios WHERE 1=1';
  var p = [];
  if (q.query.sede_destino) { s+=' AND sede_destino=?'; p.push(q.query.sede_destino); }
  if (q.query.desde) { s+=' AND DATE(fecha)>=?'; p.push(q.query.desde); }
  if (q.query.hasta) { s+=' AND DATE(fecha)<=?'; p.push(q.query.hasta); }
  s += ' ORDER BY fecha DESC, id DESC LIMIT 200';
  var envios = db.prepare(s).all(...p);
  envios.forEach(function(e){
    e.items = db.prepare('SELECT * FROM envio_accesorios_items WHERE envio_id=?').all(e.id);
    e.total_unidades = e.items.reduce(function(a,it){ return a+(it.cantidad||0); }, 0);
  });
  r.json(envios);
}));

router.put('/envios-accesorios/:id/validar', auth, safe(function(q,r){
  var db = getDB();
  var b = q.body||{};
  var env = db.prepare('SELECT * FROM envios_accesorios WHERE id=?').get(q.params.id);
  if(!env) return r.status(404).json({error:'Envío no encontrado'});
  if(!esSupervisor(q.user) && env.sede_destino !== (q.user.sede||'')){
    return r.status(403).json({error:'No autorizado para validar envíos de otra sede'});
  }
  var act = actor(q);
  db.prepare("UPDATE envios_accesorios SET validado_tienda=1, validado_por=?, fecha_validado=datetime('now','localtime'), obs=COALESCE(?, obs) WHERE id=?")
    .run(act.nombre, b.obs||null, q.params.id);
  broadcast('envio-accesorios-validado',{envio_id:parseInt(q.params.id),sede:env.sede_destino,validador:act.nombre,cod:act.cod});
  r.json({ok:true});
}));

module.exports = router;
