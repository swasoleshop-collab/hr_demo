/* =====================================================================
   HR System - app logic (Supabase version)
   ===================================================================== */

/* ===== 1. Your Supabase project (Project Settings > API) ===== */
const SUPABASE_URL = "https://phxughumjmqwckepkosu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SgzsNeMWaaL-8ehfgvqMQA_z9lLuMHw";   // publishable key. NEVER the secret / service_role key.
const BUCKET = "hr-docs";

/* ===== 2. Company settings ===== */
const COMPANY = "Gangeshwar Agro Foods";
const PLANT = "Bijnor plant, fries line expansion";
const EXISTING_STAFF = 150;
const TARGET = 300;
const IDLE_MINUTES = 30;          // sign out after this many minutes without activity

const STAGES = ["Applied","Screening","Interview","Offer","Joined","Rejected"];
const DEPTS = [
  {name:"Production", openings:80, roles:["Line Operator","Fryer Operator","Packing Operator","Shift Supervisor"]},
  {name:"Quality & Food Safety", openings:15, roles:["QA Executive","Lab Technician"]},
  {name:"Maintenance", openings:20, roles:["Electrician","Fitter","Refrigeration Technician"]},
  {name:"Stores & Logistics", openings:18, roles:["Store Assistant","Forklift Operator","Export Documentation Executive"]},
  {name:"Agri & Grower Relations", openings:10, roles:["Field Officer"]},
  {name:"HR & Admin", openings:7, roles:["HR Executive"]}
];
const SHIFTS = ["Shift A (6am to 2pm)","Shift B (2pm to 10pm)","Shift C (10pm to 6am)","General"];
const SOURCES = ["Walk-in","Referral","Naukri","ITI campus","LinkedIn","Contractor"];
const CHECKS = [
  ["docs","ID and address documents"],["bank","Bank and PF/UAN details"],["esic","ESIC form"],
  ["medical","Medical fitness"],["hygiene","Hygiene and GMP training"],["safety","Safety induction"],
  ["ppe","PPE and uniform issued"],["idcard","ID card issued"],["appointment","Appointment letter issued"]
];
const DOC_TYPES = ["Aadhaar card","PAN card","Bank passbook","Photo","Medical certificate","Education certificate","Offer letter (signed)","Appointment letter (signed)","Other"];
const ROUTES = [
  {id:"R1", name:"Route 1, Bijnor town", stops:"Bijnor bus stand, Jhalu, Mahmoodpur", capacity:40},
  {id:"R2", name:"Route 2, Chandpur", stops:"Chandpur, Haldaur, Noorpur", capacity:32},
  {id:"R3", name:"Route 3, Najibabad", stops:"Najibabad, Kiratpur", capacity:32},
  {id:"R4", name:"Route 4, Nagina", stops:"Nagina, Dhampur, Seohara", capacity:26}
];
const VILLAGE_ROUTE = {"Bijnor town":"R1","Jhalu":"R1","Mahmoodpur":"R1","Chandpur":"R2","Haldaur":"R2","Noorpur":"R2","Najibabad":"R3","Kiratpur":"R3","Nagina":"R4","Dhampur":"R4","Seohara":"R4"};

const WAGE_DUE_DAY = 7;       // salaries for a month are due by this day of the next month
const DEPOSIT_DUE_DAY = 15;   // PF and ESI deposits are due by this day of the next month
const PAY_STATUSES = ["Pending","Sent","Failed","On hold"];
const ROLE_PAY = {
  "Line Operator":14500,"Fryer Operator":16000,"Packing Operator":13500,"Shift Supervisor":28000,
  "QA Executive":26000,"Lab Technician":19000,"Electrician":18500,"Fitter":17500,"Refrigeration Technician":21000,
  "Store Assistant":14000,"Forklift Operator":16500,"Export Documentation Executive":27000,
  "Field Officer":22000,"HR Executive":25000
};

/* ===== Helpers ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAY = 864e5;
const isoOf = d => { const z = new Date(d.getTime() - d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); };
const todayISO = () => isoOf(new Date());
const addDays = n => isoOf(new Date(Date.now() + n*DAY));
const fmt = iso => iso ? new Date(iso+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"}) : "Not set";
const daysFrom = iso => Math.round((new Date(iso+"T00:00:00") - new Date(todayISO()+"T00:00:00"))/DAY);
const doneCount = c => CHECKS.filter(([k]) => c.checklist && c.checklist[k]).length;
const kb = n => n > 1048576 ? (n/1048576).toFixed(1)+" MB" : Math.max(1,Math.round(n/1024))+" KB";
const fmtTime = t => t ? new Date(t).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}) : "";

function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2800);
}
function fillSelect(sel, opts, value){
  sel.innerHTML = opts.map(o => { const [v,l] = Array.isArray(o) ? o : [o,o]; return `<option value="${esc(v)}">${esc(l)}</option>`; }).join("");
  if (value !== undefined) sel.value = value;
}

/* ===== Supabase connection ===== */
if (!window.supabase){
  document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">Could not load the app. Check your internet connection and refresh.</p>';
  throw new Error("Supabase library not loaded");
}
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {auth:{persistSession:true, autoRefreshToken:true}});

function friendly(e){
  const m = (e && e.message) || String(e);
  if (/row-level security|permission denied/i.test(m)) return "You don't have permission for this.";
  if (/JWT|expired|not authenticated/i.test(m)) return "Your session has ended. Please sign in again.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "No connection to the server. Check your internet.";
  return m;
}
async function q(promise){
  const {data, error} = await promise;
  if (error) throw new Error(friendly(error));
  return data;
}
const logEvent = (action, target = "", detail = "") =>
  sb.rpc("log_event", {p_action:action, p_target:target, p_detail:detail}).then(() => {}, () => {});

/* ===== Roles ===== */
const PERMS = {
  admin:    ["cand:read","cand:write","cand:delete","docs","payroll","users","audit"],
  hr:       ["cand:read","cand:write","docs"],
  accounts: ["cand:read","payroll"],
  viewer:   ["cand:read"]
};
const ROLE_LABEL = {admin:"Admin", hr:"HR", accounts:"Accounts", viewer:"Viewer (read only)"};
let ME = null;
const can = p => !!ME && (PERMS[ME.role] || []).includes(p);

/* ===== Data ===== */
let state = {candidates: []};
const byStage = s => state.candidates.filter(c => c.stage === s);
const find = id => state.candidates.find(c => c.id === id);

const fromRow = r => ({
  id:r.id, name:r.name, phone:r.phone || "", village:r.village || "", dept:r.dept || "", role:r.role || "",
  shift:r.shift || "", source:r.source || "", stage:r.stage, appliedOn:r.applied_on || "",
  interviewOn:r.interview_on || "", joinOn:r.join_on || "", route:r.route || "", notes:r.notes || "",
  checklist:r.checklist || {}, salary:"", docs:[]
});
const toRow = c => ({
  name:c.name, phone:c.phone || "", village:c.village || "", dept:c.dept || "", role:c.role || "",
  shift:c.shift || "", source:c.source || "", stage:c.stage, applied_on:c.appliedOn || "",
  interview_on:c.interviewOn || "", join_on:c.joinOn || "", route:c.route || "", notes:c.notes || "",
  checklist:c.checklist || {}
});
const docFromRow = d => ({id:d.id, label:d.label, path:d.path, contentType:d.content_type || "", size:d.size || 0, uploadedAt:d.uploaded_at || ""});

