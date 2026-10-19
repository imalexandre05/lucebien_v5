const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getDB } = require('../database/db');
const SECRET = require('../middleware/auth').JWT_SECRET;
function auth(q,r,n){try{var h=q.headers['authorization'];if(!h||!h.startsWith('Bearer '))return r.status(401).json({error:'Token requerido'});q.user=jwt.verify(h.slice(7),SECRET);n();}catch(e){return r.status(401).json({error:'Token invalido'});}}
function admin(q,r,n){auth(q,r,function(){if(q.user.rol!=='admin'&&q.user.rol!=='dueno')return r.status(403).json({error:'Solo admin'});n();});}
function actAplicaHoy(a, fecha, turno) {
  var d=new Date(fecha+'T12:00:00');var diaDelMes=d.getDate();var diaSemIdx=d.getDay();
  var diaSemNombres=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  var diaSemana=diaSemNombres[diaSemIdx];
  var actTurno=(a.turno||'ambos').toLowerCase();
  if(actTurno!=='ambos'){
    var t=(turno||'').toUpperCase();
    if(t==='M'&&actTurno!=='m'&&actTurno!=='mañana')return false;
    if(t==='T'&&actTurno!=='t'&&actTurno!=='tarde')return false;
  }
  var freq=parseInt(a.frecuencia_dias)||0;
  if(freq<=1)return true;
  if(freq===2)return diaDelMes%2===0;
  if(freq===7){
    if(!a.dia_semana)return true;
    var diaOk=a.dia_semana.toLowerCase().split(',').map(function(x){return x.trim()}).indexOf(diaSemana)>=0;
    if(!diaOk)return false;
    var cadaSemanas=parseInt(a.aparece_dia)||1;
    if(cadaSemanas<=1)return true;
    var weekNum=Math.floor((d.getTime()-new Date(d.getFullYear(),0,1).getTime())/(7*24*60*60*1000));
    return weekNum%cadaSemanas===0;
  }
  if(freq===15){var diaBase=parseInt(a.aparece_dia)||1;return diaDelMes===diaBase||diaDelMes===diaBase+15;}
  if(freq===30){var diaM=parseInt(a.aparece_dia)||1;return diaDelMes===diaM;}
  return true;
}
router.get('/',auth,function(req,res){
  try{
    var db=getDB(),sede=req.query.sede,fecha=req.query.fecha,turno=req.query.turno||'';
    if(!sede)return res.status(400).json({error:'sede requerida'});
    var allActs=db.prepare("SELECT * FROM actividades_config WHERE (sede=? OR sede='GLOBAL') AND activa=1 ORDER BY orden,id").all(sede);
    if(!allActs.length)return res.json({actividades:[],extras_puntos:[],extras_remuneradas:[],pendientes:[]});
    var obligatorias=allActs.filter(function(a){return a.tipo_act==='obligatoria'||(!a.tipo_act&&a.categoria!=='EXT');});
    var extras_puntos=allActs.filter(function(a){return a.tipo_act==='por_puntos';});
    var extras_remuneradas=allActs.filter(function(a){return a.tipo_act==='remunerada';});
    if(fecha){obligatorias=obligatorias.filter(function(a){return actAplicaHoy(a,fecha,turno);});}
    var pendientes=[];
    try{pendientes=db.prepare('SELECT DISTINCT act_cod FROM actividades_pendientes WHERE sede=? AND resuelta=0').all(sede).map(function(r){return r.act_cod;});}catch(e){}
    var codsHoy={};obligatorias.forEach(function(a){codsHoy[a.cod]=true;});
    obligatorias=obligatorias.map(function(a){return Object.assign({},a,{pendiente_acumulado:pendientes.indexOf(a.cod)>=0});});
    if(pendientes.length){
      try{var ph=pendientes.map(function(){return'?'}).join(',');
        var pendActs=db.prepare("SELECT * FROM actividades_config WHERE (sede=? OR sede='GLOBAL') AND activa=1 AND acumula=1 AND cod IN ("+ph+")").all(sede,...pendientes);
        pendActs.forEach(function(a){if(!codsHoy[a.cod]){obligatorias.push(Object.assign({},a,{pendiente_acumulado:true}));}});
      }catch(e){}
    }
    res.json({actividades:obligatorias,extras_puntos:extras_puntos,extras_remuneradas:extras_remuneradas,pendientes:pendientes});
  }catch(e){res.status(500).json({error:e.message});}
});
router.get('/admin',admin,function(req,res){
  try{var db=getDB();var sql='SELECT * FROM actividades_config WHERE 1=1';var p=[];
    if(req.query.sede){sql+=" AND (sede=? OR sede='GLOBAL')";p.push(req.query.sede);}
    sql+=' ORDER BY sede,categoria,orden,id';res.json(db.prepare(sql).all(...p));
  }catch(e){res.status(500).json({error:e.message});}
});
router.post('/',admin,function(req,res){
  try{var db=getDB();var b=req.body;if(!b.nombre)return res.status(400).json({error:'nombre requerido'});
    var sede=b.sede||'GLOBAL';var cod=(b.cod||(b.categoria||'ACT')+String(Date.now()).slice(-4)).toUpperCase();
    var r=db.prepare('INSERT INTO actividades_config (sede,cod,nombre,categoria,tipo_act,peso,precio_unitario,unidad,turno,aparece_dia,frecuencia_dias,dia_semana,acumula,orden,activa,descuento) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)')
      .run(sede,cod,b.nombre,b.categoria||'PO',b.tipo_act||'obligatoria',b.peso||1,b.precio_unitario||0,b.unidad||'unidad',b.turno||'ambos',b.aparece_dia||0,b.frecuencia_dias||0,b.dia_semana||'',b.acumula?1:0,b.orden||0,b.descuento||0);
    res.status(201).json({id:r.lastInsertRowid,cod:cod});
  }catch(e){if(e.message.includes('UNIQUE'))return res.status(409).json({error:'Código ya existe en esta sede'});res.status(500).json({error:e.message});}
});
// ═══ FIX CRÍTICO: PUT NO actualiza sede — solo campos de contenido ═══
router.put('/:id',admin,function(req,res){
  try{var db=getDB();var b=req.body;
    // NUNCA actualizar sede aquí — usar sync-sedes para eso
    db.prepare('UPDATE actividades_config SET nombre=?,categoria=?,tipo_act=?,peso=?,precio_unitario=?,unidad=?,turno=?,aparece_dia=?,frecuencia_dias=?,dia_semana=?,acumula=?,orden=?,activa=?,descuento=? WHERE id=?')
      .run(b.nombre,b.categoria,b.tipo_act||'obligatoria',b.peso||0,b.precio_unitario||0,b.unidad||'unidad',b.turno||'ambos',b.aparece_dia||0,b.frecuencia_dias||0,b.dia_semana||'',b.acumula?1:0,b.orden||0,b.activa!==undefined?(b.activa?1:0):1,b.descuento||0,req.params.id);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
router.delete('/:id',admin,function(req,res){
  try{
    var db=getDB();
    // Buscar cod+sede antes de eliminar, para limpiar pendientes huérfanos
    var a=db.prepare('SELECT cod,sede FROM actividades_config WHERE id=?').get(req.params.id);
    db.transaction(function(){
      db.prepare('DELETE FROM actividades_config WHERE id=?').run(req.params.id);
      if(a){try{db.prepare('DELETE FROM actividades_pendientes WHERE act_cod=? AND sede=?').run(a.cod,a.sede);}catch(e){}}
    })();
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
router.post('/duplicar',admin,function(req,res){
  try{var db=getDB();var b=req.body;if(!b.desde||!b.hacia)return res.status(400).json({error:'desde y hacia requeridos'});
    var acts=db.prepare('SELECT * FROM actividades_config WHERE sede=? AND activa=1').all(b.desde);
    var ins=db.prepare('INSERT OR IGNORE INTO actividades_config (sede,cod,nombre,categoria,tipo_act,peso,precio_unitario,unidad,turno,aparece_dia,frecuencia_dias,dia_semana,acumula,orden,activa,descuento) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)');
    var count=0;db.transaction(function(){acts.forEach(function(a){try{ins.run(b.hacia,a.cod,a.nombre,a.categoria,a.tipo_act,a.peso,a.precio_unitario,a.unidad,a.turno,a.aparece_dia,a.frecuencia_dias,a.dia_semana,a.acumula,a.orden,a.descuento||0);count++;}catch(e){}});})();
    res.json({ok:true,duplicadas:count});
  }catch(e){res.status(500).json({error:e.message});}
});
router.post('/sync-sedes',admin,function(req,res){
  try{var db=getDB();var b=req.body;if(!b.cod||!b.sedes||!b.payload)return res.status(400).json({error:'cod, sedes, payload requeridos'});
    var existing=db.prepare('SELECT sede FROM actividades_config WHERE cod=?').all(b.cod).map(function(r){return r.sede;});
    var toAdd=b.sedes.filter(function(s){return existing.indexOf(s)<0;});
    var toRemove=existing.filter(function(s){return b.sedes.indexOf(s)<0;});
    var p=b.payload;
    var ins=db.prepare('INSERT OR IGNORE INTO actividades_config (sede,cod,nombre,categoria,tipo_act,peso,precio_unitario,unidad,turno,aparece_dia,frecuencia_dias,dia_semana,acumula,orden,activa,descuento) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)');
    var del=db.prepare('DELETE FROM actividades_config WHERE cod=? AND sede=?');
    var upd=db.prepare('UPDATE actividades_config SET nombre=?,categoria=?,tipo_act=?,peso=?,unidad=?,turno=?,frecuencia_dias=?,dia_semana=?,acumula=?,orden=?,descuento=?,aparece_dia=? WHERE cod=? AND sede=?');
    db.transaction(function(){
      toAdd.forEach(function(s){ins.run(s,b.cod,p.nombre,p.categoria,p.tipo_act||'obligatoria',p.peso||0,0,p.unidad||'unidad',p.turno||'ambos',p.aparece_dia||0,p.frecuencia_dias||0,p.dia_semana||'',p.acumula?1:0,p.orden||0,p.descuento||0);});
      toRemove.forEach(function(s){del.run(b.cod,s);});
      b.sedes.forEach(function(s){if(toAdd.indexOf(s)<0)upd.run(p.nombre,p.categoria,p.tipo_act||'obligatoria',p.peso||0,p.unidad||'unidad',p.turno||'ambos',p.frecuencia_dias||0,p.dia_semana||'',p.acumula?1:0,p.orden||0,p.descuento||0,p.aparece_dia||0,b.cod,s);});
    })();
    res.json({ok:true,added:toAdd.length,removed:toRemove.length});
  }catch(e){res.status(500).json({error:e.message});}
});
router.post('/pendiente',auth,function(req,res){try{var db=getDB();var b=req.body;if(!b.actos_no_realizados||!b.actos_no_realizados.length||!b.sede)return res.json({ok:true});var ins=db.prepare('INSERT OR IGNORE INTO actividades_pendientes (act_cod,sede,desde_fecha,desde_turno) VALUES (?,?,?,?)');db.transaction(function(){b.actos_no_realizados.forEach(function(c){ins.run(c,b.sede,b.fecha,b.turno||'');});})();res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
router.post('/resolver',auth,function(req,res){try{var db=getDB();var b=req.body;if(!b.actos_realizados||!b.actos_realizados.length)return res.json({ok:true});var upd=db.prepare('UPDATE actividades_pendientes SET resuelta=1,resuelta_en=? WHERE act_cod=? AND sede=? AND resuelta=0');db.transaction(function(){b.actos_realizados.forEach(function(c){upd.run(b.fecha,c,b.sede);});})();res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
router.get('/pendientes',auth,function(req,res){try{res.json(getDB().prepare('SELECT ap.*,ac.nombre,ac.categoria,ac.peso FROM actividades_pendientes ap LEFT JOIN actividades_config ac ON ap.act_cod=ac.cod AND ap.sede=ac.sede WHERE ap.sede=? AND ap.resuelta=0 ORDER BY ap.desde_fecha').all(req.query.sede||''));}catch(e){res.status(500).json({error:e.message});}});
module.exports = router;
