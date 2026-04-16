const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getDB, hoyLocal } = require('../database/db');
const SECRET = process.env.JWT_SECRET || 'lucebien-secret-2026-xK9mP3qR';

function auth(req,res,next){try{var h=req.headers['authorization'];if(!h||!h.startsWith('Bearer '))return res.status(401).json({error:'Token requerido'});req.user=jwt.verify(h.slice(7),SECRET);next();}catch(e){return res.status(401).json({error:'Token invalido'});}}

router.get('/', auth, function(req,res){
  try{var db=getDB();var sql='SELECT * FROM devoluciones_garantia WHERE 1=1';var p=[];
    if(req.query.tienda){sql+=' AND tienda=?';p.push(req.query.tienda);}
    sql+=' ORDER BY fecha_registro DESC LIMIT 100';
    res.json(db.prepare(sql).all(...p));
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/resumen', auth, function(req,res){
  try{var db=getDB();var t=req.query.tienda||'';
    var w=t?' AND tienda=?':'';var p=t?[t]:[];
    var pend=db.prepare('SELECT COUNT(*) as n, COALESCE(SUM(monto),0) as total FROM devoluciones_garantia WHERE estado=?'+w).get('pendiente',...p);
    var dev=db.prepare('SELECT COUNT(*) as n, COALESCE(SUM(monto),0) as total FROM devoluciones_garantia WHERE estado=?'+w).get('devuelto',...p);
    res.json({pendientes:pend,devueltos:dev});
  }catch(e){res.status(500).json({error:e.message});}
});

router.post('/', auth, function(req,res){
  try{var db=getDB();var b=req.body;
    if(!b.nombre_cliente||!b.celular||!b.monto)return res.status(400).json({error:'Datos incompletos'});
    var fecha=hoyLocal();
    var r=db.prepare('INSERT INTO devoluciones_garantia (nombre_cliente,celular,num_boleta,monto,tienda,responsable,fecha_registro) VALUES (?,?,?,?,?,?,?)')
      .run(b.nombre_cliente,b.celular,b.num_boleta||'',b.monto,b.tienda||'',b.responsable||req.user.nombre||'',fecha);
    res.json({id:r.lastInsertRowid,ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

router.put('/:id', auth, function(req,res){
  try{var db=getDB();var b=req.body;var fecha=hoyLocal();
    var sets=['estado=?'];var params=[b.estado||'devuelto'];
    if(b.estado==='devuelto'){sets.push('fecha_devolucion=?');params.push(fecha);}
    if(b.responsable){sets.push('responsable=?');params.push(b.responsable);}
    params.push(req.params.id);
    db.prepare('UPDATE devoluciones_garantia SET '+sets.join(',')+' WHERE id=?').run(...params);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

module.exports = router;