async function reload(){
  const rows = await q(sb.from("candidates").select("*").order("created_at").order("id"));
  const list = rows.map(fromRow);
  const map = new Map(list.map(c => [c.id, c]));
  if (can("payroll")){
    const sal = await q(sb.from("salaries").select("*"));
    sal.forEach(s => { const c = map.get(s.candidate_id); if (c) c.salary = s.monthly_net ? String(s.monthly_net) : ""; });
  }
  if (can("docs")){
    const docs = await q(sb.from("documents").select("*").order("uploaded_at"));
    docs.forEach(d => { const c = map.get(d.candidate_id); if (c) c.docs.push(docFromRow(d)); });
  }
  state = {candidates: list};
  renderAll();
}

async function persist(c){
  try { await q(sb.from("candidates").update(toRow(c)).eq("id", c.id)); }
  catch(e){ toast("Could not save: " + e.message); try { await reload(); } catch(_){} }
}

/* ===== Sign-in screens ===== */
function showAuth(mode, msg){
  $("#auth").hidden = false;
  ["login","change"].forEach(m => $("#f-" + m).hidden = m !== mode);
  $("#authMsg").textContent = msg || "";
  $("#auth").querySelectorAll("input").forEach(i => i.value = "");
  $("#cancelChange").hidden = !ME || ME.mustChange;
  setTimeout(() => { const f = $("#f-" + mode).querySelector("input"); if (f) f.focus(); }, 50);
}
function hideAuth(){ $("#auth").hidden = true; $("#authMsg").textContent = ""; }
function busy(form, on){ form.querySelectorAll("button").forEach(b => b.disabled = on); }

function applyRole(){
  $("#userName").textContent = ME.name || ME.email;
  $("#userRole").textContent = ROLE_LABEL[ME.role] || ME.role;
  $("#userbar").hidden = false;
  document.querySelector('[data-tab="payroll"]').hidden = !can("payroll");
  document.querySelector('[data-tab="users"]').hidden = !can("users");
  document.querySelector('[data-tab="activity"]').hidden = !can("audit");
  document.querySelectorAll('[data-action="add"]').forEach(b => b.hidden = !can("cand:write"));
  setTab("overview");
}

async function startSession(){
  const {data:{user}} = await sb.auth.getUser();
  if (!user){ showAuth("login"); return; }
  let prof;
  try { prof = await q(sb.from("profiles").select("*").eq("id", user.id).maybeSingle()); }
  catch(e){ showAuth("login", e.message); return; }
  if (!prof || !prof.active){
    ME = null;
    await sb.auth.signOut();
    showAuth("login", "Your account is not active yet. Ask the admin to give you access.");
    return;
  }
  ME = {id:prof.id, email:prof.email, name:prof.name, role:prof.role, mustChange:prof.must_change};
  if (ME.mustChange){ showAuth("change", "Please choose your own password before continuing."); return; }
  hideAuth();
  applyRole();
  lastActive = Date.now();
  try { await reload(); } catch(e){ toast("Could not load data: " + e.message); }
}

function resetUI(){
  state = {candidates: []};
  pay.rows = []; pay.statutory = []; pay.selected.clear();
  if (dlg.open) dlg.close();
  if ($("#userDlg").open) $("#userDlg").close();
  $("#userbar").hidden = true;
  renderAll();
}

async function signOut(msg){
  if (ME) await logEvent("logout");
  ME = null;
  try { await sb.auth.signOut(); } catch(e){}
  resetUI();
  showAuth("login", msg || "");
}

sb.auth.onAuthStateChange(event => {
  if (event === "SIGNED_OUT" && ME){
    ME = null;
    setTimeout(() => { resetUI(); showAuth("login", "Your session has ended. Please sign in again."); }, 0);
  }
});

$("#f-login").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#lUser").value.trim().toLowerCase(), password = $("#lPass").value;
  if (!email || !password){ $("#authMsg").textContent = "Enter your email and password."; return; }
  busy(e.target, true);
  try {
    const {error} = await sb.auth.signInWithPassword({email, password});
    if (error){
      $("#authMsg").textContent = /invalid/i.test(error.message) ? "Wrong email or password." :
        /rate|too many/i.test(error.message) ? "Too many attempts. Please wait a few minutes and try again." : friendly(error);
      $("#lPass").value = "";
      return;
    }
    await logEvent("login");
    await startSession();
  } finally { busy(e.target, false); }
});

$("#f-change").addEventListener("submit", async e => {
  e.preventDefault();
  const oldPw = $("#cOld").value, next = $("#cNew").value;
  if (next.length < 10){ $("#authMsg").textContent = "New password must be at least 10 characters."; return; }
  if (next !== $("#cNew2").value){ $("#authMsg").textContent = "The two new passwords don't match."; return; }
  if (next === oldPw){ $("#authMsg").textContent = "Choose a password different from the current one."; return; }
  busy(e.target, true);
  try {
    const {error:e1} = await sb.auth.signInWithPassword({email:ME.email, password:oldPw});
    if (e1){ $("#authMsg").textContent = "Your current password is wrong."; return; }
    const {error:e2} = await sb.auth.updateUser({password:next});
    if (e2){ $("#authMsg").textContent = friendly(e2); return; }
    await sb.rpc("password_changed");
    await sb.auth.signOut({scope:"others"});   // sign out all other devices
    toast("Password changed. You've been signed out on other devices.");
    await startSession();
  } finally { busy(e.target, false); }
});

/* Sign out automatically after inactivity (important on shared computers) */
let lastActive = Date.now();
["click","keydown","touchstart","scroll"].forEach(ev => document.addEventListener(ev, () => { lastActive = Date.now(); }, {passive:true}));
setInterval(() => {
  if (ME && Date.now() - lastActive > IDLE_MINUTES * 60000) signOut(`You were signed out after ${IDLE_MINUTES} minutes of inactivity.`);
}, 30000);

