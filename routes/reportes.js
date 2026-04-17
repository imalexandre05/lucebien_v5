const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getDB, hoyLocal } = require('../database/db');
const SECRET = process.env.JWT_SECRET || 'lucebien-secret-2026-xK9mP3qR';

function auth(req,res,next){try{var h=req.headers['authorization'];if(!h||!h.startsWith('Bearer '))return res.status(401).json({error:'Token requerido'});req.user=jwt.verify(h.slice(7),SECRET);next();}catch(e){return res.status(401).json({error:'Token invalido'});}}

// El id de reporte tiene formato `DD-MM-YY_TURNO-SEDE` (ej. 15-04-26_T-ST).
// Derivar la fecha desde el id es la única fuente de verdad — así la fecha no
// puede ser corrompida por clocks desajustados, evaluaciones futuras, o cualquier
// otra ruta que pretenda actualizarla.
function fechaDesdeId(id){
  if(!id)return null;
  var m=String(id).match(/^(\d{2})-(\d{2})-(\d{2})_/);
  if(!m)return null;
  var dd=m[1], mm=m[2], yy=m[3];
  // Aceptar yy de 2 dígitos: 00-69 → 20XX, 70-99 → 19XX (no aplicable aquí, pero defensivo)
  var fullYear = parseInt(yy,10) < 70 ? '20'+yy : '19'+yy;
  return fullYear+'-'+mm+'-'+dd;
}

// Migración silenciosa: reparar filas cuya fecha no coincide con la fecha
// codificada en el id (por bug histórico). Se ejecuta una sola vez al cargar
// el módulo. Si todo está consistente, no hace nada.
(function repararFechasReportes(){
  try{
    var db=getDB();
    var rows=db.prepare("SELECT id, fecha FROM reportes WHERE id LIKE '__-__-___%'").all();
    var fixed=0;
    var upd=db.prepare('UPDATE reportes SET fecha=? WHERE id=?');
    rows.forEach(function(r){
      var f=fechaDesdeId(r.id);
      if(f && f!==r.fecha){
        upd.run(f, r.id);
        fixed++;
        console.log('[reportes] fecha reparada: '+r.id+' '+r.fecha+' → '+f);
      }
    });
    if(fixed) console.log('[reportes] '+fixed+' fecha(s) reparada(s) desde id');
  }catch(e){console.warn('[reportes] reparación fecha:', e.message);}
})();

// GET /api/reportes?sede=&fecha=
router.get('/', auth, function(req,res){
  try{var db=getDB();var sql='SELECT * FROM reportes WHERE 1=1';var p=[];
    if(req.query.sede){sql+=' AND sede=?';p.push(req.query.sede);}
    if(req.query.fecha){sql+=' AND fecha=?';p.push(req.query.fecha);}
    if(req.query.emp_nombre){sql+=' AND id IN (SELECT reporte_id FROM reporte_trabajadores WHERE nombre=?)';p.push(req.query.emp_nombre);}
    sql+=' ORDER BY fecha DESC, created_at DESC LIMIT 100';
    var reps=db.prepare(sql).all(...p);
    reps.forEach(function(r){r.trabajadores=db.prepare('SELECT nombre FROM reporte_trabajadores WHERE reporte_id=?').all(r.id).map(function(x){return x.nombre;});});
    res.json(reps);
  }catch(e){res.status(500).json({error:e.message});}
});

// GET /api/reportes/alertas/:sede
// Devuelve estado de turnos de hoy + el reporte pendiente de evaluar más antiguo (puede ser de ayer).
router.get('/alertas/:sede', auth, function(req,res){
  try{var db=getDB();var sede=req.params.sede;var hoy=hoyLocal();
    var hoyR=db.prepare('SELECT * FROM reportes WHERE sede=? AND fecha=?').all(sede,hoy);
    // Reporte pendiente más antiguo (sin importar fecha) — para cargar la evaluación incluso si es de ayer.
    var pendienteEval=db.prepare("SELECT * FROM reportes WHERE sede=? AND evaluado=0 AND bloqueado=1 ORDER BY fecha ASC, created_at ASC LIMIT 1").get(sede);
    res.json({
      tieneM:hoyR.some(function(r){return r.turno==='M'||r.turno==='C'}),
      tieneT:hoyR.some(function(r){return r.turno==='T'||r.turno==='C'}),
      pendEval:!!pendienteEval,
      pendienteEval:pendienteEval||null,
      hoyR:hoyR,
      hoy:hoy
    });
  }catch(e){res.status(500).json({error:e.message});}
});

