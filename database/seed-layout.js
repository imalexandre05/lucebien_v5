// ═══════════════════════════════════════════════════════
// Seed layout data — LuceBien + Stands (ST101/ST102)
// Run: node database/seed-layout.js
// ═══════════════════════════════════════════════════════
const { getDB } = require('./db');
const db = getDB();

// Drop and recreate
try {
  db.exec("DROP TABLE IF EXISTS layout_zonas");
  db.exec("CREATE TABLE layout_zonas (id INTEGER PRIMARY KEY AUTOINCREMENT, sede TEXT NOT NULL, cod TEXT DEFAULT '', nombre TEXT DEFAULT '', turno TEXT DEFAULT 'ambos', tipo TEXT DEFAULT 'mueble', peso REAL DEFAULT 1, pos_x REAL DEFAULT 0, pos_y REAL DEFAULT 0, ancho REAL DEFAULT 60, alto REAL DEFAULT 40, color TEXT DEFAULT '#3b82f6', forma TEXT DEFAULT 'rect', orden INTEGER DEFAULT 0)");
} catch(e) { console.log('Table:', e.message); }

var ins = db.prepare('INSERT INTO layout_zonas (sede,cod,nombre,turno,tipo,peso,pos_x,pos_y,ancho,alto,color,forma,orden) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');

