const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getDB, hoyLocal } = require('../database/db');
const SECRET = require('../middleware/auth').JWT_SECRET;

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

// ═══ Migración: columnas para auto-envío + tabla de drafts ═══
// Cada ALTER en try/catch: si la columna ya existe, SQLite lanza error y seguimos.
(function migrarReportesAutoEnvio(){
  try{
    var db=getDB();
    try{ db.exec('ALTER TABLE reportes ADD COLUMN auto_enviado INTEGER DEFAULT 0'); }catch(e){}
    try{ db.exec('ALTER TABLE reportes ADD COLUMN auto_enviado_razon TEXT'); }catch(e){}
    try{ db.exec('ALTER TABLE reportes ADD COLUMN no_evaluable INTEGER DEFAULT 0'); }catch(e){}
    try{ db.exec('ALTER TABLE reportes ADD COLUMN encargado_id TEXT'); }catch(e){}
    // Drafts en vivo — lo que el usuario va llenando en FR-01 antes de enviar.
    // PK compuesta (sede,fecha,turno) → un único borrador por espacio de trabajo.
    db.exec(
      'CREATE TABLE IF NOT EXISTS reporte_drafts (' +
      '  sede TEXT NOT NULL, fecha TEXT NOT NULL, turno TEXT NOT NULL,' +
      '  encargado_id TEXT, encargado_nombre TEXT,' +
      '  payload TEXT,' +
      '  updated_at TEXT DEFAULT (datetime(\'now\',\'localtime\')),' +
      '  PRIMARY KEY (sede, fecha, turno)' +
      ')'
    );
  }catch(e){ console.warn('[reportes] migración auto-envío:', e.message); }
})();

// ── Helper hora local (Peru) para decidir deadlines ──────────────
function horaActualPeru(){
  var d = new Date();
  return { h: d.getHours(), m: d.getMinutes(), fecha: hoyLocal() };
}

// ── Auto-asistencia: marca presentes a encargado + trabajadores del reporte ─
// Invocada desde POST manual y desde el cron de auto-envío. Idempotente
// (INSERT OR IGNORE). Sin hora real → tardanza=0; el admin puede ajustar.
// reporte: { id, fecha, turno, encargado_id, trabajadores:[nombre,...] }
function generarAsistenciasDelReporte(db, reporte) {
  if (!reporte || !reporte.id || !reporte.fecha) return;
  try {
    var ins = db.prepare(
      "INSERT OR IGNORE INTO asistencias (emp_id,fecha,turno,hora_entrada,hora_salida,minutos_tardanza,fuente,obs) "+
      "VALUES (?,?,?,?,?,?,?,?)"
    );
    var turno = reporte.turno || 'M';
    if (reporte.encargado_id) {
      try { ins.run(reporte.encargado_id, reporte.fecha, turno, null, null, 0, 'reporte', 'auto: encargado del reporte '+reporte.id); } catch(e){}
    }
    (reporte.trabajadores || []).forEach(function(n){
      if (!n) return;
      try {
        var emp = db.prepare("SELECT id FROM empleados WHERE nombre=? AND activo=1 LIMIT 1").get(n);
        if (emp && emp.id) ins.run(emp.id, reporte.fecha, turno, null, null, 0, 'reporte', 'auto: trabajador del reporte '+reporte.id);
      } catch(e){}
    });
  } catch (e) { console.warn('[reportes] generarAsistenciasDelReporte:', e.message); }
}
// Deadlines: turno M = 15:00, turno T y C = 23:00
function deadlinePasado(turno){
  var t = horaActualPeru();
  if (turno === 'M') return t.h >= 15;
  if (turno === 'T' || turno === 'C') return t.h >= 23;
  return false;
}

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
    db.prepare('INSERT INTO reportes (id,sede,turno,fecha,encargado,encargado_id,puntaje,act_total,act_done,bloqueado) VALUES (?,?,?,?,?,?,?,?,?,1)').run(b.id,b.sede,b.turno,fechaReal,b.encargado,b.encargado_id||null,b.puntaje||0,b.actTotal||0,b.actDone||0);
    // Limpiar draft al enviar manualmente
    try{ db.prepare('DELETE FROM reporte_drafts WHERE sede=? AND fecha=? AND turno=?').run(b.sede, fechaReal, b.turno); }catch(e){}
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
    // ── Auto-asistencia (provisional, hasta tener huellero) ─────────────
    // Misma función se invoca desde el cron auto-envío para mantener
    // consistencia. Sin hora real → tardanza=0, fuente='reporte'.
    generarAsistenciasDelReporte(db, {
      id: b.id, fecha: fechaReal, turno: b.turno,
      encargado_id: b.encargado_id, trabajadores: b.trabajadores
    });

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

// ═══════════════════════════════════════════════════════════════
// DRAFTS EN VIVO — autosave del reporte antes de enviar
// ═══════════════════════════════════════════════════════════════

