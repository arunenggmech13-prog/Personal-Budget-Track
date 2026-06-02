/* ═══════════════════════════════════════════════════
   Home Budget — app.js
   ═══════════════════════════════════════════════════ */

// ─── Storage ──────────────────────────────────────────
const STORAGE_KEY = 'homebudget_v2';

function loadData() {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch(e) {}
  return defaultData();
}
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function defaultData() {
  return {
    transactions: [],
    creditCards: [],
    personalLoans: [],
    categories: {
      income: [
        { id: 'i1', name: 'Salary',       emoji: '💼' },
        { id: 'i2', name: 'Freelance',    emoji: '💻' },
        { id: 'i3', name: 'Investment',   emoji: '📈' },
        { id: 'i4', name: 'Rental',       emoji: '🏠' },
        { id: 'i5', name: 'Other Income', emoji: '💰' },
      ],
      expense: [
        { id: 'e1',  name: 'Food & Dining',  emoji: '🍔' },
        { id: 'e2',  name: 'Groceries',      emoji: '🛒' },
        { id: 'e3',  name: 'Transport',      emoji: '🚗' },
        { id: 'e4',  name: 'Rent',           emoji: '🏡' },
        { id: 'e5',  name: 'Utilities',      emoji: '💡' },
        { id: 'e6',  name: 'Health',         emoji: '🏥' },
        { id: 'e7',  name: 'Shopping',       emoji: '🛍️' },
        { id: 'e8',  name: 'Entertainment',  emoji: '🎬' },
        { id: 'e9',  name: 'Education',      emoji: '📚' },
        { id: 'e10', name: 'Other',          emoji: '📦' },
      ]
    }
  };
}

let state = loadData();
if(!state.personalLoans) state.personalLoans = [];

// ─── View State ────────────────────────────────────────
let currentTab    = 'dashboard';
let currentFilter = 'all';
let currentType   = 'expense';
let selectedSource = 'cash';   // 'cash' | creditCard.id
let selectedEmoji  = '📦';
let selectedColor  = '#6366f1';
let addingCatType  = 'expense';

let viewDate = new Date(); viewDate.setDate(1);

// Chart instances
let dashExpInst=null,dashIncInst=null,dashTrendInst=null;
let expPieInst=null,srcPieInst=null,incPieInst=null,barInst=null;

// ─── Card colors palette ───────────────────────────────
const CARD_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f97316','#eab308','#10b981','#0ea5e9',
  '#14b8a6','#a855f7'
];

// ─── Helpers ───────────────────────────────────────────
const fmt = n => '₹' + (Number(n)||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2});
function fmtC(n) {
  if (n>=1e7) return '₹'+(n/1e7).toFixed(1)+'Cr';
  if (n>=1e5) return '₹'+(n/1e5).toFixed(1)+'L';
  if (n>=1e3) return '₹'+(n/1e3).toFixed(1)+'K';
  return '₹'+n.toFixed(0);
}
const uid   = () => Date.now().toString(36)+Math.random().toString(36).slice(2);
const mnKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const mnName= d => d.toLocaleDateString('en-IN',{month:'long',year:'numeric'});

function getMonthTx(d) {
  const mk = mnKey(d||viewDate);
  return state.transactions.filter(t=>t.date.startsWith(mk));
}
function getCat(id)  {
  if(id && id.startsWith('ccpay_')){
    const cardId = id.replace('ccpay_','');
    const card = getCard(cardId);
    return {
      id: id,
      name: card ? `Pay ${card.name}` : 'Credit Card Payment',
      emoji: '💳'
    };
  }
  if(id && id.startsWith('loanpay_')){
    const loanId = id.replace('loanpay_','');
    const loan = getLoan(loanId);
    return {
      id: id,
      name: loan ? `Pay ${loan.name}` : 'Loan Payment',
      emoji: '🏦'
    };
  }
  return [...state.categories.income,...state.categories.expense].find(c=>c.id===id);
}
function getCard(id) { return state.creditCards.find(c=>c.id===id); }
function getLoan(id) { return state.personalLoans.find(l=>l.id===id); }

function fmtDate(ds) {
  return new Date(ds+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
function fmtGroup(ds) {
  const d=new Date(ds+'T00:00:00');
  const now=new Date(); now.setHours(0,0,0,0);
  const yest=new Date(now); yest.setDate(now.getDate()-1);
  const tx=new Date(d); tx.setHours(0,0,0,0);
  if(tx.getTime()===now.getTime())  return 'Today';
  if(tx.getTime()===yest.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'short'});
}

function showToast(msg) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2400);
}
function destroyChart(c){if(c){try{c.destroy();}catch(e){}}return null;}

const PAL_EXP=['#ff4f7b','#ff8c69','#fbbf24','#f97316','#ef4444','#ec4899','#a855f7','#8b5cf6','#6366f1','#f43f5e'];
const PAL_INC=['#00e87b','#00bfa5','#22d3ee','#34d399','#10b981','#6ee7b7','#a3e635','#4ade80','#2dd4bf','#38bdf8'];

const BASE_CHART = {
  responsive:true, maintainAspectRatio:false,
  plugins:{
    legend:{display:false},
    tooltip:{
      backgroundColor:'rgba(26,26,62,0.97)',
      borderColor:'rgba(255,255,255,0.1)',borderWidth:1,
      titleColor:'#f0f0ff',bodyColor:'#a0a0cc',padding:10,cornerRadius:10
    }
  }
};

// ─── Month navigation ──────────────────────────────────
function setMonthLabels() {
  const label = mnName(viewDate);
  ['currentMonthLabel','dashboardMonth','txMonthLabel','cardsMonthLabel','chartMonthLabel','loansMonthLabel']
    .forEach(id=>{const el=document.getElementById(id); if(el) el.textContent=label;});
}
document.getElementById('prevMonth').addEventListener('click',()=>{viewDate.setMonth(viewDate.getMonth()-1);setMonthLabels();refresh();});
document.getElementById('nextMonth').addEventListener('click',()=>{viewDate.setMonth(viewDate.getMonth()+1);setMonthLabels();refresh();});

// ─── Bottom nav ────────────────────────────────────────
document.querySelectorAll('.nav-btn[data-tab]').forEach(btn=>{
  btn.addEventListener('click',()=>switchTab(btn.dataset.tab));
});
document.getElementById('navAdd').addEventListener('click', openAddModal);

// delegate see-all / manage buttons
document.addEventListener('click', e=>{
  const btn = e.target.closest('.see-all-btn[data-tab]');
  if (btn) switchTab(btn.dataset.tab);
});

function switchTab(tab) {
  currentTab=tab;
  document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-btn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.getElementById('tab'+tab[0].toUpperCase()+tab.slice(1)).classList.add('active');
  refresh();
}

