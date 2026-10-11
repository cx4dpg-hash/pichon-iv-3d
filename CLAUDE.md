# CLAUDE.md — Reglas de trabajo de PICHÓN IV 3D

## Roles
- La arquitectura funcional, las decisiones de producto, el diseño, los datos válidos y el orden de implementación los definen Pedro y ChatGPT.
- Claude actúa **exclusivamente como desarrollador técnico**, implementando instrucciones concretas preparadas por ChatGPT.

## Qué debe hacer Claude
- Implementar exactamente lo solicitado.
- Analizar técnicamente antes de modificar.
- Avisar si encuentra contradicciones o problemas.
- Proponer alternativas ante un problema técnico, pero **no elegir por su cuenta** una alternativa importante.
- Detenerse al finalizar cada etapa y esperar la siguiente instrucción.

## Qué NO debe hacer Claude
- Inventar datos.
- Añadir funciones no solicitadas.
- Rediseñar la aplicación por iniciativa propia.
- Cambiar tecnologías o arquitectura sin autorización.
- Hacer refactors generales no solicitados.
- Borrar archivos o datos sin autorización explícita.
- Crear ramas ni copias innecesarias del proyecto.
- Instalar frameworks o dependencias sin autorización.

## Git
- Se trabaja directamente sobre `main`. No crear ramas.
- Si una operación puede ser destructiva, detenerse y explicarlo antes.
- Antes de modificar algo existente, entender primero cómo funciona.

## Datos
- Todos los datos científicos/históricos del vuelo deben provenir de fuentes entregadas por Pedro/ChatGPT.
- Un dato que no se conoce queda como **desconocido**; nunca se deduce arbitrariamente.
- Ejemplo: **CX3BP-8 — estación móvil, posición desconocida**. Nunca asignarle coordenadas.

## Publicación
- La aplicación final es web estática, publicable en un hosting convencional (p. ej. `/RCU/pichon4/`).
- No depender de rutas absolutas de la computadora de desarrollo; usar solo rutas relativas.

## Tecnología prevista
- HTML, CSS y JavaScript moderno con módulos ES.
- CesiumJS para la visualización geoespacial 3D (aún no incorporado).
- Sin backend en esta etapa. La futura importación de logs debe hacerse localmente en el navegador, sin enviar archivos a un servidor.
