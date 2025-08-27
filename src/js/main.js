// ==============================
// Config
// ==============================

// Adresse de l'instance Ollama locale (127.0.0.1 évite certains soucis IPv6)
const OLLAMA_URL = "http://127.0.0.1:11434";

// Point d'API utilisé : /api/generate (stream NDJSON)
const OLLAMA_ENDPOINT = `${OLLAMA_URL}/api/generate`;

// Modèle par défaut (léger pour 8 Go RAM)
const DEFAULT_MODEL = "gemma:2b";

// ==============================
// Sélecteurs & helpers UI
// ==============================

const messagesEl = document.getElementById("messages");
const form = document.getElementById("search-form");
const input = document.getElementById("question-input");
const modelSelect = document.getElementById("model-select");

function el(tag, className, text){
  const n = document.createElement(tag);
  if(className) n.className = className;
  if(text != null) n.textContent = text;
  return n;
}

function makeMessage(role, text, isStreaming = false){
  const wrap = el("div", `msg ${role}`);
  const roleLine = el("div", "role");
  roleLine.append(el("span","dot"));
  roleLine.append(el("span","who", role === "user" ? "Vous" : "Bee-bot"));
  const content = el("div","text", text || "");
  wrap.append(roleLine, content);

  if(isStreaming){
    const loader = el("span", "loader");
    loader.innerHTML = "<span></span><span></span><span></span>";
    content.append(" ", loader);
    wrap.loader = loader;
  }
  return wrap;
}

function appendMessage(node){
  messagesEl.append(node);
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
}

function stopLoader(node){
  if(node && node.loader){
    node.loader.remove();
    delete node.loader;
  }
}

// ==============================
// Ping santé (diagnostic rapide en console)
// ==============================
(async () => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/version`, { method: "GET" });
    if (!r.ok) throw new Error("Bad status " + r.status);
    console.log("Ollama API OK:", await r.text());
  } catch (e) {
    console.warn("Ollama API injoignable:", e);
  }
})();

// ==============================
// Appel Ollama (streaming /api/generate)
// ==============================
async function askOllama(prompt, model = DEFAULT_MODEL){
  const res = await fetch(OLLAMA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: true })
  });

  if(!res.ok){
    const text = await res.text().catch(()=> "");
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  return {
    async *stream(){
      while(true){
        const { done, value } = await reader.read();
        if(done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for(const line of lines){
          if(!line.trim()) continue;
          try{
            const json = JSON.parse(line);
            if(typeof json.response === "string"){
              yield json.response;
            }
            if(json.done){ return; }
          }catch(_){}
        }
      }
      if(buffer.trim()){
        try{
          const json = JSON.parse(buffer.trim());
          if(typeof json.response === "string"){ yield json.response; }
        }catch(_){}
      }
    }
  };
}

// ==============================
// Submit handler
// ==============================
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = (input.value || "").trim();
  if(!question) return;

  const model = (modelSelect && modelSelect.value) ? modelSelect.value : DEFAULT_MODEL;

  // Message user
  const userMsg = makeMessage("user", question);
  appendMessage(userMsg);

  // Placeholder bot
  const botMsg = makeMessage("bot", "", true);
  appendMessage(botMsg);

  // Reset input
  input.value = "";
  input.focus();

  try{
    const streamResp = await askOllama(question, model);
    let accumulated = "";
    for await (const chunk of streamResp.stream()){
      accumulated += chunk;
      botMsg.querySelector(".text").textContent = accumulated;
    }
    stopLoader(botMsg);
  }catch(err){
    stopLoader(botMsg);
    const maybeCORS = (err instanceof TypeError);
    botMsg.querySelector(".text").textContent =
      "Désolé, je n’ai pas pu contacter Bee-bot.\n" +
      `• API: ${OLLAMA_URL}\n` +
      `• Modèle: ${model}\n` +
      "• Vérifiez que le modèle est présent (`ollama list`) et que la page est servie via http://localhost (pas file://)\n" +
      (maybeCORS ? "• Indice: erreur de type réseau/CORS côté navigateur." : "");
    console.error(err);
  }
});

// Accessibilité: Esc pour quitter le champ
input.addEventListener("keydown", (e) => { if(e.key === "Escape"){ input.blur(); } });
