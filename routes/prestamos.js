const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getDB, hoyLocal } = require('../database/db');
const SECRET = require('../middleware/auth').JWT_SECRET;

function auth(req,res,next){try{var h=req.headers['authorization'];if(!h||!h.startsWith('Bearer '))return res.status(401).json({error:'Token requerido'});req.user=jwt.verify(h.slice(7),SECRET);next();}catch(e){return res.status(401).json({error:'Token invalido'});}}
function adminOrEnc(req,res,next){auth(req,res,function(){var r=req.user.rol;if(r==='admin'||r==='dueno'||r==='encargado_almacen')return next();return res.status(403).json({error:'Solo admin o encargado almacén'});});}

// ═══ RUTAS ESPECÍFICAS PRIMERO (antes de /:id) ═══

// GET /api/prestamos/bajas/list
router.get('/bajas/list', auth, function(req,res){
  try{
    var db=getDB();
    try { db.prepare('SELECT procesada FROM prendas_baja LIMIT 0').all(); }
    catch(e) {
      try{db.exec('ALTER TABLE prendas_baja RENAME TO _baja_old');
        db.exec("CREATE TABLE prendas_baja (id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT,descripcion TEXT,sede_origen TEXT,sede_destino TEXT,motivo TEXT,fecha TEXT,responsable TEXT,lote_id INTEGER,item_id INTEGER,procesada INTEGER DEFAULT 0,procesada_por TEXT,fecha_procesada TEXT,created_at TEXT DEFAULT (datetime('now','localtime')))");
        try{db.exec("INSERT INTO prendas_baja (id,codigo,motivo,fecha,responsable) SELECT id,codigo,motivo,fecha,responsable FROM _baja_old");}catch(e2){}
        try{db.exec('DROP TABLE _baja_old');}catch(e2){}
      }catch(e2){}
    }
    res.json(db.prepare('SELECT * FROM prendas_baja ORDER BY procesada ASC, fecha DESC LIMIT 100').all());
  }catch(e){res.status(500).json({error:e.message});}
});