/* ===== Sample data ===== */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
function sampleData(){
  const r = mulberry32(7);
  const pick = a => a[Math.floor(r()*a.length)];
  const int = (a,b) => a + Math.floor(r()*(b-a+1));
  const FIRST = ["Aman","Rohit","Pooja","Sandeep","Neha","Vikas","Anjali","Arif","Sunil","Kavita","Deepak","Ritu","Arjun","Shabnam","Manoj","Priya","Rahul","Imran","Seema","Ankit","Gaurav","Nisha","Faizan","Sachin","Rekha","Mohit","Sana","Yogesh"];
  const LAST = ["Sharma","Chauhan","Saini","Tyagi","Khan","Verma","Rajput","Ahmad","Kumar","Singh","Gupta","Ansari","Pal","Rathi","Siddiqui","Tomar"];
  const VILLAGES = Object.keys(VILLAGE_ROUTE);
  const deptPool = ["Production","Production","Production","Production","Production","Production","Quality & Food Safety","Maintenance","Maintenance","Stores & Logistics","Stores & Logistics","Agri & Grower Relations","HR & Admin"];
  const plan = [["Applied",16],["Screening",11],["Interview",12],["Offer",9],["Joined",26],["Rejected",6]];
  const out = []; let n = 1;
  for (const [stage,count] of plan){
    for (let i=0;i<count;i++){
      const dept = pick(deptPool);
      const role = pick(DEPTS.find(d => d.name === dept).roles);
      const village = pick(VILLAGES);
      const dayShift = dept === "HR & Admin" || dept === "Agri & Grower Relations";
      const c = {
        id:"S"+String(n++).padStart(3,"0"), name:pick(FIRST)+" "+pick(LAST),
        phone:"9"+int(100000000,999999999), dept, role,
        shift: dayShift ? "General" : pick(SHIFTS.slice(0,3)),
        source:pick(SOURCES), village, stage, appliedOn:addDays(-int(3,30)),
        interviewOn:"", joinOn:"", route:"", notes:"", checklist:{},
        salary: String((ROLE_PAY[role] || 15000) + int(-2,3)*500)
      };
      if (stage === "Interview") c.interviewOn = addDays(int(0,8));
      if (stage === "Offer"){
        c.joinOn = addDays(int(3,21));
        c.route = r() < .15 ? "OWN" : VILLAGE_ROUTE[village];
        CHECKS.forEach(([k],idx) => c.checklist[k] = idx < 2 && r() < .5);
      }
      if (stage === "Joined"){
        const ago = int(1,40);
        c.joinOn = addDays(-ago);
        c.appliedOn = addDays(-ago - int(10,25));
        c.route = r() < .15 ? "OWN" : VILLAGE_ROUTE[village];
        const p = Math.min(.95, .45 + ago*.02);
        CHECKS.forEach(([k]) => c.checklist[k] = r() < p);
      }
      out.push(c);
    }
  }
  return out;
}

async function loadSample(btn){
  btn.disabled = true; btn.textContent = "Loading…";
  try {
    const list = sampleData();
    await q(sb.from("candidates").upsert(list.map(c => ({id:c.id, ...toRow(c)}))));
    await q(sb.from("salaries").upsert(list.map(c => ({candidate_id:c.id, monthly_net:Number(c.salary) || 0}))));
    await reload();
    toast(`Loaded ${list.length} sample candidates`);
  } catch(e){
    btn.disabled = false; btn.textContent = "Load sample data";
    toast("Could not load sample data: " + e.message);
  }
}

/* ===== Overview ===== */
function renderOverview(){
  const joined = byStage("Joined").length, offers = byStage("Offer").length;
  const head = EXISTING_STAFF + joined;
  const still = Math.max(0, TARGET - head - offers);
  let dots = "";
  for (let i=0;i<TARGET;i++){
    const cls = i < EXISTING_STAFF ? "ex" : i < head ? "j" : i < head + offers ? "o" : "";
    dots += `<span class="dot ${cls}"></span>`;
  }
  const upcoming = byStage("Interview").filter(c => c.interviewOn && daysFrom(c.interviewOn) >= 0 && daysFrom(c.interviewOn) <= 7)
    .sort((a,b) => a.interviewOn.localeCompare(b.interviewOn));
  const pending = byStage("Joined").filter(c => doneCount(c) < CHECKS.length)
    .sort((a,b) => doneCount(a) - doneCount(b)).slice(0,8);

  const deptRows = DEPTS.map(d => {
    const filled = state.candidates.filter(c => c.dept === d.name && c.stage === "Joined").length;
    const pipe = state.candidates.filter(c => c.dept === d.name && (c.stage === "Offer" || c.stage === "Interview")).length;
    const fw = Math.min(100, filled/d.openings*100), pw = Math.min(100-fw, pipe/d.openings*100);
    return `<div class="dept-row"><div class="top"><span>${esc(d.name)}</span><span><b>${filled}</b> of ${d.openings}</span></div>
      <div class="bar"><span class="f" style="width:${fw}%"></span><span class="p" style="width:${pw}%"></span></div>
      <div style="color:var(--muted);font-size:12px;margin-top:3px">${pipe} at interview or offer</div></div>`;
  }).join("");

  const emptyNote = (state.candidates.length || !ME) ? "" : `<div class="notice">
      <span>No candidates yet.${can("users") ? " Add your first candidate, or load sample data to try the system." : ""}</span>
      ${can("users") ? `<button class="btn" data-action="sample">Load sample data</button>` : ""}</div>`;

  $("#tab-overview").innerHTML = emptyNote + `
    <div class="hero">
      <div>
        <h1>People on site for the fries line</h1>
        <div class="big">${head}<small> of ${TARGET}</small></div>
        <p>${EXISTING_STAFF} existing team, ${joined} joined since hiring began, and ${offers} offers accepted and waiting to join. ${still} positions still to fill.</p>
      </div>
      <div>
        <div class="dots" role="img" aria-label="${head} of ${TARGET} positions filled">${dots}</div>
        <div class="legend">
          <span><i style="background:var(--field)"></i>Existing team</span>
          <span><i style="background:var(--tuber)"></i>Joined</span>
          <span><i style="box-shadow:inset 0 0 0 2px var(--tuber)"></i>Offer accepted</span>
          <span><i style="background:var(--empty)"></i>Still to hire</span>
        </div>
      </div>
    </div>
    <div class="grid3">
      <div class="panel">
        <h2>Interviews this week</h2>
        ${upcoming.length ? `<ul class="list">${upcoming.map(c => {
          const d = daysFrom(c.interviewOn);
          return `<li><span><button class="linkbtn" data-open="${esc(c.id)}">${esc(c.name)}</button><br><span class="sub">${esc(c.role)}</span></span>
            <span class="sub" style="white-space:nowrap">${d === 0 ? "Today" : d === 1 ? "Tomorrow" : fmt(c.interviewOn)}</span></li>`;
        }).join("")}</ul>` : `<p class="empty">No interviews in the next 7 days.</p>`}
      </div>
      <div class="panel">
        <h2>Joiners with pending paperwork</h2>
        ${pending.length ? `<ul class="list">${pending.map(c => `<li>
          <span><button class="linkbtn" data-open="${esc(c.id)}">${esc(c.name)}</button><br><span class="sub">Joined ${fmt(c.joinOn)}</span></span>
          <span class="tag">${doneCount(c)} of ${CHECKS.length} done</span></li>`).join("")}</ul>` : `<p class="empty">Every joiner has completed onboarding.</p>`}
      </div>
      <div class="panel">
        <h2>Openings by department</h2>
        ${deptRows}
      </div>
    </div>`;
}

/* ===== Candidates board ===== */
function renderBoard(){
  const qText = $("#search").value.trim().toLowerCase();
  const dept = $("#deptFilter").value;
  const list = state.candidates.filter(c =>
    (!dept || c.dept === dept) &&
    (!qText || [c.name,c.role,c.village,c.dept].join(" ").toLowerCase().includes(qText)));
  $("#board").innerHTML = STAGES.map(stage => {
    const items = list.filter(c => c.stage === stage);
    return `<div class="col ${stage === "Rejected" ? "rej" : ""}">
      <div class="col-head"><h3>${stage}</h3><span>${items.length}</span></div>
      ${items.map(cardHTML).join("") || `<p class="empty" style="padding:4px">No candidates here.</p>`}
    </div>`;
  }).join("");
}

