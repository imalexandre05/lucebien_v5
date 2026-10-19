const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getDB, hoyLocal } = require('../database/db');
const SECRET = require('../middleware/auth').JWT_SECRET;
function auth(q,r,n){try{var h=q.headers['authorization'];if(!h||!h.startsWith('Bearer '))return r.status(401).json({error:'Token requerido'});q.user=jwt.verify(h.slice(7),SECRET);n();}catch(e){return r.status(401).json({error:'Token invalido'});}}
function canApprove(q,r,n){auth(q,r,function(){var rol=q.user.rol;if(rol==='admin'||rol==='dueno'||rol==='encargado_almacen')return n();return r.status(403).json({error:'Solo admin o encargado'});});}

function ensureCols(db){
  // solicitud_items
  try{db.exec("ALTER TABLE solicitud_items ADD COLUMN cantidad_enviada INTEGER DEFAULT 0");}catch(e){}
  try{db.exec("ALTER TABLE solicitud_items ADD COLUMN cantidad_recibida INTEGER DEFAULT 0");}catch(e){}
  try{db.exec("ALTER TABLE solicitud_items ADD COLUMN obs TEXT DEFAULT ''");}catch(e){}
  try{db.exec("ALTER TABLE solicitud_items ADD COLUMN obs_recepcion TEXT DEFAULT ''");}catch(e){}
  try{db.exec("ALTER TABLE solicitud_items ADD COLUMN estado_item TEXT DEFAULT 'pendiente'");}catch(e){}
  // solicitudes
  try{db.exec("ALTER TABLE solicitudes ADD COLUMN pedido_impreso INTEGER DEFAULT 0");}catch(e){}
  try{db.exec("ALTER TABLE solicitudes ADD COLUMN confirmacion_impresa INTEGER DEFAULT 0");}catch(e){}
  try{db.exec("ALTER TABLE solicitudes ADD COLUMN fecha_pedido_impreso TEXT");}catch(e){}
  try{db.exec("ALTER TABLE solicitudes ADD COLUMN fecha_confirmacion_impresa TEXT");}catch(e){}
  try{db.exec("ALTER TABLE solicitudes ADD COLUMN rechazado_por TEXT");}catch(e){}
  try{db.exec("ALTER TABLE solicitudes ADD COLUMN motivo_rechazo TEXT");}catch(e){}
  try{db.exec("ALTER TABLE solicitudes ADD COLUMN recibe_en_tienda TEXT");}catch(e){}
  try{db.exec("ALTER TABLE solicitudes ADD COLUMN codigos_prenda TEXT");}catch(e){}
}

// GET all
router.get('/',auth,function(q,r){try{var db=getDB();ensureCols(db);
  var sql='SELECT * FROM solicitudes WHERE 1=1';var p=[];
  var isAdmin=q.user.rol==='admin'||q.user.rol==='dueno'||q.user.rol==='encargado_almacen';
  if(!isAdmin){sql+=' AND sede=?';p.push(q.user.sede||q.query.sede||'');}
  else if(q.query.sede){sql+=' AND sede=?';p.push(q.query.sede);}
  if(q.query.estado){sql+=' AND estado=?';p.push(q.query.estado);}
  sql+=" ORDER BY CASE urgencia WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, created_at DESC LIMIT 300";
  var solis=db.prepare(sql).all(...p);
  solis.forEach(function(s){s.items=db.prepare('SELECT * FROM solicitud_items WHERE solicitud_id=?').all(s.id);});
  r.json(solis);
}catch(e){r.status(500).json({error:e.message});}});

// POST create
router.post('/',auth,function(q,r){try{var db=getDB();ensureCols(db);var b=q.body;
  if(!b.items||!b.items.length)return r.status(400).json({error:'Agrega al menos un item'});
  var fecha=hoyLocal();var hora=new Date().toTimeString().slice(0,5);
  var x=db.prepare('INSERT INTO solicitudes (sede,solicitante,fecha,urgencia,obs) VALUES (?,?,?,?,?)').run(b.sede||q.user.sede||'',b.solicitante||q.user.nombre||'',fecha+' '+hora,b.urgencia||'media',b.obs||'');
  var ins=db.prepare('INSERT INTO solicitud_items (solicitud_id,categoria,tipo,cantidad,color,talla,tela,modelo,detalle,obs) VALUES (?,?,?,?,?,?,?,?,?,?)');
  db.transaction(function(){b.items.forEach(function(i){ins.run(x.lastInsertRowid,i.categoria||'prenda',i.tipo||'',i.cantidad||1,i.color||'',i.talla||'',i.tela||'',i.modelo||'',i.detalle||'',i.obs||'');});})();
  r.json({id:x.lastInsertRowid,ok:true});
}catch(e){r.status(500).json({error:e.message});}});

// PUT aprobar
router.put('/:id/aprobar',canApprove,function(q,r){try{var db=getDB();ensureCols(db);var b=q.body;
  var resp=b.responsable||q.user.nombre||'';
  var ts=hoyLocal()+' '+new Date().toTimeString().slice(0,5);
  db.prepare("UPDATE solicitudes SET estado='aprobada',aprobado_por=?,fecha_respuesta=?,obs_respuesta=? WHERE id=?")
    .run(resp,ts,b.obs_respuesta||'',q.params.id);
  if(b.items&&b.items.length){
    var upd=db.prepare('UPDATE solicitud_items SET cantidad_enviada=?,estado_item=? WHERE id=?');
    b.items.forEach(function(i){upd.run(i.cantidad_enviada||0,i.cantidad_enviada>0?'aprobado':'sin_stock',i.id);});
  }
  r.json({ok:true,estado_anterior:'pendiente'});
}catch(e){r.status(500).json({error:e.message});}});

