import{g as d,d as m}from"./storage-CQj3GmSD.js";const h=`You are an AI assistant running in a browser extension side panel.

You have access to the content of the user's current web page (title, URL, selected text, and a simplified text snapshot). Use it to summarize, rewrite, explain, extract, translate, or answer questions.

Operating principles:
- If the user selects text, focus on that selection unless they say otherwise.
- When summarizing, produce tight bullet points.
- When extracting data, return clean markdown or JSON.
- Keep replies short enough to fit comfortably in a side panel.`;function u(e,t){let n=h;return e.systemAddendum.trim()&&(n+=`

${e.systemAddendum.trim()}`),t.url&&(n+=`

<page_context>
URL: ${t.url}
Title: ${t.title??""}
Selection: ${t.selection??""}
---
${(t.text_snapshot??"").slice(0,8e3)}
</page_context>`),n}async function k(e,t={}){const n=await d();if(t.url)try{const r=new URL(t.url).host;if(n.disabledHosts.some(s=>r.includes(s)))throw new Error(`Disabled on this host (${r}). Edit options to re-enable.`)}catch{}let o;switch(n.backend){case"ollama":o=await p(e,t,n);break;case"claudeai":o=await w(e,t);break;case"anthropic":o=await y(e,t,n);break;default:throw new Error(`Unknown backend: ${n.backend}`)}return await m({id:crypto.randomUUID(),at:Date.now(),url:t.url,title:t.title,prompt:e,reply:o.reply,model:o.model,backend:n.backend}),o}async function p(e,t,n){var c;const o=n.ollamaUrl.replace(/\/$/,"")+"/api/chat",r=u(n,t),s={model:n.model,stream:!1,messages:[{role:"system",content:r},{role:"user",content:e}]};let a;try{a=await fetch(o,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(s)})}catch(l){throw new Error(`Can't reach Ollama at ${n.ollamaUrl}. Is it running? Install from https://ollama.com/download and run \`ollama serve\`. (${l.message})`)}if(!a.ok){const l=await a.text();throw a.status===404&&/model/i.test(l)?new Error(`Model "${n.model}" isn't pulled yet. Run: ollama pull ${n.model.split(":")[0]}`):new Error(`Ollama error ${a.status}: ${l}`)}const i=await a.json();return{reply:((c=i.message)==null?void 0:c.content)??"",model:i.model??n.model,backend:"ollama"}}async function w(e,t){const n=[e];t.url&&n.push(`

Context: I'm reading ${t.title??""} at ${t.url}.`),t.selection&&n.push(`

Selected text:
"""${t.selection.slice(0,4e3)}"""`);const r=`https://claude.ai/new?q=${encodeURIComponent(n.join(""))}`;return await chrome.tabs.create({url:r}),{reply:"Opened Claude.ai in a new tab with your prompt. Continue the conversation there.",model:"claudeai",backend:"claudeai"}}async function y(e,t,n){if(!n.anthropicApiKey)throw new Error("Anthropic mode requires an API key. Paste one in the options page, or switch to Ollama (local, no key).");const o=u(n,t),r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":n.anthropicApiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:n.model,max_tokens:n.anthropicMaxTokens,system:o,messages:[{role:"user",content:e}]})});if(!r.ok)throw new Error(`Anthropic ${r.status}: ${await r.text()}`);const s=await r.json();return{reply:s.content.filter(i=>i.type==="text").map(i=>i.text??"").join(`
`),model:s.model,backend:"anthropic"}}async function b(){const[e]=await chrome.tabs.query({active:!0,currentWindow:!0});if(!(e!=null&&e.id)||!e.url||!/^https?:/.test(e.url))return{url:e==null?void 0:e.url,title:e==null?void 0:e.title};try{const[{result:t}]=await chrome.scripting.executeScript({target:{tabId:e.id},func:f});return{url:e.url,title:e.title,selection:t==null?void 0:t.selection,text_snapshot:t==null?void 0:t.text}}catch{return{url:e.url,title:e.title}}}function f(){var o;const e=(((o=window.getSelection())==null?void 0:o.toString())??"").trim(),t=document.body.cloneNode(!0);t.querySelectorAll("script, style, noscript, iframe, svg, canvas, video, audio").forEach(r=>r.remove());const n=(t.innerText||t.textContent||"").replace(/\n{3,}/g,`

`).slice(0,2e4);return{selection:e,text:n}}export{k as a,b as c};
//# sourceMappingURL=page-reader-Cd_NzbXZ.js.map
