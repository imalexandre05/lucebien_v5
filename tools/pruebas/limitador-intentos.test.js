// Prueba del limitador de /api/auth/login-code (sistema viejo). La corre tools/verificar-local.sh:
//   node --test tools/pruebas/limitador-intentos.test.js
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

test('global: 20 fallos repartidos entre IP pausan a todos, como mucho 1 h', () => {
  const l = crearLimitador();
  for (let i = 0; i < 20; i++) l.registrarFallo('10.0.0.' + i, i * MIN);
  const r = l.verificar('9.9.9.9', 20 * MIN);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.alcance, 'global');
  // El primer fallo (t=0) vence a los 60 min; faltan 40.
  assert.strictEqual(r.minutos, 40);
  assert.deepStrictEqual(l.verificar('9.9.9.9', 60 * MIN), { ok: true });
});

test('un acierto no borra fallos (no hay método para hacerlo)', () => {
  const l = crearLimitador();
  assert.strictEqual(typeof l.registrarExito, 'undefined');
});
