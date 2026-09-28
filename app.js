const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const qClass=q=>q==="现在投"?"ready":q==="准备后投"?"prep":q==="观察"?"watch":"closed";
const qRank={"现在投":0,"准备后投":1,"观察":2,"已关闭":3};
let DATA={jobs:[],gaps:[],changes:[],profile:{}};

const b64ToBytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hexToBytes=h=>new Uint8Array(h.match(/.{2}/g).map(x=>parseInt(x,16)));
const bytesToHex=a=>[...a].map(b=>b.toString(16).padStart(2,"0")).join("");

async function deriveKeyBytes(code){
  return new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(code)));
}
async function loadEncryptedPayload(){
  const res=await fetch("./radar.enc.json?ts="+Date.now(),{cache:"no-store"});
  if(!res.ok) throw new Error("payload");
  return res.json();
}
async function decryptRadar(keyBytes){
  const payload=await loadEncryptedPayload();
  const key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["decrypt"]);
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64ToBytes(payload.iv)},key,b64ToBytes(payload.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}
function unlock(data,keyBytes){
  document.body.classList.remove("locked");
  $("#authGate").hidden=true;
  if(keyBytes) sessionStorage.setItem("careerRadarKey",bytesToHex(keyBytes));
  initWithData(data);
}
async function setupAuth(){
  const stored=sessionStorage.getItem("careerRadarKey");
  if(stored){
    try{const kb=hexToBytes(stored);unlock(await decryptRadar(kb),kb);return;}
    catch{sessionStorage.removeItem("careerRadarKey");}
  }
  $("#authForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const input=$("#authCode"),msg=$("#authMessage"),button=e.currentTarget.querySelector("button");
    button.disabled=true;msg.textContent="验证中…";
    try{
      const kb=await deriveKeyBytes(input.value.trim());
      const data=await decryptRadar(kb);
      msg.textContent="";
      unlock(data,kb);
    }catch{
      msg.textContent="口令不正确";
      input.value="";
      input.focus();
    }finally{button.disabled=false;}
  });
}