function cardHTML(c){
  let meta = `Applied ${fmt(c.appliedOn)}, ${esc(c.source)}`, soon = false;
  if (c.stage === "Interview"){
    if (c.interviewOn){ const d = daysFrom(c.interviewOn); meta = "Interview " + (d === 0 ? "today" : d === 1 ? "tomorrow" : fmt(c.interviewOn)); soon = d >= 0 && d <= 1; }
    else meta = "Interview date not set";
  }
  if (c.stage === "Offer") meta = "Joins " + fmt(c.joinOn);
  if (c.stage === "Joined") meta = `Joined ${fmt(c.joinOn)}, onboarding ${doneCount(c)}/${CHECKS.length}`;
  if (c.docs && c.docs.length) meta += `, ${c.docs.length} doc${c.docs.length > 1 ? "s" : ""}`;
  const idx = STAGES.indexOf(c.stage);
  const id = esc(c.id);
  const moves = c.stage === "Rejected"
    ? `<span></span><button class="btn btn-sm" data-restore="${id}">Restore</button>`
    : `<button class="btn btn-sm" data-move="-1" data-id="${id}" ${idx === 0 ? "disabled" : ""}>Back</button>
       <button class="btn btn-sm" data-move="1" data-id="${id}" ${c.stage === "Joined" ? "disabled" : ""}>Move to ${STAGES[idx+1] || ""}</button>`;
  return `<article class="card" data-open="${id}" tabindex="0">
    <div class="card-name">${esc(c.name)}</div>
    <div class="card-role">${esc(c.role)}, ${esc(c.village)}</div>
    <div class="card-meta ${soon ? "soon" : ""}">${meta}</div>
    <div class="card-move">${can("cand:write") ? moves : ""}</div>
  </article>`;
}

function applyStageDefaults(c){
  if (c.stage === "Interview" && !c.interviewOn) c.interviewOn = addDays(2);
  if (c.stage === "Offer"){
    if (!c.joinOn) c.joinOn = addDays(14);
    if (!c.route) c.route = VILLAGE_ROUTE[c.village] || "";
  }
  if (c.stage === "Joined"){
    if (!c.joinOn || daysFrom(c.joinOn) > 0) c.joinOn = todayISO();
    if (!c.route) c.route = VILLAGE_ROUTE[c.village] || "";
  }
}

function moveCandidate(id, dir){
  const c = find(id); if (!c) return;
  const next = STAGES.indexOf(c.stage) + dir;
  if (next < 0 || next > 4) return;
  c.stage = STAGES[next];
  applyStageDefaults(c);
  renderAll();
  toast(`${c.name} moved to ${c.stage}`);
  persist(c);
}

/* ===== Onboarding ===== */
function renderOnboarding(){
  const onlyInc = $("#incompleteOnly").checked;
  let rows = state.candidates.filter(c => c.stage === "Joined" || c.stage === "Offer");
  if (onlyInc) rows = rows.filter(c => doneCount(c) < CHECKS.length);
  rows.sort((a,b) => (a.joinOn || "").localeCompare(b.joinOn || ""));
  if (!rows.length){ $("#onbTable").innerHTML = `<p class="empty" style="padding:16px">No joiners with pending onboarding. Clear the filter to see everyone.</p>`; return; }
  const w = can("cand:write");
  $("#onbTable").innerHTML = `<table>
    <thead><tr><th>Name</th><th>Status</th>${CHECKS.map(([,l]) => `<th class="c">${esc(l)}</th>`).join("")}<th class="c">Documents</th><th>Progress</th></tr></thead>
    <tbody>${rows.map(c => {
      const done = doneCount(c), pct = done/CHECKS.length*100, id = esc(c.id);
      return `<tr>
        <td><button class="linkbtn" data-open="${id}">${esc(c.name)}</button><br><span style="color:var(--muted);font-size:13px">${esc(c.role)}</span></td>
        <td style="white-space:nowrap">${c.stage === "Joined" ? `<span class="tag ok">Joined ${fmt(c.joinOn)}</span>` : `<span class="tag">Joins ${fmt(c.joinOn)}</span>`}</td>
        ${CHECKS.map(([k,l]) => `<td class="c"><input type="checkbox" data-check="${id}|${k}" ${c.checklist?.[k] ? "checked" : ""} ${w ? "" : "disabled"} aria-label="${esc(l)} for ${esc(c.name)}"></td>`).join("")}
        <td class="c">${can("docs") ? `<button class="linkbtn" data-open="${id}">${c.docs.length || "Add"}</button>` : "–"}</td>
        <td><div class="prog"><div class="bar"><span class="f" style="width:${pct}%"></span></div>${done}/${CHECKS.length}</div></td>
      </tr>`;
    }).join("")}</tbody></table>`;
}

/* ===== Transport ===== */
function renderTransport(){
  const riders = state.candidates.filter(c => c.stage === "Joined" || c.stage === "Offer");
  const cards = ROUTES.map(r => {
    const list = riders.filter(c => c.route === r.id);
    const pct = list.length / r.capacity * 100, over = list.length > r.capacity;
    return `<div class="panel route">
      <h2>${esc(r.name)}</h2>
      <div class="stops">Stops: ${esc(r.stops)}</div>
      <div class="cap"><span>${list.length} riders</span><span>${r.capacity} seats</span></div>
      <div class="bar"><span class="${over ? "over" : "f"}" style="width:${Math.min(100,pct)}%"></span></div>
      ${over ? `<div class="warn">${list.length - r.capacity} over capacity. Add a vehicle or split by shift.</div>` : ""}
      <ul class="list">${list.slice(0,6).map(c => `<li><button class="linkbtn" data-open="${esc(c.id)}">${esc(c.name)}</button><span class="sub">${esc(c.shift.split(" (")[0])}${c.stage === "Offer" ? ", joins " + fmt(c.joinOn) : ""}</span></li>`).join("")}</ul>
      ${list.length > 6 ? `<p class="empty">and ${list.length - 6} more</p>` : ""}
    </div>`;
  }).join("");
  const unassigned = riders.filter(c => !c.route);
  const own = riders.filter(c => c.route === "OWN").length;
  $("#routes").innerHTML = cards + `<div class="panel route">
    <h2>Not on a bus</h2>
    <div class="stops">${own} use their own transport</div>
    ${unassigned.length ? `<ul class="list">${unassigned.map(c => `<li><button class="linkbtn" data-open="${esc(c.id)}">${esc(c.name)}</button><span class="sub">No route assigned</span></li>`).join("")}</ul>`
      : `<p class="empty">Every joiner has a route or their own transport.</p>`}
  </div>`;
}

function renderAll(){ renderOverview(); renderBoard(); renderOnboarding(); renderTransport(); }

/* ===== Candidate dialog ===== */
const form = $("#form"), dlg = $("#dlg");
let editingId = null;

function fillRoles(dept, value){
  const d = DEPTS.find(x => x.name === dept) || DEPTS[0];
  fillSelect(form.role, d.roles, value && d.roles.includes(value) ? value : d.roles[0]);
}
function renderChecks(c){
  $("#checks").innerHTML = CHECKS.map(([k,l]) => `<label><input type="checkbox" name="chk_${k}" ${c.checklist?.[k] ? "checked" : ""}>${esc(l)}</label>`).join("");
  $("#checkWrap").style.display = (form.stage.value === "Offer" || form.stage.value === "Joined") ? "" : "none";
}

