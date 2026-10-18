// El token de operador es un uuid (codigo_operadores.token). Si llega otra cosa, mejor decirlo con
// un CODIGO: claro que dejar que la base responda con un error de conversión de tipo.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tokenOperadorValido(token: string | null | undefined): token is string {
  return typeof token === 'string' && UUID.test(token);
}