// Canvas: 800×600 virtual units
// ═══════════════════════════════════════════════════════
// LUCEBIEN LAYOUT
// ═══════════════════════════════════════════════════════
var lb = [
  // === VITRINAS FRONTALES (top) — Mañana ===
  ['VF01','Vitrina frontal 1','mañana','vitrina',1.5, 10.0,5.0,130.0,15.0,'#eab308','rect'],
  ['VF02','Vitrina frontal 2','mañana','vitrina',1.5, 200.0,5.0,160.0,15.0,'#eab308','rect'],
  ['VF03','Vitrina frontal 3','mañana','vitrina',1.5, 400.0,5.0,160.0,15.0,'#eab308','rect'],
  ['VF04','Vitrina frontal 4','mañana','vitrina',1.5, 660.0,5.0,130.0,15.0,'#eab308','rect'],

  // === MANIQUÍES (triángulos) — Mañana ===
  ['M07','Maniquí 07','mañana','maniqui',0.3, 30.0,40.0,36.0,36.0,'#facc15','tri'],
  ['M08','Maniquí 08','mañana','maniqui',0.3, 230.0,40.0,36.0,36.0,'#facc15','tri'],
  ['M09','Maniquí 09','mañana','maniqui',0.3, 290.0,40.0,36.0,36.0,'#facc15','tri'],
  ['ME05','Mesa exhib. 05','mañana','mueble',1.0, 370.0,35.0,60.0,30.0,'#eab308','oct'],
  ['M10','Maniquí 10','mañana','maniqui',0.3, 450.0,40.0,36.0,36.0,'#facc15','tri'],
  ['M11','Maniquí 11','mañana','maniqui',0.3, 510.0,40.0,36.0,36.0,'#facc15','tri'],
  ['M12','Maniquí 12','mañana','maniqui',0.3, 700.0,30.0,36.0,36.0,'#facc15','tri'],
  ['M13','Maniquí 13','mañana','maniqui',0.3, 750.0,25.0,36.0,36.0,'#facc15','tri'],

  // === PARED IZQUIERDA — Mañana (M04-M06) ===
  ['M06','Maniquí 06','mañana','maniqui',0.3, 25.0,100.0,36.0,36.0,'#facc15','tri'],
  ['M05','Maniquí 05','mañana','maniqui',0.3, 25.0,200.0,36.0,36.0,'#facc15','tri'],
  ['M04','Maniquí 04','mañana','maniqui',0.3, 25.0,310.0,36.0,36.0,'#facc15','tri'],

  // === MUEBLES PARED IZQUIERDA — Tarde (MB11/MT04) ===
  ['MB11','Mueble ropa 11','tarde','mueble',2.0, 5.0,80.0,50.0,240.0,'#2563eb','rect'],
  ['V02','Espejo V02','mañana','espejo',1.0, 145.0,85.0,15.0,80.0,'#eab308','rect'],

  // === RIELES CENTRALES — Tarde ===
  ['MT05','Riel ternos 05','tarde','riel',1.5, 200.0,110.0,180.0,30.0,'#2563eb','rect'],
  ['MT06','Riel ternos 06','tarde','riel',1.5, 430.0,110.0,180.0,30.0,'#2563eb','rect'],
  ['MT07','Riel ternos 07','mañana','riel',1.5, 720.0,80.0,60.0,200.0,'#eab308','rect'],

  // === ASIENTO CENTRAL — Tarde ===
  ['MS04','Silla clientes 04','tarde','silla',0.5, 340.0,230.0,120.0,30.0,'#2563eb','rect'],

  // === MESAS CENTRALES — Mañana ===
  ['MB10','Mesa exhib. 10','mañana','mueble',1.5, 200.0,300.0,80.0,45.0,'#eab308','rect'],
  ['MB09','Mesa exhib. 09','mañana','mueble',1.5, 310.0,300.0,110.0,45.0,'#eab308','rect'],
  ['MB08','Mesa exhib. 08','mañana','mueble',2.0, 450.0,300.0,120.0,45.0,'#eab308','rect'],
  ['MB07','Mesa exhib. 07','mañana','mueble',1.5, 600.0,300.0,80.0,45.0,'#eab308','rect'],

  // === RIELES INFERIORES — Tarde ===
  ['MT03','Riel ternos 03','tarde','riel',1.5, 310.0,370.0,140.0,15.0,'#2563eb','rect'],
  ['MT02','Riel ternos 02','tarde','riel',1.5, 500.0,370.0,140.0,15.0,'#2563eb','rect'],
  ['MT01','Riel ternos 01','tarde','riel',1.5, 200.0,400.0,450.0,15.0,'#2563eb','rect'],

  // === MANIQUÍES INFERIORES — Mañana ===
  ['M03','Maniquí 03','mañana','maniqui',0.3, 175.0,430.0,36.0,36.0,'#facc15','tri'],
  ['M01','Maniquí 01','mañana','maniqui',0.3, 400.0,440.0,36.0,36.0,'#facc15','tri'],
  ['M02','Maniquí 02','mañana','maniqui',0.3, 150.0,500.0,36.0,36.0,'#facc15','tri'],

  // === CORBATAS — Tarde ===
  ['ME04','Corbatero','tarde','mueble',0.3, 115.0,345.0,25.0,55.0,'#2563eb','rect'],
  ['ME03','Corbatero grande','tarde','mueble',0.3, 660.0,415.0,45.0,20.0,'#2563eb','rect'],

  // === ZONA INFERIOR — Mañana/Tarde ===
  ['MB06','Estante bajo 06','tarde','mueble',1.5, 230.0,445.0,110.0,35.0,'#2563eb','rect'],
  ['MB06b','Estante bajo 06b','tarde','mueble',1.5, 430.0,445.0,110.0,35.0,'#2563eb','rect'],
  ['MS03','Silla 03','tarde','silla',0.5, 60.0,440.0,30.0,40.0,'#2563eb','rect'],
  ['MS02','Silla 02','mañana','silla',0.5, 120.0,470.0,20.0,25.0,'#eab308','rect'],
  ['MS01','Silla 01','tarde','silla',0.5, 60.0,500.0,20.0,20.0,'#2563eb','rect'],
  ['MB05','Caja/PC','mañana','mueble',2.0, 150.0,460.0,30.0,45.0,'#eab308','rect'],
  ['MB04','Mesa baja 04','mañana','mueble',1.0, 100.0,520.0,25.0,25.0,'#eab308','rect'],
  ['MB03','Mesa baja 03','mañana','mueble',1.0, 200.0,520.0,30.0,25.0,'#eab308','rect'],
  ['MB02','Mueble exhib. 02','tarde','mueble',1.5, 500.0,490.0,45.0,50.0,'#2563eb','rect'],
  ['MB01','Mueble exhib. 01','tarde','mueble',1.5, 555.0,490.0,50.0,50.0,'#2563eb','rect'],

  // === PLANCHA ===
  ['PLANCHA','Mesa plancha','mañana','equipo',6.0, 640.0,470.0,40.0,50.0,'#eab308','circle'],

  // === EXTRAS DERECHA ===
  ['ME02','Acc. exhib. 02','mañana','mueble',0.5, 720.0,490.0,60.0,20.0,'#eab308','rect'],
  ['ME01','Acc. exhib. 01','mañana','mueble',0.5, 720.0,520.0,60.0,20.0,'#eab308','rect'],

  // === ÁREAS SERVICIO — Tarde ===
  ['PROBADOR','Probador','tarde','area',1.5, 10.0,480.0,65.0,70.0,'#94a3b8','rect'],
  ['BAÑO','Baño','tarde','area',2.0, 250.0,530.0,180.0,40.0,'#94a3b8','rect'],
  ['REFACCION','Refacción','tarde','area',1.0, 720.0,365.0,70.0,80.0,'#94a3b8','rect'],


  // PISO y CALLE (special zones)
  ['PISO','Limpieza de piso (barrer/trapear)','ambos','piso',3.0, 0.0,0.0,800.0,580.0,'#f1f5f9','special'],
  ['CALLE','Barrer y baldear calle/vereda','ambos','calle',2.0, 0.0,0.0,800.0,580.0,'#94a3b8','special'],

  // === ESPEJO PARED IZQ ===
  ['VI01','Espejo pared izq','mañana','espejo',1.0, 0.0,425.0,8.0,80.0,'#eab308','rect'],
];

