// The approved timeline interface, fed by normalized local history.
(() => {
  const params = new URLSearchParams(location.search);
  const monitorPrototype = params.get('prototype') === 'monitor';
  let variant = monitorPrototype && params.get('variant')?.toUpperCase() === 'A0' ? 'A' : params.get('variant')?.toUpperCase() || 'A';
  const requestedMonthKey = params.get('month');
  const variants = ['A', 'B'];
  if (!variants.includes(variant)) return;

  const fixture = globalThis.__usageTimelinePrototypeFixture;
  const labels = { tokens: 'TOKENS', credits: 'COPILOT CREDITS', dollars: '≈ USD' };
  const fallbackOrigins = [['vscode', 'VS CODE'], ['cli', 'COPILOT CLI'], ['insiders', 'VS CODE INSIDERS']];
  const origins = fixture?.origins || fallbackOrigins;
  const colors = fixture?.colors || { vscode: '#70a5ff', cli: '#ffb000', insiders: '#b48cff' };
  let focusDay = 0;
  let focusSlot = null;
  let selectedSessionId = null;
  let restoreGraphFocus = false;
  let unit = ['tokens', 'credits', 'dollars'].includes(params.get('unit')) ? params.get('unit') : 'credits';
  let zoom = params.get('zoom') === 'day' ? 'day' : 'month';
  let sortDirection = globalThis.SaxjaxDateTimeSort.normalize(params.get('sort'));
  let compare = false;

  const months = fixture?.months?.length ? fixture.months : [];
  if (!months.length) {
    const empty = document.createElement('section');
    empty.className = 'timeline-prototype';
    empty.innerHTML = '<header class="proto-head"><div><span class="index">USAGE TIMELINE · VS CODE INSIDERS</span><h2>Recovered local usage history</h2><p>No parseable local journal records are available yet. The timeline will appear when VS Code Insiders history is imported.</p></div></header>';
    document.querySelector('.workbench')?.before(empty);
    return;
  }
  let monthIndex = months.findIndex((month) => month.key === requestedMonthKey);
  if (monthIndex < 0) monthIndex = months.reduce((latestSubstantial, month, index) => month.sessions.length >= 10 ? index : latestSubstantial, months.length - 1);
  let comparisonMonthIndex = months.findIndex((month) => month.key === params.get('reference'));
  if (comparisonMonthIndex === monthIndex || comparisonMonthIndex < 0) comparisonMonthIndex = null;
  compare = comparisonMonthIndex != null;
  let dates = months[monthIndex].dates;
  let sessions = months[monthIndex].sessions;
  const chooseSpikeDay = () => dates.reduce((highestDay, _, day) => {
    const credits = sessions.filter((session) => session.day === day).reduce((sum, session) => sum + (session.credits || 0), 0);
    const highestCredits = sessions.filter((session) => session.day === highestDay).reduce((sum, session) => sum + (session.credits || 0), 0);
    return credits > highestCredits ? day : highestDay;
  }, 0);
  const chooseMonth = (index) => {
    monthIndex = Math.max(0, Math.min(months.length - 1, index));
    dates = months[monthIndex].dates;
    sessions = months[monthIndex].sessions;
    focusDay = chooseSpikeDay();
    focusSlot = null;
    selectedSessionId = null;
    zoom = 'month';
    params.set('month', months[monthIndex].key);
    if (comparisonMonthIndex === monthIndex) comparisonMonthIndex = null;
    compare = comparisonMonthIndex != null;
    if (compare) params.set('reference', months[comparisonMonthIndex].key); else params.delete('reference');
    params.delete('compare');
    history.replaceState(null, '', `${location.pathname}?${params}`);
  };
  focusDay = chooseSpikeDay();

  const host = document.createElement('section');
  host.className = 'timeline-prototype';
  host.setAttribute('aria-label', 'Usage timeline');
  document.querySelector('.workbench')?.before(host);

  const value = (session) => {
    if (unit === 'tokens') return (session.inputTokens || 0) + (session.outputTokens || 0);
    if (unit === 'credits') return session.credits || 0;
    return (session.credits || 0) * (fixture?.usdPerCredit || 0);
  };
  const hasMeasurement = (session) => unit === 'tokens'
    ? Number.isFinite(session.inputTokens) || Number.isFinite(session.outputTokens)
    : Number.isFinite(session.credits);
  const monthTotal = (month) => month.sessions.reduce((sum, session) => sum + value(session), 0);
  const monthAmount = (month) => month.sessions.some(hasMeasurement) ? number(monthTotal(month)) : '—';
  const slotTotalsForMonth = (month) => {
    const totals = Array.from({ length: month.dates.length * 48 }, () => 0);
    for (const session of month.sessions) {
      const bucket = Math.max(0, Math.min(47, Math.floor(session.start / 30)));
      totals[session.day * 48 + bucket] += value(session);
    }
    return totals;
  };
  const dailyTotalsForMonth = (month) => {
    const slots = slotTotalsForMonth(month);
    return month.dates.map((_, day) => slots.slice(day * 48, (day + 1) * 48).reduce((sum, amount) => sum + amount, 0));
  };
  const scaleMonths = () => compare && comparisonMonthIndex != null ? [months[monthIndex], months[comparisonMonthIndex]] : [months[monthIndex]];
  const sharedSlotPeak = () => Math.max(1, ...scaleMonths().flatMap((month) => slotTotalsForMonth(month)));
  const sharedDailyPeak = () => Math.max(1, ...scaleMonths().flatMap((month) => {
    const slots = slotTotalsForMonth(month);
    return month.dates.map((_, day) => slots.slice(day * 48, (day + 1) * 48).reduce((sum, amount) => sum + amount, 0));
  }));
  const sharedCumulativePeak = () => Math.max(1, ...scaleMonths().map((month) => month.sessions.reduce((sum, session) => sum + value(session), 0)));
  const measure = () => {
    const slots = dates.flatMap((_, day) => Array.from({ length: 48 }, (_, bucket) => {
      const members = sessions.filter((session) => session.day === day && Math.max(0, Math.min(47, Math.floor(session.start / 30))) === bucket);
      const byOrigin = Object.fromEntries(origins.map(([key]) => [key, members.filter((session) => session.origin === key).reduce((sum, session) => sum + value(session), 0)]));
      return { id: day * 48 + bucket, day, bucket, byOrigin, total: Object.values(byOrigin).reduce((sum, amount) => sum + amount, 0) };
    }));
    const daily = dates.map((_, day) => slots.filter((slot) => slot.day === day).reduce((sum, slot) => sum + slot.total, 0));
    const cumulative = slots.reduce((values, slot) => [...values, (values.at(-1) || 0) + slot.total], []);
    const byOrigin = Object.fromEntries(origins.map(([key]) => {
      let running = 0;
      return [key, dates.map((_, day) => {
        running += sessions.filter((session) => session.day === day && session.origin === key).reduce((sum, session) => sum + value(session), 0);
        return running;
      })];
    }));
    return { daily, slots, cumulative, byOrigin, total: cumulative.at(-1) || 0 };
  };
  const number = (value) => {
    if (value === 0 && !sessions.some(hasMeasurement)) return '—';
    if (unit === 'tokens') return `${Math.round(value / 1000).toLocaleString()}k`;
    return unit === 'credits' ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : `$${value.toFixed(2)}`;
  };
  const clock = (minute) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const slotLabel = (slot) => `${clock(slot.bucket * 30)}–${clock((slot.bucket + 1) * 30)}`;
  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const stepPath = (values, xStart, xStep, bottom, height, peak) => values.reduce((path, value, index) => {
    const x = xStart + index * xStep;
    const y = bottom - ((value / peak) * height);
    return index ? `${path} H ${x} V ${y}` : `M ${x} ${y}`;
  }, '');
  const selector = () => `<div class="proto-units" aria-label="Display unit">${['tokens', 'credits', 'dollars'].map((key) => { const unavailable = key === 'dollars' && !fixture?.moneyAvailable; return `<button data-unit="${key}" class="${key === unit ? 'is-current' : ''}" ${unavailable ? 'disabled title="No explicit price rule is available"' : ''}>${key === 'credits' ? 'Provider unit' : key[0].toUpperCase() + key.slice(1)}${unavailable ? ' · unavailable' : ''}</button>`; }).join('')}</div>`;
  const zoomSelector = () => `<div class="proto-units proto-zoom" aria-label="Timeline zoom"><button data-zoom="month" class="${zoom === 'month' ? 'is-current' : ''}">Full month</button><button data-zoom="day" class="${zoom === 'day' ? 'is-current' : ''}">Selected day</button></div>`;
  const sortSelector = () => `<div class="proto-units proto-sort" aria-label="Request date and time order"><button data-sort="desc" class="${sortDirection === 'desc' ? 'is-current' : ''}">Newest first ↓</button><button data-sort="asc" class="${sortDirection === 'asc' ? 'is-current' : ''}">Oldest first ↑</button></div>`;
  const legend = () => `<div class="proto-origin-legend">${origins.map(([key, label]) => `<i style="background:${colors[key]}"></i>${label}`).join(' ')}</div>`;
  const monthRail = () => {
    const selected = months[monthIndex];
    const points = months.map((month, index) => '<button data-month-index="' + index + '" class="' + (index === monthIndex ? 'is-selected' : '') + '" title="' + (!month.sessions.some(hasMeasurement) ? 'No measurement is recorded for this display unit' : '') + '"><small>' + month.label.slice(0, 3) + '</small><strong>' + monthAmount(month) + '</strong></button>').join('');
    const references = months.map((month, index) => index === monthIndex ? '' : '<button data-reference-index="' + index + '" class="' + (comparisonMonthIndex === index ? 'is-selected' : '') + '">' + month.label.slice(0, 3) + ' · ' + monthAmount(month) + '</button>').join('');
    const referenceNote = compare
      ? 'REFERENCE: ' + months[comparisonMonthIndex].label + ' · ' + monthAmount(months[comparisonMonthIndex]) + '. Shadow = reference; colour = selected.'
      : 'Choose a reference to lock the scale and compare. — means requests were recovered, but this display unit was not measured.';
    return '<section class="proto-month-rail"><div><span>MONTH COMPARISON · ' + (compare ? 'LOCKED Y-SCALE' : 'ADAPTIVE Y-SCALE') + '</span><b>' + selected.label + ' · ' + monthAmount(selected) + '</b></div><div class="proto-month-points">' + points + '</div><div class="proto-compare-reference"><span>REFERENCE MONTH</span>' + references + '<small>' + referenceNote + '</small></div></section>';
  };
  const sharedHeader = (key, title, copy) => `<header class="proto-head"><div><span class="index">USAGE TIMELINE · VS CODE INSIDERS · ${key === 'B' ? 'MONTH PULSE' : 'SPIKE LENS'}</span><h2>${title}</h2><p>${sessions.length.toLocaleString()} normalized local requests · ${dates.length} calendar days · ${months[monthIndex].label} · ${fixture?.profileLabel || 'unverified local profile'}. ${copy}${unit === 'credits' ? ` ${fixture?.creditNotice || 'Source: local VS Code–displayed client credits, not the GitHub billing total.'}` : ''}${unit === 'dollars' ? ` ${fixture?.moneyNotice || ''}` : ''}</p></div><div>${selector()}</div></header>`;
  const navigator = () => {
    const data = measure();
    const peak = compare ? sharedCumulativePeak() : (data.total || 1);
    const left = 52, width = 843, bottom = 57, height = 47;
    const step = width / Math.max(1, data.cumulative.length - 1);
    const plots = data.cumulative.map((value, index) => ({ x: left + index * step, y: bottom - ((value / peak) * height) }));
    const path = stepPath(data.cumulative, left, step, bottom, height, peak);
    const focusStart = (focusSlot == null ? focusDay * 48 : focusSlot) * step;
    const rangeWidth = Math.max(7, (zoom === 'day' ? 48 : 1) * step);
    const rangeX = Math.max(left, left + focusStart - step * .5);
    return `<section class="proto-navigator proto-slot-aligned"><div><span>VS CODE–DISPLAYED CREDIT HISTORY · ${months[monthIndex].label} · SAME 30-MINUTE SLOTS</span><b>${number(data.total)} ${labels[unit]}</b></div><svg viewBox="0 0 910 68" aria-label="Cumulative displayed credits aligned exactly below the main time-slot graph; click a point to select its time slot"><path d="${path}"/>${plots.map((plot, index) => data.slots[index].total ? `<circle data-slot="${index}" class="proto-billing-plot ${index === focusSlot ? 'is-selected' : ''}" cx="${plot.x}" cy="${plot.y}" r="${index === focusSlot ? 4 : 1.5}"/>` : '').join('')}<rect x="${rangeX}" y="5" width="${rangeWidth}" height="55" rx="2"/><line x1="${rangeX}" y1="5" x2="${rangeX}" y2="60"/><line x1="${rangeX + rangeWidth}" y1="5" x2="${rangeX + rangeWidth}" y2="60"/></svg><p>Every upward step is a request contribution from the main graph, at the identical horizontal time position · selected ${dates[focusDay]}${focusSlot == null ? '' : ` · ${slotLabel(data.slots[focusSlot])}`}</p></section>`;
  };
  const focusDetail = () => {
    const data = measure();
    const activeSlot = focusSlot == null ? null : data.slots[focusSlot];
    const selected = sessions.filter((session) => session.day === focusDay && (!activeSlot || Math.max(0, Math.min(47, Math.floor(session.start / 30))) === activeSlot.bucket));
    const counts = Object.fromEntries(origins.map(([key]) => [key, selected.filter((session) => session.origin === key).length]));
    const session = selected.find((item) => item.id === selectedSessionId);
    if (session) {
      const originName = Object.fromEntries(origins)[session.origin];
      return `<aside class="proto-detail"><span class="proto-kicker">SELECTED REQUEST · ${dates[focusDay]} · ${originName}</span><strong>#${String(session.id).padStart(4, '0')} <small>REQUEST</small></strong><h3>Prompt and source reference</h3><p class="proto-client">${originName} · ${escapeHtml(session.sourceRef || `selected day ${dates[focusDay]}`)}</p><blockquote>Prompt excerpt: “${escapeHtml(session.promptExcerpt || 'No prompt excerpt recorded in this fixture.')}”</blockquote><button class="proto-source" data-copy-source="${session.id}">COPY SOURCE REFERENCE</button></aside>`;
    }
    return `<aside class="proto-detail"><span class="proto-kicker">${activeSlot ? `SELECTED SLOT · ${dates[focusDay]} · ${slotLabel(activeSlot)}` : `SELECTED DAY · ${dates[focusDay]}`}</span><strong>${number(activeSlot ? activeSlot.total : data.daily[focusDay])} <small>${labels[unit]}</small></strong><h3>${selected.length} request${selected.length === 1 ? '' : 's'} contributing ${activeSlot ? 'in this slot' : 'on this day'}</h3><p class="proto-client">${origins.map(([key, label]) => `${counts[key]} ${label}`).join(' · ')}</p><blockquote>Click a coloured time column to narrow this to one slot. The request ledger is ordered by prompt in → response out.</blockquote><button class="proto-source" data-zoom="day">ZOOM INTO SELECTED DAY</button></aside>`;
  };
  const spikeBars = () => {
    const data = measure();
    const peak = compare ? sharedDailyPeak() : Math.max(...data.daily, 1);
    return `<section class="proto-spike-chart"><div class="proto-reading"><span>LARGEST DAILY DELTA</span><b>${number(Math.max(...data.daily))}</b><small>${labels[unit]} · ${compare ? `LOCKED SCALE ${number(peak)} ACROSS MONTHS` : 'ADAPTIVE TO THIS MONTH'}</small></div><div class="proto-bars proto-workload-bars">${data.daily.map((value, day) => `<button data-day="${day}" class="proto-bar ${day === focusDay ? 'is-spike is-selected' : ''}" style="--height:${Math.max(2, (value / peak) * 100)}%"><span>${number(value)}</span><i></i><small>${dates[day]}</small></button>`).join('')}</div><p class="proto-note">Each bar aggregates VS Code–displayed completion credits. ${compare ? 'The bar scale remains fixed for a valid month-to-month comparison.' : 'Turn Compare on to lock the scale across months.'}</p></section>`;
  };
  const activityChart = () => {
    const data = measure();
    const visible = zoom === 'day' ? data.slots.filter((slot) => slot.day === focusDay) : data.slots;
    const referenceSlots = compare ? slotTotalsForMonth(months[comparisonMonthIndex]) : [];
    const referenceDates = compare ? months[comparisonMonthIndex].dates : [];
    const referenceVisible = compare ? visible.map((slot) => {
      const selectedDayOfMonth = dates[slot.day].slice(-2);
      const referenceDay = referenceDates.findIndex((date) => date.slice(-2) === selectedDayOfMonth);
      return referenceDay < 0 ? 0 : referenceSlots[referenceDay * 48 + slot.bucket] || 0;
    }) : [];
    const peak = compare ? sharedSlotPeak() : Math.max(1, ...visible.map((slot) => slot.total));
    const left = 52, bottom = 150, width = 843, columnWidth = width / visible.length, scale = 116 / peak;
    const dayLabels = zoom === 'day'
      ? `<text x="${left}" y="169">00:00</text><text x="${left + width - 30}" y="169">24:00</text>`
      : dates.map((date, index) => (index % 2 === 0 || index === dates.length - 1) ? `<text x="${left + index * 48 * columnWidth}" y="169">${date.slice(-2)}</text>` : '').join('');
    return `<section class="proto-activity"><div class="proto-workload-head"><div><span>USAGE VALUE PER 30-MINUTE SLOT · ${labels[unit]} · ${compare ? `LOCKED ${number(peak)} SCALE` : 'ADAPTIVE SCALE'}</span><h3>${zoom === 'day' ? `${dates[focusDay]} detail` : 'Month pulse'}</h3><p>Height is ${labels[unit].toLowerCase()}, not the number of parallel sessions. Each stack is coloured by model family; ${compare ? `the shadow plot is ${months[comparisonMonthIndex].label}, aligned by calendar day and 30-minute time slot.` : 'click a column to inspect its contributing prompts.'}</p></div><div>${legend()}${zoomSelector()}</div></div><svg viewBox="0 0 910 178" role="img" aria-label="Stacked usage value by time slot; click a column to select it"><g class="proto-activity-grid"><line x1="${left}" y1="${bottom}" x2="895" y2="${bottom}"/><line x1="${left}" y1="${bottom - 58}" x2="895" y2="${bottom - 58}"/><line x1="${left}" y1="${bottom - 116}" x2="895" y2="${bottom - 116}"/></g>${visible.map((slot, visibleIndex) => { let height = 0; const x = left + visibleIndex * columnWidth; const reference = referenceVisible[visibleIndex] || 0; const shadow = compare && reference ? `<rect class="proto-reference-slot" x="${x}" y="${bottom - reference * scale}" width="${Math.max(.8, columnWidth - .5)}" height="${reference * scale}"/>` : ''; const pieces = origins.map(([key]) => { const piece = slot.byOrigin[key] * scale; height += piece; return piece ? `<rect x="${x}" y="${bottom - height}" width="${Math.max(.8, columnWidth - .5)}" height="${piece}" fill="${colors[key]}"/>` : ''; }).join(''); return `${shadow}${pieces}<rect data-slot="${slot.id}" class="proto-slot-hit ${slot.id === focusSlot ? 'is-selected' : ''}" x="${x}" y="${bottom - 116}" width="${Math.max(.8, columnWidth - .5)}" height="116"/>`; }).join('')}<text x="3" y="${bottom}">0</text><text x="3" y="${bottom - 58}">${number(peak / 2)}</text><text x="3" y="${bottom - 116}">${number(peak)}</text>${dayLabels}</svg><div class="proto-workload-foot"><span>${zoom === 'day' ? 'Click Full month to return' : 'Click Selected day to zoom'}</span><span>↑ higher stacks = more ${labels[unit].toLowerCase()}</span><span>Selected ${dates[focusDay]}${focusSlot == null ? '' : ` · ${slotLabel(data.slots[focusSlot])}`}</span></div></section>`;
  };
  const focusLanes = () => {
    const data = measure();
    const activeSlot = focusSlot == null ? null : data.slots[focusSlot];
    const selected = sessions.filter((session) => session.day === focusDay && (!activeSlot || Math.max(0, Math.min(47, Math.floor(session.start / 30))) === activeSlot.bucket)).sort((left, right) => globalThis.SaxjaxDateTimeSort.compareValues((left.day * 1440) + left.start, (right.day * 1440) + right.start, sortDirection));
    const originName = Object.fromEntries(origins);
    return `<section class="proto-focus"><div class="proto-workload-head"><div><span>${activeSlot ? `SELECTED SLOT · ${dates[focusDay]} · ${slotLabel(activeSlot)}` : `SELECTED DAY · ${dates[focusDay]} · 00:00–24:00`}</span><h3>Prompt in → response out</h3><p>${selected.length} requests · ${globalThis.SaxjaxDateTimeSort.label(sortDirection)} by prompt start. Click any row to reveal its excerpt and copy its local VS Code chat reference.</p></div><div>${legend()}${sortSelector()}</div></div>${selected.map((session) => { const left = Math.max(0, session.start); const width = Math.min(1440, session.end) - left; return `<button data-session="${session.id}" class="proto-focus-row ${session.id === selectedSessionId ? 'is-selected' : ''}"><span><b>IN ${clock(session.start)}</b> → OUT ${clock(session.end)} · ${originName[session.origin]} · ${number(value(session))}</span><div class="proto-focus-track"><i style="--left:${(left / 1440) * 100}%;--width:${Math.max(3, (width / 1440) * 100)}%;--origin:${colors[session.origin]}"></i></div></button>`; }).join('') || '<p class="proto-note">No recorded prompt started in this selected time slot.</p>'}</section>`;
  };
  const originChart = () => {
    const data = measure();
    const peak = Math.max(...Object.values(data.byOrigin).flat(), 1);
    const step = 580 / Math.max(1, dates.length - 1);
    return `<section class="proto-origin"><div class="proto-origin-head"><div><span>MODEL-FAMILY ATTRIBUTION · CUMULATIVE</span><p>Each stepped coloured line accumulates the same ${sessions.length.toLocaleString()} request records by model family. The lower history plot is their matching displayed-credit total.</p></div>${legend()}</div><svg class="proto-origin-svg" viewBox="0 0 620 210" role="img" aria-label="Cumulative usage by model family; click a point to select its day"><g class="proto-chart-grid"><line x1="24" y1="18" x2="604" y2="18"/><line x1="24" y1="83" x2="604" y2="83"/><line x1="24" y1="148" x2="604" y2="148"/></g>${origins.map(([key]) => `<path d="${stepPath(data.byOrigin[key], 24, step, 148, 130, peak)}" stroke="${colors[key]}"/>`).join('')}${origins.flatMap(([key]) => data.byOrigin[key].map((value, index) => `<circle data-day="${index}" cx="${24 + index * step}" cy="${value ? 148 - ((value / peak) * 130) : 148}" fill="${colors[key]}" r="${index === focusDay ? 4 : 2.5}"/>`)).join('')}<text x="2" y="22">HIGH</text><text x="7" y="152">0</text>${dates.map((date, index) => (dates.length <= 15 || index % 3 === 0 || index === dates.length - 1) ? `<text x="${21 + index * step}" y="185">${date.slice(-2)}</text>` : '').join('')}</svg></section>`;
  };
  const graphDeck = () => `<div class="proto-graph-flip ${variant === 'B' ? 'is-detail' : ''}" aria-label="Usage graph face"><div class="proto-graph-card"><div class="proto-graph-face proto-graph-front">${spikeBars()}</div><div class="proto-graph-face proto-graph-back">${activityChart()}</div></div></div>`;
  const sharedTimeline = () => `${sharedHeader('A', 'Usage timeline', 'One selected month, one stationary detail card, and two graph faces: daily spikes and 30-minute usage.')}${monthRail()}<div class="proto-a-grid proto-shared-grid"><section class="proto-graph-shell"><div class="proto-shared-toolbar"><span class="proto-toolbar-mode">DAILY BARS</span><div class="proto-toolbar-controls"></div></div>${graphDeck()}<p class="proto-shared-guide"></p><div class="proto-shared-footer"></div><button class="proto-source proto-flip-control" data-variant="${variant === 'A' ? 'B' : 'A'}">${variant === 'A' ? 'OPEN B · INSPECT THIS MONTH’S TIME SLOTS →' : '← RETURN TO A · SPIKE LENS'}</button></section>${focusDetail()}</div>${navigator()}${focusLanes()}`;
  const views = { A: sharedTimeline, B: sharedTimeline };
  const syncGraphFrame = () => {
    const showingDetail = variant === 'B';
    host.classList.toggle('is-detail-graph', showingDetail);
    const guide = host.querySelector('.proto-shared-guide');
    const footer = host.querySelector('.proto-shared-footer');
    const mode = host.querySelector('.proto-toolbar-mode');
    if (mode) mode.textContent = showingDetail ? '30-MINUTE STACKS' : 'DAILY BARS';
    if (guide) guide.textContent = showingDetail
      ? (compare ? 'Height is usage value, not the number of sessions. The dim shadow is the reference month aligned by calendar day and 30-minute slot.' : 'Height is usage value, not the number of sessions. Colour identifies model family; click a column to inspect its contributing prompts.')
      : (compare ? 'Height is usage value, not the number of sessions. The dim shadow is the reference month aligned by calendar day.' : 'Height is usage value, not the number of sessions. Click a day bar to inspect its requests.');
    if (footer) footer.textContent = showingDetail
      ? `SELECTED ${dates[focusDay]}${focusSlot == null ? '' : ` · ${slotLabel(measure().slots[focusSlot])}`} · 30-MINUTE DETAIL`
      : `SELECTED ${dates[focusDay]} · DAILY OVERVIEW`;
  };
  const applyGraphSummary = (selector, label, peakLabel, peakValue) => {
    const reading = host.querySelector(selector);
    if (!reading) return;
    reading.classList.add('proto-graph-summary');
    const title = document.createElement('span');
    title.textContent = label;
    const metrics = document.createElement('div');
    metrics.className = 'proto-graph-metrics';
    for (const [name, value] of [['TOTAL MONTH', monthAmount(months[monthIndex])], [peakLabel, number(peakValue)]]) {
      const metric = document.createElement('div');
      metric.className = 'proto-graph-metric';
      const metricName = document.createElement('small');
      metricName.textContent = name;
      const metricValue = document.createElement('b');
      metricValue.textContent = value;
      metric.append(metricName, metricValue);
      metrics.append(metric);
    }
    reading.replaceChildren(title, metrics);
  };
  const moveSelectedBin = (key) => {
    const slots = measure().slots;
    if (!slots.length) return false;
    let current = focusSlot == null ? slots.findIndex((slot) => slot.day === focusDay && slot.total > 0) : focusSlot;
    if (current < 0) current = Math.max(0, focusDay * 48);
    let next = current;
    if (key === 'ArrowLeft') next -= 1;
    if (key === 'ArrowRight') next += 1;
    if (key === 'ArrowUp') next -= 48;
    if (key === 'ArrowDown') next += 48;
    if (key === 'Home') next = slots[current].day * 48;
    if (key === 'End') next = (slots[current].day * 48) + 47;
    next = Math.max(0, Math.min(slots.length - 1, next));
    if (next === current && focusSlot != null) return false;
    focusSlot = next;
    focusDay = slots[next].day;
    selectedSessionId = null;
    restoreGraphFocus = true;
    render();
    return true;
  };
  function render() {
    const index = variants.indexOf(variant);
    const names = { A: 'Spike lens', B: 'Month pulse' };
    host.innerHTML = views[variant]();
    if (zoom === 'month') {
      const title = host.querySelector('.proto-activity h3');
      if (title) title.textContent = `${months[monthIndex].label} · DAYS 1–${dates.length}`;
    }
    {
      const activity = host.querySelector('.proto-activity');
      const heading = activity?.querySelector('.proto-workload-head');
      const controls = heading?.lastElementChild;
      if (heading && controls) {
        heading.className = 'proto-reading proto-b-reading';
        controls.classList.add('proto-b-controls');
        const label = document.createElement('span');
        label.textContent = `${months[monthIndex].label} · ${zoom === 'day' ? 'SELECTED DAY' : '30-MINUTE USAGE'}`;
        const amount = document.createElement('b');
        amount.textContent = monthAmount(months[monthIndex]);
        heading.replaceChildren(label, amount);
        host.querySelector('.proto-toolbar-controls')?.append(controls);
        activity.querySelector('.proto-workload-foot')?.remove();
      }
    }
    {
      host.querySelectorAll('.proto-spike-chart .proto-bar small').forEach((label, day) => { label.textContent = String(day + 1); });
      const chart = host.querySelector('.proto-spike-chart');
      if (chart) {
        chart.querySelector('.proto-note')?.remove();
      }
      if (compare && comparisonMonthIndex != null) {
        const referenceMonth = months[comparisonMonthIndex];
        const referenceTotals = dailyTotalsForMonth(referenceMonth);
        const referencePeak = sharedDailyPeak();
        host.querySelectorAll('.proto-spike-chart .proto-bar').forEach((bar, day) => {
          const dayOfMonth = dates[day].slice(-2);
          const referenceDay = referenceMonth.dates.findIndex((date) => date.slice(-2) === dayOfMonth);
          const shadow = document.createElement('i');
          shadow.className = 'proto-reference-bar';
          shadow.style.setProperty('--reference-height', String(Math.max(0, ((referenceTotals[referenceDay] || 0) / referencePeak) * 100)) + '%');
          shadow.title = 'Reference month, aligned by calendar day';
          bar.insertBefore(shadow, bar.querySelector('i'));
        });
      }
    }
    const graphData = measure();
    applyGraphSummary('.proto-spike-chart .proto-reading', `${months[monthIndex].label} · DAILY BARS`, 'HIGHEST DAY', Math.max(...graphData.daily));
    applyGraphSummary('.proto-activity .proto-reading', `${months[monthIndex].label} · 30-MINUTE STACKS`, 'HIGHEST 30 MIN', Math.max(...graphData.slots.map((slot) => slot.total)));
    syncGraphFrame();
    const activitySvg = host.querySelector('.proto-activity svg');
    if (activitySvg) {
      activitySvg.setAttribute('tabindex', '0');
      activitySvg.setAttribute('aria-label', '30-minute usage bins. Use arrow keys to select nearby bins.');
      const visibleSlots = zoom === 'day' ? graphData.slots.filter((slot) => slot.day === focusDay) : graphData.slots;
      const selectedIndex = visibleSlots.findIndex((slot) => slot.id === focusSlot);
      const selectedHit = activitySvg.querySelector('.proto-slot-hit.is-selected');
      if (selectedHit && selectedIndex >= 0) {
        const selected = visibleSlots[selectedIndex];
        const peak = compare ? sharedSlotPeak() : Math.max(1, ...visibleSlots.map((slot) => slot.total));
        const height = Math.max(3, (selected.total / peak) * 116);
        selectedHit.setAttribute('y', String(150 - height));
        selectedHit.setAttribute('height', String(height));
      }
      activitySvg.addEventListener('keydown', (event) => {
        if (variant !== 'B' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        if (moveSelectedBin(event.key)) event.preventDefault();
      });
    }
    host.querySelectorAll('[data-unit]').forEach((button) => button.addEventListener('click', () => { unit = button.dataset.unit; params.set('unit', unit); focusSlot = null; history.replaceState(null, '', `${location.pathname}?${params}`); render(); }));
    host.querySelectorAll('[data-month-index]').forEach((button) => button.addEventListener('click', () => { chooseMonth(Number(button.dataset.monthIndex)); render(); }));
    host.querySelectorAll('[data-month-step]').forEach((button) => button.addEventListener('click', () => { chooseMonth(monthIndex + Number(button.dataset.monthStep)); render(); }));
    host.querySelectorAll('[data-reference-index]').forEach((button) => button.addEventListener('click', () => {
      const requestedReference = Number(button.dataset.referenceIndex);
      comparisonMonthIndex = requestedReference === comparisonMonthIndex ? null : requestedReference;
      compare = comparisonMonthIndex != null;
      if (compare) params.set('reference', months[comparisonMonthIndex].key); else params.delete('reference');
      history.replaceState(null, '', `${location.pathname}?${params}`);
      render();
    }));
    host.querySelectorAll('[data-day]').forEach((element) => element.addEventListener('click', () => { focusDay = Number(element.dataset.day); focusSlot = null; selectedSessionId = null; render(); }));
    host.querySelectorAll('[data-slot]').forEach((element) => element.addEventListener('click', () => { focusSlot = Number(element.dataset.slot); focusDay = measure().slots[focusSlot].day; selectedSessionId = null; restoreGraphFocus = true; render(); }));
    host.querySelectorAll('[data-zoom]').forEach((button) => button.addEventListener('click', () => { zoom = button.dataset.zoom; params.set('zoom', zoom); selectedSessionId = null; history.replaceState(null, '', `${location.pathname}?${params}`); render(); }));
    host.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => { sortDirection = globalThis.SaxjaxDateTimeSort.normalize(button.dataset.sort); if (sortDirection === 'asc') params.set('sort', 'asc'); else params.delete('sort'); history.replaceState(null, '', `${location.pathname}?${params}`); render(); window.dispatchEvent(new CustomEvent('saxjax-date-sort-change', { detail: { direction: sortDirection } })); }));
    host.querySelectorAll('[data-session]').forEach((element) => element.addEventListener('click', () => { selectedSessionId = Number(element.dataset.session); render(); }));
    host.querySelectorAll('[data-copy-source]').forEach((button) => button.addEventListener('click', () => {
      const source = sessions.find((item) => item.id === Number(button.dataset.copySource))?.sourceRef;
      if (!source) return;
      globalThis.navigator.clipboard?.writeText(source);
      button.textContent = 'SOURCE REFERENCE COPIED';
    }));
    host.querySelectorAll('[data-variant]').forEach((button) => button.addEventListener('click', () => {
      const nextVariant = button.dataset.variant;
      if (!nextVariant || nextVariant === variant) return;
      if (!monitorPrototype) params.set('variant', nextVariant);
      history.replaceState(null, '', `${location.pathname}?${params}`);
      variant = nextVariant;
      host.querySelector('.proto-graph-flip')?.classList.toggle('is-detail', variant === 'B');
      button.dataset.variant = variant === 'A' ? 'B' : 'A';
      button.textContent = variant === 'A' ? 'OPEN B · INSPECT THIS MONTH’S TIME SLOTS →' : '← RETURN TO A · SPIKE LENS';
      syncGraphFrame();
    }));
    if (restoreGraphFocus) {
      restoreGraphFocus = false;
      requestAnimationFrame(() => host.querySelector('.proto-activity svg')?.focus());
    }
  }
  window.addEventListener('saxjax-date-sort-change', (event) => {
    const direction = globalThis.SaxjaxDateTimeSort.normalize(event.detail?.direction);
    if (direction === sortDirection) return;
    sortDirection = direction;
    if (sortDirection === 'asc') params.set('sort', 'asc'); else params.delete('sort');
    history.replaceState(null, '', `${location.pathname}?${params}`);
    render();
  });
  render();
})();
