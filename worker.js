export default {
  async fetch(request, env) {
    // Configuración de CORS para que tus páginas web puedan hablar con él
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'text/plain;charset=UTF-8'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers });

    // 1. OBTENER LA PREGUNTA DEL USUARIO
    let pregunta = "";
    let contextoAcademico = "";

    if (request.method === 'POST') {
      try { 
        const body = await request.json(); 
        if (body.pregunta) pregunta = body.pregunta; 
      } catch(e) {}
    } else {
      // Si es GET (tipo /ask?q=...), lo tomamos de la URL
      const url = new URL(request.url);
      pregunta = url.searchParams.get('q') || "";
    }

    if (!pregunta) return new Response("Por favor, escribe una pregunta.", { headers, status: 400 });

    // =====================================================================
    // 2. EL AGENTE BUSCA EN LAS 12 FUENTES (FASE DE INVESTIGACIÓN)
    // =====================================================================
    try {
      // Búsqueda rápida en 3 fuentes principales para tener contexto académico
      const resultados = await Promise.allSettled([
        fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(pregunta)}&limit=3&fields=title,abstract`).then(r => r.json()),
        fetch(`https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(pregunta)}&limit=3`).then(r => r.json()),
        fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(pregunta)}&max_results=3`).then(r => r.text())
      ]);

      // Procesamos los resultados de Semantic Scholar
      if (resultados[0].status === 'fulfilled' && resultados[0].value.data) {
        const data = resultados[0].value.data;
        contextoAcademico += `\n📚 SEMANTIC SCHOLAR (${data.length} resultados):\n`;
        data.slice(0, 2).forEach(p => {
          contextoAcademico += `• Título: ${p.title}\n  Resumen: ${p.abstract?.substring(0, 200)}...\n`;
        });
      }

      // Procesamos los resultados de CORE
      if (resultados[1].status === 'fulfilled' && resultados[1].value.results) {
        const data = resultados[1].value.results;
        contextoAcademico += `\n📖 CORE PAPERS (${data.length} resultados):\n`;
        data.slice(0, 2).forEach(p => {
          contextoAcademico += `• Título: ${p.title}\n  Resumen: ${p.abstract?.substring(0, 200)}...\n`;
        });
      }

      // Procesamos los resultados de arXiv (XML)
      if (resultados[2].status === 'fulfilled') {
        const xmlText = resultados[2].value;
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, 'text/xml');
        const entries = xml.querySelectorAll('entry');
        contextoAcademico += `\n📐 ARXIV (${entries.length} resultados):\n`;
        entries.forEach((entry, i) => {
          if (i >= 2) return;
          const title = entry.querySelector('title')?.textContent?.trim() || 'Sin título';
          const summary = entry.querySelector('summary')?.textContent?.trim()?.substring(0, 200) || '';
          contextoAcademico += `• Título: ${title}\n  Resumen: ${summary}...\n`;
        });
      }

    } catch (e) {
      contextoAcademico = "\n[Error al consultar fuentes externas, usando conocimiento base.]\n";
    }

    // =====================================================================
    // 3. EL AGENTE LE ENVÍA LA INFORMACIÓN A OLLAMA IA (MISTRAL)
    // =====================================================================
    const promptFinal = `Contexto académico:\n${contextoAcademico}\n\n---\nPregunta del usuario: ${pregunta}\n---\nInstrucciones OBLIGATORIAS:\n1. Escríbelo TODO en ESPAÑOL.\n2. Estructura la respuesta con: "Introducción:", "Desarrollo:" (con al menos 3 subpuntos numerados 1., 2., 3.) y "Conclusión:".\n3. Incluye citas APA 7 básicas.\n4. Asegúrate de que el texto NO se corte y que la "Conclusión:" esté siempre al final.`;

    const respuestaOllama = await fetch('https://ollama-ai.odandoolugan.workers.dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta: promptFinal })
    });

    if (!respuestaOllama.ok) {
      return new Response("Error al conectar con Ollama IA", { headers, status: 500 });
    }

    const textoFinal = await respuestaOllama.text();

    // 4. DEVOLVER LA RESPUESTA A LA PÁGINA WEB
    return new Response(textoFinal, { headers });
  }
};
