const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDB, hoyLocal, mesLocal } = require('../database/db');
const SECRET = process.env.JWT_SECRET || 'lucebien-secret-2026-xK9mP3qR';

function auth(req,res,next){try{var h=req.headers['authorization'];if(!h||!h.startsWith('Bearer '))return res.status(401).json({error:'Token requerido'});req.user=jwt.verify(h.slice(7),SECRET);next();}catch(e){return res.status(401).json({error:'Token invalido'});}}
function admin(req,res,next){auth(req,res,function(){if(req.user.rol!=='admin'&&req.user.rol!=='dueno')return res.status(403).json({error:'Solo admin'});next();});}

function ensureEmpCols(db){
  var cols=[['dni','TEXT DEFAULT ""'],['telefono','TEXT DEFAULT ""'],['direccion','TEXT DEFAULT ""'],['fecha_nacimiento','TEXT DEFAULT ""'],['fecha_ingreso','TEXT DEFAULT ""'],['contacto_emergencia','TEXT DEFAULT ""'],['tel_emergencia','TEXT DEFAULT ""'],['estado','TEXT DEFAULT "activo"'],['notas','TEXT DEFAULT ""'],['nombre_completo','TEXT DEFAULT ""'],['password_hash','TEXT DEFAULT ""'],
    // Datos contractuales (S2 + S4)
    ['salario_base','REAL DEFAULT 0'],['tipo_contrato','TEXT DEFAULT ""'],['vencimiento_contrato','TEXT DEFAULT ""']
  ];
  cols.forEach(function(c){try{db.exec('ALTER TABLE empleados ADD COLUMN '+c[0]+' '+c[1]);}catch(e){}});
}