async function loadThumbs(c){
  const imgs = c.docs.filter(d => d.contentType.startsWith("image/"));
  if (!imgs.length) return;
  try {
    const urls = await q(sb.storage.from(BUCKET).createSignedUrls(imgs.map(d => d.path), 300));
    urls.forEach((u, i) => {
      if (!u.signedUrl) return;
      const img = document.querySelector(`img[data-thumb="${imgs[i].id}"]`);
      if (img) img.src = u.signedUrl;
    });
  } catch(e){}
}

function renderDocs(){
  const c = editingId ? find(editingId) : null;
  if (!c){
    $("#docList").innerHTML = `<p class="empty">Save the candidate first, then add documents.</p>`;
    $("#docAdd").style.display = "none"; $("#docHint").style.display = "none";
    return;
  }
  $("#docAdd").style.display = ""; $("#docHint").style.display = "";
  if (!c.docs.length){ $("#docList").innerHTML = `<p class="empty">No documents uploaded yet.</p>`; return; }
  $("#docList").innerHTML = c.docs.map(d => {
    const isImg = d.contentType.startsWith("image/");
    return `<div class="doc">
      <button type="button" class="thumb" data-view="${d.id}" aria-label="Open ${esc(d.label)}">${isImg ? `<img data-thumb="${d.id}" alt="">` : "PDF"}</button>
      <div class="info">${esc(d.label)}<span>${kb(d.size)}, ${esc(fmtTime(d.uploadedAt))}</span></div>
      <button type="button" class="btn btn-sm" data-view="${d.id}">Open</button>
      <button type="button" class="btn btn-sm btn-danger" data-deldoc="${d.id}">Remove</button>
    </div>`;
  }).join("");
  loadThumbs(c);
}

/* Convert a photo to WebP (falls back to JPEG on browsers that cannot make WebP) */
function canvasToBlob(cv, type, quality){ return new Promise(res => cv.toBlob(res, type, quality)); }
async function compressImage(file, maxSide = 1600){
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  let blob = await canvasToBlob(cv, "image/webp", 0.8);
  if (!blob || blob.type !== "image/webp") blob = await canvasToBlob(cv, "image/jpeg", 0.82);
  return blob;
}

async function uploadDoc(){
  const c = find(editingId); if (!c) return;
  const f = $("#docFile").files[0];
  if (!f){ toast("Choose a photo or PDF first"); return; }
  const btn = $("#uploadBtn");
  btn.disabled = true; btn.textContent = "Uploading…";
  try {
    let blob = f;
    if (f.type.startsWith("image/")) blob = await compressImage(f);
    else if (f.type !== "application/pdf") throw new Error("Only photos and PDFs can be uploaded");
    if (blob.size > 10*1024*1024) throw new Error("File is larger than 10 MB");
    const ext = {"image/webp":"webp","image/jpeg":"jpg","image/png":"png","application/pdf":"pdf"}[blob.type];
    if (!ext) throw new Error("This file type is not supported");
    const path = `${c.id}/${crypto.randomUUID()}.${ext}`;
    const label = $("#docLabel").value;
    await q(sb.storage.from(BUCKET).upload(path, blob, {contentType:blob.type, upsert:false}));
    let row;
    try {
      row = await q(sb.from("documents").insert({candidate_id:c.id, label, path, content_type:blob.type, size:blob.size}).select().single());
    } catch(err){
      await sb.storage.from(BUCKET).remove([path]);
      throw err;
    }
    c.docs.push(docFromRow(row));
    $("#docFile").value = "";
    renderDocs(); renderBoard(); renderOnboarding();
    toast(`${label} uploaded (${kb(blob.size)})`);
  } catch(e){
    toast("Upload failed: " + e.message);
  } finally {
    btn.disabled = false; btn.textContent = "Upload";
  }
}

async function viewDoc(docId){
  const c = find(editingId); const d = c && c.docs.find(x => x.id === docId);
  if (!d) return;
  const win = window.open("", "_blank");
  try {
    const res = await q(sb.storage.from(BUCKET).createSignedUrl(d.path, 60));
    if (win){ win.opener = null; win.location.href = res.signedUrl; } else location.href = res.signedUrl;
    logEvent("doc.view", c.name, d.label);
  } catch(e){
    if (win) win.close();
    toast("Could not open file: " + e.message);
  }
}

async function deleteDoc(docId){
  const c = find(editingId); const d = c && c.docs.find(x => x.id === docId);
  if (!d || !confirm(`Remove ${d.label}? The file will be deleted.`)) return;
  try {
    await q(sb.storage.from(BUCKET).remove([d.path]));
    await q(sb.from("documents").delete().eq("id", d.id));
    c.docs = c.docs.filter(x => x.id !== d.id);
    renderDocs(); renderBoard(); renderOnboarding();
    toast(`Removed ${d.label}`);
  } catch(e){ toast("Could not remove: " + e.message); }
}

function openDialog(id){
  editingId = id || null;
  const c = id ? find(id) : {name:"",phone:"",village:"Bijnor town",dept:"Production",role:"",shift:SHIFTS[0],source:"Walk-in",stage:"Applied",interviewOn:"",joinOn:"",route:"",notes:"",salary:"",checklist:{},docs:[]};
  if (!c) return;
  $("#dlgTitle").textContent = id ? c.name : "Add candidate";
  form.name.value = c.name; form.phone.value = c.phone;
  fillSelect(form.village, Object.keys(VILLAGE_ROUTE), c.village);
  fillSelect(form.dept, DEPTS.map(d => d.name), c.dept);
  fillRoles(c.dept, c.role);
  fillSelect(form.shift, SHIFTS, c.shift);
  fillSelect(form.source, SOURCES, c.source);
  fillSelect(form.stage, STAGES, c.stage);
  form.interviewOn.value = c.interviewOn || ""; form.joinOn.value = c.joinOn || "";
  fillSelect(form.route, [["","Not assigned"],...ROUTES.map(r => [r.id,r.name]),["OWN","Own transport"]], c.route || "");
  form.notes.value = c.notes || "";
  form.salary.value = c.salary || "";
  fillSelect($("#docLabel"), DOC_TYPES, DOC_TYPES[0]);
  $("#docFile").value = "";
  renderChecks(c);
  renderDocs();
  $("#err").style.display = "none";
  const w = can("cand:write");
  $("#deleteBtn").style.display = id && can("cand:delete") ? "" : "none";
  $("#rejectBtn").style.display = id && w && c.stage !== "Rejected" ? "" : "none";
  $("#saveBtn").style.display = w ? "" : "none";
  $("#salaryLabel").style.display = can("payroll") ? "" : "none";
  $("#docWrap").style.display = can("docs") ? "" : "none";
  form.querySelectorAll(".dlg-body input, .dlg-body select, .dlg-body textarea").forEach(el => { if (!el.closest("#docWrap")) el.disabled = !w; });
  dlg.showModal();
}
form.dept.addEventListener("change", () => fillRoles(form.dept.value));
form.stage.addEventListener("change", () => { $("#checkWrap").style.display = (form.stage.value === "Offer" || form.stage.value === "Joined") ? "" : "none"; });

async function saveSalary(c, newSalary){
  if (!can("payroll") || newSalary === (c.salary || "")) return;
  await q(sb.from("salaries").upsert({candidate_id:c.id, monthly_net:Number(newSalary) || 0}));
  c.salary = newSalary;
}

