const router=require('express').Router();
const jwt=require('jsonwebtoken');
const{getDB}=require('../database/db');
const SECRET=require('../middleware/auth').JWT_SECRET;
function auth(q,r,n){try{var h=q.headers['authorization'];if(!h||!h.startsWith('Bearer '))return r.status(401).json({error:'Token requerido'});q.user=jwt.verify(h.slice(7),SECRET);n();}catch(e){return r.status(401).json({error:'Token invalido'});}}
function admin(q,r,n){if(q.user.rol!=='admin'&&q.user.rol!=='dueno')return r.status(403).json({error:'Solo admin/dueño'});n();}

router.get('/',function(q,r){try{var db=getDB();var rows=db.prepare('SELECT * FROM config').all();var cfg={};rows.forEach(function(x){cfg[x.clave]=x.valor;});r.json(cfg);}catch(e){r.status(500).json({error:e.message});}});
router.put('/',auth,function(q,r){try{var db=getDB();if(q.user.rol!=='admin'&&q.user.rol!=='dueno')return r.status(403).json({error:'Solo admin'});var upd=db.prepare('INSERT OR REPLACE INTO config (clave,valor) VALUES (?,?)');Object.entries(q.body).forEach(function(e){upd.run(e[0],String(e[1]));});r.json({ok:true});}catch(e){r.status(500).json({error:e.message});}});

router.get('/permisos',auth,function(q,r){try{var db=getDB();var row=db.prepare("SELECT valor FROM config WHERE clave='permisos'").get();r.json(row?JSON.parse(row.valor):{});}catch(e){r.json({});}});
router.put('/permisos',auth,admin,function(q,r){try{var db=getDB();db.prepare("INSERT OR REPLACE INTO config (clave,valor) VALUES ('permisos',?)").run(JSON.stringify(q.body||{}));r.json({ok:true});}catch(e){r.status(500).json({error:e.message});}});

// ─── Puestos personalizados (puestos_custom) ─────────────────────────────
// Guarda un array de {cod,label,icon,sector} que extiende el listado
// hardcoded de roles. Los puestos custom aparecen como columnas extra en
// la matriz de accesos y son seleccionables al editar un empleado.
router.get('/puestos',auth,function(q,r){
  try{var db=getDB();var row=db.prepare("SELECT valor FROM config WHERE clave='puestos_custom'").get();
    r.json(row?JSON.parse(row.valor):[]);
  }catch(e){r.json([]);}
});
router.put('/puestos',auth,admin,function(q,r){
  try{var db=getDB();
    var arr=Array.isArray(q.body)?q.body:[];
    // Validar estructura mínima: cod únicos, label no vacío
    var seen={};var clean=[];
    arr.forEach(function(p){
      if(!p||!p.cod||!p.label)return;
      var cod=String(p.cod).toLowerCase().replace(/[^a-z0-9_]/g,'_').slice(0,32);
      if(!cod||seen[cod])return;
      seen[cod]=1;
      clean.push({cod:cod,label:String(p.label).slice(0,40),icon:String(p.icon||'👤').slice(0,4),sector:String(p.sector||'').slice(0,20)});
    });
    db.prepare("INSERT OR REPLACE INTO config (clave,valor) VALUES ('puestos_custom',?)").run(JSON.stringify(clean));
    r.json({ok:true,puestos:clean});
  }catch(e){r.status(500).json({error:e.message});}
});

// ─── Grupos de rangos (grupos_rangos) ────────────────────────────────────
// Un grupo agrupa varios puestos para aplicar permisos en lote.
// Estructura: [{id,nombre,puestos:[cod,...],color?}]
router.get('/grupos-rangos',auth,function(q,r){
  try{var db=getDB();var row=db.prepare("SELECT valor FROM config WHERE clave='grupos_rangos'").get();
    r.json(row?JSON.parse(row.valor):[]);
  }catch(e){r.json([]);}
});
router.put('/grupos-rangos',auth,admin,function(q,r){
  try{var db=getDB();
    var arr=Array.isArray(q.body)?q.body:[];
    var seen={};var clean=[];
    arr.forEach(function(g){
      if(!g||!g.nombre)return;
      var id=String(g.id||g.nombre).toLowerCase().replace(/[^a-z0-9_]/g,'_').slice(0,32);
      if(!id||seen[id])return;
      seen[id]=1;
      clean.push({
        id:id,
        nombre:String(g.nombre).slice(0,40),
        puestos:Array.isArray(g.puestos)?g.puestos.map(String).slice(0,30):[],
        color:String(g.color||'#64748b').slice(0,16)
      });
    });
    db.prepare("INSERT OR REPLACE INTO config (clave,valor) VALUES ('grupos_rangos',?)").run(JSON.stringify(clean));
    r.json({ok:true,grupos:clean});
  }catch(e){r.status(500).json({error:e.message});}
});

