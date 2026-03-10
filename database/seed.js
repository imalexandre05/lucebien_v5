const bcrypt = require('bcryptjs');
const { getDB, initDB } = require('./db');

const EMPLEADOS = [
  { id:'E01', cod:'1001', nombre:'Alexander', ini:'AL', rol:'trabajador', t:['ST'] },
  { id:'E02', cod:'1002', nombre:'Janet',     ini:'JA', rol:'trabajador', t:['TR'] },
  { id:'E03', cod:'1003', nombre:'Maritza',   ini:'MA', rol:'trabajador', t:['AL'] },
  { id:'E04', cod:'1004', nombre:'Cesar',     ini:'CE', rol:'trabajador', t:['LB'] },
  { id:'E05', cod:'1005', nombre:'Jazmín',    ini:'JZ', rol:'trabajador', t:['LB'] },
  { id:'E06', cod:'1006', nombre:'Marylin',   ini:'ML', rol:'trabajador', t:['ST'] },
  { id:'E07', cod:'1007', nombre:'Gloria',    ini:'GL', rol:'trabajador', t:['TR'] },
  { id:'E08', cod:'1008', nombre:'Jordan',    ini:'JO', rol:'admin',      t:['AL','ST','LB','TR'] },
  { id:'E09', cod:'1009', nombre:'Jessica',   ini:'JE', rol:'trabajador', t:['ST'] },
  { id:'E10', cod:'1010', nombre:'Heidy',     ini:'HE', rol:'trabajador', t:['TR'] },
  { id:'E11', cod:'1011', nombre:'Remy',      ini:'RE', rol:'trabajador', t:['AL'] },
  { id:'E12', cod:'1012', nombre:'Michel',    ini:'MI', rol:'trabajador', t:['AL'] },
  { id:'E13', cod:'1013', nombre:'Margarita', ini:'MG', rol:'admin',      t:['AL','ST','LB','TR'] },
];

const EXTRAS = [
  { cod:'XR01', nombre:'Lavado al agua a mano',          tipo:'remunerada',  precio:5, unidad:'prenda', peso:0 },
  { cod:'XR02', nombre:'Confección de michis',            tipo:'remunerada',  precio:3, unidad:'unidad', peso:0 },
  { cod:'XP01', nombre:'Planchado de prendas',            tipo:'por_puntos',  precio:0, unidad:'prenda', peso:2 },
  { cod:'XP02', nombre:'Planchado de pantalones nuevos',  tipo:'por_puntos',  precio:0, unidad:'unidad', peso:2 },
  { cod:'XP03', nombre:'Lavado al seco',                  tipo:'por_puntos',  precio:0, unidad:'unidad', peso:3 },
  { cod:'XP04', nombre:'Confección de pañuelos',          tipo:'por_puntos',  precio:0, unidad:'unidad', peso:2 },
  { cod:'XP05', nombre:'Reporte clientes deudores (INFOCORP)', tipo:'por_puntos', precio:0, unidad:'reporte', peso:3 },
  { cod:'XP06', nombre:'Seguimiento clientes potenciales',tipo:'por_puntos',  precio:0, unidad:'reporte', peso:3 },
  { cod:'XP07', nombre:'Apertura/Cierre locales anexos',  tipo:'por_puntos',  precio:0, unidad:'vez', peso:2 },
  { cod:'XP08', nombre:'Capacitación a nuevos trabajadores',tipo:'por_puntos', precio:0, unidad:'sesión', peso:4 },
  { cod:'XP09', nombre:'Sellado con vela de terno',       tipo:'por_puntos',  precio:0, unidad:'unidad', peso:2 },
  { cod:'XP10', nombre:'Entalle de pantalón (excepto basta)',tipo:'por_puntos',precio:0, unidad:'unidad', peso:3 },
  { cod:'XP11', nombre:'Entalle de saco',                 tipo:'por_puntos',  precio:0, unidad:'unidad', peso:3 },
  { cod:'XP12', nombre:'Costura de cintas',               tipo:'por_puntos',  precio:0, unidad:'unidad', peso:1 },
  { cod:'XP13', nombre:'Lavado al agua de zapatos',       tipo:'por_puntos',  precio:0, unidad:'par', peso:2 },
  { cod:'XP14', nombre:'Lustrado de zapatos',             tipo:'por_puntos',  precio:0, unidad:'par', peso:1 },
  { cod:'XP15', nombre:'Planchado y doblado de camisas',  tipo:'por_puntos',  precio:0, unidad:'unidad', peso:1 },
];

