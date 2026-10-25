# Resumen: "El fin del Vibe Coding: Crea software robusto con este método"

> **Canal:** MoureDev by Brais Moure
> **Duración:** 2:03:16
> **Enlace:** https://www.youtube.com/watch?v=5HaOxAAA5qI
> **Repositorio del curso:** https://github.com/mouredev/hello-sdd

---

## Visión general

Curso completo sobre **SDD (Spec-Driven Development)**, el "desarrollo dirigido por especificaciones": la forma profesional de desarrollar software con agentes de IA. La premisa central es que la IA **no elimina la ingeniería de software, la evoluciona**. Cuanto más código genera la IA, menos lo revisamos y más indeterminado es el resultado, lo que produce fallos de seguridad, inestabilidad y software que no puede evolucionar. SDD resuelve esto combinando el flujo de desarrollo clásico con la IA, manteniendo al programador como pieza clave con criterio y control.

El curso va de los fundamentos teóricos a una **práctica completa**: construir una CLI en Python para registrar hábitos de estudio y calcular rachas de días, siguiendo el flujo SDD paso a paso.

---

## Contenido por capítulos

### 1. Introducción al curso de SDD (00:00 – 08:45)

- SDD = *Spec-Driven Development*, la metodología que usan la mayoría de equipos profesionales para desarrollar con IA.
- El problema: la IA genera cada vez más código, pero con resultados indeterministas y menos revisados → más fallos de seguridad, inestabilidad y deuda técnica.
- SDD une **fundamentos de programación + IA**; la IA no sustituye los fundamentos.
- Curso orientado a todos los niveles (desde junior hasta quienes hacen vibe coding sin saber programar).
- **No se casa con herramientas**: lo importante es el fundamento, no el framework. "Los frameworks pasan de moda; el método siempre se queda."
- Todo el material (prompts, plantillas, código y el proyecto final) está en el repo `mouredev/hello-sdd`.

### 2. ¿Qué es Spec-Driven Development? (08:45 – 15:47)

- Forma de desarrollar software con IA en la que **antes de generar código se escribe una especificación**: un documento estructurado, normalmente en Markdown.
- El código es el *cómo*; la especificación define el *qué* y el *porqué* (la intención).
- La especificación se convierte en el **artefacto principal de comunicación con la IA**, en lugar de escribir prompts "a lo loco".
- Origen: en 2025 aparece el término *vibe coding* (programar dejándose llevar). Atrajo a gente no técnica, pero derivó en muchos problemas: no se puede crear software profesional sin saber qué se está construyendo.
- Surgieron "arneses" (guardarraíles) para la IA: skills, reglas, contexto, documentación, MCPs. La pieza final es SDD: si la IA no sabe qué construir, lo hará mal.
- Objetivo: pasar de resultados **indeterministas** a lo más **deterministas** posible.
- SDD **no es** documentar por documentar ni crear specs que nadie valida: es la manera profesional y controlada de desarrollar.

### 3. El flujo de desarrollo clásico (15:47 – 21:55)

- SDD no es nuevo: es el ciclo de vida del software de los últimos 50-60 años adaptado a la IA.
- Fases clásicas: **planificar → analizar → diseñar → implementar → testear → desplegar → mantener** (bucle). Tres fases existen *antes* de tocar código.
- Equivalencias con SDD:
  - Planificación → **Constitución**
  - Análisis de requisitos → **Especificación**
  - Diseño → **Plan técnico**
  - Desglose del trabajo → **Tareas**
  - Implementación → la IA programa
  - Testing → **Validación** de la spec
  - Mantenimiento → iteración sobre las specs

### 4. Vibe coding: qué es y por qué no sirve para desarrollar en serio (21:55 – 26:11)

- El vibe coding **sí tiene cabida**: prototipos desechables, pruebas de concepto, explorar librerías, herramientas de usar y tirar.
- Pero para **software profesional** (el que evoluciona durante meses/años, por el que te pagan) no sirve: se rompe sin requisitos, no existe "lo correcto", problemas de seguridad y deuda técnica, no escala a equipos ni empresas.
- "Las empresas no contratan vibe coders; contratan programadores que sepan manejar bien la IA."
- Con vibe coding no aprendes y te vuelves una pieza prescindible. Lo ideal es unir lo mejor de ambos mundos.

