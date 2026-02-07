# Guia de Despliegue a Google Cloud Run

Esta guia cubre el proceso completo para desplegar un agente de Klisk a Google Cloud Run, desde cero.

---

## Prerequisitos

### 1. Instalar Google Cloud CLI

El CLI de Google Cloud (`gcloud`) es necesario para desplegar.

**macOS (Homebrew):**
```bash
brew install google-cloud-sdk
```

**macOS / Linux (descarga directa):**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL  # Reiniciar el shell
```

**Windows:**

Descarga el instalador desde https://cloud.google.com/sdk/docs/install

**Verificar instalacion:**
```bash
gcloud --version
```

### 2. Crear cuenta en Google Cloud

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Inicia sesion con tu cuenta de Google (o crea una)
3. Acepta los terminos de servicio

> Google Cloud ofrece **$300 en creditos gratis** para cuentas nuevas. Un agente basico en Cloud Run cuesta centimos al mes.

### 3. Crear un proyecto en Google Cloud

Un proyecto de GCP agrupa todos los recursos (servicios, facturacion, APIs).

1. En la [consola de GCP](https://console.cloud.google.com), haz clic en el selector de proyecto (arriba a la izquierda)
2. Clic en **"New Project"**
3. Nombre: por ejemplo `mi-agente-prod`
4. Clic en **"Create"**

Anota el **Project ID** (puede ser diferente del nombre). Lo necesitaras en el siguiente paso.

### 4. Activar facturacion

Cloud Run requiere facturacion activa (aunque uses creditos gratis).

1. Ve a [Billing](https://console.cloud.google.com/billing)
2. Crea una cuenta de facturacion si no tienes una (pide tarjeta, pero no cobra si no superas los creditos)
3. Asocia la cuenta de facturacion al proyecto

### 5. Autenticarse desde terminal

```bash
# Abre el browser para iniciar sesion
gcloud auth login

# Configura el proyecto por defecto
gcloud config set project TU_PROJECT_ID
```

Verifica que todo esta correcto:
```bash
gcloud config get-value project   # Deberia mostrar tu project ID
gcloud auth print-access-token    # Deberia mostrar un token (no un error)
```

---

## Desplegar el agente

### Paso 1: Probar en local

Antes de desplegar, asegurate de que el agente funciona en modo produccion:

```bash
klisk serve mi-agente
```

Abre `http://localhost:8080` y verifica que el chat funciona correctamente.

### Paso 2: Generar archivos de deployment

```bash
klisk deploy init mi-agente
```

Esto genera tres archivos en el directorio del proyecto:

| Archivo | Proposito |
|---|---|
| `Dockerfile` | Imagen Docker con Python 3.12, instala dependencias y ejecuta `klisk serve` |
| `.dockerignore` | Excluye `.venv/`, `.git/`, `.env`, etc. del build |
| `requirements.txt` | `klisk` (o `klisk[litellm]` si usa modelos no-OpenAI) |

> El comando detecta automaticamente si tu agente usa modelos LiteLLM (como `anthropic/claude-sonnet-4-20250514`) y ajusta `requirements.txt` en consecuencia.

### Paso 3: Verificar el `.env`

El archivo `.env` contiene las API keys que tu agente necesita. Asegurate de que tiene claves reales:

```bash
# Ejemplo de .env
OPENAI_API_KEY=sk-proj-abc123...
```

`klisk deploy` lee el `.env` y envia las variables como env vars al servicio de Cloud Run. El archivo `.env` en si **no se sube** al container (esta en `.dockerignore`).

> Si el `.env` tiene placeholders como `sk-your-key-here`, se ignoraran automaticamente.

### Paso 3b: Configurar autenticación (recomendado)

Por defecto, cualquier persona con la URL puede usar tu agente. Para protegerlo, añade API keys al `.env`:

```bash
# .env
OPENAI_API_KEY=sk-proj-abc123...

# Autenticación — al menos una de estas variables activa la protección
KLISK_API_KEY=mi-clave-para-api          # Para consumidores de la API REST
KLISK_CHAT_KEY=mi-clave-para-chat        # Para usuarios del chat web
KLISK_WIDGET_KEY=mi-clave-para-widget    # Para el widget embebido
```

**Comportamiento:**
- Sin ninguna variable → sin autenticación (backward compatible)
- Con al menos una variable → se requiere key en todos los endpoints (excepto `/health` y `/api/info`)
- Todas las keys configuradas se combinan en un pool único — cualquier key válida da acceso a cualquier endpoint

