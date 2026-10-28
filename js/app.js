/* Передача фронта — приложение (подрядчик и застройщик). Версия 1.0, 28.10.2026.
 * Данные и акты — в Google Таблице объекта; связь — через API веб-приложения Apps Script (config.js). */
(function () {
  'use strict';

  var APP_VERSION = '1.0';
  var CFG = window.APP_CONFIG || { objects: [] };
  var ST = {
    obj: null, token: '', role: '', me: null, email: '',
    c: null, dev: null, tab: 'out', dtab: 'wait', q: '', sel: '', editId: '',
    loading: false, lastLoad: 0, pollN: 0, pollT: 0, kickT: 0, msg: null
  };

  /* ---------- утилиты ---------- */
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } }
  };
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;            // только для своих SVG-иконок
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="#0E0E10" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/></svg>',
    reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/></svg>',
    plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    ext: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF7A1A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>'
  };
  function icon(name, cls) { return h('span', { class: cls || '', html: ICON[name], style: 'display:inline-flex' }); }
  function key(s) { return String(s || '').toLowerCase().replace(/[«»"“”„'`]/g, '').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  var root = function () { return document.getElementById('app'); };

  var toastT = 0;
  function toast(text, err) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    clearTimeout(toastT);
    if (!text) return;
    var t = h('div', { class: 'toast' + (err ? ' err' : ''), role: 'status', 'aria-live': 'polite', text: text });
    document.body.appendChild(t);
    toastT = setTimeout(function () { t.remove(); }, err ? 9000 : 6000);
  }

  /* ---------- связь с сервером ---------- */
  function api(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return fetch(ST.obj.api, { method: 'POST', body: JSON.stringify({ fn: fn, args: args }), redirect: 'follow' })
      .catch(function () { throw new Error('Нет связи с сервером. Проверьте интернет и повторите.'); })
      .then(function (res) {
        return res.json().catch(function () { throw new Error('Сервер ответил неожиданно (код ' + res.status + '). Повторите через минуту.'); });
      })
      .then(function (j) {
        if (j.ok) return j.r;
        var e = new Error(j.err || 'Ошибка сервера.'); e.code = j.code;
        if (j.code === 'SESSION') { logout(true); ST.msg = { text: j.err, kind: 'err' }; go(''); }
        throw e;
      });
  }
  /** «Сформировать сейчас» после решения застройщика: ответ не ждём (страховку держит сервер). */
  function kick() {
    clearTimeout(ST.kickT);
    ST.kickT = setTimeout(function () {
      try { fetch(ST.obj.api, { method: 'POST', body: JSON.stringify({ fn: 'devKick', args: [ST.token] }), keepalive: true }).catch(function () {}); } catch (e) { /* старый браузер */ }
    }, 2500);
  }

  /* ---------- сессия и маршруты ---------- */
  function sessKey() { return 'pf:' + (ST.obj ? ST.obj.id : '') + ':'; }
  function saveSession() { store.set(sessKey() + 's', JSON.stringify({ token: ST.token, role: ST.role, me: ST.me })); }
  function loadSession() {
    try { var s = JSON.parse(store.get(sessKey() + 's') || 'null'); if (s && s.token) { ST.token = s.token; ST.role = s.role; ST.me = s.me; } } catch (e) { /* пусто */ }
  }
  function logout(silent) {
    if (ST.token && !silent) api('logout', ST.token).catch(function () {});
    ST.token = ''; ST.role = ''; ST.me = null; ST.c = null; ST.dev = null; ST.sel = '';
    store.set(sessKey() + 's', null);
    stopPoll();
  }
  function go(hash) { if (location.hash.replace(/^#/, '') !== hash) location.hash = hash; else route(); }

  function route() {
    var hs = location.hash.replace(/^#/, '');
    if (!ST.obj) return renderPick();
    if (!ST.token) return renderLogin();
    if (ST.role === 'dev') {
      var m = hs.match(/^d\/(.+)$/);
      ST.sel = m ? decodeURIComponent(m[1]) : '';
      return renderDev();
    }
    if (hs === 'new') return renderForm(null);
    var e = hs.match(/^edit\/(.+)$/);
    if (e) return renderForm(findMine(decodeURIComponent(e[1])));
    return renderContractor();
  }

  /* ---------- выбор объекта ---------- */
  function pickObject() {
    var list = CFG.objects || [];
    var want = new URLSearchParams(location.search).get('o') || store.get('pf:obj');
    var o = list.filter(function (x) { return x.id === want; })[0] || (list.length === 1 ? list[0] : null);
    if (o) { ST.obj = o; store.set('pf:obj', o.id); document.title = 'Передача фронта — ' + o.name; }
  }
  function renderPick() {
    var list = CFG.objects || [];
    var r = root(); r.innerHTML = '';
    add(r, h('main', { class: 'login' },
      h('div', { class: 'ring', 'aria-hidden': 'true' }),
      brand('Выберите объект'),
      h('h1', { class: 'h1' }, 'Передача ', h('em', null, 'фронта работ')),
      list.length ? h('div', { class: 'list' }, list.map(function (o) {
        return h('button', { class: 'card', type: 'button', onclick: function () { ST.obj = o; store.set('pf:obj', o.id); document.title = 'Передача фронта — ' + o.name; loadSession(); go(''); } },
          h('span', { class: 'c-title' }, o.name), o.address ? h('span', { class: 'c-sub' }, o.address) : null);
      })) : h('div', { class: 'msg err' }, 'Не настроен ни один объект (config.js).')));
  }
  function brand(sub) {
    return h('div', { class: 'brand' }, h('div', { class: 'logo', html: ICON.home }),
      h('div', null, h('div', { class: 'b-sub' }, sub || (ST.obj ? ST.obj.name : '')), h('div', { class: 'b-main' }, 'Передача фронта работ')));
  }

  /* ---------- вход ---------- */
  function renderLogin() {
    var step2 = !!ST.email;
    var r = root(); r.innerHTML = '';
    var msgBox = h('div', { 'aria-live': 'polite' });
    function msg(text, kind) { msgBox.innerHTML = ''; if (text) add(msgBox, h('div', { class: 'msg ' + (kind || 'ok') }, text)); }
    if (ST.msg) { msg(ST.msg.text, ST.msg.kind); ST.msg = null; }

    var email = h('input', { id: 'email', class: 'inp', type: 'email', autocomplete: 'email', inputmode: 'email', value: store.get('pf:email') || '',
      style: 'height:56px;border:1.5px solid var(--acc)', placeholder: 'name@company.ru' });
    var bCode = h('button', { class: 'btn block', type: 'submit' }, 'Получить код');
    var f1 = h('form', { class: 'field', onsubmit: function (ev) {
      ev.preventDefault();
      var e = email.value.trim(); bCode.disabled = true; bCode.textContent = 'Отправляем…'; msg('');
      api('requestCode', e).then(function (x) {
        ST.email = e; store.set('pf:email', e); ST.who = x.role === 'dev' ? 'застройщик' : x.org; renderLogin();
      }).catch(function (err) { bCode.disabled = false; bCode.textContent = 'Получить код'; msg(err.message, 'err'); });
    } }, h('label', { for: 'email' }, 'Электронная почта'), email, h('div', { style: 'height:6px' }), bCode);

    var code = h('input', { id: 'code', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', 'aria-label': 'Код из письма, 6 цифр' });
    var cells = [0, 1, 2, 3, 4, 5].map(function () { return h('div', { class: 'cell', 'aria-hidden': 'true' }); });
    function paint() {
      var v = code.value.replace(/\D/g, '').slice(0, 6); if (v !== code.value) code.value = v;
      cells.forEach(function (c, i) { c.textContent = v[i] || (i === v.length ? '_' : ''); c.className = 'cell' + (i === v.length ? ' cur' : ''); });
      if (v.length === 6) submit2();
    }
    var bIn = h('button', { class: 'btn block', type: 'submit' }, 'Войти');
    var busy2 = false;
    function submit2() {
      if (busy2 || code.value.length !== 6) return;
      busy2 = true; bIn.disabled = true; bIn.textContent = 'Проверяем…'; msg('');
      api('verifyCode', ST.email, code.value).then(function (x) {
        ST.token = x.token; ST.role = x.role; ST.me = { name: x.name, org: x.org, email: x.email }; ST.email = '';
        saveSession(); go(x.role === 'dev' ? 'd' : '');
      }).catch(function (err) { busy2 = false; bIn.disabled = false; bIn.textContent = 'Войти'; code.value = ''; paint(); msg(err.message, 'err'); });
    }
    code.addEventListener('input', paint);
    var f2 = h('form', { class: 'panel', onsubmit: function (ev) { ev.preventDefault(); submit2(); } },
      h('span', { class: 'lbl' }, 'Код из письма'),
      h('div', { class: 'otp' }, cells, code),
      h('span', { style: 'font-size:12px;color:var(--mut)' }, 'Код отправлен на ' + ST.email + (ST.who ? ' (' + ST.who + ')' : '') + '. Действует 10 минут. Проверьте «Спам». ',
        h('button', { class: 'linkbtn', type: 'button', onclick: function () {
          api('requestCode', ST.email).then(function () { msg('Новый код отправлен.', 'good'); }).catch(function (err) { msg(err.message, 'err'); });
        } }, 'Отправить ещё раз')),
      bIn,
      h('button', { class: 'btn ghost sm', type: 'button', onclick: function () { ST.email = ''; renderLogin(); } }, 'Другой адрес'));

    add(r, h('main', { class: 'login' },
      h('div', { class: 'ring', 'aria-hidden': 'true' }),
      brand(),
      h('div', { style: 'display:flex;flex-direction:column;gap:12px;margin-top:32px' },
        h('h1', { class: 'h1' }, 'Вход в ', h('em', null, 'приложение')),
        h('p', { class: 'lead' }, 'Введите рабочий e-mail, который вы сообщили застройщику. Пришлём одноразовый код — пароль не нужен.')),
      step2 ? f2 : f1, msgBox,
      (CFG.objects || []).length > 1 ? h('button', { class: 'linkbtn', type: 'button', style: 'align-self:flex-start', onclick: function () { store.set('pf:obj', null); ST.obj = null; go(''); } }, 'Другой объект') : null,
      h('div', { class: 'foot' }, 'Нет доступа? Попросите застройщика внести ваш e-mail. Версия ' + APP_VERSION + '.')));
    (step2 ? code : email).focus();
    if (step2) paint();
  }

  /* ---------- подрядчик ---------- */
  function chipKind(s) {
    if (/сформирован/.test(s) && !/ошибка/.test(s)) return 'act';
    if (/^На доработку/.test(s)) return 'fix';
    if (/^Отклонена|^Отозвана|^Не заполнено|ошибка|не создан/.test(s)) return 'bad';
    return 'wait';
  }
  function linkBtn(url, text, cls) { return url ? h('a', { class: 'btn ghost sm ' + (cls || ''), href: url, target: '_blank', rel: 'noopener' }, text) : null; }
  function findMine(id) { return ST.c ? ST.c.out.filter(function (x) { return x.id === id; })[0] || null : null; }

  function loadContractor(quiet) {
    if (ST.loading) return;
    ST.loading = true;
    if (!quiet) toast('');
    return api('load', ST.token).then(function (d) {
      ST.loading = false; ST.c = d; ST.lastLoad = Date.now();
      ST.me = ST.me || {}; ST.me.org = d.org; saveSession();
      if (!/^#(new|edit)/.test(location.hash)) renderContractor();
    }).catch(function (e) { ST.loading = false; if (e.code !== 'SESSION') toast(e.message, true); });
  }

  function renderContractor() {
    var r = root(); r.innerHTML = '';
    if (!ST.c) { add(r, h('div', { class: 'wrap' }, topBar('Мои заявки', ST.me && ST.me.org), h('div', { class: 'empty' }, h('span', { class: 'spin' }), ' Загрузка…'))); loadContractor(true); return; }
    var d = ST.c;
    var arr = ST.tab === 'out' ? d.out : d.inc;
    add(r, h('div', { class: 'wrap' },
      topBar('Мои заявки', d.org),
      h('div', { class: 'seg', role: 'tablist' },
        h('button', { type: 'button', role: 'tab', class: ST.tab === 'out' ? 'on' : '', 'aria-selected': String(ST.tab === 'out'), onclick: function () { ST.tab = 'out'; renderContractor(); } }, 'Передаю · ' + d.out.length),
        h('button', { type: 'button', role: 'tab', class: ST.tab === 'inc' ? 'on' : '', 'aria-selected': String(ST.tab === 'inc'), onclick: function () { ST.tab = 'inc'; renderContractor(); } }, 'Принимаю · ' + d.inc.length)),
      h('div', { class: 'list' }, arr.length ? arr.map(function (it) { return card(it, ST.tab === 'out'); })
        : h('div', { class: 'empty' }, ST.tab === 'out' ? 'Заявок пока нет. Нажмите «Новая заявка».' : 'Входящих заявок нет.'))));
    if (ST.tab === 'out') add(r, h('div', { class: 'fab' }, h('a', { class: 'btn', href: '#new' }, icon('plus'), 'Новая заявка')));
  }

  function topBar(title, sub, extra) {
    return h('div', { class: 'top' },
      h('div', { class: 'grow' }, h('div', { class: 't-sub' }, sub || ''), h('div', { class: 't-main' }, title)),
      extra || null,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Обновить', onclick: function () { if (ST.role === 'dev') loadDev(); else loadContractor(); }, html: ICON.reload }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Выйти', onclick: function () { logout(false); go(''); }, html: ICON.out }));
  }

  function card(it, mine) {
    var kind = chipKind(it.status);
    var place = [it.korp, [it.p1, it.mark].filter(Boolean).join(' '), [it.p2, it.axes].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    var fix = mine && kind === 'fix';
    return h('article', { class: 'card' + (fix ? ' hot' : '') },
      h('div', { class: 'c-head' }, h('span', { class: 'c-id' }, it.id + (it.date ? ' · ' + it.date : '')), h('span', { class: 'chip ' + kind }, it.status || '—')),
      h('div', { class: 'c-title' }, it.w1 + ' → ' + it.w2),
      h('div', { class: 'c-sub' }, place + (mine ? ' · кому: ' + it.to : ' · от: ' + it.from)),
      it.note ? h('div', { class: 'c-sub' }, 'Комментарий: ' + it.note) : null,
      mine && (it.ddec || it.dnote) ? h('div', { class: 'c-note' }, 'Застройщик: ' + [it.ddec, it.dnote].filter(Boolean).join(' — ')) : null,
      !it.viaForm && mine ? h('div', { class: 'c-sub' }, 'Подана через файл-реестр — правка и отзыв там.') : null,
      h('div', { class: 'c-btns' },
        linkBtn(it.draftUrl, 'Проект акта'),
        it.act ? linkBtn(it.docUrl, 'Акт № ' + it.act) : null,
        it.act ? linkBtn(it.pdfUrl, 'PDF') : null,
        mine && it.editable ? h('a', { class: fix ? 'btn sm' : 'btn ghost sm', href: '#edit/' + encodeURIComponent(it.id) }, fix ? 'Исправить и отправить' : 'Изменить') : null,
        mine && it.revocable ? revokeBtn(it) : null));
  }
  function revokeBtn(it) {
    var b = h('button', { class: 'btn mute sm', type: 'button' }, 'Отозвать');
    b.addEventListener('click', function () {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Точно отозвать?'; return; }
      b.disabled = true; b.textContent = 'Отзываем…';
      api('revoke', ST.token, it.id).then(function () { toast('Заявка ' + it.id + ' отозвана.'); loadContractor(true); })
        .catch(function (e) { b.disabled = false; b.textContent = 'Отозвать'; delete b.dataset.sure; toast(e.message, true); });
    });
    return b;
  }

  /* ---------- форма заявки ---------- */
  function suggest(input, list) {
    var box = null, items = [], cur = -1;
    function close() { if (box) { box.remove(); box = null; } cur = -1; }
    function open() {
      var v = key(input.value);
      items = (list || []).filter(function (x) { return !v || key(x).indexOf(v) >= 0; }).filter(function (x) { return key(x) !== v; }).slice(0, 6);
      close();
      if (!items.length || document.activeElement !== input) return;
      box = h('div', { class: 'sugg', role: 'listbox' }, items.map(function (x, i) {
        return h('button', { type: 'button', role: 'option', tabindex: '-1', onmousedown: function (ev) { ev.preventDefault(); input.value = x; close(); } }, x);
      }));
      input.parentNode.appendChild(box);
    }
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', open);
    input.addEventListener('focus', open);
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    input.addEventListener('keydown', function (ev) {
      if (!box) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault(); cur = (cur + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        Array.prototype.forEach.call(box.children, function (b, i) { b.classList.toggle('on', i === cur); });
      } else if (ev.key === 'Enter' && cur >= 0) { ev.preventDefault(); input.value = items[cur]; close(); }
      else if (ev.key === 'Escape') close();
    });
  }

  function renderForm(it) {
    if (!ST.c) { root().innerHTML = ''; loadContractor(true).then(function () { route(); }); return; }
    var l = ST.c.lists;
    var r = root(); r.innerHTML = '';
    ST.editId = it ? it.id : '';
    var v = function (k) { return it ? (k === 'date' ? it.iso : (it[k] || '')) : (k === 'date' ? today() : ''); };
    function sel(id, arr, val, blank) {
      return h('select', { id: id, class: 'inp' }, blank ? h('option', { value: '' }, '—') : null,
        arr.map(function (x) { return h('option', { value: x, selected: x === val ? true : null }, x); }));
    }
    var f = {
      date: h('input', { id: 'f_date', class: 'inp', type: 'date', value: v('date'), required: true }),
      korp: sel('f_korp', l.korp, v('korp'), !v('korp')),
      to: h('input', { id: 'f_to', class: 'inp', value: v('to'), required: true, placeholder: 'Начните вводить название' }),
      w1: h('input', { id: 'f_w1', class: 'inp', value: v('w1'), required: true }),
      w2: h('input', { id: 'f_w2', class: 'inp', value: v('w2'), required: true }),
      p1: sel('f_p1', l.p1, v('p1'), true),
      mark: h('input', { id: 'f_mark', class: 'inp', value: v('mark') }),
      p2: sel('f_p2', l.p2, v('p2'), true),
      axes: h('input', { id: 'f_axes', class: 'inp mono', value: v('axes') }),
      note: h('textarea', { id: 'f_note', class: 'inp', rows: '2' }, v('note'))
    };
    var fld = function (k, label) { return h('div', { class: 'field' }, h('label', { for: 'f_' + k }, label), f[k]); };
    var msgBox = h('div', { 'aria-live': 'polite' });
    var bSave = h('button', { class: 'btn block', type: 'submit' }, 'Отправить');
    var form = h('form', { class: 'form', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      var data = {}; Object.keys(f).forEach(function (k) { data[k] = f[k].value; });
      bSave.disabled = true; bSave.innerHTML = ''; add(bSave, [h('span', { class: 'spin' }), ' Отправляем…']);
      msgBox.innerHTML = '';
      var wasEdit = !!ST.editId;
      var slow = setTimeout(function () { add(msgBox, h('div', { class: 'msg ok' }, 'Много одновременных заявок — отправка может занять до полутора минут. Не закрывайте страницу.')); }, 15000);
      api('save', ST.token, data, ST.editId).then(function (x) {
        clearTimeout(slow);
        toast(x.unchanged ? (wasEdit ? 'Изменений нет.' : 'Такая заявка уже подана — ' + x.id + '. Повторно не отправлена.')
          : 'Заявка ' + x.id + ' отправлена. Статус: ' + x.status + '.' + (x.added && x.added.length ? ' В справочник добавлено: ' + x.added.join(', ') + '.' : '') +
            (x.late ? ' Ссылка на проект акта появится через 1–2 минуты.' : ''));
        ST.tab = 'out'; ST.c = null; go('');
      }).catch(function (e) {
        clearTimeout(slow);
        bSave.disabled = false; bSave.textContent = 'Отправить';
        msgBox.innerHTML = ''; add(msgBox, h('div', { class: 'msg err' }, e.message));
      });
    } },
      it ? h('div', { class: 'msg good' }, 'Изменение заявки ' + it.id + ': после отправки проект акта пересоздастся, согласование начнётся заново.') : null,
      it && (it.ddec || it.dnote) ? h('div', { class: 'msg ok' }, 'Застройщик: ' + [it.ddec, it.dnote].filter(Boolean).join(' — ')) : null,
      h('div', { class: 'grid2' }, fld('date', 'Дата *'), fld('korp', 'Корпус *')),
      fld('to', 'Кому передаю фронт *'),
      fld('w1', 'Мои выполненные работы *'),
      fld('w2', 'Работы принимающего *'),
      h('div', { class: 'grid-pre' }, fld('p1', 'Предлог'), fld('mark', 'Отметка')),
      h('div', { class: 'grid-pre' }, fld('p2', 'Предлог'), fld('axes', 'Оси')),
      fld('note', 'Комментарий для застройщика'),
      h('div', { class: 'note-row' }, icon('info'), 'Новую организацию или работу впишите целиком — она добавится в справочник. После отправки сразу появится проект акта «не подписывать».'),
      msgBox,
      h('div', { class: 'fab' }, bSave));
    suggest(f.to, l.contractors); suggest(f.w1, l.works); suggest(f.w2, l.works); suggest(f.mark, l.marks);
    add(r, h('div', { class: 'wrap' },
      h('div', { class: 'top' },
        h('a', { class: 'icon-btn', href: '#', 'aria-label': 'Назад к заявкам', html: ICON.back }),
        h('div', { class: 'grow' }, h('div', { class: 't-sub' }, ST.c.org), h('div', { class: 't-main' }, it ? 'Заявка ' + it.id : 'Новая заявка'))),
      form));
    (it ? f.w1 : f.to).focus();
  }

  /* ---------- застройщик ---------- */
  function loadDev(quiet) {
    if (ST.loading) return Promise.resolve();
    ST.loading = true;
    return api('devLoad', ST.token).then(function (d) {
      ST.loading = false; ST.dev = d; ST.lastLoad = Date.now();
      ST.me = ST.me || {}; ST.me.name = d.name; saveSession();
      renderDev();
      schedulePoll();
    }).catch(function (e) { ST.loading = false; if (e.code !== 'SESSION' && !quiet) toast(e.message, true); });
  }
  function stopPoll() { clearTimeout(ST.pollT); ST.pollT = 0; ST.pollN = 0; }
  function schedulePoll() {
    clearTimeout(ST.pollT);
    var forming = ST.dev && ST.dev.wait.some(function (v) { return v.forming; });
    if (!forming) { ST.pollN = 0; return; }
    if (ST.pollN++ > 15) return;                        // не дольше ~5 минут
    ST.pollT = setTimeout(function () { if (document.visibilityState === 'visible') loadDev(true); else schedulePoll(); }, 20000);
  }
  function devList() {
    var d = ST.dev; if (!d) return [];
    var arr = ST.dtab === 'fix' ? d.fix : ST.dtab === 'acts' ? d.acts : d.wait;
    var q = key(ST.q);
    return q ? arr.filter(function (v) { return key([v.id, v.from, v.to, v.w1, v.w2, v.korp, v.mark, v.axes].join(' ')).indexOf(q) >= 0; }) : arr;
  }
  function findDev(id) {
    var d = ST.dev; if (!d) return null;
    return d.wait.concat(d.fix, d.acts).filter(function (v) { return v.id === id; })[0] || null;
  }

  function renderDev() {
    var r = root(); r.innerHTML = '';
    if (!ST.dev) { add(r, h('div', { class: 'wrap wide' }, topBar('Согласование', 'Застройщик'), h('div', { class: 'empty' }, h('span', { class: 'spin' }), ' Загрузка…'))); loadDev(); return; }
    var d = ST.dev;
    var sel = ST.sel ? findDev(ST.sel) : null;
    var list = devList();
    var wide = window.matchMedia('(min-width: 1000px)').matches;
    if (!sel && wide && list.length) sel = list[0];
    var tile = function (k, n, label) {
      return h('button', { type: 'button', class: 'tile' + (ST.dtab === k ? ' on' : ''), 'aria-pressed': String(ST.dtab === k), onclick: function () { ST.dtab = k; ST.sel = ''; go('d'); } },
        h('b', null, String(n)), h('span', null, label));
    };
    var search = h('input', { type: 'search', 'aria-label': 'Поиск', placeholder: 'Организация, работы, № заявки', value: ST.q });
    search.addEventListener('input', function () { ST.q = search.value; var pos = search.selectionStart; renderDev(); var s2 = document.querySelector('.search input'); if (s2) { s2.focus(); s2.setSelectionRange(pos, pos); } });

    var cards = h('div', { class: 'list only-narrow', style: 'padding-bottom:32px' }, list.length ? list.map(function (v) {
      return h('a', { class: 'card' + (v.forming ? '' : ST.dtab === 'wait' ? ' hot' : ''), href: '#d/' + encodeURIComponent(v.id), style: 'color:var(--tx)' },
        h('div', { class: 'c-head' }, h('span', { class: 'c-id' }, v.id + ' · ' + v.sent), statusChip(v)),
        h('div', { class: 'c-title' }, short(v.from) + ' → ' + short(v.to)),
        h('div', { class: 'c-sub' }, v.w1 + ' → ' + v.w2 + ' · ' + place(v)));
    }) : h('div', { class: 'empty' }, emptyText()));
    var table = h('div', { class: 'dtable-box only-wide' }, list.length ? h('table', { class: 'dtable' },
      h('thead', null, h('tr', null, ['№ заявки', 'Передаёт → принимает', 'Работы', 'Где', ST.dtab === 'acts' ? 'Акт' : 'Подана'].map(function (t) { return h('th', { scope: 'col' }, t); }))),
      h('tbody', null, list.map(function (v) {
        return h('tr', { class: sel && sel.id === v.id ? 'sel' : '', tabindex: '0', onclick: function () { go('d/' + encodeURIComponent(v.id)); },
          onkeydown: function (ev) { if (ev.key === 'Enter') go('d/' + encodeURIComponent(v.id)); } },
          h('td', { class: 'mono' }, v.id), h('td', { class: 'who' }, short(v.from) + ' → ' + short(v.to)),
          h('td', null, v.w1 + ' → ' + v.w2), h('td', null, place(v)), h('td', null, ST.dtab === 'acts' ? '№ ' + v.act : (v.forming ? 'формируется' : v.sent)));
      }))) : h('div', { class: 'empty' }, emptyText()));

    add(r, h('div', { class: 'wrap wide' },
      topBar(ST.dtab === 'fix' ? 'На доработке' : ST.dtab === 'acts' ? 'Сформированные акты' : 'На согласование', (d.name ? d.name + ' · ' : '') + 'Застройщик',
        null),
      h('div', { class: 'dev-grid' + (ST.sel ? ' has-sel' : '') },
        h('section', { class: 'dev-list' },
          h('div', { class: 'tiles' }, tile('wait', d.counts.wait, 'Ждут решения'), tile('fix', d.counts.fix, 'На доработке'), tile('acts', d.counts.acts, 'Актов')),
          h('label', { class: 'search' }, h('span', { html: ICON.search, style: 'display:inline-flex' }), search),
          cards, table),
        h('aside', { class: 'dev-detail', 'aria-label': 'Заявка' }, sel ? detail(sel) : h('div', { class: 'empty' }, 'Выберите заявку')))));
  }
  function emptyText() { return ST.q ? 'Ничего не найдено.' : ST.dtab === 'wait' ? 'Все заявки рассмотрены.' : ST.dtab === 'fix' ? 'На доработке ничего нет.' : 'Актов пока нет.'; }
  function short(s) { return String(s || '').replace(/^(ООО|АО|ПАО|ЗАО|ИП)\s+/, '').replace(/[«»"]/g, ''); }
  function place(v) { return [v.korp, [v.p1, v.mark].filter(Boolean).join(' '), [v.p2, v.axes].filter(Boolean).join(' ')].filter(Boolean).join(' · '); }
  function statusChip(v) {
    if (v.act) return h('span', { class: 'chip act' }, 'Акт № ' + v.act);
    if (v.forming) return h('span', { class: 'chip wait' }, 'Формируется');
    if (v.ddec === 'На доработку') return h('span', { class: 'chip fix' }, 'На доработке');
    if (!v.ready) return h('span', { class: 'chip bad' }, 'Проект готовится');
    return h('span', { class: 'chip wait' }, 'Ждёт решения');
  }

  function detail(v) {
    var facts = [['Передаёт', v.from], ['Принимает', v.to], ['Выполнено', v.w1], ['Далее', v.w2], ['Где', place(v)], ['Дата', v.date]];
    if (v.note) facts.push(['Комментарий', v.note]);
    if (v.ddec) facts.push(['Решение', v.ddec + (v.dnote ? ' — ' + v.dnote : '') + (v.by ? ' (' + v.by + (v.dtime ? ', ' + v.dtime : '') + ')' : '')]);
    var box = h('div', { class: 'dev-detail-in', style: 'display:flex;flex-direction:column;gap:14px' },
      h('div', { class: 'back-row' }, h('a', { class: 'btn ghost sm', href: '#d', style: 'width:max-content' }, icon('back'), 'К списку')),
      h('div', { class: 'c-head', style: 'display:flex;justify-content:space-between;align-items:center' }, h('span', { class: 'mono', style: 'color:var(--acc-soft-tx)' }, v.id), statusChip(v)),
      h('dl', { class: 'facts' }, facts.map(function (p) { return [h('dt', null, p[0]), h('dd', null, p[1] || '—')]; })),
      v.draftUrl && !v.act ? h('a', { class: 'btn ghost', href: v.draftUrl, target: '_blank', rel: 'noopener' }, 'Открыть проект акта', icon('ext')) : null,
      v.act ? h('div', { class: 'grid2' }, linkBtn(v.docUrl, 'Акт № ' + v.act), linkBtn(v.pdfUrl, 'PDF')) : null);
    if (v.act || v.forming || v.ddec) {
      add(box, h('div', { class: 'msg ok' }, v.act ? 'Акт сформирован.' : v.forming ? 'Согласовано — акт и PDF формируются, обычно 1–3 минуты.' :
        'Ждём исправления от подрядчика. После исправления заявка вернётся в очередь.'));
      return box;
    }
    var comment = h('textarea', { id: 'dc', class: 'inp', rows: '3', placeholder: 'Обязателен для «На доработку» и «Отклонить»' });
    var msgBox = h('div', { 'aria-live': 'polite' });
    var buttons = [];
    function decide(dec) {
      if (dec !== 'Согласовать' && !comment.value.trim()) { msgBox.innerHTML = ''; add(msgBox, h('div', { class: 'msg err' }, 'Напишите причину — её увидит подрядчик.')); comment.focus(); return; }
      buttons.forEach(function (b) { b.disabled = true; });
      msgBox.innerHTML = ''; add(msgBox, h('div', { class: 'msg ok' }, h('span', { class: 'spin' }), ' Записываем решение…'));
      api('devDecide', ST.token, v.id, dec, comment.value, v.h).then(function (x) {
        if (x.already) {
          toast('Решение уже принято: ' + x.ddec + (x.by ? ' — ' + x.by : '') + '.', true);
        } else {
          v.ddec = dec; v.dnote = comment.value; v.by = ST.me && ST.me.name; v.forming = dec === 'Согласовать';
          toast(dec === 'Согласовать' ? 'Согласовано. Акт и PDF сформируются за 1–3 минуты.' : dec === 'На доработку' ? 'Отправлено на доработку.' : 'Заявка отклонена.');
          kick();
        }
        var next = devList().filter(function (u) { return u.id !== v.id && !u.forming; })[0];
        ST.sel = ''; go(next && window.matchMedia('(min-width: 1000px)').matches ? 'd/' + encodeURIComponent(next.id) : 'd');
        setTimeout(function () { loadDev(true); }, x.already ? 0 : 1500);
      }).catch(function (e) {
        buttons.forEach(function (b) { b.disabled = false; });
        msgBox.innerHTML = ''; add(msgBox, h('div', { class: 'msg err' }, e.message));
      });
    }
    var bOk = h('button', { class: 'btn block', type: 'button', onclick: function () { decide('Согласовать'); } }, icon('check'), v.ready ? 'Согласовать' : 'Согласовать (проект ещё готовится)');
    var bFix = h('button', { class: 'btn outline sm', type: 'button', style: 'height:52px', onclick: function () { decide('На доработку'); } }, 'На доработку');
    var bNo = h('button', { class: 'btn mute sm', type: 'button', style: 'height:52px', onclick: function () { decide('Отклонить'); } }, 'Отклонить');
    buttons = [bOk, bFix, bNo];
    add(box, [
      h('div', { class: 'field' }, h('label', { for: 'dc' }, 'Комментарий подрядчику'), comment),
      h('div', { class: 'decide' }, bOk, h('div', { class: 'grid2' }, bFix, bNo)),
      msgBox,
      h('div', { style: 'font-size:12px;color:var(--mut)' }, 'Решение запишется с вашим именем и временем. Если коллега уже ответил, вы увидите его решение.')]);
    return box;
  }

  /* ---------- запуск ---------- */
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !ST.token || Date.now() - ST.lastLoad < 30000) return;
    if (ST.role === 'dev') loadDev(true); else if (!/^#(new|edit)/.test(location.hash)) loadContractor(true);
  });
  pickObject();
  if (ST.obj) loadSession();
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