### 5. Los 3 tipos de SDD: spec-first, spec-anchored y spec-as-source (26:11 – 40:49)

Todos responden a la pregunta: **¿qué pasa con la especificación cuando el código ya está implementado?**

| Tipo | Descripción | Fuente de verdad | Compromiso con la spec |
|---|---|---|---|
| **Spec-first** | La spec arranca el desarrollo y puede "morir" tras implementarse | El código | Bajo |
| **Spec-anchored** | La spec acompaña al código siempre, sincronizada con los cambios | Código + spec | Medio |
| **Spec-as-source** | La spec *es* el programa; el código casi no se revisa | La spec | Alto |

- Recomendación de Brais: trabajar entre **spec-first y spec-anchored** (donde el código sigue siendo importante). Spec-as-source le parece "superpeligroso".
- Frameworks mencionados: **Kiro** y **BMAD** (más spec-first), **Spec Kit** (de GitHub) y **OpenSpec** (más spec-anchored). También se menciona RPI (research, plan, implement).
- Advertencia: usar estos frameworks sin entender SDD te convierte en "una máquina de copiar y pegar". Ninguno es estándar de la industria; **el flujo SDD sí lo es**. El 90% de estas herramientas mueren por el camino (ejemplo: Tessl, que pivotó de spec-as-source a skills).

### 6. Markdown: el idioma en el que se escriben las specs (40:49 – 41:32)

- Las especificaciones se escriben en **Markdown**: se aprende en media hora y es esencial en el desarrollo con IA.
- Recursos: guía gratuita de Markdown en moure.dev / MoureDev Pro, o la guía de GitHub.

### 7. Cómo se trabaja con SDD: AGENTS.md, specs y modo plan (41:32 – 48:25)

- **AGENTS.md**: fichero Markdown en la raíz del repo con el contexto operativo del proyecto (resumen, comandos, convenciones, límites de "qué no tocar", verificaciones obligatorias). Es la "Biblia pequeñita" que el agente lee antes de trabajar. Ya es un estándar que leen Copilot, Claude, Codex, etc.
- **Anatomía de una spec**: contexto, historias de usuario, requisitos funcionales (RF), requisitos no funcionales, casos límite, alcance (qué queda fuera), criterios de finalización (definition of done) y dudas. Responde al *qué* y al *porqué*, no al *cómo*.
- **Notación EARS** (*Easy Approach to Requirements Syntax*): reduce la ambigüedad con patrones:
  - Ubicuo: "El sistema almacenará…"
  - Dirigido por eventos: "Cuando el usuario…, el sistema…"
  - Por estados: "Mientras no exista ningún hábito, el sistema…"
  - Comportamientos no deseados: "Si el hábito ya está completado, entonces el sistema…"
  - Opcional: "Donde se pase X opción, el sistema…"
- **Flujo SDD estándar**: Constitución → Especificación → Clarificación → Plan técnico → Tareas → Implementación → Validación → (bucle). La constitución se hace una vez; la spec es siempre el punto de partida.
- **Modo plan**: modo del agente que no escribe código, sino que presenta una planificación para que la revises antes de implementar. Usarlo en todas las fases excepto en la implementación.

### 8. PRÁCTICA: Proyecto completo con SDD de principio a fin (48:25 – 55:56)

- Proyecto: **Habits CLI**, una aplicación de terminal en Python para registrar hábitos de estudio y calcular rachas de días consecutivos (crear hábito, marcar como hecho, listar).
- Da igual el editor, el agente (GitHub Copilot, OpenCode, Claude Code, Cursor, Antigravity, Kiro…) y el modelo (incluso gratuitos): el flujo es el mismo. En la demo usa VS Code + Claude Code.

### 9. Paso 1: Setup, constitución y AGENTS.md (55:56 – 70:12)