Ver [Autenticación en Serve Interfaces](./serve-interfaces.md#autenticación-api-keys) para detalles sobre cómo cada interfaz envía la key.

### Paso 4: Desplegar

```bash
# Desde el directorio del proyecto:
klisk deploy --region europe-southwest1

# O especificando la ruta:
klisk deploy --path mi-agente --region europe-southwest1
```

**Regiones recomendadas:**

| Region | Ubicacion |
|---|---|
| `europe-southwest1` | Madrid |
| `europe-west1` | Belgica |
| `us-central1` | Iowa (mas barato) |
| `us-east1` | Carolina del Sur |

**Opciones:**

| Opcion | Descripcion |
|---|---|
| `--path` / `-p` | Ruta al proyecto Klisk (default: directorio actual) |
| `--region` / `-r` | Region de GCP |
| `--service` / `-s` | Nombre del servicio (default: nombre del proyecto) |
| `--project` | Project ID de GCP (si no quieres usar el default) |

**Que hace el comando internamente:**

1. Verifica prerequisitos (gcloud, auth, proyecto, billing, Cloud Run API)
2. Si la Cloud Run API no esta habilitada, ofrece activarla automaticamente
3. Lee el `.env` y extrae las API keys
4. Ejecuta `gcloud run deploy --source . --allow-unauthenticated --set-env-vars ...`
5. Google Cloud Build construye la imagen Docker en la nube
6. Cloud Run despliega el container
7. Imprime la URL del servicio desplegado

### Paso 5: Verificar

El comando imprime las URLs al terminar:

```
  Deployed successfully!

  Chat:   https://mi-agente-xxxx-ew.a.run.app
  API:    https://mi-agente-xxxx-ew.a.run.app/api/chat
  Health: https://mi-agente-xxxx-ew.a.run.app/health

  Embed widget:
  <script src="https://mi-agente-xxxx-ew.a.run.app/widget.js"></script>
```

> Si tienes API keys configuradas, los usuarios del chat verán un prompt para ingresar la key. Para el widget, usa `data-key` para autenticación transparente:
> ```html
> <script src="https://mi-agente-xxxx-ew.a.run.app/widget.js" data-key="tu-widget-key"></script>
> ```

Verifica que funciona:
```bash
# Health check (no requiere auth)
curl https://mi-agente-xxxx-ew.a.run.app/health

# Info del agente (no requiere auth, indica si auth está activo)
curl https://mi-agente-xxxx-ew.a.run.app/api/info

# Chat via API (incluir Authorization si configuraste API keys)
curl -X POST https://mi-agente-xxxx-ew.a.run.app/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tu-api-key" \
  -d '{"message": "Hola", "stream": false}'
```

> Si no configuraste API keys, omite el header `Authorization`.

---

## Troubleshooting

### "gcloud: command not found"

No tienes el CLI de Google Cloud instalado. Ver [Paso 1](#1-instalar-google-cloud-cli).

### "Not authenticated with Google Cloud"

```bash
gcloud auth login
```

### "No Google Cloud project configured"

```bash
gcloud config set project TU_PROJECT_ID
```

Para ver tus proyectos: `gcloud projects list`

### "Billing is not enabled"

Ve a https://console.cloud.google.com/billing y asocia una cuenta de facturacion al proyecto.

### "Cloud Run API is not enabled"

`klisk deploy` ofrece activarla automaticamente. Si falla:

```bash
gcloud services enable run.googleapis.com
```

### El deploy falla con errores de APIs

`klisk deploy` detecta automaticamente las APIs que faltan y ofrece activarlas. Si falla, activalas manualmente:

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

### El deploy falla con "storage.objects.get access denied"

`klisk deploy` concede automaticamente los permisos de Storage al service account de Cloud Build. Si falla, concedelo manualmente:

```bash
PROJECT_NUMBER=$(gcloud projects describe TU_PROJECT_ID --format='value(projectNumber)')

gcloud projects add-iam-policy-binding TU_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

> A veces los permisos tardan unos segundos en propagarse. Si el primer deploy falla con este error, simplemente ejecuta el mismo comando de nuevo.

### El deploy falla con errores de permisos

Tu cuenta necesita los roles:
- **Cloud Run Admin** (`roles/run.admin`)
- **Cloud Build Editor** (`roles/cloudbuild.builds.editor`)
- **Storage Admin** (`roles/storage.admin`) — para subir el source code

Si eres el owner del proyecto ya tienes todos los permisos.

### El agente despliega pero no responde

1. Verifica el health check: `curl https://URL/health`
2. Revisa los logs: `gcloud run services logs read TU_SERVICIO --region TU_REGION`
3. Verifica que las env vars estan configuradas: revisa la [consola de Cloud Run](https://console.cloud.google.com/run)
4. Asegurate de que tu `.env` tenia claves reales (no placeholders)

### Redesplegar despues de cambios

Simplemente ejecuta el mismo comando desde el directorio del proyecto:

```bash
klisk deploy --region europe-southwest1
```

Cloud Run mantiene el mismo URL entre despliegues.

---

## Costes

Cloud Run factura por uso (CPU + RAM + requests). Con el free tier:

- **2 millones de requests/mes** gratis
- **360,000 vCPU-seconds/mes** gratis
- **180,000 GiB-seconds/mes** gratis

Para un agente con uso moderado, el coste es practicamente cero. Mas detalles en [Cloud Run Pricing](https://cloud.google.com/run/pricing).