var countLB = 0;
db.transaction(function() {
  lb.forEach(function(z, i) {
    ins.run('LB', z[0], z[1], z[2], z[3], z[4], z[5], z[6], z[7], z[8], z[9], z[10], i);
    countLB++;
  });
})();
console.log('✅ LuceBien: ' + countLB + ' zonas');

// ═══════════════════════════════════════════════════════
// STANDS (ST101 + ST102) — One combined layout
// Left half = ST102, Right half = ST101, Middle = pasillo
// ═══════════════════════════════════════════════════════
var st = [

  // PISO y CALLE
  ['PISO','Limpieza de piso (barrer/trapear)','ambos','piso',3.0, 0.0,0.0,800.0,580.0,'#f1f5f9','special'],
  ['CALLE','Barrer y baldear calle/vereda','ambos','calle',2.0, 0.0,0.0,800.0,580.0,'#94a3b8','special'],

  // === ESTRUCTURA ===
  ['ALMACEN','Almacén ST102','mañana','area',1.5, 5.0,5.0,260.0,60.0,'#eab308','rect'],
  ['PASILLO','Pasillo central','ambos','area',1.0, 315.0,5.0,70.0,565.0,'#cbd5e1','rect'],

  // === ST102 — Mañana ===
  ['PLANCHA','Plancha ST102','mañana','equipo',6.0, 180.0,70.0,35.0,100.0,'#eab308','circle'],
  ['MB09','Mesa 09','mañana','mueble',1.5, 170.0,200.0,80.0,35.0,'#eab308','rect'],
  ['MB10','Mesa 10','mañana','mueble',1.5, 10.0,110.0,60.0,50.0,'#eab308','rect'],

  // === ST102 — Tarde ===
  ['MB11','Mueble ropa 11','tarde','mueble',1.0, 60.0,75.0,50.0,35.0,'#2563eb','rect'],
  ['REFAC','Refacción ST102','tarde','area',1.0, 5.0,110.0,45.0,60.0,'#94a3b8','rect'],
  ['PROB_ST102','Probador ST102','tarde','area',1.5, 5.0,190.0,55.0,50.0,'#94a3b8','rect'],
  ['MB08','Mueble 08','tarde','mueble',1.0, 5.0,370.0,55.0,30.0,'#2563eb','rect'],
  ['MB07','Mueble 07','tarde','mueble',2.0, 65.0,370.0,130.0,55.0,'#2563eb','rect'],
  ['ME07','Exhib. 07','tarde','mueble',1.0, 65.0,440.0,50.0,25.0,'#2563eb','rect'],
  ['ME06','Exhib. 06','tarde','mueble',1.0, 120.0,440.0,50.0,25.0,'#2563eb','rect'],
  ['ME05','Exhib. 05','tarde','mueble',1.0, 175.0,440.0,50.0,25.0,'#2563eb','rect'],
  ['MT07','Riel 07','mañana','riel',1.5, 5.0,480.0,55.0,80.0,'#eab308','rect'],
  ['VI03','Espejo VI03','mañana','espejo',1.0, 5.0,255.0,15.0,45.0,'#eab308','rect'],
  ['VI04','Espejo VI04','mañana','espejo',1.0, 5.0,310.0,15.0,45.0,'#eab308','rect'],

  // === MANIQUÍES PASILLO — Mañana ===
  ['M12','Maniquí 12','mañana','maniqui',0.3, 340.0,50.0,36.0,36.0,'#facc15','tri'],
  ['M11','Maniquí 11','mañana','maniqui',0.3, 340.0,120.0,36.0,36.0,'#facc15','tri'],
  ['M10','Maniquí 10','mañana','maniqui',0.3, 340.0,190.0,36.0,36.0,'#facc15','tri'],
  ['M09','Maniquí 09','mañana','maniqui',0.3, 340.0,260.0,36.0,36.0,'#facc15','tri'],
  ['M08','Maniquí 08','mañana','maniqui',0.3, 340.0,370.0,36.0,36.0,'#facc15','tri'],
  ['M07','Maniquí 07','mañana','maniqui',0.3, 325.0,440.0,36.0,36.0,'#facc15','tri'],

  // === VITRINAS ST — Mañana ===
  ['VF05','Vitrina F05','mañana','vitrina',1.5, 290.0,5.0,20.0,100.0,'#eab308','rect'],
  ['VF04','Vitrina F04','mañana','vitrina',1.5, 290.0,370.0,20.0,100.0,'#eab308','rect'],
  ['VF01','Vitrina F01','mañana','vitrina',1.5, 420.0,5.0,200.0,12.0,'#eab308','rect'],
  ['VF02','Vitrina F02','mañana','vitrina',1.5, 395.0,5.0,20.0,65.0,'#eab308','rect'],
  ['VF03','Vitrina F03','mañana','vitrina',1.5, 395.0,430.0,20.0,80.0,'#eab308','rect'],
  ['VI02','Espejo VI02','mañana','espejo',1.0, 480.0,55.0,150.0,12.0,'#eab308','rect'],
  ['VI01','Espejo VI01','mañana','espejo',1.0, 775.0,55.0,15.0,65.0,'#eab308','rect'],

  // === ST101 — Mañana (maniquíes + muebles amarillos) ===
  ['M06','Maniquí 06','mañana','maniqui',0.3, 440.0,30.0,36.0,36.0,'#facc15','tri'],
  ['M05','Maniquí 05','mañana','maniqui',0.3, 505.0,30.0,36.0,36.0,'#facc15','tri'],
  ['ME04','Mesa exhib. 04','mañana','mueble',1.0, 560.0,25.0,25.0,25.0,'#eab308','rect'],
  ['M04','Maniquí 04','mañana','maniqui',0.3, 600.0,30.0,36.0,36.0,'#facc15','tri'],
  ['PROB_ST101','Probador ST101','tarde','area',1.5, 690.0,5.0,65.0,50.0,'#94a3b8','rect'],
  ['MS02','Silla 02','tarde','silla',0.5, 760.0,15.0,25.0,25.0,'#2563eb','rect'],

  ['MB06','Mueble 06','mañana','mueble',2.0, 410.0,80.0,100.0,80.0,'#eab308','rect'],
  ['MB05','Mueble 05','mañana','mueble',2.0, 410.0,310.0,80.0,65.0,'#eab308','rect'],
  ['MB04','Mueble 04','mañana','mueble',1.5, 510.0,300.0,70.0,40.0,'#eab308','rect'],

  // === ST101 — Tarde (rieles, corbatas) ===
  ['MT05','Riel 05','tarde','riel',1.5, 740.0,130.0,50.0,55.0,'#2563eb','rect'],
  ['MT06','Riel 06','tarde','riel',1.5, 740.0,210.0,50.0,55.0,'#2563eb','rect'],
  ['MT04','Riel 04','tarde','riel',1.5, 740.0,290.0,50.0,55.0,'#2563eb','rect'],
  ['M03','Maniquí 03','mañana','maniqui',0.3, 760.0,360.0,36.0,36.0,'#facc15','tri'],
  ['M02','Maniquí 02','mañana','maniqui',0.3, 760.0,410.0,36.0,36.0,'#facc15','tri'],
  ['M01','Maniquí 01','mañana','maniqui',0.3, 620.0,535.0,36.0,36.0,'#facc15','tri'],

  ['ME03','Corbatero','tarde','mueble',0.3, 480.0,210.0,35.0,35.0,'#2563eb','rect'],
  ['MS01','Silla 01','tarde','silla',0.5, 480.0,300.0,25.0,25.0,'#2563eb','rect'],

  ['MB3','Mueble bajo 3','mañana','mueble',1.5, 480.0,530.0,70.0,30.0,'#eab308','rect'],
  ['MB02','Mueble bajo 02','mañana','mueble',1.5, 560.0,530.0,80.0,30.0,'#eab308','rect'],
  ['MB01','Mueble bajo 01','mañana','mueble',1.5, 650.0,530.0,80.0,30.0,'#eab308','rect'],
  ['ME02','Acc. exhib.','tarde','mueble',0.5, 410.0,465.0,20.0,70.0,'#2563eb','rect'],
  ['MT03','Riel 03','tarde','riel',1.5, 530.0,420.0,70.0,20.0,'#2563eb','rect'],
  ['MT02','Riel 02','tarde','riel',1.5, 500.0,475.0,110.0,15.0,'#2563eb','rect'],
  ['MT01','Riel 01','tarde','riel',1.5, 610.0,475.0,120.0,15.0,'#2563eb','rect'],
  ['ME01','Acc. exhib. 01','tarde','mueble',0.5, 755.0,500.0,35.0,30.0,'#2563eb','rect'],
];