function options(el,values){
  [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-CN")).forEach(v=>{
    const o=document.createElement("option");o.value=v;o.textContent=v;el.appendChild(o);
  });
}
function renderStats(jobs){
  const counts={"现在投":0,"准备后投":0,"观察":0,"已关闭":0};
  jobs.forEach(j=>counts[j.queue]=(counts[j.queue]||0)+1);
  $("#stats").innerHTML=[
    ["现在投",counts["现在投"],"ready"],["准备后投",counts["准备后投"],"prep"],
    ["观察",counts["观察"],"watch"],["已关闭",counts["已关闭"],"closed"]
  ].map(([k,v,t])=>`<article class="stat" data-tone="${t}"><b>${v}</b><span>${k}</span></article>`).join("");
}
function filtered(){
  const s=$("#searchInput").value.trim().toLowerCase(),q=$("#queueFilter").value,r=$("#routeFilter").value,c=$("#companyFilter").value;
  let arr=DATA.jobs.filter(j=>(!q||j.queue===q)&&(!r||j.route===r)&&(!c||j.company===c));
  if(s) arr=arr.filter(j=>[j.company,j.title,j.location,j.route,j.gap,j.next,j.status].join(" ").toLowerCase().includes(s));
  const sort=$("#sortBy").value;
  arr.sort((a,b)=>{
    if(sort==="score") return b.score-a.score;
    if(sort==="confidence") return b.confidence-a.confidence||b.score-a.score;
    if(sort==="company") return a.company.localeCompare(b.company,"zh-CN")||b.score-a.score;
    return qRank[a.queue]-qRank[b.queue]||b.score-a.score;
  });
  return arr;
}
function card(j){
  const metrics=[["匹配",j.fit],["作品集",j.portfolio],["暑期可行",j.availability],["战略",j.strategy],["证据",j.confidence]];
  const src=j.officialSource?`<a href="${esc(j.officialSource)}" target="_blank" rel="noreferrer">官方来源 ↗</a>`:"";
  const src2=j.secondarySource?`<span class="pill">次级来源：${esc(j.secondarySource)}</span>`:"";
  return `<article class="job-card" style="--score:${Math.max(0,Math.min(100,j.score))}%">
    <div class="job-main" role="button" tabindex="0" aria-expanded="false">
      <div>
        <div class="company-line"><strong>${esc(j.company)}</strong><span>·</span><span>${esc(j.route)}</span><span class="pill">${esc(j.urgency)}</span></div>
        <div class="job-title">${esc(j.title)}</div>
        <div class="meta"><span>${esc(j.type)}</span><span>· ${esc(j.graduation)}</span><span>· ${esc(j.location)}</span><span>· ${esc(j.deadline)}</span></div>
      </div>
      <div class="score-block"><div class="score">${j.score}<small>/100</small></div><div class="queue ${qClass(j.queue)}">${esc(j.queue)}</div></div>
    </div>
    <div class="meter"><i></i></div>
    <div class="job-detail">
      <div class="metric-grid">${metrics.map(([n,v])=>`<div class="metric"><b>${v}</b><span>${n}</span></div>`).join("")}</div>
      <div class="detail-grid">
        <div class="detail-box"><label>官方状态</label><p>${esc(j.status)}</p></div>
        <div class="detail-box"><label>最后核验</label><p>${esc(j.verified)}</p></div>
        <div class="detail-box"><label>主要缺口</label><p>${esc(j.gap)}</p></div>
        <div class="detail-box"><label>下一步</label><p>${esc(j.next)}</p></div>
        <div class="detail-box"><label>备注</label><p>${esc(j.note||"—")}</p></div>
        <div class="detail-box"><label>为什么不由紧急度决定</label><p>综合分只看长期匹配与执行条件；截止日期只影响提醒，不抬高匹配分。</p></div>
      </div>
      <div class="source-row">${src}${src2}</div>
    </div>
  </article>`;
}
function bindCards(){
  document.querySelectorAll(".job-card .job-main").forEach(el=>{
    const toggle=()=>{const c=el.closest(".job-card");const open=c.classList.toggle("open");el.setAttribute("aria-expanded",open)};
    el.addEventListener("click",toggle);el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle()}});
  });
}
function renderJobs(){
  const arr=filtered();$("#resultCount").textContent=arr.length;$("#jobList").innerHTML=arr.map(card).join("");$("#emptyState").hidden=arr.length!==0;bindCards();
}
function renderSide(){
  const act=DATA.jobs.filter(j=>j.queue==="现在投"||j.queue==="准备后投").sort((a,b)=>qRank[a.queue]-qRank[b.queue]||b.score-a.score).slice(0,6);
  $("#actionQueue").innerHTML=act.length?act.map(j=>`<div class="action-item"><b>${esc(j.company)} · ${esc(j.title)}</b><span>${esc(j.queue)} · ${j.score}分 · ${esc(j.next)}</span></div>`).join(""):`<div class="change-item">目前没有“现在投”。雷达不会为了凑数量强推岗位。</div>`;
  $("#gapList").innerHTML=DATA.gaps.map(g=>`<div class="gap-item"><b>${esc(g.name)} <span>· ${esc(g.priority)}</span></b><span>${esc(g.action)}</span><div class="gap-bar"><i style="width:${g.level}%"></i></div></div>`).join("");
  $("#changeList").innerHTML=DATA.changes.slice(0,5).map(c=>`<div class="change-item"><strong>${esc(c.time)}</strong><br>${esc(c.text)}</div>`).join("");
}
function initWithData(data){
  try{
    DATA=data;
    $("#syncLabel").textContent="雷达在线";$("#lastUpdated").textContent="最后更新 "+DATA.meta.lastUpdated;
    $("#missionTitle").textContent=DATA.profile.mission;$("#missionText").textContent=DATA.profile.description;
    $("#routeTags").innerHTML=DATA.profile.routes.map(r=>`<span class="tag">${esc(r)}</span>`).join("");
    options($("#queueFilter"),DATA.jobs.map(j=>j.queue));options($("#routeFilter"),DATA.jobs.map(j=>j.route));options($("#companyFilter"),DATA.jobs.map(j=>j.company));
    renderStats(DATA.jobs);renderSide();renderJobs();
    ["searchInput","queueFilter","routeFilter","companyFilter","sortBy"].forEach(id=>$("#"+id).addEventListener(id==="searchInput"?"input":"change",renderJobs));
  }catch(e){$("#syncLabel").textContent="数据读取失败";$("#lastUpdated").textContent="请刷新页面重试";$("#emptyState").hidden=false;$("#emptyState").textContent="jobs.json 暂时不可用。"}
}
setupAuth();