// PUT /api/prestamos/bajas/:id/procesar
router.put('/bajas/:id/procesar', adminOrEnc, function(req,res){
  try{
    var fecha=hoyLocal();
    getDB().prepare('UPDATE prendas_baja SET procesada=1,procesada_por=?,fecha_procesada=? WHERE id=?')
      .run(req.user.nombre||'',fecha,req.params.id);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

// PUT /api/prestamos/item/:itemId/estado
router.put('/item/:itemId/estado', auth, function(req,res){
  try{
    var db=getDB();var b=req.body;
    var item=db.prepare('SELECT pi.*,pl.sede_origen,pl.sede_destino FROM prestamo_items pi JOIN prestamos_lotes pl ON pi.lote_id=pl.id WHERE pi.id=?').get(req.params.itemId);
    if(!item)return res.status(404).json({error:'Prenda no encontrada'});

    var nuevoEstado=b.estado;
    var estados_validos=['prestada','alquilada','devuelta','vendida','perdida'];
    if(estados_validos.indexOf(nuevoEstado)<0)return res.status(400).json({error:'Estado inválido: '+nuevoEstado});

    var fecha=hoyLocal();
    db.prepare('UPDATE prestamo_items SET estado=?,fecha_estado=?,obs_estado=?,cambiado_por=?,cambiado_sede=? WHERE id=?')
      .run(nuevoEstado,fecha,b.obs||'',req.user.nombre||'',b.sede||req.user.sede||'',req.params.itemId);

    // Vendida o Perdida → prendas_baja (recrear tabla si es vieja)
    if(nuevoEstado==='vendida'||nuevoEstado==='perdida'){
      try{
        db.prepare('INSERT INTO prendas_baja (codigo,descripcion,sede_origen,sede_destino,motivo,fecha,responsable,lote_id,item_id) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(item.codigo,item.descripcion||'',item.sede_origen||'',item.sede_destino||'',nuevoEstado,fecha,req.user.nombre||'',item.lote_id,parseInt(req.params.itemId));
      }catch(e2){
        // Tabla vieja — intentar con columnas mínimas
        try{
          db.exec('DROP TABLE IF EXISTS prendas_baja');
          db.exec("CREATE TABLE prendas_baja (id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT,descripcion TEXT,sede_origen TEXT,sede_destino TEXT,motivo TEXT,fecha TEXT,responsable TEXT,lote_id INTEGER,item_id INTEGER,procesada INTEGER DEFAULT 0,procesada_por TEXT,fecha_procesada TEXT,created_at TEXT DEFAULT (datetime('now','localtime')))");
          db.prepare('INSERT INTO prendas_baja (codigo,descripcion,sede_origen,sede_destino,motivo,fecha,responsable,lote_id,item_id) VALUES (?,?,?,?,?,?,?,?,?)')
            .run(item.codigo,item.descripcion||'',item.sede_origen||'',item.sede_destino||'',nuevoEstado,fecha,req.user.nombre||'',item.lote_id,parseInt(req.params.itemId));
        }catch(e3){console.error('[Baja]',e3.message);}
      }
    }

    res.json({ok:true,estado:nuevoEstado,obs:b.obs||''});
  }catch(e){res.status(500).json({error:e.message});}
});

// ═══ RUTAS GENÉRICAS ═══

// GET /api/prestamos
router.get('/', auth, function(req,res){
  try{
    var db=getDB();var sql='SELECT * FROM prestamos_lotes WHERE 1=1';var p=[];
    if(req.query.sede){sql+=' AND (sede_origen=? OR sede_destino=?)';p.push(req.query.sede,req.query.sede);}
    if(req.query.sede_origen){sql+=' AND sede_origen=?';p.push(req.query.sede_origen);}
    sql+=' ORDER BY created_at DESC LIMIT 100';
    var lotes=db.prepare(sql).all(...p);
    lotes.forEach(function(l){
      l.items=db.prepare('SELECT * FROM prestamo_items WHERE lote_id=? ORDER BY id').all(l.id);
      l.total_items=l.items.length;
      l.pendientes=l.items.filter(function(i){return i.estado==='prestada'||i.estado==='alquilada'}).length;
    });
    res.json(lotes);
  }catch(e){res.status(500).json({error:e.message});}
});

// POST /api/prestamos
router.post('/', auth, function(req,res){
  try{
    var db=getDB();var b=req.body;
    if(!b.sede_destino||!b.quien_lleva||!b.items||!b.items.length)
      return res.status(400).json({error:'Destino, quién lleva y prendas requeridos'});
    var fecha=b.fecha||hoyLocal();
    var sede_origen=b.sede_origen||req.user.sede||'';
    var lote=db.prepare('INSERT INTO prestamos_lotes (fecha,sede_origen,sede_destino,quien_lleva,responsable_registro,obs) VALUES (?,?,?,?,?,?)')
      .run(fecha,sede_origen,b.sede_destino,b.quien_lleva,req.user.nombre||'',b.obs||'');
    var loteId=lote.lastInsertRowid;
    var ins=db.prepare('INSERT INTO prestamo_items (lote_id,codigo,descripcion,estado,fecha_estado) VALUES (?,?,?,?,?)');
    db.transaction(function(){
      b.items.forEach(function(i){ins.run(loteId,i.codigo||'',i.descripcion||'','prestada',fecha);});
    })();
    res.json({id:loteId,ok:true,items:b.items.length});
  }catch(e){res.status(500).json({error:e.message});}
});

// GET /api/prestamos/:id — ÚLTIMO (no intercepta rutas específicas)
router.get('/:id', auth, function(req,res){
  try{
    var db=getDB();
    var lote=db.prepare('SELECT * FROM prestamos_lotes WHERE id=?').get(req.params.id);
    if(!lote)return res.status(404).json({error:'Lote no encontrado'});
    lote.items=db.prepare('SELECT * FROM prestamo_items WHERE lote_id=? ORDER BY id').all(lote.id);
    res.json(lote);
  }catch(e){res.status(500).json({error:e.message});}
});

module.exports = router;