// GET /api/reportes/drafts/:sede/:fecha/:turno — leer draft actual
router.get('/drafts/:sede/:fecha/:turno', auth, function(req,res){
  try{
    var db=getDB();
    var d=db.prepare('SELECT * FROM reporte_drafts WHERE sede=? AND fecha=? AND turno=?')
      .get(req.params.sede, req.params.fecha, req.params.turno);
    if (!d) return res.json(null);
    try{ d.payload = d.payload ? JSON.parse(d.payload) : {}; }catch(e){ d.payload = {}; }
    res.json(d);
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /api/reportes/drafts — upsert draft
// Body: { sede, fecha, turno, encargado_id, encargado_nombre, payload:{ trabajadores, actividades, extras, incidencias, ... } }
router.post('/drafts', auth, function(req,res){
  try{
    var db=getDB();
    var b=req.body||{};
    if (!b.sede || !b.fecha || !b.turno) return res.status(400).json({error:'sede/fecha/turno requeridos'});
    var payload = b.payload ? JSON.stringify(b.payload) : '{}';
    // No dejar que el autosave pise un encargado ya fijado si no viene en el body
    var existing = db.prepare('SELECT encargado_id, encargado_nombre FROM reporte_drafts WHERE sede=? AND fecha=? AND turno=?')
      .get(b.sede, b.fecha, b.turno);
    var encId   = (b.encargado_id   !== undefined) ? b.encargado_id   : (existing ? existing.encargado_id   : null);
    var encNom  = (b.encargado_nombre!== undefined)? b.encargado_nombre: (existing ? existing.encargado_nombre: null);
    db.prepare(
      'INSERT INTO reporte_drafts (sede,fecha,turno,encargado_id,encargado_nombre,payload,updated_at) ' +
      "VALUES (?,?,?,?,?,?,datetime('now','localtime')) " +
      'ON CONFLICT(sede,fecha,turno) DO UPDATE SET ' +
      '  encargado_id=excluded.encargado_id,' +
      '  encargado_nombre=excluded.encargado_nombre,' +
      '  payload=excluded.payload,' +
      '  updated_at=excluded.updated_at'
    ).run(b.sede, b.fecha, b.turno, encId, encNom, payload);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// DELETE /api/reportes/drafts/:sede/:fecha/:turno — limpiar al enviar o anular
router.delete('/drafts/:sede/:fecha/:turno', auth, function(req,res){
  try{
    getDB().prepare('DELETE FROM reporte_drafts WHERE sede=? AND fecha=? AND turno=?')
      .run(req.params.sede, req.params.fecha, req.params.turno);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /api/reportes/permitir-reenvio — re-habilitar envío de un reporte no_evaluable
// Body: { sede, fecha, turno }
router.post('/permitir-reenvio', auth, function(req,res){
  try{
    if (req.user.rol!=='admin' && req.user.rol!=='dueno')
      return res.status(403).json({error:'Solo admin/dueño'});
    var db=getDB();
    var b=req.body||{};
    if (!b.sede || !b.fecha || !b.turno) return res.status(400).json({error:'sede/fecha/turno requeridos'});
    // Borra reportes no_evaluable de ese sede/fecha/turno → permite reenvío manual
    var reps = db.prepare('SELECT id FROM reportes WHERE sede=? AND fecha=? AND turno=? AND no_evaluable=1').all(b.sede, b.fecha, b.turno);
    db.transaction(function(){
      reps.forEach(function(r){
        db.prepare('DELETE FROM reporte_trabajadores WHERE reporte_id=?').run(r.id);
        db.prepare('DELETE FROM reporte_actividades  WHERE reporte_id=?').run(r.id);
        db.prepare('DELETE FROM reporte_extras       WHERE reporte_id=?').run(r.id);
        try{ db.prepare('DELETE FROM incidencias WHERE reporte_id=?').run(r.id); }catch(e){}
        db.prepare('DELETE FROM reportes WHERE id=?').run(r.id);
      });
    })();
    res.json({ok:true, borrados:reps.length});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ═══════════════════════════════════════════════════════════════
// AUTO-ENVÍO — se invoca desde el cron en server.js
// Para cada sede + turno cuyo deadline ya pasó y NO hay reporte enviado:
//   - Si hay draft: se convierte en reporte (auto_enviado=1, atribuido al encargado)
//   - Si NO hay draft: se crea reporte no_evaluable=1 (placeholder para trazabilidad)
// ═══════════════════════════════════════════════════════════════
function autoEnviarPendientes(opts){
  var db=getDB();
  var hoy = hoyLocal();
  var t = horaActualPeru();
  var SEDES = ['ST','LB','AL','TR'];
  var TURNOS = ['M','T','C'];
  var resultados = [];
  SEDES.forEach(function(sede){
    TURNOS.forEach(function(turno){
      if (!deadlinePasado(turno)) return;
      // ¿Ya hay reporte enviado para este sede/fecha/turno?
      var existe = db.prepare('SELECT id FROM reportes WHERE sede=? AND fecha=? AND turno=?').get(sede, hoy, turno);
      if (existe) return;
      // Generar id formato DD-MM-YY_TURNO-SEDE
      var parts = hoy.split('-'); // yyyy-mm-dd
      var idRep = parts[2]+'-'+parts[1]+'-'+parts[0].slice(2)+'_'+turno+'-'+sede;
      // Verificar que id no exista (por seguridad)
      if (db.prepare('SELECT id FROM reportes WHERE id=?').get(idRep)) return;
      var draft = db.prepare('SELECT * FROM reporte_drafts WHERE sede=? AND fecha=? AND turno=?').get(sede, hoy, turno);
      var payload = {};
      try{ payload = draft && draft.payload ? JSON.parse(draft.payload) : {}; }catch(e){ payload = {}; }
      var tieneContenido = !!(draft && (
        (payload.trabajadores && payload.trabajadores.length) ||
        (payload.actividades && payload.actividades.length) ||
        (payload.extras && payload.extras.length) ||
        (payload.incidencias && payload.incidencias.length)
      ));
      var encNom = (draft && draft.encargado_nombre) || null;
      var encId  = (draft && draft.encargado_id)     || null;
      var noEvaluable = tieneContenido ? 0 : 1;
      var razon = tieneContenido ? 'auto-envio-deadline' : 'sin-draft-no-evaluable';
      try{
        db.transaction(function(){
          db.prepare(
            'INSERT INTO reportes (id,sede,turno,fecha,encargado,encargado_id,puntaje,act_total,act_done,bloqueado,auto_enviado,auto_enviado_razon,no_evaluable) ' +
            'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
          ).run(idRep, sede, turno, hoy, encNom, encId, 0,
                (payload.actividades||[]).length, (payload.actividades||[]).filter(function(a){return a.realizada;}).length,
                noEvaluable?0:1, 1, razon, noEvaluable);
          if (tieneContenido) {
            var insT = db.prepare('INSERT INTO reporte_trabajadores (reporte_id,nombre) VALUES (?,?)');
            (payload.trabajadores||[]).forEach(function(n){ insT.run(idRep, n); });
            var insA = db.prepare('INSERT INTO reporte_actividades (reporte_id,cod,nombre,cat,peso,realizada,obs) VALUES (?,?,?,?,?,?,?)');
            (payload.actividades||[]).forEach(function(a){ if(a.realizada) insA.run(idRep, a.cod, a.nombre, a.cat, a.peso, 1, a.obs||''); });
            if (payload.extras && payload.extras.length){
              var insE = db.prepare('INSERT INTO reporte_extras (reporte_id,tipo,nombre,cantidad,precio_unitario,monto_total,detalle,registrado_por) VALUES (?,?,?,?,?,?,?,?)');
              payload.extras.forEach(function(e){ insE.run(idRep, e.tipo, e.nombre, e.cantidad||1, e.precio_unitario||0, e.monto_total||0, e.detalle||'', e.registrado_por||''); });
            }
            if (payload.incidencias && payload.incidencias.length){
              var insI = db.prepare('INSERT INTO incidencias (sede,fecha,tipo,descripcion,nivel,responsable,reporte_id,reportado_por,origen,puntos_penalidad) VALUES (?,?,?,?,?,?,?,?,?,?)');
              payload.incidencias.forEach(function(i){
                var niv=(i.nivel||'Medio'); if(!/^(Alto|Medio|Bajo)$/.test(niv)) niv='Medio';
                var pts=(i.puntos_penalidad!=null && i.puntos_penalidad!=='')?parseFloat(i.puntos_penalidad):(niv==='Alto'?5:(niv==='Bajo'?1:2));
                insI.run(sede, hoy, i.tipo, i.descripcion||'', niv, i.responsable||'—', idRep, encNom||null, 'auto', pts);
              });
            }
          }
          // Limpiar draft usado
          db.prepare('DELETE FROM reporte_drafts WHERE sede=? AND fecha=? AND turno=?').run(sede, hoy, turno);
          // Auto-asistencia: solo si el draft tenía contenido (encargado o trabajadores)
          if (tieneContenido) {
            generarAsistenciasDelReporte(db, {
              id: idRep, fecha: hoy, turno: turno,
              encargado_id: encId, trabajadores: payload.trabajadores
            });
          }
        })();
        resultados.push({sede:sede, turno:turno, id:idRep, auto:true, no_evaluable:noEvaluable, razon:razon});
        console.log('[auto-envio] '+idRep+' ('+(tieneContenido?'con contenido':'no-evaluable')+') encargado='+(encNom||'(ninguno)'));
      }catch(e){
        console.warn('[auto-envio] fallo '+idRep+':', e.message);
      }
    });
  });
  return resultados;
}

// Admin debug endpoint — forzar corrida del auto-envío (útil para testing sin esperar 15:00)
router.post('/auto-envio/run', auth, function(req,res){
  if (req.user.rol!=='admin' && req.user.rol!=='dueno')
    return res.status(403).json({error:'Solo admin'});
  res.json({ok:true, resultados: autoEnviarPendientes()});
});

module.exports = router;
module.exports.autoEnviarPendientes = autoEnviarPendientes;
