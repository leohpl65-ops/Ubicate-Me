# Ubícame

Ubícame es una aplicación móvil y web para compartir la ubicación de forma voluntaria. Las personas inician sesión, se vinculan con un código temporal de un solo uso y solo comparten su ubicación después de activarlo expresamente. Pueden pausar el uso compartido o quitar un vínculo en cualquier momento.

## Cómo está organizado

Este repositorio es un monorepo pnpm:

- `artifacts/ubicacion-compartida/`: app universal hecha con Expo Router y React Native. Incluye la experiencia Android/iOS y la exportación web.
- `artifacts/api-server/`: API Express que valida sesiones Clerk y guarda perfiles, vínculos, invitaciones y ubicaciones.
- `lib/api-spec/`: contrato OpenAPI de la API.
- `lib/api-client-react/` y `lib/api-zod/`: cliente y validaciones generados a partir del contrato.
- `lib/db/`: esquema PostgreSQL y configuración de Drizzle.

### Flujo de uso

1. La persona inicia sesión con Google mediante Clerk.
2. La app crea o actualiza su perfil en la API.
3. Para vincularse, una persona genera un código temporal de cinco dígitos; la otra lo revisa y confirma.
4. La ubicación queda pausada hasta que su titular la activa y permite el acceso a la ubicación.
5. Mientras compartir está activo, la app actualiza la ubicación y la API la entrega únicamente a las personas vinculadas.
6. En web, el navegador solicita el permiso de ubicación y el mapa de OpenStreetMap muestra la ubicación seleccionada. En móvil, se usa el mapa nativo con teselas de OpenStreetMap. El mapa web solicita teselas del área aproximada; las coordenadas exactas se mantienen en la página.

## Ejecutar en Replit

Los servicios están registrados en Replit. Inicia los workflows **Ubicación compartida** y **API Server** para probar la app y su API. El flujo de inicio de sesión requiere la autenticación Clerk configurada para el proyecto.

Requisitos de la API:

- `DATABASE_URL`: conexión PostgreSQL, administrada por Replit cuando la base de datos está habilitada.
- `CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY`: claves administradas por Replit Clerk; no deben copiarse al repositorio ni escribirse en este README.

Si el esquema aún no está aplicado en la base de desarrollo, ejecútalo con:

```sh
pnpm --filter @workspace/db run push
```

Comprobaciones del monorepo:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
```

## Exportar la versión web

La app está configurada para exportar sus rutas web como archivos estáticos:

```sh
pnpm --filter @workspace/ubicacion-compartida run build:web
```

La salida queda en `artifacts/ubicacion-compartida/dist/`. Para que el sitio pueda iniciar sesión y guardar datos, también necesita una API accesible y una instancia de autenticación que funcione en el dominio de alojamiento.

## Publicar en Vercel

**La exportación web se puede compilar, pero esta app todavía no está lista para publicar en Vercel con inicio de sesión funcional.** Las claves Clerk configuradas para este proyecto son administradas por Replit y solo están preparadas para los dominios y el proxy de Replit. No las copies a Vercel: no son una configuración de autenticación válida para ese alojamiento.

Antes de publicar en Vercel hay que:

1. Elegir y configurar un proveedor de autenticación compatible con el dominio de Vercel, y actualizar el cliente y el middleware del servidor para ese proveedor.
2. Publicar la API Express y la base de datos en un servicio accesible desde Vercel, o adaptar expresamente la API para el alojamiento serverless. La API actual no es una función de Vercel.
3. Configurar las variables públicas y privadas en sus entornos correspondientes. La clave publicable puede ir en `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` solo cuando se haya configurado una instancia Clerk externa; `DATABASE_URL` y la clave secreta de autenticación deben permanecer como secretos del servidor.

Cuando esos dos servicios estén listos, importa el repositorio en Vercel y usa:

- **Root Directory:** `.` (raíz del monorepo; no activar “Include source files outside of the Root Directory”).
- **Install Command:** `pnpm install --frozen-lockfile`
- **Build Command:** `pnpm --filter @workspace/ubicacion-compartida run build:web`
- **Output Directory:** `artifacts/ubicacion-compartida/dist`
- **Framework Preset:** `Other`

Si la API está en otro dominio, configura un rewrite de Vercel para reenviar `/api/:path*` al dominio de esa API. Configura también el proxy de Clerk para el proveedor externo y el dominio web; no uses el proxy de Replit para Vercel. Una vez activada la web, prueba inicio/cierre de sesión, ubicación con permiso y sin permiso, creación/confirmación de códigos y pausa del uso compartido.

## Registro de modificaciones

Agrega una entrada numerada al final de esta lista cada vez que se haga un arreglo o cambio. Conserva las anteriores y describe el resultado visible, no solo el nombre del archivo.

- **modificación (1):** Se habilitó Clerk administrado por Replit y se corrigió la causa de la pantalla de error: faltaban las claves de autenticación.
- **modificación (2):** Se agregó el acceso a la ubicación del navegador y un mapa web de OpenStreetMap; la app solicita permiso antes de iniciar el seguimiento.
- **modificación (3):** Se preparó la exportación estática web con Expo Router y un comando de compilación independiente, sin cambiar el flujo de compilación móvil.
- **modificación (4):** Se separó la URL de la API para web y móvil y se evitó enviar el token Bearer móvil desde el navegador, que usa las cookies de sesión.
- **modificación (5):** Se documentaron la estructura, los servicios, los comandos de ejecución y las limitaciones actuales de Vercel.

## Historial de versiones

La app móvil continúa siendo la misma experiencia Expo. La versión web requiere un proveedor de autenticación y una API compatibles con el dominio externo antes de publicarse fuera de Replit.