// ─── Summary cards ─────────────────────────────────────
function renderSummary() {
  const txs     = getMonthTx();
  const income  = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const balance = income-expense;

  // Total credit outstanding = existingDue + all-time credit card charges - all-time payments
  const allTx = state.transactions.filter(t=>t.type==='expense');
  const totalCreditOutstanding = state.creditCards.reduce((sum, card)=>{
    const cardCharges = allTx.filter(t=>t.source===card.id).reduce((s,t)=>s+t.amount,0);
    const cardPayments = state.transactions.filter(t=>t.type==='expense'&&t.categoryId===`ccpay_${card.id}`).reduce((s,t)=>s+t.amount,0);
    return sum + (card.existingDue||0) + cardCharges - cardPayments;
  }, 0);

  // Total loan outstanding = existingDue - payments
  const totalLoanOutstanding = state.personalLoans.reduce((sum, loan)=>{
    const loanPayments = state.transactions.filter(t=>t.type==='expense'&&t.categoryId===`loanpay_${loan.id}`).reduce((s,t)=>s+t.amount,0);
    return sum + Math.max(0, (loan.existingDue||0) - loanPayments);
  }, 0);

  document.getElementById('totalIncome').textContent  = fmt(income);
  document.getElementById('totalExpense').textContent = fmt(expense);
  const balEl=document.getElementById('totalBalance');
  balEl.textContent = fmt(Math.abs(balance));
  balEl.style.color = balance>=0?'var(--income)':'var(--expense)';

  const ccCard=document.getElementById('creditSummaryCard');
  if(state.creditCards.length>0){
    ccCard.style.display='flex';
    document.getElementById('totalCredit').textContent=fmt(totalCreditOutstanding);
  } else {
    ccCard.style.display='none';
  }

  const loanCard=document.getElementById('loanSummaryCard');
  if(state.personalLoans.length>0){
    loanCard.style.display='flex';
    document.getElementById('totalLoanOutstanding').textContent=fmt(totalLoanOutstanding);
  } else {
    loanCard.style.display='none';
  }
}

// ─── Transaction List ──────────────────────────────────
function renderTxList(containerId, emptyId, txs) {
  const cont=document.getElementById(containerId);
  const emp =document.getElementById(emptyId);
  cont.innerHTML='';
  if(!txs.length){emp.classList.remove('hidden');return;}
  emp.classList.add('hidden');

  const groups={};
  txs.forEach(tx=>{(groups[tx.date]=groups[tx.date]||[]).push(tx);});
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(date=>{
    const hdr=document.createElement('div');
    hdr.className='date-group-header'; hdr.textContent=fmtGroup(date);
    cont.appendChild(hdr);

    groups[date].forEach(tx=>{
      const cat=getCat(tx.categoryId);
      const card=tx.source&&tx.source!=='cash'?getCard(tx.source):null;

      // source badge
      let sourceBadge='';
      if(tx.type==='expense'){
        if(card){
          sourceBadge=`<span class="tx-source-badge credit" style="border-color:${card.color}40;color:${card.color};background:${card.color}18">💳 ${card.name} ••${card.last4}</span>`;
        } else {
          sourceBadge=`<span class="tx-source-badge cash">🏦 Bank / Cash</span>`;
        }
      }

      const item=document.createElement('div');
      item.className=`tx-item ${tx.type}`;
      item.innerHTML=`
        <div class="tx-emoji">${cat?cat.emoji:'📦'}</div>
        <div class="tx-info">
          <div class="tx-category">${cat?cat.name:'Unknown'}</div>
          <div class="tx-badges">
            ${sourceBadge}
            ${tx.note?`<div class="tx-note-pill"><span class="note-icon">📝</span>${tx.note}</div>`:''}
          </div>
        </div>
        <div class="tx-right">
          <div class="tx-amount">${tx.type==='expense'?'-':'+'}${fmt(tx.amount)}</div>
          <div class="tx-date-badge">${fmtDate(tx.date)}</div>
        </div>
        <button class="tx-delete" data-id="${tx.id}" aria-label="Delete">✕</button>
      `;
      cont.appendChild(item);
    });
  });

  cont.querySelectorAll('.tx-delete').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      state.transactions=state.transactions.filter(t=>t.id!==btn.dataset.id);
      saveData(); refresh(); showToast('Transaction deleted');
    });
  });
}

function renderRecent() {
  const txs=getMonthTx().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  renderTxList('recentList','recentEmpty',txs);
}
function renderAllTx() {
  let txs=getMonthTx().sort((a,b)=>b.date.localeCompare(a.date));
  if(currentFilter!=='all') txs=txs.filter(t=>t.type===currentFilter);
  renderTxList('transactionList','transactionEmpty',txs);
}

document.querySelectorAll('.filter-chip').forEach(chip=>{
  chip.addEventListener('click',()=>{
    document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active'); currentFilter=chip.dataset.filter; renderAllTx();
  });
});

