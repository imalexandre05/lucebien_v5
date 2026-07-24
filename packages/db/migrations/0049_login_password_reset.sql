-- 0049_login_password_reset.sql — prepara la migración de login a usuario+contraseña (LOGIN_V2).
--
-- El hash bcrypt real de cada empleado (del sistema Express viejo) YA se migró a
-- public.empleados.password_hash en 0001_init.sql (comentario "bcrypt; cod_plain/pass_plain NO
-- se migran (DROP)"). GoTrue (Supabase Auth) guarda auth.users.encrypted_password en el MISMO
-- formato bcrypt — así que esto es una copia directa del hash existente, no una contraseña nueva.
-- Cero texto plano, cero reseteos forzados para los empleados que ya tienen hash.
--
-- Empleados sin password_hash (verificado en la BD viva del sistema viejo: 3 de 18, todos
-- inactivos hoy) NO se tocan aquí — el admin les asigna una contraseña desde /empleados
-- (accionEstablecerContrasena, usa la Admin API que hashea server-side) cuando corresponda.
--
-- ⚠️ Antes de aplicar: confirmar que no hay nombres duplicados en scilb (no solo en la BD SQLite
-- vieja, que ya se verificó sin duplicados) — el login por usuario depende de esa unicidad:
--   select lower(nombre), count(*) from empleados group by lower(nombre) having count(*) > 1;
-- Si aparece alguno, resolverlo a mano (renombrar/desambiguar) ANTES de activar LOGIN_V2.
update auth.users u
set encrypted_password = e.password_hash,
    updated_at = now()
from public.empleados e
where u.id = e.id
  and e.password_hash is not null
  and e.password_hash <> '';