- **AGENTS.md**: plantilla con descripción del proyecto en 2 frases, arquitectura/tecnologías, comandos, estilos y convenciones (versión de lenguaje, idioma del código en inglés y mensajes en español), reglas, límites y verificación obligatoria al terminar. Contiene lo mínimo para no sobrecargar al agente.
- Si no eres capaz de definir tu proyecto, "la IA te está dominando a ti".
- **Constitución** (`docs/constitution.md`): principios innegociables del proyecto, escritos una sola vez. Se genera con ayuda de la IA mediante un prompt (ej.: "Propón un constitution.md con 6 principios cortos y verificables que cubran simplicidad del stack, relación spec-código, separación lógica/interfaz, política de tests, persistencia…").
- Se trabaja en **modo plan** para revisar lo que la IA propone antes de aprobarlo.
- Si un agente usa su propio fichero (p. ej. `CLAUDE.md`), basta con que referencie a `AGENTS.md` como fuente de verdad.

### 10. Paso 2: La especificación (spec.md) (70:12 – 82:57)

- Se genera la spec con IA en modo plan, con un prompt tipo: *"No escribas código. Lee docs/constitution.md. Vamos a redactar la especificación de la primera funcionalidad… Hazme preguntas de una en una (máx. 6) para eliminar ambigüedades… Con mis respuestas, genera specs/001-habits-mvp/spec.md con contexto, usuarios, historias de usuario, requisitos funcionales con criterios de aceptación y notación EARS…"*
- La IA hace preguntas (¿qué es exactamente una "racha"?, ¿nombre único de hábito?, ¿qué mostrar en el listado?, ¿qué queda fuera del MVP?) y con las respuestas genera el documento.
- Las specs se numeran (`001`, `002`…) dentro de una carpeta `specs/`; un proyecto grande puede tener decenas y se implementan una a una.
- Consejo: usar el **modelo más potente disponible** para crear la spec, porque "sin una buena especificación no hay buen código".

### 11. Paso 3: Clarificación (82:57 – 85:43)

- Si la spec no convence, se itera: prompt de clarificación tipo *"Revisa la spec como si fueras un QA profesional. Lista ambigüedades, contradicciones, casos límite no cubiertos y conflictos con la constitución. No propongas soluciones todavía."*
- Se repite las veces necesarias hasta tener una especificación sólida.

### 12. Paso 4: El plan técnico (plan.md) (85:43 – 89:55)

- Con la spec cerrada (que habla de negocio, no de código), se genera `plan.md`: *"Lee la constitución y la especificación y no escribas código. Genera plan.md con estructura de módulos, modelo de datos JSON, algoritmo de cálculo, comandos, salidas y decisiones técnicas."*
- Aquí la IA empieza a pensar de forma técnica (módulos `storage`, `core`, `cli`, estrategia de tests…). El plan también admite clarificación/iteración.

### 13. Paso 5: Las tareas (tasks.md) (89:55 – 97:05)

- Prompt: *"A partir del spec y del plan, genera tasks.md con tareas pequeñas (20-30 min cada una), en orden de dependencia, cada una con los requisitos funcionales que cubre, con checkboxes verificables."*
- La IA ya ha leído spec + plan + constitución + AGENTS.md, así que sus propuestas son cada vez más deterministas. Incluso detecta huecos (p. ej., dónde guardar el fichero de datos).
- Resultado de ejemplo: 8-14 tareas (esqueleto del proyecto, storage, core, CLI, tests…). Filosofía **divide y vencerás**.
- **Trazabilidad**: cada tarea referencia los RF de la spec (ej.: T2 → RF9 y RF11 sobre el almacenamiento JSON).

### 14. Paso 6: Implementación (97:05 – 102:18)

- Prompt por tarea: *"Implementa solo la tarea T2 siguiendo plan y constitución. Escribe primero los tests, luego el código (TDD). Ejecuta los tests y muéstrame el resultado. Al terminar, marca T2 en tasks.md, indica qué RF cubre y párate: no empieces T3."*
- Se implementa tarea a tarea, verificando cada una. Los ficheros de la spec (spec.md, plan.md, tasks.md) se mantienen sincronizados con el código (enfoque mixto spec-first/spec-anchored).
- Ventaja clave: documentación completa e histórico de todas las decisiones → si aparece un bug, se revisa la spec, se corrige y se crea una nueva tarea.

### 15. Paso 7: Validación (102:18 – 104:56)