var countST = 0;
db.transaction(function() {
  st.forEach(function(z, i) {
    ins.run('ST', z[0], z[1], z[2], z[3], z[4], z[5], z[6], z[7], z[8], z[9], z[10], i);
    countST++;
  });
})();
console.log('✅ Stands: ' + countST + ' zonas');


// ═══════════════════════════════════════════════════════
// TRECE (TR) LAYOUT — Tienda más pequeña
// ═══════════════════════════════════════════════════════
var tr = [
  // === MAMPARAS/VITRINAS FRONTALES ===
  ['VF01','Mampara frontal 1','mañana','vitrina',1.5, 10,5,180,15,'#eab308','rect'],
  ['VF02','Mampara frontal 2','mañana','vitrina',1.5, 200,5,180,15,'#eab308','rect'],
  ['VF03','Mampara frontal 3','mañana','vitrina',1.5, 400,5,180,15,'#eab308','rect'],
  ['VF04','Mampara frontal 4','mañana','vitrina',1.5, 610,5,180,15,'#eab308','rect'],

  // === MANIQUÍES ===
  ['M01','Maniquí 01','mañana','maniqui',0.3, 30,40,36,36,'#facc15','tri'],
  ['M02','Maniquí 02','mañana','maniqui',0.3, 120,40,36,36,'#facc15','tri'],
  ['M03','Maniquí 03','mañana','maniqui',0.3, 350,40,36,36,'#facc15','tri'],
  ['M04','Maniquí 04','mañana','maniqui',0.3, 550,40,36,36,'#facc15','tri'],
  ['M05','Maniquí 05','mañana','maniqui',0.3, 700,40,36,36,'#facc15','tri'],

  // === RIELES DE TERNOS ===
  ['MT01','Riel ternos izquierda','tarde','riel',1.5, 5,100,60,200,'#2563eb','rect'],
  ['MT02','Riel ternos centro 1','tarde','riel',1.5, 180,100,200,20,'#2563eb','rect'],
  ['MT03','Riel ternos centro 2','tarde','riel',1.5, 420,100,200,20,'#2563eb','rect'],
  ['MT04','Riel ternos derecha','tarde','riel',1.5, 735,100,60,200,'#2563eb','rect'],

  // === ESPEJOS ===
  ['VI01','Espejo pared izq','mañana','espejo',1.0, 0,350,10,80,'#eab308','rect'],
  ['VI02','Espejo central','mañana','espejo',1.0, 380,200,15,100,'#eab308','rect'],

  // === MUEBLES ===
  ['MB01','Mesa exhibición 01','mañana','mueble',1.5, 120,200,100,40,'#eab308','rect'],
  ['MB02','Mesa exhibición 02','mañana','mueble',1.5, 500,200,100,40,'#eab308','rect'],
  ['MB03','Mueble bajo','tarde','mueble',1.0, 200,350,120,35,'#2563eb','rect'],
  ['MB04','Mueble bajo 2','tarde','mueble',1.0, 420,350,120,35,'#2563eb','rect'],
  ['MB05','Caja/PC','mañana','mueble',2.0, 650,350,50,40,'#eab308','rect'],

  // === CORBATERO ===
  ['CO01','Corbatero','tarde','mueble',0.3, 100,300,25,50,'#2563eb','rect'],

  // === ASIENTOS ===
  ['MS01','Asiento clientes','tarde','silla',0.5, 300,280,80,25,'#2563eb','rect'],

  // === PLANCHA ===
  ['PLANCHA','Mesa de plancha','mañana','equipo',6.0, 680,440,50,45,'#eab308','circle'],

  // === ÁREAS ===
  ['PROBADOR','Probador','tarde','area',1.5, 5,430,80,60,'#94a3b8','rect'],
  ['BAÑO','Baño','tarde','area',2.0, 5,500,80,50,'#94a3b8','rect'],

  // === PISO Y CALLE ===
  ['PISO','Limpieza de piso (barrer/trapear)','ambos','piso',3.0, 0,0,800,580,'#f1f5f9','special'],
  ['CALLE','Barrer y baldear calle/vereda','ambos','calle',2.0, 0,0,800,580,'#94a3b8','special'],
];