async function saveDialog(){
  const name = form.name.value.trim();
  if (!name){ $("#err").style.display = "block"; form.name.focus(); return; }
  const checklist = {};
  CHECKS.forEach(([k]) => checklist[k] = form["chk_"+k].checked);
  const data = {
    name, phone:form.phone.value.trim(), village:form.village.value, dept:form.dept.value, role:form.role.value,
    shift:form.shift.value, source:form.source.value, stage:form.stage.value,
    interviewOn:form.interviewOn.value, joinOn:form.joinOn.value, route:form.route.value,
    notes:form.notes.value.trim(), checklist
  };
  const newSalary = form.salary.value.replace(/[^\d]/g, "");
  const btn = $("#saveBtn"); btn.disabled = true;
  try {
    if (editingId){
      const c = find(editingId);
      Object.assign(c, data); applyStageDefaults(c);
      await q(sb.from("candidates").update(toRow(c)).eq("id", c.id));
      await saveSalary(c, newSalary);
      toast(`Saved ${name}`);
      dlg.close();
      renderAll();
    } else {
      const c = {...data, appliedOn:todayISO()}; applyStageDefaults(c);
      const row = await q(sb.from("candidates").insert(toRow(c)).select().single());
      const created = fromRow(row);
      state.candidates.push(created);
      await saveSalary(created, newSalary);
      toast(`Added ${name}. You can now upload documents.`);
      dlg.close();
      renderAll();
      openDialog(created.id);
    }
  } catch(e){
    toast("Could not save: " + e.message);
  } finally { btn.disabled = false; }
}

async function deleteCandidate(){
  const c = find(editingId); if (!c) return;
  if (!confirm(`Delete ${c.name} and all their documents? This cannot be undone.`)) return;
  try {
    if (c.docs.length) await q(sb.storage.from(BUCKET).remove(c.docs.map(d => d.path)));
    await q(sb.from("candidates").delete().eq("id", c.id));
    state.candidates = state.candidates.filter(x => x.id !== c.id);
    dlg.close(); renderAll();
    toast(`Deleted ${c.name}`);
  } catch(e){ toast("Could not delete: " + e.message); }
}

/* ===== Payroll ===== */
let pay = {month:"", rows:[], statutory:[], selected:new Set()};
const rupees = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return isoOf(d).slice(0,7); };
const monthLabel = m => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", {month:"long", year:"numeric"});
const monthEnd = m => { const [y,mo] = m.split("-").map(Number); return isoOf(new Date(y, mo, 0)); };
const dueDate = (m, day) => { const [y,mo] = m.split("-").map(Number); return isoOf(new Date(y, mo, day)); };
const defaultPay = c => Number(c.salary) || ROLE_PAY[c.role] || 15000;
const eligibleFor = m => state.candidates.filter(c => c.stage === "Joined" && c.joinOn && c.joinOn <= monthEnd(m));
const payFromRow = r => ({id:r.id, candidateId:r.candidate_id, month:r.month, netPay:r.net_pay || 0, status:r.status, utr:r.utr || "", paidOn:r.paid_on || "", payslip:!!r.payslip, note:r.note || ""});
const statFromRow = r => ({month:r.month, type:r.type, status:r.status, challanNo:r.challan_no || "", amount:r.amount || 0, paidOn:r.paid_on || ""});

async function loadPayroll(){
  if (!$("#payMonth").value) $("#payMonth").value = prevMonth();
  const m = $("#payMonth").value;
  if (!/^\d{4}-\d{2}$/.test(m)) return;
  pay.month = m;
  $("#payBody").innerHTML = `<p class="empty">Loading…</p>`;
  try {
    const rows = await q(sb.from("payroll").select("*").eq("month", m));
    const st = await q(sb.from("statutory").select("*").eq("month", m));
    pay.rows = rows.map(payFromRow); pay.statutory = st.map(statFromRow); pay.selected.clear();
    renderPayroll();
  } catch(e){ $("#payBody").innerHTML = `<p class="empty">Could not load payroll: ${esc(e.message)}</p>`; }
}

async function preparePayroll(){
  const m = pay.month;
  const have = new Set(pay.rows.map(r => r.candidateId));
  const rows = eligibleFor(m).filter(c => !have.has(c.id))
    .map(c => ({id:`${c.id}_${m}`, candidate_id:c.id, month:m, net_pay:defaultPay(c), status:"Pending"}));
  try {
    if (rows.length) await q(sb.from("payroll").upsert(rows, {onConflict:"id", ignoreDuplicates:true}));
    await q(sb.from("statutory").upsert([{month:m, type:"PF"}, {month:m, type:"ESI"}], {onConflict:"month,type", ignoreDuplicates:true}));
    await loadPayroll();
    toast(rows.length ? `Added ${rows.length} employees to ${monthLabel(m)} payroll` : "Payroll is up to date");
  } catch(e){ toast("Could not prepare payroll: " + e.message); }
}

