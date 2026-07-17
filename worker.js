# En Codespace, crear el archivo
cat > worker.js << 'EOF'
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method === 'GET') {
      return new Response(`<!DOCTYPE html>
<html>
<head>
  <title>🧠 Wikipedia IA - 403M Datos</title>
  <style>
    body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; background: #0d1117; color: #f0f6fc; }
    h1 { color: #58a6ff; }
    input { width: 70%; padding: 12px; background: #161b22; border: 1px solid #30363d; color: white; border-radius: 6px; font-size: 16px; }
    button { padding: 12px 24px; background: #238636; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
    button:hover { background: #2ea043; }
    #respuesta { margin-top: 20px; padding: 20px; background: #161b22; border-radius: 8px; border: 1px solid #30363d; white-space: pre-wrap; min-height: 100px; }
    .fuente { color: #58a6ff; }
    .categoria { color: #f0883e; }
  </style>
</head>
<body>
  <h1>🧠 Wikipedia IA - 403M+ Datos</h1>
  <p>Pregunta sobre cualquier tema</p>
  <div>
    <input type="text" id="pregunta" placeholder="Ej: ¿Qué es inteligencia artificial?" size="50">
    <button onclick="preguntar()">Preguntar</button>
  </div>
  <div id="respuesta"></div>
  <script>
  async function preguntar() {
    const pregunta = document.getElementById('pregunta').value;
    const respuestaDiv = document.getElementById('respuesta');
    if (!pregunta.trim()) return alert('Escribe una pregunta');
    respuestaDiv.innerHTML = '⏳ Pensando...';
    try {
      const response = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: pregunta })
      });
      const data = await response.json();
      if (data.error) {
        respuestaDiv.innerHTML = '❌ Error: ' + data.error;
      } else {
        let html = data.answer || 'No se recibió respuesta';
        if (data.fuentes && data.fuentes.length > 0) {
          html += '\\n\\n📚 Fuentes encontradas:\\n';
          data.fuentes.forEach(f => {
            html += '  • ' + f.titulo;
            if (f.categoria) html += ' <span class="categoria">[' + f.categoria + ']</span>';
            html += '\\n';
          });
        }
        respuestaDiv.innerHTML = html;
      }
    } catch (error) {
      respuestaDiv.innerHTML = '❌ Error: ' + error.message;
    }
  }
  </script>
</body>
</html>`, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    if (request.method === 'POST') {
      try {
        const { question } = await request.json();
        let context = '';
        let fuentes = [];

        if (env.DB) {
          const results = await env.DB.prepare(
            'SELECT titulo, contenido, categoria FROM contenido WHERE contenido LIKE ? OR titulo LIKE ? LIMIT 5'
          ).bind(`%${question}%`, `%${question}%`).all();

          if (results.results && results.results.length > 0) {
            fuentes = results.results.map(r => ({ titulo: r.titulo, categoria: r.categoria || 'General' }));
            context = results.results.map(r =>
              `📌 ${r.titulo}${r.categoria ? ' ('+r.categoria+')' : ''}\\n${r.contenido}`
            ).join('\\n\\n---\\n\\n');
          }
        }

        if (!context) context = 'Usa tu conocimiento general sobre el tema.';

        const systemPrompt = `Eres un asistente experto en Wikipedia con acceso a 403M+ datos.

Contexto disponible:
${context}

Responde la pregunta de manera clara, educativa y en español.
Si el contexto tiene información relevante, úsala.
Si no, usa tu conocimiento general.`;

        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: question }],
          max_tokens: 1000,
          temperature: 0.7
        });

        return Response.json({ answer: response.response || 'No se pudo generar respuesta', fuentes: fuentes }, {
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return Response.json({ error: error.message }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Método no permitido', { status: 405 });
  }
};
EOF


# Agregar el archivo
git add worker.js

# Commit
git commit -m "Agregar Worker con modelo Llama 3.1"

# Push
git push origin main
