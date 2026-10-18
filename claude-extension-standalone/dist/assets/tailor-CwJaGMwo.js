import{c as E,p as b}from"./api-BE5aEraI.js";import{m as N,l as T}from"./i18n-rb8SFTAW.js";function A(t){return t.replace(/[^\p{L}\p{N}_+#./ -]+/gu," ").split(/\s+/).map(e=>e.replace(/^[./-]+|[./-]+$/g,"")).filter(e=>e.length>1)}function O(t,e=40){const n=A(t),i=new Map,a=(r,s)=>i.set(r,(i.get(r)??0)+s);for(let r=0;r<n.length;r++){const s=n[r],l=s.toLowerCase();if(N.has(l))continue;const f=new RegExp("\\p{Lu}.*\\p{Lu}|[+#.]|\\d","u").test(s)||new RegExp("^\\p{Lu}\\p{Ll}+\\p{Lu}","u").test(s);a(l,f?2:1);const c=n[r+1];c&&!N.has(c.toLowerCase())&&a(`${l} ${c.toLowerCase()}`,1.5)}return[...i.entries()].filter(([r,s])=>s>=2&&r.length>2).sort((r,s)=>s[1]-r[1]).slice(0,e).map(([r])=>r)}function M(t){const e=new Set;for(const n of A(t))(new RegExp("\\p{Lu}.*\\p{Lu}|[+#]|\\.\\p{L}|\\d","u").test(n)||new RegExp("^\\p{Lu}\\p{Ll}+\\p{Lu}","u").test(n))&&e.add(n.toLowerCase());return[...e]}function Y(t){return[t.summary,t.skills.join(" "),...t.work.flatMap(e=>[e.title,e.company,...e.bullets]),...t.education.flatMap(e=>[e.degree,e.field,e.school]),...t.certifications.map(e=>e.name)].join(` 
 `).toLowerCase()}function g(t,e){const n=t.toLowerCase();return e.reduce((i,a,r)=>n.includes(a)?i+(e.length-r):i,0)}function I(t,e,n="",i="en"){var c,h,d;const a=O(`${e.title}
${e.description}`),r={};for(const u of t.work)r[u.id]=[...u.bullets].sort((m,y)=>g(y,a)-g(m,a));const s=[...t.skills].sort((u,m)=>g(m,a)-g(u,a)),l=`${t.personal.firstName} ${t.personal.lastName}`.trim(),f=n.trim()||`Dear Hiring Team,

I am applying for the ${e.title} role (${e.reqId}). ${t.summary}

In my recent work as ${((c=t.work[0])==null?void 0:c.title)??"a professional"} at ${((h=t.work[0])==null?void 0:h.company)??"my current company"}, ${(r[((d=t.work[0])==null?void 0:d.id)??""]??[])[0]??""}

I would welcome the chance to discuss how I can contribute.

Sincerely,
${l}`;return{summary:t.summary,skills:s,roles:r,coverLetter:f,keywords:a,warnings:[],method:"keyword"}}const x=`You tailor a candidate's CV and cover letter to a job description for a Workday ATS application.
HARD RULES:
- The MASTER PROFILE is the only source of facts. Never add employers, titles, dates, degrees, certifications, tools, skills, metrics or numbers that are not in it.
- You may reorder, shorten and reword bullets, and use the job description's exact wording for things the profile already shows.
- Skills must be a subset of the profile's skills, ordered by relevance to the job.
- Keep every role; 3–6 bullets per role, each one line or two, starting with a strong verb, outcome first.
- Summary: 2–3 sentences around the job title and the top must-haves the candidate genuinely meets.
- Cover letter: 250–350 words, 3–4 paragraphs, plain text, no placeholders, signed with the candidate's name. If a BASE COVER LETTER is given, keep its voice and structure and adapt it to this job.
- LANGUAGE: write the summary, bullets and cover letter in the OUTPUT LANGUAGE given in the request (translate faithfully from the profile; keep product, tool and company names as they are). Skills keep the profile's exact wording.
Return ONLY JSON: {"summary": string, "skills": string[], "roles": {"<work id>": string[]}, "coverLetter": string}`;function U(t,e,n,i="",a=!1){var S;const r=Y(t),s=[],l=(a?M(i):e).filter(o=>!r.includes(o)),f=new Map(t.skills.map(o=>[o.toLowerCase(),o])),c=(n.skills??[]).filter(o=>{const p=f.has(String(o).toLowerCase());return p||s.push(`Dropped skill not in your profile: ${o}`),p});for(const o of t.skills)c.some(p=>p.toLowerCase()===o.toLowerCase())||c.push(o);const h={};for(const o of t.work){const p=w=>(w.match(/\d[\d,.\s]*%?/g)??[]).map(k=>k.replace(/[^\d%]/g,"")).filter(Boolean),R=new Set(p(o.bullets.join(" "))),$=(Array.isArray((S=n.roles)==null?void 0:S[o.id])?n.roles[o.id]:[]).filter(w=>{const k=String(w).toLowerCase(),C=l.find(L=>k.includes(L)),v=p(String(w)).find(L=>!R.has(L));return C||v?(s.push(`${o.company}: dropped a bullet that added "${C??v}" (not in your profile)`),!1):!0});h[o.id]=$.length>=Math.min(2,o.bullets.length)?$:o.bullets}let d=String(n.summary??"");const u=l.find(o=>d.toLowerCase().includes(o));(u||!d)&&(u&&s.push(`Summary mentioned "${u}" (not in your profile); kept your original summary`),d=t.summary);let m=String(n.coverLetter??"");const y=l.filter(o=>m.toLowerCase().includes(o));return y.length&&s.push(`Cover letter mentions ${y.map(o=>`"${o}"`).join(", ")}, which your profile doesn't show — edit before approving`),/\[[A-Z][^\]]*\]/.test(m)&&s.push("Cover letter still contains a [placeholder]"),{summary:d,skills:c,roles:h,coverLetter:m,keywords:e,warnings:s,method:"llm"}}function J(t,e="auto"){return e&&e!=="auto"?e:t.language||"en"}async function B(t,e,n="",i=J(e)){const a=O(`${e.title}
${e.description}`),r=`OUTPUT LANGUAGE: ${T[i]??i}
JOB: ${e.title} (${e.reqId}) — ${e.location}
JOB DESCRIPTION:
"""${e.description.slice(0,12e3)}"""

MASTER PROFILE (JSON):
${JSON.stringify({summary:t.summary,skills:t.skills,work:t.work,education:t.education,certifications:t.certifications,name:`${t.personal.firstName} ${t.personal.lastName}`})}
${n.trim()?`
BASE COVER LETTER:
"""${n.slice(0,6e3)}"""
`:""}
Return the JSON now.`;try{const s=await E(r,{system:x,json:!0,maxTokens:4e3});return U(t,a,b(s),e.description,i!=="en")}catch(s){const l=I(t,e,n,i);return i!=="en"&&l.warnings.push(`Without the AI, your CV content stays in its original language (job is in ${T[i]??i}).`),l.warnings.push(`AI tailoring unavailable (${s.message}); used keyword ordering instead.`),l}}const G=`Convert the CV text into this exact JSON shape. Copy facts verbatim; never invent. Unknown fields = "" or [].
Dates as "YYYY-MM" (or "YYYY" if only the year is known). Most recent role first.
{"personal":{"firstName":"","lastName":"","email":"","phone":{"countryName":"","countryCode":"","number":"","deviceType":"Mobile"},"address":{"line1":"","line2":"","city":"","region":"","postalCode":"","country":""},"linkedin":"","website":"","github":""},
"summary":"","skills":[],"work":[{"id":"w1","title":"","company":"","location":"","start":"","end":"","current":false,"bullets":[]}],
"education":[{"id":"e1","school":"","degree":"","field":"","gpa":"","start":"","end":""}],
"certifications":[{"name":"","issuer":"","issued":""}],"languages":[{"language":"","proficiency":"","native":false}]}
Return ONLY the JSON.`;async function F(t){const e=await E(`CV TEXT:
"""${t.slice(0,16e3)}"""`,{system:G,json:!0,maxTokens:4e3});return b(e)}export{J as d,O as e,F as p,B as t};
//# sourceMappingURL=tailor-CwJaGMwo.js.map