db.transaction(function(){
  tr.forEach(function(z,i){
    ins.run('TR',z[0],z[1],z[2],z[3],z[4],z[5],z[6],z[7],z[8],z[9],z[10],i);
  });
})();
console.log('  ✅ TR: ' + tr.length + ' zonas');

// ═══════════════════════════════════════════════════════
// ALMACÉN LAYOUT — Basado en plano real abril 2026
// Canvas: 800×580 — Amarillo=mostradores, Azul=estantes, Gris=mesas/áreas
// ═══════════════════════════════════════════════════════
var al = [
  // === FILA SUPERIOR ===
  ['ME01','Estante superior','ambos','mueble',1.5, 170,5,140,30,'#6b7280','rect'],
  ['ESCALERA','Escaleras','ambos','area',0.5, 315,5,260,42,'#94a3b8','rect'],
  ['BAÑO','Baño','ambos','area',2.0, 650,5,140,70,'#94a3b8','rect'],

  // === IZQUIERDA — Mostradores (amarillo) ===
  ['MT01','Mostrador principal','ambos','mueble',2.0, 35,58,265,38,'#eab308','rect'],
  ['MT02','Estante pared izq.','ambos','mueble',1.5, 12,100,42,130,'#eab308','rect'],
  ['MB01','Perchero/Rack 01','ambos','mueble',1.0, 55,195,72,35,'#eab308','rect'],
  ['MT03','Mostrador lateral izq.','ambos','mueble',1.5, 52,248,92,78,'#eab308','rect'],
  ['ME02','Mesa lateral izq. sup.','ambos','mueble',1.0, 0,270,25,52,'#6b7280','rect'],
  ['ME03','Mesa lateral izq. inf.','ambos','mueble',1.0, 0,358,38,48,'#6b7280','rect'],

  // === CENTRO — Mostradores y racks (amarillo) ===
  ['MB02','Rack central superior','ambos','mueble',2.0, 275,58,215,32,'#eab308','rect'],
  ['MB03','Rack centro medio','ambos','mueble',1.5, 300,100,110,35,'#eab308','rect'],
  ['MT04','Mostrador centro izq.','ambos','mueble',1.5, 228,115,68,52,'#eab308','rect'],
  ['MB04','Rack centro (c/perchero)','ambos','mueble',1.0, 348,115,62,38,'#eab308','rect'],
  ['MB05','Rack centro bajo','ambos','mueble',1.5, 300,158,110,35,'#eab308','rect'],
  ['MT05','Mostrador central','ambos','mueble',2.0, 172,198,128,42,'#eab308','rect'],
  ['MB06','Estante centro A','ambos','mueble',1.5, 220,242,120,30,'#eab308','rect'],
  ['MB07','Estante centro B','ambos','mueble',1.5, 220,275,120,32,'#eab308','rect'],

  // === DERECHA SUPERIOR — Estantes azules (almacenaje ternos) ===
  ['MB13','Estante ternos A','ambos','mueble',2.0, 510,75,88,42,'#3b82f6','rect'],
  ['MB14','Estante ternos B','ambos','mueble',2.0, 600,70,72,48,'#3b82f6','rect'],
  ['MB15','Estante pared der. sup.','ambos','mueble',2.0, 715,100,52,65,'#3b82f6','rect'],

  // === DERECHA MEDIA — Estantes azules ===
  ['MB12','Estante ternos C','ambos','mueble',2.0, 510,180,88,42,'#3b82f6','rect'],
  ['MB17','Estante ternos D','ambos','mueble',2.0, 600,180,72,42,'#3b82f6','rect'],
  ['MB16','Estante pared der. med.','ambos','mueble',2.0, 715,182,52,65,'#3b82f6','rect'],
  ['ME05','Mesa de trabajo derecha','ambos','mueble',1.0, 555,228,75,25,'#6b7280','rect'],

  // === DERECHA INFERIOR — Máquinas de costura y estantes ===
  ['ME04','Mesa costura sup.','ambos','mueble',1.5, 578,288,52,42,'#6b7280','rect'],
  ['MB10','Estante costura A','ambos','mueble',1.5, 578,338,52,42,'#3b82f6','rect'],
  ['MB11','Estante costura B','ambos','mueble',1.5, 578,395,52,42,'#3b82f6','rect'],
  // Estantes verticales derecha
  ['MB18','Estante derecho A','ambos','mueble',1.5, 645,288,50,62,'#3b82f6','rect'],
  ['MB19','Estante derecho B','ambos','mueble',1.5, 700,288,50,62,'#3b82f6','rect'],
  ['MB20','Estante derecho C','ambos','mueble',1.5, 645,360,50,80,'#3b82f6','rect'],
  ['MB21','Estante derecho D','ambos','mueble',1.5, 700,360,50,80,'#3b82f6','rect'],

  // === ZONA DE PLANCHADO (inferior) ===
  ['PLANCHA1','Plancha 1','ambos','equipo',6.0, 48,400,55,55,'#ef4444','circle'],
  ['MB08','Rack planchado','ambos','mueble',1.5, 175,375,85,52,'#eab308','rect'],
  ['PLANCHA2','Plancha 2','ambos','equipo',6.0, 320,398,65,55,'#ef4444','circle'],

  // === FILA INFERIOR ===
  ['MB09','Mostrador inferior largo','ambos','mueble',2.0, 32,465,265,30,'#eab308','rect'],
  ['MT06','Mostrador inferior derecho','ambos','mueble',1.5, 290,465,102,30,'#eab308','rect'],

  // === PISO (limpieza general) ===
  ['PISO','Barrer y trapear piso','ambos','piso',3.0, 0,0,800,500,'#f1f5f9','special'],
];

db.transaction(function(){
  al.forEach(function(z,i){
    ins.run('AL',z[0],z[1],z[2],z[3],z[4],z[5],z[6],z[7],z[8],z[9],z[10],i);
  });
})();
console.log('  ✅ AL: ' + al.length + ' zonas');

console.log('\n🎉 Layout seed complete!');