function renderPayroll(){
  const m = pay.month, label = monthLabel(m);
  const filter = $("#payFilter").value;
  const have = new Set(pay.rows.map(r => r.candidateId));
  const missing = eligibleFor(m).filter(c => !have.has(c.id));
  $("#selCount").textContent = pay.selected.size ? `${pay.selected.size} selected` : "";

  if (!pay.rows.length){
    $("#payBody").innerHTML = `<div class="panel">
      <h2>No payroll for ${esc(label)} yet</h2>
      <p class="empty">${missing.length} employees had joined by the end of ${esc(label)}. Prepare the payroll to list them with their monthly salary.</p>
      ${missing.length ? `<button class="btn btn-primary" data-action="prepare">Prepare ${esc(label)} payroll</button>` : ""}
    </div>`;
    return;
  }

  const sent = pay.rows.filter(r => r.status === "Sent");
  const failed = pay.rows.filter(r => r.status === "Failed");
  const unpaid = pay.rows.filter(r => r.status !== "Sent");
  const total = pay.rows.reduce((a,r) => a + r.netPay, 0);
  const paidTotal = sent.reduce((a,r) => a + r.netPay, 0);
  const due = dueDate(m, WAGE_DUE_DAY), dd = daysFrom(due);

  let alert;
  if (!unpaid.length) alert = `<div class="alert good">All ${pay.rows.length} salaries for ${esc(label)} have been paid.</div>`;
  else if (dd < 0) alert = `<div class="alert bad">${unpaid.length} salaries for ${esc(label)} are overdue. They were due by ${fmt(due)}.</div>`;
  else alert = `<div class="alert warn">${unpaid.length} salaries to pay by ${fmt(due)}, ${dd === 0 ? "today" : dd === 1 ? "1 day left" : dd + " days left"}.</div>`;
  if (failed.length) alert += `<div class="alert bad">${failed.length} bank transfer${failed.length > 1 ? "s" : ""} failed. Check account and IFSC details, then resend.
    <button class="btn btn-sm" data-action="show-failed">Show failed</button></div>`;
  if (missing.length) alert += `<div class="alert warn">${missing.length} employee${missing.length > 1 ? "s" : ""} joined but ${missing.length > 1 ? "are" : "is"} not in this payroll.
    <button class="btn btn-sm" data-action="prepare">Add to payroll</button></div>`;

  let rows = pay.rows.map(r => ({r, c:find(r.candidateId)}));
  if (filter) rows = rows.filter(x => x.r.status === filter);
  rows.sort((a,b) => (a.c?.name || "").localeCompare(b.c?.name || ""));
  const allSel = rows.length && rows.every(x => pay.selected.has(x.r.id));

  const table = rows.length ? `<div class="tablewrap"><table class="paytbl">
    <thead><tr>
      <th><input type="checkbox" id="selAll" ${allSel ? "checked" : ""} aria-label="Select all"></th>
      <th>Employee</th><th>Net pay (₹)</th><th>Status</th><th>Bank ref (UTR)</th><th>Paid on</th><th class="c">Payslip</th>
    </tr></thead>
    <tbody>${rows.map(({r,c}) => { const rid = esc(r.id); return `<tr>
      <td><input type="checkbox" data-sel="${rid}" ${pay.selected.has(r.id) ? "checked" : ""} aria-label="Select"></td>
      <td>${c ? `<button class="linkbtn" data-open="${esc(c.id)}">${esc(c.name)}</button><br><span style="color:var(--muted);font-size:13px">${esc(c.role)}</span>` : `<span style="color:var(--muted)">Removed employee</span>`}</td>
      <td><input type="number" min="0" step="100" value="${r.netPay}" data-pay="${rid}|netPay" aria-label="Net pay"></td>
      <td><select data-pay="${rid}|status" class="st-${r.status.replace(" ","-")}" aria-label="Status">${PAY_STATUSES.map(s => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td><input type="text" value="${esc(r.utr)}" data-pay="${rid}|utr" placeholder="Transaction ref" aria-label="UTR"></td>
      <td><input type="date" value="${esc(r.paidOn)}" data-pay="${rid}|paidOn" aria-label="Paid on"></td>
      <td class="c"><input type="checkbox" data-pay="${rid}|payslip" ${r.payslip ? "checked" : ""} aria-label="Payslip issued"></td>
    </tr>`; }).join("")}</tbody></table></div>`
    : `<p class="empty">No salaries match this filter.</p>`;

  const depDue = dueDate(m, DEPOSIT_DUE_DAY), depD = daysFrom(depDue);
  const deposits = ["PF","ESI"].map(t => {
    const s = pay.statutory.find(x => x.type === t) || {status:"Pending", challanNo:"", amount:0, paidOn:""};
    const late = s.status !== "Deposited" && depD < 0;
    const dueText = s.status === "Deposited" ? `Deposited on ${fmt(s.paidOn)}`
      : late ? `Overdue. Was due by ${fmt(depDue)}` : `Due by ${fmt(depDue)}`;
    return `<div class="panel">
      <h2>${t} deposit for ${esc(label)}</h2>
      <p class="due ${late ? "late" : ""}">${dueText}</p>
      <label>Status<select data-stat="${t}|status">${["Pending","Deposited"].map(x => `<option ${x === s.status ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label>Amount (₹)<input type="number" min="0" value="${s.amount || ""}" data-stat="${t}|amount"></label>
      <label>Challan number<input value="${esc(s.challanNo)}" data-stat="${t}|challanNo"></label>
      <label>Deposited on<input type="date" value="${esc(s.paidOn)}" data-stat="${t}|paidOn"></label>
    </div>`;
  }).join("");

  $("#payBody").innerHTML = `
    <div class="stats">
      <div class="stat"><b>${pay.rows.length}</b><span>Employees in ${esc(label)}</span></div>
      <div class="stat"><b>${sent.length}</b><span>Salaries sent</span></div>
      <div class="stat"><b>${unpaid.length - failed.length}</b><span>Pending or on hold</span></div>
      <div class="stat"><b>${rupees(paidTotal)}</b><span>Paid of ${rupees(total)}</span></div>
    </div>
    ${alert}
    ${table}
    <div class="deposits">${deposits}</div>`;
}

async function savePayRow(r){
  try {
    await q(sb.from("payroll").update({
      net_pay:r.netPay, status:r.status, utr:r.utr, paid_on:r.paidOn, payslip:r.payslip, note:r.note
    }).eq("id", r.id));
  } catch(e){ toast("Could not save: " + e.message); loadPayroll(); }
}

async function bulkPay(status){
  const ids = [...pay.selected];
  if (!ids.length){ toast("Select employees first using the boxes on the left"); return; }
  const paidOn = status === "Sent" ? todayISO() : "";
  try {
    await q(sb.from("payroll").update({status, paid_on:paidOn}).in("id", ids));
    pay.rows.forEach(r => { if (pay.selected.has(r.id)){ r.status = status; r.paidOn = paidOn; } });
    pay.selected.clear();
    renderPayroll();
    toast(`${ids.length} salar${ids.length > 1 ? "ies" : "y"} marked as ${status.toLowerCase()}`);
  } catch(e){ toast("Could not update: " + e.message); }
}

async function saveStatutory(s){
  try {
    await q(sb.from("statutory").upsert({
      month:pay.month, type:s.type, status:s.status, challan_no:s.challanNo, amount:s.amount || 0, paid_on:s.paidOn
    }, {onConflict:"month,type"}));
    renderPayroll();
  } catch(e){ toast("Could not save: " + e.message); }
}

/* ===== Users (admin) ===== */
let users = [], editingUser = null;

async function loadUsers(){
  $("#usersBody").innerHTML = `<p class="empty" style="padding:16px">Loading…</p>`;
  try {
    users = await q(sb.from("profiles").select("*").order("created_at"));
    $("#usersBody").innerHTML = `<table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr></thead>
      <tbody>${users.map(u => `<tr>
        <td><b>${esc(u.name)}</b>${ME && u.id === ME.id ? ` <span class="pill">You</span>` : ""}</td>
        <td>${esc(u.email)}</td>
        <td>${esc(ROLE_LABEL[u.role] || u.role)}</td>
        <td>${!u.active ? `<span class="pill off">Not active</span>` : u.must_change ? `<span class="pill">Must set password</span>` : `<span class="pill">Active</span>`}</td>
        <td style="white-space:nowrap">${esc(fmtTime(u.created_at))}</td>
        <td><button class="btn btn-sm" data-edituser="${u.id}">Edit</button></td>
      </tr>`).join("")}</tbody></table>`;
  } catch(e){ $("#usersBody").innerHTML = `<p class="empty" style="padding:16px">${esc(e.message)}</p>`; }
}

function openUserDlg(id){
  const u = users.find(x => x.id === id); if (!u) return;
  editingUser = id;
  const f = $("#userForm");
  $("#userDlgTitle").textContent = "Edit " + (u.name || u.email);
  f.uname.value = u.name || "";
  $("#uemail").textContent = u.email;
  fillSelect(f.urole, Object.entries(ROLE_LABEL), u.role);
  f.uactive.checked = u.active;
  $("#uerr").style.display = "none";
  $("#userDlg").showModal();
}

async function saveUser(){
  const f = $("#userForm");
  try {
    await q(sb.from("profiles").update({name:f.uname.value.trim(), role:f.urole.value, active:f.uactive.checked}).eq("id", editingUser));
    $("#userDlg").close();
    toast("User updated");
    loadUsers();
  } catch(e){ $("#uerr").textContent = e.message; $("#uerr").style.display = "block"; }
}

/* ===== Activity log (admin) ===== */
const ACTION_LABEL = {
  "login":"Signed in", "logout":"Signed out", "password.change":"Changed password", "doc.view":"Opened document",
  "candidates.insert":"Added candidate", "candidates.update":"Updated candidate", "candidates.delete":"Deleted candidate",
  "salaries.insert":"Set salary", "salaries.update":"Changed salary", "salaries.delete":"Removed salary",
  "documents.insert":"Uploaded document", "documents.delete":"Removed document",
  "payroll.insert":"Added to payroll", "payroll.update":"Updated salary payment", "payroll.delete":"Removed from payroll",
  "statutory.insert":"Opened PF/ESI record", "statutory.update":"Updated PF/ESI deposit",
  "profiles.insert":"New login created", "profiles.update":"Changed user access", "profiles.delete":"Login removed"
};
async function loadActivity(){
  $("#activityBody").innerHTML = `<p class="empty" style="padding:16px">Loading…</p>`;
  try {
    const rows = await q(sb.from("audit_log").select("*").order("id", {ascending:false}).limit(300));
    $("#activityBody").innerHTML = rows.length ? `<table>
      <thead><tr><th>When</th><th>Who</th><th>What</th><th>Item</th><th>Details</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td style="white-space:nowrap">${esc(fmtTime(r.at))}</td>
        <td>${esc(r.user_email || "Unknown")}</td>
        <td>${esc(ACTION_LABEL[r.action] || r.action)}</td>
        <td>${esc(r.target)}</td>
        <td style="color:var(--muted)">${esc(r.detail)}</td>
      </tr>`).join("")}</tbody></table>` : `<p class="empty" style="padding:16px">No activity yet.</p>`;
  } catch(e){ $("#activityBody").innerHTML = `<p class="empty" style="padding:16px">${esc(e.message)}</p>`; }
}

/* ===== Tabs and events ===== */
function setTab(tab){
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
  ["overview","candidates","onboarding","transport","payroll","users","activity"].forEach(t => $("#tab-"+t).hidden = t !== tab);
  if (tab === "payroll") loadPayroll();
  if (tab === "users") loadUsers();
  if (tab === "activity") loadActivity();
}

document.addEventListener("click", e => {
  const t = e.target;
  const tab = t.closest("[data-tab]"); if (tab){ setTab(tab.dataset.tab); return; }
  const mv = t.closest("[data-move]"); if (mv){ moveCandidate(mv.dataset.id, +mv.dataset.move); return; }
  const rs = t.closest("[data-restore]");
  if (rs){ const c = find(rs.dataset.restore); if (c){ c.stage = "Applied"; renderAll(); toast(`${c.name} restored to Applied`); persist(c); } return; }
  const vw = t.closest("[data-view]"); if (vw){ viewDoc(vw.dataset.view); return; }
  const dd = t.closest("[data-deldoc]"); if (dd){ deleteDoc(dd.dataset.deldoc); return; }
  const eu = t.closest("[data-edituser]"); if (eu){ openUserDlg(eu.dataset.edituser); return; }

  const act = t.closest("[data-action]");
  if (act){
    const a = act.dataset.action;
    if (a === "add") openDialog();
    if (a === "close") dlg.close();
    if (a === "save") saveDialog();
    if (a === "upload") uploadDoc();
    if (a === "delete") deleteCandidate();
    if (a === "reject" && editingId){ const c = find(editingId); c.stage = "Rejected"; dlg.close(); renderAll(); toast(`${c.name} moved to Rejected`); persist(c); }
    if (a === "sample") loadSample(act);
    if (a === "prepare") preparePayroll();
    if (a === "bulk-sent") bulkPay("Sent");
    if (a === "bulk-hold") bulkPay("On hold");
    if (a === "show-failed"){ $("#payFilter").value = "Failed"; renderPayroll(); }
    if (a === "signout") signOut();
    if (a === "change-pass") showAuth("change");
    if (a === "cancel-change") hideAuth();
    if (a === "close-user") $("#userDlg").close();
    if (a === "save-user") saveUser();
    if (a === "refresh-activity") loadActivity();
    return;
  }
  if (t.closest("input,select,label,textarea")) return;
  const op = t.closest("[data-open]"); if (op) openDialog(op.dataset.open);
});

document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.matches(".card[data-open]")) openDialog(e.target.dataset.open);
});

document.addEventListener("change", e => {
  const t = e.target;

  const ck = t.closest("[data-check]");
  if (ck){
    const [id,k] = ck.dataset.check.split("|"); const c = find(id); if (!c) return;
    c.checklist = c.checklist || {}; c.checklist[k] = ck.checked;
    renderOverview(); renderBoard(); renderTransport();
    if (doneCount(c) === CHECKS.length){ toast(`${c.name} has finished onboarding`); renderOnboarding(); }
    persist(c);
    return;
  }
  if (t.id === "payMonth"){ loadPayroll(); return; }
  if (t.id === "payFilter"){ renderPayroll(); return; }
  if (t.id === "selAll"){
    t.closest("table").querySelectorAll("[data-sel]").forEach(cb => { cb.checked = t.checked; t.checked ? pay.selected.add(cb.dataset.sel) : pay.selected.delete(cb.dataset.sel); });
    $("#selCount").textContent = pay.selected.size ? `${pay.selected.size} selected` : "";
    return;
  }
  if (t.dataset.sel){
    t.checked ? pay.selected.add(t.dataset.sel) : pay.selected.delete(t.dataset.sel);
    $("#selCount").textContent = pay.selected.size ? `${pay.selected.size} selected` : "";
    return;
  }
  if (t.dataset.pay){
    const [id, field] = t.dataset.pay.split("|");
    const r = pay.rows.find(x => x.id === id); if (!r) return;
    if (field === "payslip") r.payslip = t.checked;
    else if (field === "netPay") r.netPay = Math.max(0, parseInt(t.value, 10) || 0);
    else r[field] = t.value;
    if (field === "status"){
      if (r.status === "Sent" && !r.paidOn) r.paidOn = todayISO();
      if (r.status !== "Sent") r.paidOn = "";
    }
    savePayRow(r);
    renderPayroll();
    return;
  }
  if (t.dataset.stat){
    const [type, field] = t.dataset.stat.split("|");
    let s = pay.statutory.find(x => x.type === type);
    if (!s){ s = {month:pay.month, type, status:"Pending", challanNo:"", amount:0, paidOn:""}; pay.statutory.push(s); }
    s[field] = field === "amount" ? (parseInt(t.value, 10) || 0) : t.value;
    if (field === "status" && s.status === "Deposited" && !s.paidOn) s.paidOn = todayISO();
    saveStatutory(s);
    if (field === "status") toast(`${type} marked as ${s.status.toLowerCase()}`);
  }
});

$("#search").addEventListener("input", renderBoard);
$("#deptFilter").addEventListener("change", renderBoard);
$("#incompleteOnly").addEventListener("change", renderOnboarding);

/* ===== Start ===== */
$("#companyName").textContent = COMPANY;
$("#plantName").textContent = PLANT;
$("#authBrand").textContent = COMPANY;
fillSelect($("#deptFilter"), [["","All departments"],...DEPTS.map(d => [d.name,d.name])], "");
renderAll();

if (SUPABASE_URL.includes("YOUR-PROJECT-ID")){
  showAuth("login", "Setup needed: put your Supabase URL and anon key at the top of app.js.");
} else {
  startSession().catch(e => showAuth("login", friendly(e)));
}
