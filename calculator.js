'use strict';
// Pure calculations: money is in rupees; rates are decimals; periods are months.
function monthlyRate(annual) { return Math.expm1(Math.log1p(annual) / 12); }
function fundingProjection(initial, startingMonthly, rate, months, annualIncrease = 0) {
  let balance = initial, contributions = 0;
  const balances = [initial], schedule = [];
  for (let month = 0; month < months; month++) {
    const payment = startingMonthly * Math.pow(1 + annualIncrease, Math.floor(month / 12));
    balance = balance * (1 + rate) + payment;
    contributions += payment;
    balances.push(balance);
    if (month % 12 === 0) schedule.push({year: Math.floor(month / 12) + 1, monthly: payment, contributed: 0, balance: 0});
    const row = schedule[schedule.length - 1];
    row.contributed += payment; row.balance = balance;
  }
  return {balance, contributions, balances, schedule,
    finalMonthly: months ? startingMonthly * Math.pow(1 + annualIncrease, Math.floor((months - 1) / 12)) : 0};
}
// Present value of withdrawals: first payment at month 1, growing thereafter.
function pensionFactor(rate, inflation, months) {
  const logRatio = Math.log1p(inflation) - Math.log1p(rate);
  if (Math.abs(logRatio) < 1e-14) return months / (1 + rate);
  return Math.expm1(months * logRatio) / Math.expm1(logRatio) / (1 + rate);
}
function depletionMonths(corpus, pension, rate, inflation) {
  if (pension === 0) return Infinity;
  if (corpus <= 0) return 1;
  if (rate > inflation && corpus >= pension / (rate - inflation)) return Infinity;
  let high = 12;
  while (pension * pensionFactor(rate, inflation, high) < corpus) high *= 2;
  let low = 0;
  for (let i = 0; i < 65; i++) {
    const mid = (low + high) / 2;
    if (pension * pensionFactor(rate, inflation, mid) < corpus) low = mid; else high = mid;
  }
  // The first month that fully exhausts the corpus or cannot cover the pension.
  return Math.max(1, Math.ceil(high - 1e-7));
}
function usageProjection(corpus, pension, rate, inflation, months) {
  let balance = corpus;
  const balances = [corpus], schedule = [];
  let firstShortfall = null;
  for (let month = 0; month < months; month++) {
    const available = balance * (1 + rate), withdrawal = pension * Math.pow(1 + inflation, month);
    if (month % 12 === 0) schedule.push({year: Math.floor(month / 12) + 1, monthly: withdrawal, withdrawn: 0, shortfall: 0, balance: 0});
    const row = schedule[schedule.length - 1];
    row.withdrawn += Math.min(available, withdrawal);
    row.shortfall += Math.max(0, withdrawal - available);
    if (available + Math.max(0.01, available * 1e-12) < withdrawal && firstShortfall === null) firstShortfall = month + 1;
    balance = Math.max(0, available - withdrawal);
    if (balance < 0.01) balance = 0;
    balances.push(balance);
    row.balance = balance;
  }
  return {balances, ending: balance, firstShortfall, schedule};
}
function calculatePlan(input) {
  const months = (input.retire - input.age) * 12, usageMonths = input.usageYears * 12;
  const rate = monthlyRate(input.annual / 100), inflation = monthlyRate(input.inflation / 100);
  const pension = input.expenses * Math.pow(1 + input.inflation / 100, input.retire - input.age);
  const withdrawalFactor = pensionFactor(rate, inflation, usageMonths);
  const requiredCorpus = pension * withdrawalFactor;
  const baseline = fundingProjection(input.current, 0, rate, months).balance;
  const fundingFactor = fundingProjection(0, 1, rate, months, input.stepUp / 100).balance;
  let target = Math.max(2500000, input.target), monthly = input.monthly;
  if (input.driver === 'expenses') target = Math.max(2500000, requiredCorpus);
  if (input.driver !== 'monthly' && months > 0) monthly = Math.max(0, (target - baseline) / fundingFactor);
  const funding = fundingProjection(input.current, monthly, rate, months, input.stepUp / 100);
  if (input.driver === 'monthly') target = Math.max(2500000, funding.balance);
  const needed = months ? Math.max(0, (target - baseline) / fundingFactor) : 0;
  const usage = usageProjection(funding.balance, pension, rate, inflation, usageMonths);
  const lifetime = depletionMonths(funding.balance, pension, rate, inflation);
  return {months, usageMonths, rate, inflation, pension, requiredCorpus, target, monthly, needed, funding, usage, lifetime,
    supportedPension: target / withdrawalFactor,
    growth: Math.max(0, funding.balance - input.current - funding.contributions),
    gap: funding.balance - target};
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {monthlyRate, fundingProjection, pensionFactor, depletionMonths, usageProjection, calculatePlan};
}
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
  const integer = n => new Intl.NumberFormat('en-IN', {maximumFractionDigits:0}).format(n);
  const compact = n => n >= 10000000 ? `₹${+(n/10000000).toFixed(2)} crore` : n >= 100000 ? `₹${+(n/100000).toFixed(2)} lakh` : money(n);
  const state = {driver:'monthly',age:32,retire:65,target:25000000,current:1000000,monthly:25000,stepUp:0,expenses:50000,inflation:6,usageYears:25,annual:6};
  const fields = {
    age:[18,65,1],retire:[40,80,1],current:[0,100000000,0],target:[2500000,250000000,0],monthly:[0,500000,0],
    stepUp:[0,25,0],expenses:[0,500000,0],inflation:[0,15,0],usageYears:[1,60,1],return:[0,12,0]
  };
  function render(source, raw) {
    if (source) {
      const [min,max] = fields[source];
      const cleaned = String(raw).replace(/,/g, '').trim();
      const numeric = Number(cleaned);
      if (cleaned !== '' && Number.isFinite(numeric)) {
        const limit = ['current','target','monthly','expenses'].includes(source) ? 1e15 : max;
        const value = Math.max(min,Math.min(limit,Math.round(numeric)));
        state[source === 'return' ? 'annual' : source] = value;
        if (source === 'monthly' || source === 'target') state.driver = source;
        if (['expenses','inflation','usageYears'].includes(source)) state.driver = 'expenses';
      }
    }
    state.retire = Math.max(state.age,state.retire);
    const p = calculatePlan(state);
    state.target = p.target; state.monthly = p.monthly;
    for (const [id,[floor,max]] of Object.entries(fields)) {
      const value = state[id === 'return' ? 'annual' : id], min = id === 'retire' ? Math.max(40,state.age) : floor;
      const ceiling = Math.max(max,value);
      for (const suffix of ['', 'Number']) {
        const el = $(id+suffix);
        el.step = '1';
        el.min = 0; el.max = ceiling; el.min = min;
        el.value = suffix ? integer(value) : Math.round(value);
        el.disabled = id === 'monthly' && p.months === 0;
      }
      $(id+'Out').textContent = ['current','target','monthly','expenses'].includes(id) ? compact(value) : '';
      $(id).setAttribute('aria-valuetext', ['current','target','monthly','expenses'].includes(id) ? money(value) : String(value));
    }
    $('ageHint').textContent = '';
    $('retireHint').textContent = `${state.retire-state.age} years to save`;
    $('currentHint').textContent = '';
    $('targetHint').textContent = '₹25 lakh minimum';
    $('monthlyHint').textContent = p.months ? 'Starting monthly amount' : 'Retirement is now';
    $('stepUpHint').textContent = state.stepUp && p.months > 12 ? `Fixed for 12 months · year 2: ${money(p.monthly*(1+state.stepUp/100))}/month` : 'Fixed within each year · 0% = no increase';
    $('expensesHint').textContent = `At retirement: ${money(p.pension)}/month`;
    $('inflationHint').textContent = 'Before and during retirement';
    $('usageYearsHint').textContent = `Age ${state.retire}–${state.retire+state.usageYears}`;
    $('returnHint').textContent = 'Same return during saving and usage';
    $('projected').textContent = compact(p.funding.balance); $('projected').title = money(p.funding.balance);
    $('targetLine').textContent = Math.abs(p.gap)<1 ? `Target met · at age ${state.retire}` : `${compact(Math.abs(p.gap))} ${p.gap>0?'above':'below'} target · age ${state.retire}`;
    $('requiredPension').textContent = money(p.pension); $('requiredCorpus').textContent = compact(p.requiredCorpus);
    $('needed').textContent = p.months ? money(p.needed) : p.gap>=0 ? '₹0' : 'Due now';
    $('growth').textContent = compact(p.growth); $('pension').textContent = money(p.supportedPension);
    $('finalFunding').textContent = p.months ? money(p.funding.finalMonthly) : '—';
    $('totalContributions').textContent = compact(p.funding.contributions);
    $('usePeriod').textContent = Number.isFinite(p.lifetime) ? `Age ${+(state.retire+p.lifetime/12).toFixed(1)}` : 'No depletion';
    $('chartEnd').textContent = 'Age '+state.retire;
    $('usageStart').textContent = 'Age '+state.retire;
    $('usageEnd').textContent = 'Age '+(state.retire+state.usageYears);
    $('usageInsight').textContent = p.usage.firstShortfall !== null ? `Pension shortfall from age ${+(state.retire+p.usage.firstShortfall/12).toFixed(1)}.` : `${state.usageYears} years covered · ${compact(p.usage.ending)} remaining.`;
    const expenseGap = p.funding.balance-p.requiredCorpus;
    $('insight').textContent = p.months===0 && p.gap < -1 ? `${money(-p.gap)} additional funding needed now.` : Math.abs(expenseGap)<1 ? 'Your corpus matches your expense plan.' : `${compact(Math.abs(expenseGap))} ${expenseGap>0?'surplus':'shortfall'} against your expense plan.`;
    if (state.driver==='monthly' && p.funding.balance<2500000) $('insight').textContent += ' Below the ₹25 lakh minimum target.';
    draw('chart',p.funding.balances,p.target);
    draw('usageChart',p.usage.balances);
    $('fundingSchedule').innerHTML = p.funding.schedule.length ? p.funding.schedule.map(row=>`<tr><td>${row.year} · ${state.age+row.year}</td><td>${money(row.monthly)}</td><td>${money(row.contributed)}</td><td>${compact(row.balance)}</td></tr>`).join('') : '<tr><td colspan="4">No saving years remaining.</td></tr>';
    $('withdrawalSchedule').innerHTML = p.usage.schedule.map(row=>`<tr><td>${row.year} · ${state.retire+row.year}</td><td>${money(row.monthly)}</td><td>${money(row.withdrawn)}</td><td>${money(row.balance)}</td><td>${money(row.shortfall)}</td></tr>`).join('');
  }
  function draw(id, balances, target) {
    const count = Math.min(360,Math.max(1,balances.length-1));
    const vals = Array.from({length:count+1},(_,i)=>balances[Math.round(i*(balances.length-1)/count)]);
    const left=8,right=592,top=24,bottom=158,max=Math.max(...vals,target||0,1)*1.12;
    const x=i=>left+(right-left)*i/(vals.length-1),y=v=>bottom-(bottom-top)*v/max;
    const points=vals.map((v,i)=>`${x(i)},${y(v)}`).join(' '),fill=id+'Fill';
    const last=vals.at(-1),sameTarget=target!==undefined && Math.abs(target-last)<1;
    const reference=target===undefined?'':`<line x1="${left}" y1="${y(target)}" x2="${right}" y2="${y(target)}" stroke="#d8b56b" stroke-width="1.5" stroke-dasharray="5 5"/><text x="${right}" y="${y(target)-8}" text-anchor="end" fill="#9b7a37" font-size="11">Target ${compact(target)}</text>`;
    const lastY=target!==undefined && Math.abs(y(target)-y(last))<22 ? Math.min(bottom+14,y(last)+16) : Math.max(12,y(last)-8);
    const lastLabel=sameTarget?'':`<text x="${right}" y="${lastY}" text-anchor="end" fill="#66766e" font-size="11">${compact(last)}</text>`;
    $(id).innerHTML=`<defs><linearGradient id="${fill}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#60a77b" stop-opacity=".3"/><stop offset="1" stop-color="#60a77b" stop-opacity="0"/></linearGradient></defs><line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#dce4dc"/>${reference}<polygon points="${left},${bottom} ${points} ${right},${bottom}" fill="url(#${fill})"/><polyline points="${points}" fill="none" stroke="#176b4a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="${left}" y="${Math.max(12,y(vals[0])-8)}" fill="#66766e" font-size="11">${compact(vals[0])}</text>${lastLabel}`;
  }
  Object.keys(fields).forEach(id=>{
    $(id).addEventListener('input',()=>render(id,$(id).value));
    $(id+'Number').addEventListener('change',()=>render(id,$(id+'Number').value));
    $(id+'Number').addEventListener('keydown',event=>{if(event.key==='Enter') $(id+'Number').blur();});
  });
  render();
}