// PUT entregar
router.put('/:id/entregar',canApprove,function(q,r){try{var db=getDB();ensureCols(db);
  var resp=q.body.responsable||q.user.nombre||'';
  var recibe=q.body.recibe_en_tienda||'';
  var codigos=q.body.codigos_prenda?JSON.stringify(q.body.codigos_prenda):'';
  var ts=hoyLocal()+' '+new Date().toTimeString().slice(0,5);
  db.prepare("UPDATE solicitudes SET estado='entregada',entregado_por=?,fecha_entrega=?,recibe_en_tienda=?,codigos_prenda=? WHERE id=?").run(resp,ts,recibe,codigos,q.params.id);
  r.json({ok:true,estado_anterior:'aprobada'});
}catch(e){r.status(500).json({error:e.message});}});

// PUT confirmar — tienda corrige cantidades recibidas
router.put('/:id/confirmar',auth,function(q,r){try{var db=getDB();ensureCols(db);var b=q.body;
  var resp=b.responsable||q.user.nombre||'';
  var ts=hoyLocal()+' '+new Date().toTimeString().slice(0,5);
  db.prepare("UPDATE solicitudes SET estado='confirmada',confirmado=1,confirmado_por=?,fecha_confirmacion=? WHERE id=?").run(resp,ts,q.params.id);
  if(b.items&&b.items.length){
    var upd=db.prepare('UPDATE solicitud_items SET cantidad_recibida=?,obs_recepcion=? WHERE id=?');
    b.items.forEach(function(i){upd.run(i.cantidad_recibida!=null?i.cantidad_recibida:i.cantidad_enviada||0,i.obs_recepcion||'',i.id);});
  }
  r.json({ok:true,estado_anterior:'entregada'});
}catch(e){r.status(500).json({error:e.message});}});

// PUT rechazar (reemplaza DELETE)
router.put('/:id/rechazar',canApprove,function(q,r){try{var db=getDB();ensureCols(db);var b=q.body;
  if(!b.motivo)return r.status(400).json({error:'Motivo requerido'});
  var resp=b.responsable||q.user.nombre||'';
  var ts=hoyLocal()+' '+new Date().toTimeString().slice(0,5);
  // Save previous state for undo
  var prev=db.prepare('SELECT estado FROM solicitudes WHERE id=?').get(q.params.id);
  db.prepare("UPDATE solicitudes SET estado='rechazada',rechazado_por=?,motivo_rechazo=?,fecha_respuesta=? WHERE id=?").run(resp,b.motivo,ts,q.params.id);
  r.json({ok:true,estado_anterior:prev?prev.estado:'pendiente'});
}catch(e){r.status(500).json({error:e.message});}});

// PUT deshacer — revert to previous state
router.put('/:id/deshacer',auth,function(q,r){try{var db=getDB();ensureCols(db);var b=q.body;
  var target=b.estado_destino;
  if(!target)return r.status(400).json({error:'estado_destino requerido'});
  if(target==='pendiente'){
    db.prepare("UPDATE solicitudes SET estado='pendiente',aprobado_por=NULL,fecha_respuesta=NULL,obs_respuesta=NULL,rechazado_por=NULL,motivo_rechazo=NULL WHERE id=?").run(q.params.id);
    db.prepare("UPDATE solicitud_items SET cantidad_enviada=0,estado_item='pendiente' WHERE solicitud_id=?").run(q.params.id);
  } else if(target==='aprobada'){
    db.prepare("UPDATE solicitudes SET estado='aprobada',entregado_por=NULL,fecha_entrega=NULL WHERE id=?").run(q.params.id);
  } else if(target==='entregada'){
    db.prepare("UPDATE solicitudes SET estado='entregada',confirmado=0,confirmado_por=NULL,fecha_confirmacion=NULL,confirmacion_impresa=0 WHERE id=?").run(q.params.id);
    db.prepare("UPDATE solicitud_items SET cantidad_recibida=0,obs_recepcion='' WHERE solicitud_id=?").run(q.params.id);
  }
  r.json({ok:true});
}catch(e){r.status(500).json({error:e.message});}});

// PUT marcar impreso
router.put('/:id/marcar-impreso',auth,function(q,r){try{var db=getDB();ensureCols(db);
  var tipo=q.body.tipo;// 'pedido' o 'confirmacion'
  var ts=hoyLocal()+' '+new Date().toTimeString().slice(0,5);
  if(tipo==='pedido')db.prepare("UPDATE solicitudes SET pedido_impreso=1,fecha_pedido_impreso=? WHERE id=?").run(ts,q.params.id);
  else if(tipo==='confirmacion')db.prepare("UPDATE solicitudes SET confirmacion_impresa=1,fecha_confirmacion_impresa=? WHERE id=?").run(ts,q.params.id);
  r.json({ok:true});
}catch(e){r.status(500).json({error:e.message});}});

module.exports = router;