// POST /api/reportes
// La fecha del reporte SIEMPRE se deriva del id (formato DD-MM-YY_TURNO-SEDE),
// NUNCA del payload del cliente ni del reloj del servidor. El id se genera al
// iniciar el turno; si la evaluación ocurre al día siguiente, esto garantiza
// que la fecha permanece anclada al día real del turno y no contamina los
// reportes del día actual.
router.post('/', auth, function(req,res){
  try{var db=getDB();var b=req.body;
    if(db.prepare('SELECT id FROM reportes WHERE id=?').get(b.id))return res.status(409).json({error:'Reporte ya existe'});
    var fechaReal = fechaDesdeId(b.id) || b.fecha || hoyLocal();
    db.prepare('INSERT INTO reportes (id,sede,turno,fecha,encargado,puntaje,act_total,act_done,bloqueado) VALUES (?,?,?,?,?,?,?,?,1)').run(b.id,b.sede,b.turno,fechaReal,b.encargado,b.puntaje||0,b.actTotal||0,b.actDone||0);
    var insTrab=db.prepare('INSERT INTO reporte_trabajadores (reporte_id,nombre) VALUES (?,?)');
    (b.trabajadores||[]).forEach(function(n){insTrab.run(b.id,n);});
    var insAct=db.prepare('INSERT INTO reporte_actividades (reporte_id,cod,nombre,cat,peso,realizada,obs) VALUES (?,?,?,?,?,?,?)');
    (b.actividades||[]).forEach(function(a){insAct.run(b.id,a.cod,a.nombre,a.cat,a.peso,1,a.obs||'');});
    if(b.extras&&b.extras.length){var insExt=db.prepare('INSERT INTO reporte_extras (reporte_id,tipo,nombre,cantidad,precio_unitario,monto_total,detalle,registrado_por) VALUES (?,?,?,?,?,?,?,?)');b.extras.forEach(function(e){insExt.run(b.id,e.tipo,e.nombre,e.cantidad||1,e.precio_unitario||0,e.monto_total||0,e.detalle||'',e.registrado_por||'');});}
    if(b.incidencias&&b.incidencias.length){
      // reportado_por = encargado del turno del reporte; puntos según catálogo si no vienen
      var tipos={};try{db.prepare('SELECT tipo,puntos_default,nivel_default FROM incidencia_tipos WHERE activo=1').all().forEach(function(r){tipos[r.tipo]=r;});}catch(e){}
      var insInc=db.prepare('INSERT INTO incidencias (sede,fecha,tipo,descripcion,nivel,responsable,reporte_id,reportado_por,reportado_por_cod,origen,puntos_penalidad) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      b.incidencias.forEach(function(i){
        var niv=(i.nivel||'Medio').replace(/[^\wáéíóúñÁÉÍÓÚÑ ]/g,'').trim();
        if(!/^(Alto|Medio|Bajo)$/.test(niv)) niv='Medio';
        var puntos=(i.puntos_penalidad!==undefined&&i.puntos_penalidad!==null&&i.puntos_penalidad!=='')?parseFloat(i.puntos_penalidad):null;
        if(puntos===null||isNaN(puntos)){var t=tipos[i.tipo];if(t){puntos=t.puntos_default;if(!i.nivel)niv=t.nivel_default||niv;}}
        if(puntos===null||isNaN(puntos))puntos=(niv==='Alto'?5:(niv==='Bajo'?1:2));
        insInc.run(b.sede,fechaReal,i.tipo,i.descripcion||'',niv,i.responsable||'—',b.id,b.encargado||null,null,'reporte',puntos);
      });
    }
    res.json({id:b.id,ok:true,fecha:fechaReal});
  }catch(e){res.status(500).json({error:e.message});}
});

