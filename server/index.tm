<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>AUTO PRINT SERVER — Admin Panel</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f4f7f6;color:#17201c}
.top{height:62px;background:#062e52;color:#fff;display:flex;align-items:center;padding:0 22px;font-weight:700}.brand{font-size:18px}
.layout{display:flex;min-height:calc(100vh - 62px)}.side{width:225px;background:#082f4f;color:#fff;padding:16px 10px}
.side a{display:block;color:#dbe8f1;text-decoration:none;padding:12px 13px;border-radius:7px;margin:3px 0;font-size:14px;cursor:pointer}
.side a:hover,.side a.active{background:#14526f}.side a.active{border-left:4px solid #22a85b}
.main{flex:1;padding:24px;overflow:auto}.title{font-size:25px;margin:0 0 5px}.sub{color:#64746d;margin-bottom:20px}
.card{background:#fff;border:1px solid #d8e1dd;border-radius:11px;padding:18px;margin-bottom:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.field{margin:10px 0}.field label{display:block;color:#19633f;font-size:13px;font-weight:700;margin-bottom:6px}
input{width:100%;padding:11px;border:1px solid #cbd6d1;border-radius:6px;font-size:14px}
button{border:0;border-radius:6px;padding:10px 16px;background:#08783f;color:#fff;font-weight:700;cursor:pointer}button.secondary{background:#eaf2ee;color:#17623d}
.panel-title{color:#19633f;font-weight:800;margin:0 0 8px}.qrbox{text-align:center;border:1px solid #d8e1dd;border-radius:8px;padding:12px}
.qrbox img{width:180px;height:180px;object-fit:contain}.tabs{display:flex;border-bottom:1px solid #d8e1dd;margin:-18px -18px 18px;padding:0 18px}
.tab{padding:13px 18px;color:#557064}.tab.active{color:#08783f;font-weight:800;border-bottom:3px solid #08783f}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:11px 8px;border-bottom:1px solid #e4ebe7;text-align:left}th{color:#53675e}
.badge{display:inline-block;padding:4px 8px;border-radius:20px;font-size:11px;font-weight:700}.online{background:#dff5e6;color:#08783f}.offline{background:#fbe2e2;color:#9b2226}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.stat{background:#fff;border:1px solid #d8e1dd;border-radius:10px;padding:16px}.stat b{font-size:25px}.muted{color:#687a72}
.bottom{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.feature{background:#fff;border:1px solid #d8e1dd;border-radius:10px;padding:16px}.feature b{display:block;color:#145c3a;margin-bottom:5px}
.hidden{display:none}.notice{padding:12px;border-radius:8px;background:#fff7db;border:1px solid #f0dc9a;color:#66520b;font-size:13px}
@media(max-width:900px){.side{width:180px}.grid,.stats,.bottom{grid-template-columns:1fr}.main{padding:14px}}
</style></head><body>
<div class="top"><div class="brand">🖨️ &nbsp;AUTO PRINT SERVER</div></div>
<div class="layout"><aside class="side">
<a class="active" data-page="dashboard">⌂ &nbsp; Dashboard</a><a data-page="clients">▣ &nbsp; Clients / PCs</a>
<a data-page="qr">▦ &nbsp; QR Codes</a><a data-page="payment">▣ &nbsp; Payment Settings</a>
<a data-page="jobs">▤ &nbsp; Jobs / Queue</a><a data-page="logs">☷ &nbsp; Logs</a>
<a data-page="settings">⚙ &nbsp; Settings</a><a data-page="users">♙ &nbsp; Users</a>
<a data-page="backup">▣ &nbsp; Backup</a><a data-page="system">◉ &nbsp; System</a></aside>
<main class="main">

<section id="dashboard" class="page"><h1 class="title">Dashboard</h1><div class="sub">Auto Print Server overview</div>
<div class="stats"><div class="stat"><div class="muted">Clients / PCs</div><b id="sc">0</b></div><div class="stat"><div class="muted">Online</div><b id="so">0</b></div>
<div class="stat"><div class="muted">Queued Jobs</div><b id="sq">0</b></div><div class="stat"><div class="muted">Total Jobs</div><b id="sj">0</b></div></div></section>

<section id="payment" class="page hidden"><h1 class="title">Payment Settings</h1><div class="sub">Default/main payment and optional per-client payment details</div>
<div class="card"><div class="tabs"><div class="tab active">Default (Main) Payment</div><div class="tab">Per Client Payment Settings</div></div>
<div class="grid"><div><h3 class="panel-title">DEFAULT (MAIN) PAYMENT DETAILS</h3><p class="muted">Used when client UPI is not set</p>
<div class="field"><label>UPI ID / UPI Number</label><input id="upi" placeholder="9097676711@upi"></div>
<div class="field"><label>UPI Number</label><input id="un" placeholder="9097676711"></div>
<div class="field"><label>UPI QR Code</label><div class="qrbox"><img id="qr" alt="UPI QR" style="display:none"><br><input id="qrf" type="file" accept="image/*"><br><button class="secondary" onclick="clearQR()">Remove QR</button></div></div>
</div>
<div><h3 class="panel-title">CLIENT PAYMENT SETTINGS</h3><p class="muted">Set different UPI for each client (optional)</p>
<table><thead><tr><th>ID</th><th>Client Name</th><th>UPI ID / Number</th><th>QR</th><th>Status</th><th>Action</th></tr></thead><tbody id="ct"></tbody></table></div></div>
<hr style="border:0;border-top:1px solid #e1e8e4;margin:18px 0"><h3 class="panel-title">AMOUNT SETTINGS</h3>
<div class="grid"><div class="field"><label>Base Amount (Per Job)</label><input id="base" type="number"></div><div class="field"><label>B/W Per Page</label><input id="bw" type="number"></div>
<div class="field"><label>Colour Per Page</label><input id="co" type="number"></div><div class="field"><label>Min Amount</label><input id="mi" type="number"></div></div>
<button onclick="save()">Save Settings</button><p id="saved" class="notice hidden">Settings saved.</p></div></section>

<section id="clients" class="page hidden"><h1 class="title">Clients / PCs</h1><div class="sub">Server-generated unique Client IDs</div>
<div class="card"><button onclick="reg()">+ Register New Client</button><table style="margin-top:15px"><thead><tr><th>Client</th><th>Client ID</th><th>Shop</th><th>Status</th><th>Customer Page</th></tr></thead><tbody id="cl"></tbody></table></div></section>

<section id="qrpage" class="page hidden"></section>
<section id="qr" class="page hidden"><h1 class="title">QR Codes</h1><div class="sub">Each QR is bound to one Client ID</div><div class="card" id="qrs"></div></section>
<section id="jobs" class="page hidden"><h1 class="title">Jobs / Queue</h1><div class="sub">All customer print jobs</div><div class="card"><table><thead><tr><th>File</th><th>Client</th><th>Options</th><th>Amount</th><th>Status</th></tr></thead><tbody id="jt"></tbody></table></div></section>
<section id="logs" class="page hidden"><h1 class="title">Logs</h1><div class="card">Server activity and print events.</div></section>
<section id="settings" class="page hidden"><h1 class="title">Settings</h1><div class="card"><div class="notice">Use HTTPS and admin authentication for production.</div></div></section>
<section id="users" class="page hidden"><h1 class="title">Users</h1><div class="card">Admin users management.</div></section>
<section id="backup" class="page hidden"><h1 class="title">Backup</h1><div class="card">Database backup tools.</div></section>
<section id="system" class="page hidden"><h1 class="title">System</h1><div class="card" id="health">Checking server...</div></section>

<div class="bottom" style="margin-top:20px"><div class="feature">🛡️ <b>SECURE & RELIABLE</b>Secure API and client IDs.</div>
<div class="feature">☁️ <b>REAL-TIME</b>Jobs sent to the correct client queue.</div>
<div class="feature">♻️ <b>AUTO PROCESS</b>Auto print and cleanup.</div><div class="feature">🗄️ <b>DATABASE</b>Jobs, clients and settings.</div></div>
</main></div>
<script>
let S={},C=[],J=[];const $=x=>document.getElementById(x);
async function api(u,o){let r=await fetch(u,o);let x={};try{x=await r.json()}catch{}return x}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function show(p){document.querySelectorAll('.page').forEach(x=>x.classList.add('hidden'));$(p).classList.remove('hidden');document.querySelectorAll('.side a').forEach(a=>a.classList.toggle('active',a.dataset.page===p));render()}
document.querySelectorAll('.side a').forEach(a=>a.onclick=()=>show(a.dataset.page));
async function load(){S=await api('/api/admin/settings');C=await api('/api/admin/clients');J=await api('/api/admin/jobs');render()}
function render(){
$('sc').textContent=C.length;$('so').textContent=C.filter(x=>x.online).length;$('sq').textContent=J.filter(x=>x.status==='queued').length;$('sj').textContent=J.length;
$('upi').value=S.upiId||'';$('un').value=S.upiNumber||'';$('base').value=S.baseAmount??10;$('bw').value=S.bwPerPage??1;$('co').value=S.colourPerPage??5;$('mi').value=S.minAmount??10;
if(S.paymentQr){$('qr').src=S.paymentQr;$('qr').style.display='inline-block'}else $('qr').style.display='none';
$('ct').innerHTML=C.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.name)}</td><td>${esc(c.upiId||c.upiNumber||'Not Set (Use Default)')}</td><td>${c.paymentQr?'QR':'—'}</td><td><span class="badge ${c.enabled?'online':'offline'}">${c.enabled?'Active':'Disabled'}</span></td><td><button class="secondary" onclick="edit(${c.id})">Edit</button></td></tr>`).join('');
$('cl').innerHTML=C.map(c=>`<tr><td>${esc(c.name)}</td><td><code>${esc(c.clientId)}</code></td><td>${esc(c.shopName)}</td><td><span class="badge ${c.online?'online':'offline'}">${c.online?'Online':'Offline'}</span></td><td><a target="_blank" href="/upload.html?client=${encodeURIComponent(c.clientId)}">Open</a></td></tr>`).join('');
$('qrs').innerHTML=C.map(c=>`<div class="card"><b>${esc(c.name)}</b> — <code>${esc(c.clientId)}</code><br><button onclick="viewQR('${c.clientId}')">Generate / View QR</button></div>`).join('')||'No clients registered.';
$('jt').innerHTML=J.map(j=>`<tr><td>${esc(j.originalName)}</td><td><code>${esc(j.clientId)}</code></td><td>${j.printType}/${j.paper}/×${j.copies}</td><td>₹${j.amount}</td><td>${esc(j.status)}</td></tr>`).join('')||'<tr><td colspan=5>No jobs</td></tr>';
$('health').textContent='Server status: Online • '+new Date().toLocaleString()
}
async function save(){let body={upiId:$('upi').value,upiNumber:$('un').value,baseAmount:+$('base').value,bwPerPage:+$('bw').value,colourPerPage:+$('co').value,minAmount:+$('mi').value};let f=$('qrf').files[0];if(f)body.paymentQr=await dataURL(f);else body.paymentQr=S.paymentQr||'';await api('/api/admin/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});$('saved').classList.remove('hidden');setTimeout(()=>$('saved').classList.add('hidden'),1800);load()}
function dataURL(f){return new Promise((a,b)=>{let r=new FileReader();r.onload=()=>a(r.result);r.onerror=b;r.readAsDataURL(f)})}
async function clearQR(){await api('/api/admin/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({paymentQr:''})});load()}
async function edit(id){let c=C.find(x=>x.id==id),u=prompt('Client UPI ID / Number (blank = default):',c.upiId||'');if(u===null)return;let n=prompt('Client UPI Number:',c.upiNumber||'');if(n===null)return;await api('/api/admin/clients/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({upiId:u,upiNumber:n})});load()}
async function reg(){let n=prompt('Client / PC name:','PC-'+(C.length+1));if(!n)return;let x=await api('/api/client/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,shopName:n})});alert('Unique Client ID: '+x.clientId);load()}
async function viewQR(id){let x=await api('/api/public/'+encodeURIComponent(id)+'/qr');let w=open();w.document.write('<h2>Customer QR</h2><p>'+x.link+'</p><img src="'+x.qr+'" style="width:400px">')}
load();setInterval(load,10000)
</script></body></html>