// ─── Credit Cards ──────────────────────────────────────
function renderCards() {
  const list   = document.getElementById('cardsList');
  const noCards= document.getElementById('noCardsState');
  list.innerHTML='';

  if(!state.creditCards.length){ noCards.style.display='flex'; return; }
  noCards.style.display='none';

  // all-time charges per card (not just this month)
  const allExpTx = state.transactions.filter(t=>t.type==='expense');
  const monthTx  = getMonthTx().filter(t=>t.type==='expense');

  state.creditCards.forEach(card=>{
    const existingDue  = card.existingDue||0;
    const totalCharged = allExpTx.filter(t=>t.source===card.id).reduce((s,t)=>s+t.amount,0);
    const thisMonth    = monthTx.filter(t=>t.source===card.id).reduce((s,t)=>s+t.amount,0);
    
    // Payments made to this card (all-time)
    const totalPayments = state.transactions.filter(t=>t.type==='expense'&&t.categoryId===`ccpay_${card.id}`).reduce((s,t)=>s+t.amount,0);
    const totalOutstanding = existingDue + totalCharged - totalPayments;
    const availableLimit = card.limit>0 ? (card.limit - totalOutstanding) : 0;
    
    const utilBase     = card.limit>0 ? card.limit : 0;
    const pct          = utilBase>0 ? Math.min(100,Math.max(0,(totalOutstanding/utilBase)*100)) : 0;

    const widget=document.createElement('div');
    widget.className='cc-widget';
    widget.style.background=`linear-gradient(135deg,${card.color}cc,${card.color}88)`;
    widget.style.boxShadow =`0 8px 32px ${card.color}44`;

    widget.innerHTML=`
      <div class="cc-chip">💳 Credit Card</div>
      <div class="cc-name">${card.name}</div>
      <div class="cc-last4">•••• •••• •••• ${card.last4||'????'}</div>

      <div class="cc-stats">
        <div>
          <div class="cc-stat-label">This Month Spent</div>
          <div class="cc-stat-val">${fmt(thisMonth)}</div>
        </div>
        ${card.limit>0?`
        <div>
          <div class="cc-stat-label">Available Limit</div>
          <div class="cc-stat-val" style="color:#00e87b;font-weight:700">${fmt(availableLimit)}</div>
        </div>
        <div>
          <div class="cc-stat-label">Credit Limit</div>
          <div class="cc-stat-val">${fmtC(card.limit)}</div>
        </div>
        `:''}
      </div>

      ${existingDue>0?`
      <div class="cc-outstanding-row">
        <span class="oo-label">📂 Opening / Existing Due</span>
        <span class="oo-val">${fmt(existingDue)}</span>
      </div>`:''}
      ${totalCharged>0?`
      <div class="cc-outstanding-row">
        <span class="oo-label">🧾 All New Charges</span>
        <span class="oo-val">${fmt(totalCharged)}</span>
      </div>`:''}
      ${totalPayments>0?`
      <div class="cc-outstanding-row payment-row" style="background:rgba(0,232,123,0.06);border-color:rgba(0,232,123,0.15)">
        <span class="oo-label" style="color:rgba(0,232,123,0.85)">🟢 Total Payments</span>
        <span class="oo-val" style="color:#00e87b">-${fmt(totalPayments)}</span>
      </div>`:''}
      <div class="cc-outstanding-row total-row">
        <span class="oo-label">💳 Total Outstanding</span>
        <span class="oo-val">${fmt(totalOutstanding)}</span>
      </div>
      ${card.limit>0?`
      <div class="cc-outstanding-row available-row" style="background:rgba(0,232,123,0.12);border-color:rgba(0,232,123,0.25)">
        <span class="oo-label" style="color:rgba(255,255,255,0.85);font-weight:600">🟢 Available Limit</span>
        <span class="oo-val" style="color:#00e87b;font-size:16px">${fmt(availableLimit)}</span>
      </div>`:''}

      ${utilBase>0?`
        <div style="margin-top:10px;position:relative;z-index:1">
          <div class="cc-progress-bar">
            <div class="cc-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="cc-progress-label">${pct.toFixed(0)}% of limit utilized</div>
        </div>
      `:''}

      <div class="cc-actions">
        <button class="cc-action-btn" data-edit-due="${card.id}">✏️ Edit Due</button>
        <button class="cc-action-btn danger" data-del-card="${card.id}">Delete</button>
      </div>
    `;
    list.appendChild(widget);
  });

  // Delete card handlers
  list.querySelectorAll('[data-del-card]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=btn.dataset.delCard;
      const inUse=state.transactions.some(t=>t.source===id || t.categoryId===`ccpay_${id}`);
      if(inUse){showToast('Card has transactions/payments — delete those first');return;}
      state.creditCards=state.creditCards.filter(c=>c.id!==id);
      saveData(); renderCards(); renderSummary();
      showToast('Card removed');
    });
  });

  // Edit Due handlers
  list.querySelectorAll('[data-edit-due]').forEach(btn=>{
    btn.addEventListener('click',()=>openEditDueModal(btn.dataset.editDue));
  });

  // Dashboard credit mini section
  const dashSection=document.getElementById('dashCreditSection');
  const dashList   =document.getElementById('dashCreditCards');
  if(state.creditCards.length>0){
    dashSection.style.display='block';
    dashList.innerHTML='';
    state.creditCards.forEach(card=>{
      const existingDue    = card.existingDue||0;
      const totalCharged   = allExpTx.filter(t=>t.source===card.id).reduce((s,t)=>s+t.amount,0);
      const totalPayments  = state.transactions.filter(t=>t.type==='expense'&&t.categoryId===`ccpay_${card.id}`).reduce((s,t)=>s+t.amount,0);
      const totalOutstanding = existingDue + totalCharged - totalPayments;
      const pct = card.limit>0?Math.min(100,Math.max(0,(totalOutstanding/card.limit)*100)):0;
      const row=document.createElement('div');
      row.className='dash-cc-row';
      row.innerHTML=`
        <div class="dash-cc-dot" style="background:${card.color}"></div>
        <div class="dash-cc-name">${card.name} ••${card.last4}</div>
        ${card.limit>0?`<div class="dash-cc-bar-wrap">
          <div class="dash-cc-bar"><div class="dash-cc-bar-fill" style="width:${pct}%;background:${card.color}"></div></div>
        </div>`:''}
        <div class="dash-cc-amt">${fmt(totalOutstanding)}</div>
      `;
      dashList.appendChild(row);
    });
  } else {
    dashSection.style.display='none';
  }
}

// ─── Categories ────────────────────────────────────────
function renderCategories() {
  ['income','expense'].forEach(type=>{
    const el=document.getElementById(type==='income'?'incomeCatList':'expenseCatList');
    el.innerHTML='';
    state.categories[type].forEach(cat=>{
      const count=state.transactions.filter(t=>t.categoryId===cat.id).length;
      const item=document.createElement('div'); item.className='cat-item';
      item.innerHTML=`
        <span class="cat-emoji">${cat.emoji}</span>
        <span class="cat-name">${cat.name}</span>
        <span class="cat-count">${count} tx</span>
        <button class="cat-delete" data-id="${cat.id}" data-type="${type}" aria-label="Delete">✕</button>
      `;
      el.appendChild(item);
    });

    // Dynamically display credit cards under expense categories
    if(type==='expense' && state.creditCards.length>0){
      state.creditCards.forEach(card=>{
        const count=state.transactions.filter(t=>t.categoryId===`ccpay_${card.id}`).length;
        const item=document.createElement('div'); item.className='cat-item cc-payment-cat';
        item.style.borderColor=card.color+'40';
        item.innerHTML=`
          <span class="cat-emoji">💳</span>
          <span class="cat-name" style="color:${card.color};font-weight:600">Pay ${card.name} ••${card.last4}</span>
          <span class="cat-count">${count} tx</span>
          <span style="font-size:10px;color:var(--text3);margin-left:auto;padding-right:6px">System</span>
        `;
        el.appendChild(item);
      });
    }

    // Dynamically display personal loans under expense categories
    if(type==='expense' && state.personalLoans.length>0){
      state.personalLoans.forEach(loan=>{
        const count=state.transactions.filter(t=>t.categoryId===`loanpay_${loan.id}`).length;
        const item=document.createElement('div'); item.className='cat-item loan-payment-cat';
        item.style.borderColor=loan.color+'40';
        item.innerHTML=`
          <span class="cat-emoji">🏦</span>
          <span class="cat-name" style="color:${loan.color};font-weight:600">Pay ${loan.name}</span>
          <span class="cat-count">${count} tx</span>
          <span style="font-size:10px;color:var(--text3);margin-left:auto;padding-right:6px">System</span>
        `;
        el.appendChild(item);
      });
    }

    el.querySelectorAll('.cat-delete').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(state.transactions.some(t=>t.categoryId===btn.dataset.id)){showToast('Category in use');return;}
        state.categories[btn.dataset.type]=state.categories[btn.dataset.type].filter(c=>c.id!==btn.dataset.id);
        saveData(); renderCategories(); showToast('Category removed');
      });
    });
  });
}

