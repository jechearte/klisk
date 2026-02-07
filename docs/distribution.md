# Distribución de Klisk (Beta)

Guía para construir y distribuir Klisk a beta testers.

## Construir el paquete

### Requisitos

```bash
pip install build
```

### Generar el .whl

1. Actualiza la versión en `pyproject.toml`:

```toml
[project]
version = "0.1.0"  # Incrementa con cada release
```

2. Construye el paquete:

```bash
python -m build
```

3. El archivo `.whl` se genera en `dist/`:

```
dist/klisk-0.1.0-py3-none-any.whl
```

4. Comparte ese archivo con los testers (Google Drive, email, Slack, etc.)

## Instrucciones para testers

### Requisitos

- Python 3.11 o superior

Verificar versión:

```bash
python3 --version
```

### Instalación

1. Descargar el archivo `.whl` compartido
2. Abrir una terminal y ejecutar:

```bash
pip install ~/Downloads/klisk-0.1.0-py3-none-any.whl
```

> Ajustar la ruta si el archivo está en otra carpeta. También se puede arrastrar el archivo al terminal para pegar la ruta automáticamente.

3. Verificar que la instalación fue correcta:

```bash
klisk --help
```

### Actualización

Cuando se comparta una nueva versión, descargar el nuevo `.whl` e instalar:

```bash
pip install ~/Downloads/klisk-0.2.0-py3-none-any.whl
```

pip detecta automáticamente que es una versión más nueva y actualiza.

### Desinstalación

```bash
pip uninstall klisk
```