- Con todas las tareas completadas: *"Recorre la especificación requisito por requisito (RF1 a RF11). Para cada uno, indica qué test lo cubre y el resultado de ejecutarlo. Si alguno no está cubierto o falla, dilo claramente. Comprueba los criterios de finalización y da un veredicto: ¿está la spec cumplida?"*
- Si el veredicto es positivo, el ciclo SDD de esa especificación queda cerrado.

### 16. Paso 8: Iteración, cambios y nuevas tareas (104:56 – 107:30)

- Nueva funcionalidad o cambio → nueva spec (no se toca la constitución salvo cambios globales del proyecto). Se repite el bucle: especificación → clarificación → plan → tareas → implementación → validación.
- Se pueden referenciar specs anteriores, retocarlas, o crear tareas correctoras. El flujo es igual con 1 spec que con 50; cuando todas están validadas, el proyecto está completado.

### 17. El siguiente nivel: Skills, subagentes y MCPs (107:30 – 117:06)

- **Skills**: procedimientos reutilizables empaquetados para no repetir prompts. Ejemplo del curso: skill `spec-generator` que guía la creación de specs (lee la constitución, numera la siguiente spec, sigue la plantilla, hace preguntas). Se pueden crear skills para cada fase (spec, clarificación, plan, tasks, implementación, validación).
- Revelación: **los frameworks como Spec Kit, BMAD u OpenSpec son, por debajo, prompts y skills**. Entendiendo el flujo puedes crearlos tú mismo, sin casarte con ningún framework que mañana puede desaparecer.
- **Subagentes**: agentes especializados con su propio contexto y system prompt (p. ej., un agente experto en SDD que ya conoce las skills y contextos a leer).
- **MCPs**: conectar el agente con herramientas externas (p. ej., Jira) para leer historias de usuario, generar specs, implementar y marcar la tarea como completada automáticamente.

### 18. Conclusiones y recursos (117:06 – 123:16)

- Recap: SDD = ciclo de vida del software de siempre adaptado a la IA; la solución al vibe coding sin control.
- Tres niveles de SDD; recomendado el punto medio entre **spec-first y spec-anchored**.
- Flujo: **Constitución → Spec → Clarificación → Plan → Tareas → Implementación → Validación**, con el humano siempre en el medio (*human in the loop*): revisando antes y después de que la IA ejecute.
- La IA puede equivocarse o "mentir": hay que revisar planes, specs, código y tests.
- Lo que antes llevaba días ahora lleva un 10-20% del tiempo; el valor del programador está donde la IA no aporta: el criterio. *"Tu jefe no va a despedir a la IA si falla; te va a despedir a ti."*
- Ejercicio propuesto: rehacer el proyecto Habits CLI desde cero siguiendo el flujo, sin copiar el código.
- Recursos: repo `github.com/mouredev/hello-sdd` (templates, prompts, proyecto final), guía de Markdown y cursos de agentes (Claude Code, OpenCode, Cursor…) en el canal, y la plataforma MoureDev Pro.

---

## Ideas clave (takeaways)

1. **La IA no sustituye la ingeniería de software; la evoluciona.** El programador con criterio sigue siendo la pieza central.
2. **Primero la especificación, luego el código.** La spec define el *qué* y el *porqué*; es el artefacto principal para comunicarse con la IA y convertir resultados indeterministas en deterministas.
3. **SDD es el ciclo de vida clásico con IA**: constitución, especificación, clarificación, plan, tareas, implementación, validación — en bucle.
4. **El vibe coding sirve para prototipos desechables, no para software profesional.**
5. **Aprende el método, no el framework**: Spec Kit, OpenSpec, BMAD, Kiro… son solo prompts y skills automatizados, y la mayoría desaparecerán.
6. **Human in the loop**: revisa todo lo que genera la IA. La responsabilidad final es tuya.
7. **AGENTS.md, Markdown y notación EARS** son herramientas básicas del flujo.
8. El siguiente nivel: **skills, subagentes y MCPs** para automatizar y especializar tu propio flujo SDD.

---

*Resumen generado a partir de los subtítulos automáticos del vídeo (en español), organizado según los capítulos oficiales.*