// GET /api/reportes/:id/detalle — Detalle completo con actividades + calificaciones + observaciones
router.get('/:id/detalle', auth, function(req,res){
  try{var db=getDB();
    var rep=db.prepare('SELECT * FROM reportes WHERE id=?').get(req.params.id);
    if(!rep)return res.status(404).json({error:'Reporte no encontrado'});
    // Defensa cross-sede: non-admins solo ven reportes de su propia sede
    var rol=req.user&&req.user.rol;
    if(rol!=='admin'&&rol!=='dueno'&&req.user.sede&&rep.sede&&req.user.sede!==rep.sede){
      return res.status(403).json({error:'Reporte de otra sede'});
    }
    rep.trabajadores=db.prepare('SELECT nombre FROM reporte_trabajadores WHERE reporte_id=?').all(req.params.id).map(function(x){return x.nombre;});
    rep.actividades=db.prepare('SELECT * FROM reporte_actividades WHERE reporte_id=?').all(req.params.id);
    rep.extras=db.prepare('SELECT * FROM reporte_extras WHERE reporte_id=?').all(req.params.id);
    rep.incidencias=[];try{rep.incidencias=db.prepare('SELECT * FROM incidencias WHERE reporte_id=?').all(req.params.id);}catch(e){}
    res.json(rep);
  }catch(e){res.status(500).json({error:e.message});}
});

// PUT /api/reportes/:id/evaluar — con observaciones por actividad
router.put('/:id/evaluar', auth, function(req,res){
  try{var db=getDB();var b=req.body;
    var rep=db.prepare('SELECT * FROM reportes WHERE id=?').get(req.params.id);
    if(!rep)return res.status(404).json({error:'Reporte no encontrado'});
    var trabs=db.prepare('SELECT nombre FROM reporte_trabajadores WHERE reporte_id=?').all(req.params.id).map(function(r){return r.nombre;});
    if(trabs.indexOf(b.evaluador)>=0)return res.status(400).json({error:'El evaluante no puede ser del turno'});
    if(b.calificaciones){
      var updAct=db.prepare('UPDATE reporte_actividades SET calificacion=?, obs_eval=? WHERE reporte_id=? AND cod=?');
      b.calificaciones.forEach(function(c){updAct.run(c.cal,c.obs||'',req.params.id,c.cod);});
    }
    db.prepare('UPDATE reportes SET evaluado=1,evaluador=?,puntaje_eval=?,puntaje=?,bloqueado=0 WHERE id=?').run(b.evaluador,b.puntajeEval,b.puntajeEval,req.params.id);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

// DELETE /api/reportes/:id/anular — Admin only: anula un reporte (borra datos asociados)
router.delete('/:id/anular', auth, function(req,res){
  try{var db=getDB();
    if(req.user.rol!=='admin'&&req.user.rol!=='dueno')return res.status(403).json({error:'Solo admin/dueño puede anular'});
    var rep=db.prepare('SELECT * FROM reportes WHERE id=?').get(req.params.id);
    if(!rep)return res.status(404).json({error:'Reporte no encontrado'});
    db.transaction(function(){
      db.prepare('DELETE FROM reporte_trabajadores WHERE reporte_id=?').run(req.params.id);
      db.prepare('DELETE FROM reporte_actividades WHERE reporte_id=?').run(req.params.id);
      db.prepare('DELETE FROM reporte_extras WHERE reporte_id=?').run(req.params.id);
      try{db.prepare('DELETE FROM incidencias WHERE reporte_id=?').run(req.params.id);}catch(e){}
      db.prepare('DELETE FROM reportes WHERE id=?').run(req.params.id);
    })();
    res.json({ok:true,anulado:req.params.id});
  }catch(e){res.status(500).json({error:e.message});}
});

// DELETE /api/reportes/:id/anular-eval — Admin: anula solo la evaluación, reporte queda pendiente
router.delete('/:id/anular-eval', auth, function(req,res){
  try{var db=getDB();
    if(req.user.rol!=='admin'&&req.user.rol!=='dueno')return res.status(403).json({error:'Solo admin/dueño'});
    var rep=db.prepare('SELECT * FROM reportes WHERE id=?').get(req.params.id);
    if(!rep)return res.status(404).json({error:'Reporte no encontrado'});
    db.transaction(function(){
      db.prepare('UPDATE reporte_actividades SET calificacion=NULL, obs_eval=NULL WHERE reporte_id=?').run(req.params.id);
      db.prepare('UPDATE reportes SET evaluado=0, evaluador=NULL, puntaje_eval=NULL, puntaje=0, bloqueado=1 WHERE id=?').run(req.params.id);
    })();
    res.json({ok:true,msg:'Evaluación anulada, reporte queda pendiente'});
  }catch(e){res.status(500).json({error:e.message});}
});

module.exports = router;
