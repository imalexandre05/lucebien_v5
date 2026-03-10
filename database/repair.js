// ═══════════════════════════════════════════════════════
// LUCEBIEN · database/repair.js — Reparar asignaciones de tiendas
// Ejecutar con: node database/repair.js
// ═══════════════════════════════════════════════════════
const { getDB, initDB } = require('./db');

// Asignaciones correctas según seed original
const ASIGNACIONES = [
  { id:'E01', tiendas:['ST'] },       // Alexander → Stan
  { id:'E02', tiendas:['TR'] },       // Janet → Trece
  { id:'E03', tiendas:['AL'] },       // Maritza → Almacén
  { id:'E04', tiendas:['LB'] },       // Cesar → LuceBien
  { id:'E05', tiendas:['LB'] },       // Jazmín → LuceBien
  { id:'E06', tiendas:['ST'] },       // Marylin → Stan
  { id:'E07', tiendas:['TR'] },       // Gloria → Trece
  { id:'E08', tiendas:['AL','ST','LB','TR'] }, // Jordan → ADMIN (todas)
  { id:'E09', tiendas:['ST'] },       // Jessica → Stan
  { id:'E10', tiendas:['TR'] },       // Heidy → Trece
  { id:'E11', tiendas:['AL'] },       // Remy → Almacén
  { id:'E12', tiendas:['AL'] },       // Michel → Almacén
  { id:'E13', tiendas:['AL','ST','LB','TR'] }, // Margarita → ADMIN (todas)
];

function repair() {
  initDB();
  const db = getDB();

  console.log('\n📋 Estado ACTUAL de empleado_tiendas:');
  const actual = db.prepare('SELECT et.emp_id, e.nombre, et.tienda FROM empleado_tiendas et JOIN empleados e ON e.id=et.emp_id ORDER BY et.emp_id').all();
  actual.forEach(r => console.log(`   ${r.emp_id} ${r.nombre} → ${r.tienda}`));

  const sinTienda = db.prepare(`SELECT id, nombre FROM empleados WHERE activo=1 AND id NOT IN (SELECT DISTINCT emp_id FROM empleado_tiendas)`).all();
  if (sinTienda.length) {
    console.log('\n⚠️  Empleados SIN tienda asignada:');
    sinTienda.forEach(e => console.log(`   ${e.id} ${e.nombre}`));
  }

  // Reparar
  console.log('\n🔧 Reparando asignaciones...');
  db.prepare('DELETE FROM empleado_tiendas').run();
  const ins = db.prepare('INSERT INTO empleado_tiendas (emp_id, tienda) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const a of ASIGNACIONES) {
      // Verificar que el empleado existe
      const emp = db.prepare('SELECT id, nombre FROM empleados WHERE id=?').get(a.id);
      if (!emp) { console.log(`   ⚠️  ${a.id} no existe, saltando`); continue; }
      for (const t of a.tiendas) {
        ins.run(a.id, t);
        console.log(`   ✅ ${emp.nombre} (${a.id}) → ${t}`);
      }
    }
  });
  tx();

  // Limpiar reportes con IDs viejos (con /) que rompen la API
  const reportesViejos = db.prepare("SELECT id FROM reportes WHERE id LIKE '%/%'").all();
  if (reportesViejos.length) {
    console.log(`\n🧹 Limpiando ${reportesViejos.length} reportes con IDs rotos (contenían /):`);
    reportesViejos.forEach(r => console.log(`   🗑️  ${r.id}`));
    db.prepare("DELETE FROM reporte_trabajadores WHERE reporte_id IN (SELECT id FROM reportes WHERE id LIKE '%/%')").run();
    db.prepare("DELETE FROM reporte_actividades WHERE reporte_id IN (SELECT id FROM reportes WHERE id LIKE '%/%')").run();
    db.prepare("DELETE FROM reportes WHERE id LIKE '%/%'").run();
  }

  console.log('\n✅ Reparación completa.\n');

  // Verificar resultado
  console.log('📋 Estado NUEVO de empleado_tiendas:');
  const nuevo = db.prepare('SELECT et.emp_id, e.nombre, et.tienda FROM empleado_tiendas et JOIN empleados e ON e.id=et.emp_id ORDER BY et.emp_id').all();
  nuevo.forEach(r => console.log(`   ${r.emp_id} ${r.nombre} → ${r.tienda}`));
}

repair();
