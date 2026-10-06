// Prueba del limitador de /api/auth/login-code (sistema viejo). Corre con: node --test tools/pruebas/
const test = require('node:test');
const assert = require('node:assert');
const { crearLimitador } = require('../../routes/limitador-intentos');

const MIN = 60 * 1000;

test('por IP: el sexto intento tras 5 fallos espera 15 min', () => {
  const l = crearLimitador();
  for (let i = 0; i < 5; i++) {
    assert.deepStrictEqual(l.verificar('1.1.1.1', 0), { ok: true });
    l.registrarFallo('1.1.1.1', 0);
  }
  assert.deepStrictEqual(l.verificar('1.1.1.1', 0), { ok: false, alcance: 'ip', minutos: 15 });
  assert.deepStrictEqual(l.verificar('2.2.2.2', 0), { ok: true }, 'otra IP no queda bloqueada');
  assert.deepStrictEqual(l.verificar('1.1.1.1', 15 * MIN), { ok: true }, 'vence a los 15 min');
});

test('global: 30 fallos repartidos entre IP pausan a todos', () => {
  const l = crearLimitador();
  for (let i = 0; i < 30; i++) l.registrarFallo('10.0.0.' + i, i * MIN);
  const r = l.verificar('9.9.9.9', 30 * MIN);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.alcance, 'global');
  // El primer fallo (t=0) vence a las 24 h; faltan 24h − 30 min.
  assert.strictEqual(r.minutos, 24 * 60 - 30);
  assert.deepStrictEqual(l.verificar('9.9.9.9', 24 * 60 * MIN), { ok: true });
});

test('un acierto no borra fallos (no hay método para hacerlo)', () => {
  const l = crearLimitador();
  assert.strictEqual(typeof l.registrarExito, 'undefined');
});