// ─── Charts ────────────────────────────────────────────
function catTotals(type){
  const map={};
  getMonthTx().filter(t=>t.type===type).forEach(tx=>{
    const cat=getCat(tx.categoryId);
    const nm=cat?cat.name:'Other';
    map[nm]=(map[nm]||0)+tx.amount;
  });
  const labels=Object.keys(map), amounts=Object.values(map);
  const total=amounts.reduce((s,v)=>s+v,0);
  return{labels,amounts,total};
}

function sourceTotals(){
  // breakdown of expense by payment source
  const map={'Bank / Cash':0};
  state.creditCards.forEach(c=>{map[c.name+' ••'+c.last4]=0;});
  getMonthTx().filter(t=>t.type==='expense').forEach(tx=>{
    if(!tx.source||tx.source==='cash'){
      map['Bank / Cash']=(map['Bank / Cash']||0)+tx.amount;
    } else {
      const card=getCard(tx.source);
      if(card){
        const key=card.name+' ••'+card.last4;
        map[key]=(map[key]||0)+tx.amount;
      }
    }
  });
  const labels=Object.keys(map).filter(k=>map[k]>0);
  const amounts=labels.map(k=>map[k]);
  const palette=labels.map((l,i)=>{
    if(l==='Bank / Cash') return '#a78bfa';
    const idx=state.creditCards.findIndex(c=>l===c.name+' ••'+c.last4);
    return idx>=0?state.creditCards[idx].color:PAL_EXP[i%PAL_EXP.length];
  });
  return{labels,amounts,palette};
}

function buildDonut(canvasId,labels,data,palette,centerId,legendId){
  const ctx=document.getElementById(canvasId).getContext('2d');
  const total=data.reduce((s,v)=>s+v,0);
  if(centerId) document.getElementById(centerId).textContent=fmtC(total);

  const chart=new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:palette.slice(0,data.length),borderColor:'transparent',borderWidth:0,hoverOffset:6}]},
    options:{...BASE_CHART,cutout:'68%',plugins:{...BASE_CHART.plugins,tooltip:{...BASE_CHART.plugins.tooltip,callbacks:{label:c=>` ${c.label}: ${fmt(c.raw)}`}}}}
  });

  if(legendId){
    const leg=document.getElementById(legendId);
    leg.innerHTML='';
    if(total===0){
      leg.innerHTML='<div class="legend-item"><span style="color:var(--text3);font-size:11px">No data</span></div>';
    } else {
      labels.forEach((l,i)=>{
        const pct=((data[i]/total)*100).toFixed(0);
        const item=document.createElement('div'); item.className='legend-item';
        item.innerHTML=`<span class="legend-dot" style="background:${palette[i]}"></span><span class="legend-label">${l}</span><span class="legend-pct">${pct}%</span>`;
        leg.appendChild(item);
      });
    }
  }
  return chart;
}

function buildFullDonut(canvasId,labels,data,amounts,palette,legendId){
  const ctx=document.getElementById(canvasId).getContext('2d');
  const total=data.reduce((s,v)=>s+v,0);
  const chart=new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:palette.slice(0,data.length),borderColor:'transparent',borderWidth:0,hoverOffset:8}]},
    options:{...BASE_CHART,cutout:'60%',plugins:{...BASE_CHART.plugins,tooltip:{...BASE_CHART.plugins.tooltip,callbacks:{label:c=>` ${c.label}: ${fmt(c.raw)}`}}}}
  });
  const leg=document.getElementById(legendId);
  leg.innerHTML='';
  if(total===0){
    leg.innerHTML='<div class="legend-item"><span style="color:var(--text3);font-size:12px">No data this month</span></div>';
  } else {
    labels.forEach((l,i)=>{
      const pct=((data[i]/total)*100).toFixed(1);
      const item=document.createElement('div'); item.className='legend-item';
      item.innerHTML=`
        <span class="legend-dot" style="background:${palette[i]};width:10px;height:10px"></span>
        <span class="legend-label">${l}</span>
        <span class="legend-pct">${pct}%</span>
        <span class="legend-amount">${fmt(amounts[i])}</span>
      `;
      leg.appendChild(item);
    });
  }
  return chart;
}

