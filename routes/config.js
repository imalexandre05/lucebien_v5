const router=require('express').Router();
const jwt=require('jsonwebtoken');
const{getDB}=require('../database/db');
const SECRET=process.env.JWT_SECRET||'lucebien-secret-2026-xK9mP3qR';
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

module.exports=router;