function seed() {
  initDB();
  const db = getDB();
  const n = db.prepare('SELECT COUNT(*) as cnt FROM empleados').get();
  if (n.cnt > 0 && !process.argv.includes('--force')) {
    console.log('⚠️  BD ya tiene datos. Usa --force para sobrescribir.'); process.exit(0);
  }
  if (n.cnt > 0) {
    db.exec(`DELETE FROM empleado_tiendas;DELETE FROM empleados;DELETE FROM incidencias;DELETE FROM lista_counters;
      DELETE FROM reportes;DELETE FROM reporte_trabajadores;DELETE FROM reporte_actividades;DELETE FROM reporte_extras;
      DELETE FROM actividades_config;DELETE FROM actividades_pendientes;DELETE FROM config;
      DELETE FROM prendas;DELETE FROM prenda_historial;DELETE FROM envios_prendas;DELETE FROM prenda_calificacion;
      DELETE FROM prestamos_prendas;DELETE FROM prendas_baja;DELETE FROM devoluciones_garantia;
      DELETE FROM solicitudes_prendas;DELETE FROM solicitud_items;
      DELETE FROM evaluaciones_mensuales;DELETE FROM evaluaciones_valores;
      DELETE FROM listas_lavanderia;DELETE FROM lista_items;`);
  }

  // Empleados
  const ie = db.prepare('INSERT INTO empleados (id,cod,nombre,iniciales,rol,cod_hash) VALUES (?,?,?,?,?,?)');
  const it = db.prepare('INSERT INTO empleado_tiendas (emp_id,tienda) VALUES (?,?)');
  db.transaction(()=>{
    for (const e of EMPLEADOS) { ie.run(e.id,e.cod,e.nombre,e.ini,e.rol,bcrypt.hashSync(e.cod,10)); for(const t of e.t) it.run(e.id,t); }
  })();

  // Incidencias demo
  const ii = db.prepare('INSERT INTO incidencias (sede,fecha,tipo,nivel,responsable,descripcion) VALUES (?,?,?,?,?,?)');
  ii.run('LB','2026-03-01','Conflicto grave con cliente','Alto','—','');
  ii.run('TR','2026-03-01','Faltante de caja significativo','Alto','Heidy','');

  // Counters
  const ic = db.prepare('INSERT OR IGNORE INTO lista_counters (sede,tipo,contador) VALUES (?,?,0)');
  for(const s of['ST','LB','TR','AL'])for(const t of['LAV','REF'])ic.run(s,t);

  // Actividades extras para todas las sedes
  const ia = db.prepare(`INSERT OR IGNORE INTO actividades_config
    (sede,cod,nombre,categoria,tipo_act,peso,precio_unitario,unidad,aparece_dia,frecuencia_dias,turno,acumula,orden,activa)
    VALUES (?  ,?,?,  'EXT',?,?,?,?,0,0,'ambos',0,?,1)`);
  db.transaction(()=>{
    for(const s of['ST','LB','TR','AL']) EXTRAS.forEach((a,i)=>ia.run(s,a.cod,a.nombre,a.tipo,a.peso,a.precio,a.unidad,100+i));
  })();

  // Config
  const cfg = db.prepare('INSERT OR IGNORE INTO config (clave,valor) VALUES (?,?)');
  cfg.run('eval_valores_habilitado','0');
  cfg.run('precio_lavado_mano','5.00');
  cfg.run('precio_michi','3.00');

  console.log(`\n✅ Seed completo: ${EMPLEADOS.length} empleados, ${EXTRAS.length} extras × 4 sedes`);
  console.log('\n📋 Códigos:');
  EMPLEADOS.forEach(e=>console.log(`   ${e.cod} → ${e.nombre} (${e.rol}) [${e.t}]`));
}
seed();