function buildBar(canvasId,months,incomes,expenses){
  const ctx=document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx,{
    type:'bar',
    data:{labels:months,datasets:[
      {label:'Income', data:incomes, backgroundColor:'rgba(0,232,123,0.75)',borderRadius:7,borderSkipped:false,barPercentage:0.42},
      {label:'Expense',data:expenses,backgroundColor:'rgba(255,79,123,0.75)',borderRadius:7,borderSkipped:false,barPercentage:0.42}
    ]},
    options:{
      ...BASE_CHART,
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(240,240,255,0.5)',font:{size:10,family:'Inter'}}},
        y:{grid:{color:'rgba(255,255,255,0.04)'},beginAtZero:true,ticks:{color:'rgba(240,240,255,0.5)',font:{size:10,family:'Inter'},callback:v=>fmtC(v)}}
      },
      plugins:{
        ...BASE_CHART.plugins,
        legend:{display:true,position:'top',labels:{color:'rgba(240,240,255,0.7)',font:{size:11,family:'Inter'},usePointStyle:true,pointStyle:'circle',boxWidth:8,boxHeight:8}},
        tooltip:{...BASE_CHART.plugins.tooltip,callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.raw)}`}}
      }
    }
  });
}

function last6(){
  const months=[],inc=[],exp=[];
  for(let i=5;i>=0;i--){
    const d=new Date(viewDate); d.setMonth(viewDate.getMonth()-i);
    months.push(d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}));
    const mk=mnKey(d);
    const tx=state.transactions.filter(t=>t.date.startsWith(mk));
    inc.push(tx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0));
    exp.push(tx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0));
  }
  return{months,inc,exp};
}

function renderDashCharts(){
  dashExpInst=destroyChart(dashExpInst);
  dashIncInst=destroyChart(dashIncInst);
  dashTrendInst=destroyChart(dashTrendInst);

  const exp=catTotals('expense'), inc=catTotals('income');
  const expL=exp.labels.length?exp.labels:['No data'];
  const expA=exp.amounts.length?exp.amounts:[1];
  const expP=exp.amounts.length?PAL_EXP:['rgba(255,255,255,0.08)'];
  const incL=inc.labels.length?inc.labels:['No data'];
  const incA=inc.amounts.length?inc.amounts:[1];
  const incP=inc.amounts.length?PAL_INC:['rgba(255,255,255,0.08)'];

  dashExpInst=buildDonut('dashExpenseChart',expL,expA,expP,'dashExpenseCenter','dashExpenseLegend');
  if(!exp.amounts.length) document.getElementById('dashExpenseCenter').textContent='₹0';
  dashIncInst=buildDonut('dashIncomeChart',incL,incA,incP,'dashIncomeCenter','dashIncomeLegend');
  if(!inc.amounts.length) document.getElementById('dashIncomeCenter').textContent='₹0';

  const {months,inc:incArr,exp:expArr}=last6();
  dashTrendInst=buildBar('dashTrendChart',months,incArr,expArr);
}

function renderChartTab(){
  expPieInst=destroyChart(expPieInst);
  srcPieInst=destroyChart(srcPieInst);
  incPieInst=destroyChart(incPieInst);
  barInst   =destroyChart(barInst);

  const exp=catTotals('expense'),inc=catTotals('income');
  const src=sourceTotals();

  const expL=exp.labels.length?exp.labels:['No data'];
  const expA=exp.amounts.length?exp.amounts:[1];
  const expP=exp.amounts.length?PAL_EXP:['rgba(255,255,255,0.08)'];
  const incL=inc.labels.length?inc.labels:['No data'];
  const incA=inc.amounts.length?inc.amounts:[1];
  const incP=inc.amounts.length?PAL_INC:['rgba(255,255,255,0.08)'];

  expPieInst=buildFullDonut('expensePieChart',expL,expA,exp.amounts,expP,'expensePieLegend');
  const srcL=src.labels.length?src.labels:['No data'];
  const srcA=src.amounts.length?src.amounts:[1];
  const srcP=src.amounts.length?src.palette:['rgba(255,255,255,0.08)'];
  srcPieInst=buildFullDonut('expenseSourceChart',srcL,srcA,src.amounts,srcP,'expenseSourceLegend');
  incPieInst=buildFullDonut('incomePieChart',incL,incA,inc.amounts,incP,'incomePieLegend');
  const {months,inc:incArr,exp:expArr}=last6();
  barInst=buildBar('barCompareChart',months,incArr,expArr);
}

// ─── Main refresh ───────────────────────────────────────
function refresh(){
  renderSummary();
  if(currentTab==='dashboard')   {renderRecent();renderDashCharts();renderCards();renderLoans();}
  if(currentTab==='transactions'){renderAllTx();}
  if(currentTab==='cards')       {renderCards();renderCategories();}
  if(currentTab==='loans')       {renderLoans();renderCategories();}
  if(currentTab==='charts')      {renderChartTab();}
}

// ─── Add Transaction Modal ──────────────────────────────
function populateCatSelect(type){
  const sel=document.getElementById('txCategory');
  sel.innerHTML='<option value="">Select category...</option>';
  state.categories[type].forEach(cat=>{
    const o=document.createElement('option');
    o.value=cat.id; o.textContent=`${cat.emoji} ${cat.name}`; sel.appendChild(o);
  });
  
  if(type==='expense' && state.creditCards.length>0){
    const optGroup=document.createElement('optgroup');
    optGroup.label='Credit Card Bill Payment';
    state.creditCards.forEach(card=>{
      const o=document.createElement('option');
      o.value=`ccpay_${card.id}`;
      o.textContent=`💳 Pay ${card.name} ••${card.last4}`;
      optGroup.appendChild(o);
    });
    sel.appendChild(optGroup);
  }

  if(type==='expense' && state.personalLoans.length>0){
    const optGroup=document.createElement('optgroup');
    optGroup.label='Personal Loan Repayments';
    state.personalLoans.forEach(loan=>{
      const o=document.createElement('option');
      o.value=`loanpay_${loan.id}`;
      o.textContent=`🏦 Pay ${loan.name}`;
      optGroup.appendChild(o);
    });
    sel.appendChild(optGroup);
  }
}

function buildPayFromRow(){
  const row=document.getElementById('payFromRow');
  row.innerHTML='';

  // Bank / Cash
  const cashBtn=document.createElement('button');
  cashBtn.className='pay-source-btn'+(selectedSource==='cash'?' active cash-active':'');
  cashBtn.dataset.source='cash'; cashBtn.id='paySourceCash';
  cashBtn.innerHTML='<span class="pay-source-icon">🏦</span><span>Bank / Cash</span>';
  cashBtn.addEventListener('click',()=>setSource('cash'));
  row.appendChild(cashBtn);

  // One button per credit card
  state.creditCards.forEach(card=>{
    const btn=document.createElement('button');
    btn.className='pay-source-btn'+(selectedSource===card.id?' active':'');
    btn.dataset.source=card.id;
    btn.style.setProperty('--cc-sel-color', card.color);
    btn.innerHTML=`<span class="pay-source-icon">💳</span><span>${card.name} ••${card.last4}</span>`;
    if(selectedSource===card.id){
      btn.style.borderColor=card.color;
      btn.style.background =card.color+'20';
      btn.style.color      =card.color;
      btn.style.boxShadow  =`0 0 12px ${card.color}40`;
    }
    btn.addEventListener('click',()=>setSource(card.id,card.color));
    row.appendChild(btn);
  });
}

function setSource(id, color){
  selectedSource=id;
  document.querySelectorAll('.pay-source-btn').forEach(b=>{
    b.classList.remove('active','cash-active');
    b.style.borderColor=''; b.style.background=''; b.style.color=''; b.style.boxShadow='';
  });
  const active=document.querySelector(`.pay-source-btn[data-source="${id}"]`);
  if(active){
    if(id==='cash'){
      active.classList.add('active','cash-active');
    } else {
      active.classList.add('active');
      active.style.borderColor=color;
      active.style.background =color+'20';
      active.style.color      =color;
      active.style.boxShadow  =`0 0 12px ${color}40`;
    }
  }
}

function openAddModal(){
  currentType='expense'; selectedSource='cash';
  document.getElementById('typeExpense').classList.add('active');
  document.getElementById('typeIncome').classList.remove('active');
  document.getElementById('txAmount').value='';
  document.getElementById('txDate').value=new Date().toISOString().slice(0,10);
  document.getElementById('txNote').value=''; updateNoteCounter();
  populateCatSelect('expense');
  document.getElementById('payFromGroup').style.display='block';
  buildPayFromRow();
  document.getElementById('addModal').classList.add('open');
  setTimeout(()=>document.getElementById('txAmount').focus(),420);
}
function closeAddModal(){document.getElementById('addModal').classList.remove('open');}

function updateNoteCounter(){
  const len=document.getElementById('txNote').value.length;
  const el=document.getElementById('noteCounter');
  el.textContent=`${len}/200`;
  el.classList.toggle('warn',len>=160&&len<200);
  el.classList.toggle('over',len>=200);
}

document.getElementById('txNote').addEventListener('input',updateNoteCounter);
document.getElementById('cancelModal').addEventListener('click',closeAddModal);
document.getElementById('addModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeAddModal();});

document.getElementById('typeExpense').addEventListener('click',()=>{
  currentType='expense';
  document.getElementById('typeExpense').classList.add('active');
  document.getElementById('typeIncome').classList.remove('active');
  document.getElementById('payFromGroup').style.display='block';
  populateCatSelect('expense'); buildPayFromRow();
});
document.getElementById('typeIncome').addEventListener('click',()=>{
  currentType='income'; selectedSource='cash';
  document.getElementById('typeIncome').classList.add('active');
  document.getElementById('typeExpense').classList.remove('active');
  document.getElementById('payFromGroup').style.display='none';
  populateCatSelect('income');
});

document.getElementById('saveTransaction').addEventListener('click',()=>{
  const amount    =parseFloat(document.getElementById('txAmount').value);
  const date      =document.getElementById('txDate').value;
  const categoryId=document.getElementById('txCategory').value;
  const note      =document.getElementById('txNote').value.trim();
  const source    =currentType==='income'?'cash':selectedSource;

  if(!amount||amount<=0){showToast('Enter a valid amount');return;}
  if(!date)             {showToast('Select a date');return;}
  if(!categoryId)       {showToast('Select a category');return;}

  state.transactions.push({id:uid(),type:currentType,amount,date,categoryId,note,source});
  saveData(); closeAddModal(); refresh();
  showToast(`${currentType==='income'?'Income':'Expense'} of ${fmt(amount)} saved ✓`);
});

// ─── Add Credit Card Modal ──────────────────────────────
const CARD_COLOR_OPTIONS = CARD_COLORS;
let addCardSelectedColor = CARD_COLOR_OPTIONS[0];

function buildColorPicker(){
  const picker=document.getElementById('colorPicker');
  picker.innerHTML='';
  CARD_COLOR_OPTIONS.forEach(c=>{
    const sw=document.createElement('div');
    sw.className='color-swatch'+(c===addCardSelectedColor?' selected':'');
    sw.style.background=c; sw.style.boxShadow=`0 2px 8px ${c}66`;
    sw.addEventListener('click',()=>{
      addCardSelectedColor=c;
      picker.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    picker.appendChild(sw);
  });
}

document.getElementById('addCardBtn').addEventListener('click',()=>{
  document.getElementById('cardName').value='';
  document.getElementById('cardLast4').value='';
  document.getElementById('cardLimit').value='';
  document.getElementById('cardExistingDue').value='';
  addCardSelectedColor=CARD_COLOR_OPTIONS[0];
  buildColorPicker();
  document.getElementById('addCardModal').classList.add('open');
  setTimeout(()=>document.getElementById('cardName').focus(),420);
});
document.getElementById('cancelCardModal').addEventListener('click',()=>document.getElementById('addCardModal').classList.remove('open'));
document.getElementById('addCardModal').addEventListener('click',e=>{if(e.target===e.currentTarget)document.getElementById('addCardModal').classList.remove('open');});

document.getElementById('saveCardModal').addEventListener('click',()=>{
  const name        = document.getElementById('cardName').value.trim();
  const last4       = document.getElementById('cardLast4').value.trim().slice(-4);
  const limit       = parseFloat(document.getElementById('cardLimit').value)||0;
  const existingDue = parseFloat(document.getElementById('cardExistingDue').value)||0;

  if(!name) {showToast('Enter a card name');return;}
  if(state.creditCards.some(c=>c.name.toLowerCase()===name.toLowerCase())){showToast('Card already exists');return;}

  state.creditCards.push({id:uid(),name,last4:last4||'????',limit,existingDue,color:addCardSelectedColor});
  saveData();
  document.getElementById('addCardModal').classList.remove('open');
  refresh(); showToast(`${name} added ✓`);
});

// ─── Edit Existing Due Modal ────────────────────────────
function openEditDueModal(cardId){
  const card = getCard(cardId);
  if(!card) return;
  document.getElementById('editDueCardId').value = cardId;
  document.getElementById('editDueTitle').textContent = `Update Due — ${card.name}`;
  document.getElementById('editDueAmount').value = card.existingDue||'';
  // preview pill
  const prev = document.getElementById('editDuePreview');
  prev.innerHTML=`
    <div class="due-card-dot" style="background:${card.color}"></div>
    <div class="due-card-name">${card.name}</div>
    <div class="due-card-num">•••• ${card.last4}</div>
  `;
  document.getElementById('editDueModal').classList.add('open');
  setTimeout(()=>document.getElementById('editDueAmount').focus(),420);
}
document.getElementById('cancelEditDue').addEventListener('click',()=>document.getElementById('editDueModal').classList.remove('open'));
document.getElementById('editDueModal').addEventListener('click',e=>{if(e.target===e.currentTarget)document.getElementById('editDueModal').classList.remove('open');});

document.getElementById('saveEditDue').addEventListener('click',()=>{
  const cardId = document.getElementById('editDueCardId').value;
  const amount = parseFloat(document.getElementById('editDueAmount').value)||0;
  const card   = getCard(cardId);
  if(!card){showToast('Card not found');return;}
  card.existingDue = amount;
  saveData();
  document.getElementById('editDueModal').classList.remove('open');
  refresh();
  showToast(`Existing due updated to ${fmt(amount)} ✓`);
});

// ─── Add Category Modal ─────────────────────────────────
const EMOJIS=[
  '🍔','🍕','🍣','☕','🛒','🏠','🚗','🛵','🚌','✈️','💡','💧','📱','💻',
  '👕','👟','🛍️','🎬','🎮','🎵','📚','🏥','💊','🏋️','🏦','💰','💼','📈',
  '🏡','🌿','🎁','🍼','🐶','🐱','🌟','⚡','🔧','🎯','🏆','❤️','🙏','💸',
  '📦','🎓','🛁','🍷','🎂','🚀','🌍','🍀','🦷','🎪','🏄','🧘','🍱','🎻'
];

function openCatModal(type){
  addingCatType=type;
  document.getElementById('catModalTitle').textContent=`Add ${type==='income'?'Income':'Expense'} Category`;
  document.getElementById('catName').value='';
  selectedEmoji=type==='income'?'💰':'📦';
  buildEmojiPicker();
  document.getElementById('catModal').classList.add('open');
  setTimeout(()=>document.getElementById('catName').focus(),420);
}
function closeCatModal(){document.getElementById('catModal').classList.remove('open');}

function buildEmojiPicker(){
  const p=document.getElementById('emojiPicker'); p.innerHTML='';
  EMOJIS.forEach(em=>{
    const btn=document.createElement('button');
    btn.className='emoji-btn'+(em===selectedEmoji?' selected':'');
    btn.textContent=em; btn.type='button';
    btn.addEventListener('click',()=>{
      selectedEmoji=em;
      p.querySelectorAll('.emoji-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    p.appendChild(btn);
  });
}

document.getElementById('addIncomeCategory').addEventListener('click',()=>openCatModal('income'));
document.getElementById('addExpenseCategory').addEventListener('click',()=>openCatModal('expense'));
document.getElementById('cancelCatModal').addEventListener('click',closeCatModal);
document.getElementById('catModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeCatModal();});

document.getElementById('saveCatModal').addEventListener('click',()=>{
  const name=document.getElementById('catName').value.trim();
  if(!name){showToast('Enter a category name');return;}
  if(state.categories[addingCatType].some(c=>c.name.toLowerCase()===name.toLowerCase())){showToast('Category exists');return;}
  state.categories[addingCatType].push({id:uid(),name,emoji:selectedEmoji});
  saveData(); closeCatModal(); renderCategories();
  showToast(`"${name}" added ✓`);
});

// ─── Excel Export ────────────────────────────────────────
document.getElementById('exportExcel').addEventListener('click',()=>{
  const txs=getMonthTx().sort((a,b)=>a.date.localeCompare(b.date));
  const label=mnName(viewDate);
  if(!txs.length){showToast('No transactions to export');return;}

  const header=['Date','Day','Type','Category','Pay From','Amount (₹)','Note'];
  const rows=txs.map(tx=>{
    const cat=getCat(tx.categoryId);
    const d=new Date(tx.date+'T00:00:00');
    let source='—';
    if(tx.type==='expense'){
      if(!tx.source||tx.source==='cash') source='Bank / Cash';
      else { const card=getCard(tx.source); source=card?`${card.name} ••${card.last4}`:'Unknown Card'; }
    }
    return[
      tx.date,
      d.toLocaleDateString('en-IN',{weekday:'long'}),
      tx.type==='income'?'Income':'Expense',
      cat?`${cat.emoji} ${cat.name}`:'Unknown',
      source,
      tx.type==='expense'?-tx.amount:tx.amount,
      tx.note||''
    ];
  });

  const income =txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const balance=income-expense;

  const ccRows = [];
  if (state.creditCards.length > 0) {
    ccRows.push(['Credit Card Summary', '', '', '', '', '', '']);
    state.creditCards.forEach(card => {
      const monthSpent = txs.filter(t => t.type === 'expense' && t.source === card.id).reduce((s, t) => s + t.amount, 0);
      const monthPaid = txs.filter(t => t.type === 'expense' && t.categoryId === `ccpay_${card.id}`).reduce((s, t) => s + t.amount, 0);
      
      ccRows.push([`  ${card.name} ••${card.last4} - Month Spent`, '', '', '', '', -monthSpent, '']);
      ccRows.push([`  ${card.name} ••${card.last4} - Month Payments`, '', '', '', '', monthPaid, '']);
      
      const allTx = state.transactions.filter(t => t.type === 'expense');
      const totalCharged = allTx.filter(t => t.source === card.id).reduce((s, t) => s + t.amount, 0);
      const totalPayments = state.transactions.filter(t => t.type === 'expense' && t.categoryId === `ccpay_${card.id}`).reduce((s, t) => s + t.amount, 0);
      const totalOutstanding = (card.existingDue || 0) + totalCharged - totalPayments;
      
      ccRows.push([`  ${card.name} ••${card.last4} - Total Outstanding`, '', '', '', '', -totalOutstanding, '']);
      if (card.limit > 0) {
        ccRows.push([`  ${card.name} ••${card.last4} - Available Limit`, '', '', '', '', card.limit - totalOutstanding, '']);
      }
    });
  }

  if (state.personalLoans && state.personalLoans.length > 0) {
    ccRows.push([], ['Personal Loans Summary', '', '', '', '', '', '']);
    state.personalLoans.forEach(loan => {
      const monthPaid = txs.filter(t => t.type === 'expense' && t.categoryId === `loanpay_${loan.id}`).reduce((s, t) => s + t.amount, 0);
      ccRows.push([`  ${loan.name} - Month Payments`, '', '', '', '', monthPaid, '']);
      
      const totalPayments = state.transactions.filter(t => t.type === 'expense' && t.categoryId === `loanpay_${loan.id}`).reduce((s, t) => s + t.amount, 0);
      const totalOutstanding = Math.max(0, (loan.existingDue || 0) - totalPayments);
      const totalRepaid = Math.max(0, (loan.principal || 0) - totalOutstanding);
      
      ccRows.push([`  ${loan.name} - Repaid So Far`, '', '', '', '', totalRepaid, '']);
      ccRows.push([`  ${loan.name} - Outstanding Balance`, '', '', '', '', -totalOutstanding, '']);
      ccRows.push([`  ${loan.name} - Total Principal`, '', '', '', '', loan.principal || 0, '']);
    });
  }

  const wsData=[
    header,...rows,[],
    ['SUMMARY','','','','','',''],
    ['Total Income','','','','',income,''],
    ['Total Expense','','','','',-expense,''],
    ['Balance','','','','',balance,''],
    ...(ccRows.length?[['Credit Card Breakdown','','','','','',''],...ccRows]:[])
  ];

  const ws=XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols']=[{wch:12},{wch:12},{wch:10},{wch:20},{wch:20},{wch:14},{wch:34}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,label.replace(/[/\\?*[\]]/g,'_'));
  XLSX.writeFile(wb,`HomeBudget_${label.replace(/\s+/g,'_')}.xlsx`);
  showToast(`Exported ${txs.length} transactions ✓`);
});

// ─── Personal Loans Code ────────────────────────────────
function renderLoans() {
  const list   = document.getElementById('loansList');
  const noLoans= document.getElementById('noLoansState');
  list.innerHTML='';

  if(!state.personalLoans.length){ noLoans.style.display='flex'; return; }
  noLoans.style.display='none';

  state.personalLoans.forEach(loan=>{
    const principal   = loan.principal||0;
    const existingDue = loan.existingDue||0;
    
    // Payments made to this loan (all-time)
    const totalPayments = state.transactions.filter(t=>t.type==='expense'&&t.categoryId===`loanpay_${loan.id}`).reduce((s,t)=>s+t.amount,0);
    const totalOutstanding = Math.max(0, existingDue - totalPayments);
    const totalRepaid = Math.max(0, principal - totalOutstanding);
    const pct = principal>0 ? Math.min(100, (totalRepaid/principal)*100) : 0;

    const widget=document.createElement('div');
    widget.className='loan-widget';
    widget.style.background=`linear-gradient(135deg,${loan.color}cc,${loan.color}88)`;
    widget.style.boxShadow =`0 8px 32px ${loan.color}44`;

    widget.innerHTML=`
      <div class="loan-chip">🏦 Personal Loan</div>
      <div class="cc-name">${loan.name}</div>
      <div class="cc-last4">Repay Progress</div>

      <div class="cc-stats">
        <div>
          <div class="cc-stat-label">Repaid So Far</div>
          <div class="cc-stat-val" style="color:#00e87b">${fmt(totalRepaid)}</div>
        </div>
        <div>
          <div class="cc-stat-label">Outstanding</div>
          <div class="cc-stat-val">${fmt(totalOutstanding)}</div>
        </div>
        <div>
          <div class="cc-stat-label">Total Principal</div>
          <div class="cc-stat-val">${fmt(principal)}</div>
        </div>
      </div>

      ${existingDue>0?`
      <div class="cc-outstanding-row">
        <span class="oo-label">📂 Initial Outstanding</span>
        <span class="oo-val">${fmt(existingDue)}</span>
      </div>`:''}
      ${totalPayments>0?`
      <div class="cc-outstanding-row payment-row" style="background:rgba(0,232,123,0.06);border-color:rgba(0,232,123,0.15)">
        <span class="oo-label" style="color:rgba(0,232,123,0.85)">🟢 Total Repayments</span>
        <span class="oo-val" style="color:#00e87b">-${fmt(totalPayments)}</span>
      </div>`:''}
      <div class="cc-outstanding-row total-row" style="background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.15);">
        <span class="oo-label">🏦 Current Balance Due</span>
        <span class="oo-val">${fmt(totalOutstanding)}</span>
      </div>

      ${principal>0?`
        <div style="margin-top:10px;position:relative;z-index:1">
          <div class="cc-progress-bar">
            <div class="cc-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="cc-progress-label">${pct.toFixed(1)}% of loan repaid</div>
        </div>
      `:''}

      <div class="cc-actions">
        <button class="cc-action-btn" data-edit-loan-due="${loan.id}">✏️ Edit Outstanding</button>
        <button class="cc-action-btn danger" data-del-loan="${loan.id}">Delete</button>
      </div>
    `;
    list.appendChild(widget);
  });

  // Delete loan handlers
  list.querySelectorAll('[data-del-loan]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=btn.dataset.delLoan;
      const inUse=state.transactions.some(t=>t.categoryId===`loanpay_${id}`);
      if(inUse){showToast('Loan has transaction history — delete payments first');return;}
      state.personalLoans=state.personalLoans.filter(l=>l.id!==id);
      saveData(); renderLoans(); renderSummary();
      showToast('Loan removed');
    });
  });

  // Edit Outstanding handlers
  list.querySelectorAll('[data-edit-loan-due]').forEach(btn=>{
    btn.addEventListener('click',()=>openEditLoanDueModal(btn.dataset.editLoanDue));
  });

  // Dashboard loan mini section
  const dashSection=document.getElementById('dashLoanSection');
  const dashList   =document.getElementById('dashLoans');
  if(state.personalLoans.length>0){
    dashSection.style.display='block';
    dashList.innerHTML='';
    state.personalLoans.forEach(loan=>{
      const principal    = loan.principal||0;
      const existingDue  = loan.existingDue||0;
      const totalPayments= state.transactions.filter(t=>t.type==='expense'&&t.categoryId===`loanpay_${loan.id}`).reduce((s,t)=>s+t.amount,0);
      const totalOutstanding = Math.max(0, existingDue - totalPayments);
      const totalRepaid  = Math.max(0, principal - totalOutstanding);
      const pct = principal>0?Math.min(100,(totalRepaid/principal)*100):0;
      const row=document.createElement('div');
      row.className='dash-loan-row';
      row.innerHTML=`
        <div class="dash-loan-dot" style="background:${loan.color}"></div>
        <div class="dash-loan-name">${loan.name}</div>
        ${principal>0?`<div class="dash-loan-bar-wrap">
          <div class="dash-loan-bar"><div class="dash-loan-bar-fill" style="width:${pct}%;background:${loan.color}"></div></div>
        </div>`:''}
        <div class="dash-loan-amt">${fmt(totalOutstanding)}</div>
      `;
      dashList.appendChild(row);
    });
  } else {
    dashSection.style.display='none';
  }
}

let addLoanSelectedColor = CARD_COLORS[0];

function buildLoanColorPicker(){
  const picker=document.getElementById('loanColorPicker');
  picker.innerHTML='';
  CARD_COLORS.forEach(c=>{
    const sw=document.createElement('div');
    sw.className='color-swatch'+(c===addLoanSelectedColor?' selected':'');
    sw.style.background=c; sw.style.boxShadow=`0 2px 8px ${c}66`;
    sw.addEventListener('click',()=>{
      addLoanSelectedColor=c;
      picker.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    picker.appendChild(sw);
  });
}

document.getElementById('addLoanBtn').addEventListener('click',()=>{
  document.getElementById('loanName').value='';
  document.getElementById('loanPrincipal').value='';
  document.getElementById('loanExistingDue').value='';
  addLoanSelectedColor=CARD_COLORS[0];
  buildLoanColorPicker();
  document.getElementById('addLoanModal').classList.add('open');
  setTimeout(()=>document.getElementById('loanName').focus(),420);
});
document.getElementById('cancelLoanModal').addEventListener('click',()=>document.getElementById('addLoanModal').classList.remove('open'));
document.getElementById('addLoanModal').addEventListener('click',e=>{if(e.target===e.currentTarget)document.getElementById('addLoanModal').classList.remove('open');});

document.getElementById('saveLoanModal').addEventListener('click',()=>{
  const name        = document.getElementById('loanName').value.trim();
  const principal   = parseFloat(document.getElementById('loanPrincipal').value)||0;
  const existingDue = parseFloat(document.getElementById('loanExistingDue').value)||0;

  if(!name) {showToast('Enter a loan name');return;}
  if(state.personalLoans.some(l=>l.name.toLowerCase()===name.toLowerCase())){showToast('Loan already exists');return;}

  state.personalLoans.push({id:uid(),name,principal,existingDue,color:addLoanSelectedColor});
  saveData();
  document.getElementById('addLoanModal').classList.remove('open');
  refresh(); showToast(`${name} added ✓`);
});

function openEditLoanDueModal(loanId){
  const loan = getLoan(loanId);
  if(!loan) return;
  document.getElementById('editLoanDueId').value = loanId;
  document.getElementById('editLoanDueTitle').textContent = `Update Outstanding — ${loan.name}`;
  document.getElementById('editLoanDueAmount').value = loan.existingDue||'';
  
  const prev = document.getElementById('editLoanDuePreview');
  prev.innerHTML=`
    <div class="due-card-dot" style="background:${loan.color}"></div>
    <div class="due-card-name">${loan.name}</div>
    <div class="due-card-num">Principal: ${fmt(loan.principal)}</div>
  `;
  document.getElementById('editLoanDueModal').classList.add('open');
  setTimeout(()=>document.getElementById('editLoanDueAmount').focus(),420);
}

document.getElementById('cancelEditLoanDue').addEventListener('click',()=>document.getElementById('editLoanDueModal').classList.remove('open'));
document.getElementById('editLoanDueModal').addEventListener('click',e=>{if(e.target===e.currentTarget)document.getElementById('editLoanDueModal').classList.remove('open');});

document.getElementById('saveEditLoanDue').addEventListener('click',()=>{
  const loanId = document.getElementById('editLoanDueId').value;
  const amount = parseFloat(document.getElementById('editLoanDueAmount').value)||0;
  const loan   = getLoan(loanId);
  if(!loan){showToast('Loan not found');return;}
  loan.existingDue = amount;
  saveData();
  document.getElementById('editLoanDueModal').classList.remove('open');
  refresh();
  showToast(`Loan initial outstanding updated to ${fmt(amount)} ✓`);
});

// ─── Boot ────────────────────────────────────────────────
setMonthLabels();
refresh();