function getEmpT(db,id){var e=db.prepare('SELECT * FROM empleados WHERE id=?').get(id);if(!e)return null;e.tiendas=db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?').all(id).map(function(r){return r.tienda});delete e.cod_hash;return e;}

// GET all employees (includes suspended)
router.get('/', auth, function(req,res){
  try{var db=getDB();ensureEmpCols(db);
    var all=db.prepare('SELECT * FROM empleados ORDER BY nombre').all();
    res.json(all.map(function(e){e.tiendas=db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?').all(e.id).map(function(r){return r.tienda});delete e.cod_hash;return e;}));
  }catch(e){res.status(500).json({error:e.message});}
});

// GET by sede (only active)
router.get('/by-sede/:sede', auth, function(req,res){
  try{var db=getDB();ensureEmpCols(db);var sede=req.params.sede;
    var all=db.prepare("SELECT * FROM empleados WHERE activo=1 AND (estado IS NULL OR estado='activo')").all().map(function(e){e.tiendas=db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?').all(e.id).map(function(r){return r.tienda});delete e.cod_hash;return e;});
    var propios=all.filter(function(e){return e.tiendas.indexOf(sede)>=0});
    var otros=all.filter(function(e){return e.tiendas.indexOf(sede)<0});
    res.json({propios:propios,otros:otros});
  }catch(e){res.status(500).json({error:e.message});}
});

// GET desempeño
router.get('/:id/desempeno', auth, function(req,res){
  try{var db=getDB();ensureEmpCols(db);var id=req.params.id;
    var emp=getEmpT(db,id);if(!emp)return res.status(404).json({error:'No encontrado'});
    var reportes=db.prepare('SELECT * FROM reportes ORDER BY fecha DESC LIMIT 100').all();
    reportes.forEach(function(r){r.trabajadores=db.prepare('SELECT nombre FROM reporte_trabajadores WHERE reporte_id=?').all(r.id).map(function(x){return x.nombre});});
    var myR=reportes.filter(function(r){return r.trabajadores.indexOf(emp.nombre)>=0});
    var evals=db.prepare('SELECT * FROM evaluaciones_mensuales WHERE emp_id=? ORDER BY mes DESC LIMIT 12').all(id);
    var incidencias=db.prepare('SELECT * FROM incidencias WHERE responsable=? ORDER BY fecha DESC LIMIT 50').all(emp.nombre);
    var avgP=myR.length?Math.round(myR.reduce(function(s,r){return s+(r.puntaje||0)},0)/myR.length):0;
    // Pipeline stats
    var pipeStats={totalPts:0,acciones:0,thisMonth:0,detalle:[]};
    try{
      var thisMonth=mesLocal();
      pipeStats.totalPts=db.prepare("SELECT COALESCE(SUM(puntos),0) as t FROM pipeline_puntos WHERE emp_nombre=? AND puntos>0").get(emp.nombre)?.t||0;
      pipeStats.acciones=db.prepare("SELECT COUNT(*) as n FROM pipeline_puntos WHERE emp_nombre=? AND puntos>0").get(emp.nombre)?.n||0;
      pipeStats.thisMonth=db.prepare("SELECT COALESCE(SUM(puntos),0) as t FROM pipeline_puntos WHERE emp_nombre=? AND puntos>0 AND fecha LIKE ?").get(emp.nombre,thisMonth+'%')?.t||0;
      pipeStats.detalle=db.prepare("SELECT tipo,SUM(puntos) as pts,COUNT(*) as n FROM pipeline_puntos WHERE emp_nombre=? AND puntos>0 GROUP BY tipo ORDER BY pts DESC LIMIT 10").all(emp.nombre);
    }catch(e){}
    // Extras points from reports
    var extrasStats={totalPts:0,count:0};
    try{
      var extRows=db.prepare("SELECT re.* FROM reporte_extras re JOIN reportes r ON re.reporte_id=r.id WHERE re.registrado_por=? AND re.tipo='por_puntos'").all(emp.nombre);
      extrasStats.count=extRows.length;
      extrasStats.totalPts=extRows.reduce(function(s,e){return s+(e.monto_total||0)},0);
    }catch(e){}
    res.json({emp:emp,reportes:myR,evals:evals,incidencias:incidencias,pipeStats:pipeStats,extrasStats:extrasStats,stats:{avgPuntaje:avgP,totalReportes:myR.length,evaluados:myR.filter(function(r){return r.evaluado}).length,totalIncidencias:incidencias.length}});
  }catch(e){res.status(500).json({error:e.message});}
});

// POST new employee
router.post('/', admin, function(req,res){
  try{var db=getDB();ensureEmpCols(db);var b=req.body;
    if(db.prepare('SELECT id FROM empleados WHERE cod=?').get(b.cod))return res.status(400).json({error:'Código ya existe'});
    var hash=bcrypt.hashSync(String(b.cod),10);
    var pwHash=b.password?bcrypt.hashSync(String(b.password),10):'';
    db.prepare('INSERT INTO empleados (id,cod,nombre,iniciales,rol,cod_hash,nombre_completo,password_hash,dni,telefono,direccion,fecha_nacimiento,fecha_ingreso,contacto_emergencia,tel_emergencia,estado,notas,salario_base,tipo_contrato,vencimiento_contrato) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      b.id,b.cod,b.nombre,b.iniciales||b.nombre.slice(0,2).toUpperCase(),b.rol||'trabajador',hash,
      b.nombre_completo||'',pwHash,
      b.dni||'',b.telefono||'',b.direccion||'',b.fecha_nacimiento||'',b.fecha_ingreso||'',b.contacto_emergencia||'',b.tel_emergencia||'',b.estado||'activo',b.notas||'',
      parseFloat(b.salario_base)||0, b.tipo_contrato||'', b.vencimiento_contrato||''
    );
    var ins=db.prepare('INSERT OR IGNORE INTO empleado_tiendas (emp_id,tienda) VALUES (?,?)');(b.tiendas||[]).forEach(function(t){ins.run(b.id,t)});
    res.json(getEmpT(db,b.id));
  }catch(e){res.status(500).json({error:e.message});}
});

// PUT update employee
router.put('/:id', admin, function(req,res){
  try{var db=getDB();ensureEmpCols(db);var b=req.body;var id=req.params.id;
    var emp=db.prepare('SELECT * FROM empleados WHERE id=?').get(id);if(!emp)return res.status(404).json({error:'No encontrado'});
    // Handle code change
    if(b.cod&&b.cod!==emp.cod){
      if(db.prepare('SELECT id FROM empleados WHERE cod=? AND id!=?').get(b.cod,id))return res.status(400).json({error:'Código ya existe'});
      db.prepare('UPDATE empleados SET cod=?,cod_hash=? WHERE id=?').run(b.cod,bcrypt.hashSync(String(b.cod),10),id);
    }
    // Handle password change
    if(b.password&&b.password.trim()){
      db.prepare('UPDATE empleados SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(b.password),10),id);
    }
    // Update all other fields
    db.prepare('UPDATE empleados SET nombre=?,nombre_completo=?,iniciales=?,rol=?,dni=?,telefono=?,direccion=?,fecha_nacimiento=?,fecha_ingreso=?,contacto_emergencia=?,tel_emergencia=?,estado=?,notas=?,salario_base=?,tipo_contrato=?,vencimiento_contrato=? WHERE id=?').run(
      b.nombre||emp.nombre,b.nombre_completo!==undefined?b.nombre_completo:(emp.nombre_completo||''),
      b.iniciales||emp.iniciales,b.rol||emp.rol,
      b.dni!==undefined?b.dni:(emp.dni||''),b.telefono!==undefined?b.telefono:(emp.telefono||''),
      b.direccion!==undefined?b.direccion:(emp.direccion||''),
      b.fecha_nacimiento||emp.fecha_nacimiento||'',b.fecha_ingreso||emp.fecha_ingreso||'',
      b.contacto_emergencia||emp.contacto_emergencia||'',b.tel_emergencia||emp.tel_emergencia||'',
      b.estado||emp.estado||'activo',b.notas!==undefined?b.notas:(emp.notas||''),
      b.salario_base!==undefined?(parseFloat(b.salario_base)||0):(emp.salario_base||0),
      b.tipo_contrato!==undefined?b.tipo_contrato:(emp.tipo_contrato||''),
      b.vencimiento_contrato!==undefined?b.vencimiento_contrato:(emp.vencimiento_contrato||''),
      id
    );
    db.prepare('DELETE FROM empleado_tiendas WHERE emp_id=?').run(id);
    var ins=db.prepare('INSERT INTO empleado_tiendas (emp_id,tienda) VALUES (?,?)');(b.tiendas||[]).forEach(function(t){ins.run(id,t)});
    res.json(getEmpT(db,id));
  }catch(e){res.status(500).json({error:e.message});}
});

// PUT suspend/activate
router.put('/:id/estado', admin, function(req,res){
  try{var db=getDB();ensureEmpCols(db);
    var estado=req.body.estado||'activo';
    var activo=estado==='activo'?1:0;
    db.prepare('UPDATE empleados SET estado=?,activo=? WHERE id=?').run(estado,activo,req.params.id);
    res.json({ok:true,estado:estado});
  }catch(e){res.status(500).json({error:e.message});}
});

router.delete('/:id', admin, function(req,res){
  try{getDB().prepare('UPDATE empleados SET activo=0,estado="deshabilitado" WHERE id=?').run(req.params.id);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});

module.exports = router;

// ═══ CHECKLISTS AUTOMÁTICOS — desde reportes evaluados ═══
router.get('/:id/checklists', auth, function(req,res){
  try{
    var db=getDB();var id=req.params.id;
    var emp=getEmpT(db,id);if(!emp)return res.status(404).json({error:'No encontrado'});
    var desde=req.query.desde||(function(){var d=new Date(Date.now()-30*86400000);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
    var hasta=req.query.hasta||hoyLocal();
    var reportes=db.prepare('SELECT * FROM reportes WHERE fecha>=? AND fecha<=? ORDER BY fecha DESC').all(desde,hasta);
    reportes.forEach(function(r){
      r.trabajadores=db.prepare('SELECT nombre FROM reporte_trabajadores WHERE reporte_id=?').all(r.id).map(function(x){return x.nombre});
      r.actividades=db.prepare('SELECT * FROM reporte_actividades WHERE reporte_id=?').all(r.id);
    });
    var myR=reportes.filter(function(r){return r.trabajadores.indexOf(emp.nombre)>=0});
    res.json({emp:emp,reportes:myR,desde:desde,hasta:hasta});
  }catch(e){res.status(500).json({error:e.message});}
});

// ════════════════════════════════════════════════════════════════════════
// GET /:id/checklists2 — agregaciones para la UI de Evaluación Mensual
// Devuelve métricas del colaborador en un periodo, agrupadas por categoría:
//   IND               → limpieza
//   AS%/BS% (cod)     → software
//   AT%/BT% (cod)     → operaciones
//   EXT               → no se cuenta
// Schema del response es el que admin.js cargarEvalMensualForm consume.
// ════════════════════════════════════════════════════════════════════════
router.get('/:id/checklists2', auth, function(req,res){
  try{
    var db=getDB();
    var id=req.params.id;
    var emp=getEmpT(db,id);
    if(!emp)return res.status(404).json({error:'No encontrado'});

    var desde=req.query.desde||(function(){var d=new Date(Date.now()-30*86400000);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
    var hasta=req.query.hasta||hoyLocal();

    var dStart=new Date(desde+'T12:00:00');
    var dEnd=new Date(hasta+'T12:00:00');
    var dias_periodo=Math.max(1,Math.round((dEnd-dStart)/86400000)+1);

    var reportes=db.prepare(
      "SELECT DISTINCT r.* FROM reportes r " +
      "LEFT JOIN reporte_trabajadores rt ON rt.reporte_id=r.id " +
      "WHERE r.fecha>=? AND r.fecha<=? " +
      "AND (r.encargado_id=? OR r.encargado=? OR rt.nombre=?)"
    ).all(desde,hasta,id,emp.nombre,emp.nombre);

    var bags={ops:{},sw:{},limp:{}};
    reportes.forEach(function(r){
      var acts=db.prepare('SELECT * FROM reporte_actividades WHERE reporte_id=?').all(r.id);
      acts.forEach(function(a){
        var cod=(a.cod||'').toUpperCase();
        var cat=(a.cat||'').toUpperCase();
        var key=null;
        if(cat==='EXT')return;
        if(cat==='IND')key='limp';
        else if(/^(AS|BS)/.test(cod))key='sw';
        else if(/^(AT|BT)/.test(cod))key='ops';
        else return;
        var b=bags[key];
        var k=cod||a.nombre||('a'+a.id);
        if(!b[k])b[k]={cod:cod,nombre:a.nombre||cod,peso:parseFloat(a.peso)||1,veces_hecha:0,suma_calif:0,max_calif:0};
        b[k].veces_hecha++;
        var calif=parseFloat(a.calificacion);
        if(!isNaN(calif)){
          b[k].suma_calif+=calif;
          b[k].max_calif+=20;
        } else if(a.realizada){
          b[k].suma_calif+=20;
          b[k].max_calif+=20;
        }
      });
    });

    function buildGrupo(bag){
      var detalle=Object.values(bag).map(function(d){
        var pondPct=d.max_calif>0?(d.suma_calif/d.max_calif):0;
        return {
          cod:d.cod,
          nombre:d.nombre,
          peso:d.peso,
          veces_hecha:d.veces_hecha,
          expected_count:d.veces_hecha,
          total_reportes:reportes.length,
          suma_ponderada:+(pondPct*d.peso*d.veces_hecha).toFixed(2),
          max_posible:+(d.peso*d.veces_hecha).toFixed(2)
        };
      });
      var sp=detalle.reduce(function(s,d){return s+d.suma_ponderada;},0);
      var mp=detalle.reduce(function(s,d){return s+d.max_posible;},0);
      var nota20=mp>0?+((sp/mp)*20).toFixed(2):0;
      return {detalle:detalle,nota20:nota20};
    }

    var operaciones=buildGrupo(bags.ops);
    var software=buildGrupo(bags.sw);
    var limpieza=buildGrupo(bags.limp);

    var total_reportes=reportes.length;
    var evaluados=reportes.filter(function(r){return r.evaluado;}).length;
    var sumP=reportes.reduce(function(s,r){return s+(r.puntaje||0);},0);
    var countE=reportes.filter(function(r){return r.puntaje_eval;}).length;
    var sumE=reportes.filter(function(r){return r.puntaje_eval;}).reduce(function(s,r){return s+(r.puntaje_eval||0);},0);
    var prom_puntaje=total_reportes?Math.round(sumP/total_reportes):0;
    var prom_eval=countE?Math.round(sumE/countE):0;

    var diasSet={};
    reportes.forEach(function(r){if(r.fecha)diasSet[r.fecha]=true;});
    var dias_trabajados=Object.keys(diasSet).length;

    var por_sede={};
    reportes.forEach(function(r){
      var s=r.sede||'?';
      if(!por_sede[s])por_sede[s]={reportes:0,evaluados:0,_sumP:0,_sumE:0,_countE:0};
      por_sede[s].reportes++;
      if(r.evaluado)por_sede[s].evaluados++;
      por_sede[s]._sumP+=(r.puntaje||0);
      if(r.puntaje_eval){por_sede[s]._sumE+=r.puntaje_eval;por_sede[s]._countE++;}
    });
    Object.keys(por_sede).forEach(function(s){
      var d=por_sede[s];
      d.puntaje_prom=d.reportes?Math.round(d._sumP/d.reportes):0;
      d.puntaje_eval_prom=d._countE?Math.round(d._sumE/d._countE):0;
      delete d._sumP;delete d._sumE;delete d._countE;
    });

    var expected_reportes=total_reportes;
    try{
      var slots=db.prepare("SELECT dia, turno FROM horarios WHERE emp_id=?").all(id);
      if(slots.length){
        var perWeek=slots.length;
        var semanas=Math.max(1,Math.ceil(dias_periodo/7));
        expected_reportes=perWeek*semanas;
      }
    }catch(e){}

    var incidencias=[];
    try{
      incidencias=db.prepare(
        "SELECT id, fecha, tipo, descripcion, nivel, sede, puntos_penalidad " +
        "FROM incidencias WHERE responsable=? AND fecha>=? AND fecha<=? " +
        "ORDER BY fecha DESC"
      ).all(emp.nombre,desde,hasta);
    }catch(e){}

    var total_actual_points=Math.round(sumP);
    var total_expected_points=total_reportes*100;

    res.json({
      emp:emp,
      desde:desde, hasta:hasta,
      dias_periodo:dias_periodo,
      dias_trabajados:dias_trabajados,
      total_reportes:total_reportes,
      expected_reportes:expected_reportes,
      evaluados:evaluados,
      prom_puntaje:prom_puntaje,
      prom_eval:prom_eval,
      total_actual_points:total_actual_points,
      total_expected_points:total_expected_points,
      por_sede:por_sede,
      operaciones:operaciones,
      software:software,
      limpieza:limpieza,
      incidencias:incidencias
    });
  }catch(e){res.status(500).json({error:e.message});}
});