// ─── Layout tooltips (layout_tooltips) ──────────────────────────────────
// Estructura JSON: { byTipo:{maniqui:'texto',...}, byPrefix:{MC:'texto',...} }
// Se aplica en el cliente al renderizar el mapa del layout: si existe un
// texto custom para el código (prefijo) o tipo, se usa en lugar del default.
router.get('/layout-tooltips',function(q,r){
  try{var db=getDB();var row=db.prepare("SELECT valor FROM config WHERE clave='layout_tooltips'").get();
    r.json(row?JSON.parse(row.valor):{byTipo:{},byPrefix:{}});
  }catch(e){r.json({byTipo:{},byPrefix:{}});}
});
router.put('/layout-tooltips',auth,admin,function(q,r){
  try{var db=getDB();
    var b=q.body||{};
    var clean={byTipo:{},byPrefix:{}};
    if(b.byTipo&&typeof b.byTipo==='object'){
      Object.keys(b.byTipo).forEach(function(k){
        var key=String(k).toLowerCase().slice(0,20);
        var val=String(b.byTipo[k]||'').trim().slice(0,300);
        if(key&&val)clean.byTipo[key]=val;
      });
    }
    if(b.byPrefix&&typeof b.byPrefix==='object'){
      Object.keys(b.byPrefix).forEach(function(k){
        var key=String(k).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
        var val=String(b.byPrefix[k]||'').trim().slice(0,300);
        if(key&&val)clean.byPrefix[key]=val;
      });
    }
    db.prepare("INSERT OR REPLACE INTO config (clave,valor) VALUES ('layout_tooltips',?)").run(JSON.stringify(clean));
    r.json({ok:true});
  }catch(e){r.status(500).json({error:e.message});}
});

// ─── Pesos de Evaluación Mensual (eval_pesos) ────────────────────────────
// JSON: { competencias, valores, operaciones, tardanzas, incidencias }
// Cada peso es % (0-100). La suma debería ser 100, pero permitimos cualquier
// valor — el cálculo final normaliza. La nota final será sobre 20 puntos.
// Las categorías "tardanzas" e "incidencias" son DESCUENTOS (restan).
var EVAL_PESOS_DEFAULT = {
  competencias: 25,
  valores:      15,
  operaciones:  50,   // incluye puntos del pipeline (pipeline_puntos)
  tardanzas:     5,   // peso del descuento por tardanzas
  incidencias:   5    // peso del descuento por incidencias
};
router.get('/eval-pesos', function(q, r) {
  try {
    var db = getDB();
    var row = db.prepare("SELECT valor FROM config WHERE clave='eval_pesos'").get();
    if (row) {
      try { r.json(Object.assign({}, EVAL_PESOS_DEFAULT, JSON.parse(row.valor))); return; }
      catch(e) {}
    }
    r.json(EVAL_PESOS_DEFAULT);
  } catch(e) { r.json(EVAL_PESOS_DEFAULT); }
});
router.put('/eval-pesos', auth, admin, function(q, r) {
  try {
    var b = q.body || {};
    var clean = {};
    Object.keys(EVAL_PESOS_DEFAULT).forEach(function(k) {
      var v = parseFloat(b[k]);
      if (isNaN(v) || v < 0) v = EVAL_PESOS_DEFAULT[k];
      if (v > 100) v = 100;
      clean[k] = Math.round(v * 10) / 10;  // 1 decimal
    });
    var total = clean.competencias + clean.valores + clean.operaciones;
    if (total <= 0) return r.status(400).json({ error: 'La suma de pesos positivos (competencias + valores + operaciones) debe ser > 0' });
    var db = getDB();
    db.prepare("INSERT OR REPLACE INTO config (clave,valor) VALUES ('eval_pesos',?)").run(JSON.stringify(clean));
    r.json({ ok: true, pesos: clean, suma_positiva: total });
  } catch(e) { r.status(500).json({ error: e.message }); }
});

module.exports=router;
