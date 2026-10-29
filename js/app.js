/* Передача фронта — приложение (подрядчик и застройщик). Версия 1.1, 29.10.2026.
 * Данные и акты — в Google Таблице объекта; связь — через API веб-приложения Apps Script (config.js). */
(function () {
  'use strict';

  var APP_VERSION = '1.1.3';
  var CFG = window.APP_CONFIG || { objects: [] };
  var ST = {
    obj: null, token: '', role: '', me: null, email: '',
    c: null, dev: null, tab: 'out', dtab: 'wait', scope: '', q: '', sel: '', editId: '', cfg: null,
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
    if (hs === 'join') return renderJoin();
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
    if (o) { ST.obj = o; store.set('pf:obj', o.id); document.title = 'Генератор актов — ' + o.name; }
  }
  function renderPick() {
    var list = CFG.objects || [];
    var r = root(); r.innerHTML = '';
    add(r, h('main', { class: 'login' },
      h('div', { class: 'ring', 'aria-hidden': 'true' }),
      brand('Выберите объект'),
      h('h1', { class: 'h1' }, 'Передача ', h('em', null, 'фронта работ')),
      list.length ? h('div', { class: 'list' }, list.map(function (o) {
        return h('button', { class: 'card', type: 'button', onclick: function () { ST.obj = o; store.set('pf:obj', o.id); document.title = 'Генератор актов — ' + o.name; loadSession(); go(''); } },
          h('span', { class: 'c-title' }, o.name), o.address ? h('span', { class: 'c-sub' }, o.address) : null);
      })) : h('div', { class: 'msg err' }, 'Не настроен ни один объект (config.js).')));
  }
  function brand(sub) {
    return h('div', { class: 'brand' }, h('div', { class: 'logo', html: ICON.home }),
      h('div', null, h('div', { class: 'b-sub' }, sub || (ST.obj ? ST.obj.name : '')), h('div', { class: 'b-main' }, 'Генератор актов')));
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
      h('div', { class: 'foot' },
        h('a', { class: 'btn ghost block', href: '#join', style: 'margin-bottom:14px' }, 'Заявка на подключение организации'),
        'Нет доступа? Подайте заявку на подключение — застройщик рассмотрит её и пришлёт ответ на e-mail. Версия ' + APP_VERSION + '.')));
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
      it.app ? h('div', { class: 'c-sub' }, 'Приложение: ' + it.app) : null,
      it.note ? h('div', { class: 'c-sub' }, 'Комментарий: ' + it.note) : null,
      mine && it.apprName ? h('div', { class: 'c-sub' }, 'Согласующий: ' + it.apprName + (it.dir ? ' · ' + it.dir : '')) : null,
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
      app: h('input', { id: 'f_app', class: 'inp', value: v('app'), placeholder: 'напр.: Схема устройства гильз проходок в монолитных стенах К5 на 2 тех.этаже в осях 4-5/Б-7' }),
      note: h('textarea', { id: 'f_note', class: 'inp', rows: '2' }, v('note'))
    };
    var fld = function (k, label) { return h('div', { class: 'field' }, h('label', { for: 'f_' + k }, label), f[k]); };
    // согласующий от застройщика: направление → представители, которые ведут корпус и направление
    var devs = l.devs || [], dirs = l.dirs || [];
    var useAppr = devs.length > 0;
    var choice = { dir: it ? it.dir : (store.get('pf:dir') || ''), appr: it ? it.appr : (store.get('pf:appr') || '') };
    if (dirs.indexOf(choice.dir) < 0) choice.dir = '';
    var apprSel = h('select', { id: 'f_appr', class: 'inp' });
    var apprHint = h('div', { class: 'hint', 'aria-live': 'polite' });
    var dirBox = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Направление' });
    function covers(d, k, dir) {
      return (!d.korp.length || d.korp.some(function (x) { return key(x) === key(k); })) && (!d.dirs.length || !dir || d.dirs.indexOf(dir) >= 0);
    }
    function paintDirs() {
      dirBox.innerHTML = '';
      dirs.forEach(function (x) {
        add(dirBox, h('button', { type: 'button', role: 'radio', 'aria-checked': String(choice.dir === x), class: choice.dir === x ? 'on' : '',
          onclick: function () { choice.dir = x; paintDirs(); paintAppr(); } }, x));
      });
    }
    function paintAppr() {
      var k = f.korp.value;
      var list = k && choice.dir ? devs.filter(function (d) { return covers(d, k, choice.dir); }) : [];
      var spec = list.filter(function (d) { return d.korp.length || d.dirs.length; });          // кто ведёт именно этот корпус
      list = spec.concat(list.filter(function (d) { return spec.indexOf(d) < 0; }));
      if (choice.auto || !list.some(function (d) { return d.id === choice.appr; })) {          // выбор вручную сохраняется
        choice.appr = spec.length === 1 ? spec[0].id : list.length === 1 ? list[0].id : '';
        choice.auto = !!choice.appr;
      }
      apprSel.innerHTML = '';
      add(apprSel, h('option', { value: '' }, list.length > 1 ? '— выберите —' : '—'));
      list.forEach(function (d) { add(apprSel, h('option', { value: d.id, selected: d.id === choice.appr ? true : null }, d.name + (d.pos ? ' — ' + d.pos : ''))); });
      apprSel.disabled = !k || !choice.dir || !list.length;
      apprHint.textContent = !k ? 'Сначала выберите корпус.' : !choice.dir ? 'Выберите направление.' :
        !list.length ? 'Для ' + k + ' (' + choice.dir + ') согласующий не назначен — обратитесь к застройщику.' :
        spec.length === 1 && choice.appr === spec[0].id ? k + ' (' + choice.dir + ') ведёт ' + spec[0].name + ' — выбран автоматически.' : '';
    }
    apprSel.addEventListener('change', function () { choice.appr = apprSel.value; choice.auto = false; });
    f.korp.addEventListener('change', paintAppr);
    if (useAppr) { paintDirs(); paintAppr(); }
    var msgBox = h('div', { 'aria-live': 'polite' });
    var bSave = h('button', { class: 'btn block', type: 'submit' }, 'Отправить');
    var form = h('form', { class: 'form', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      var data = {}; Object.keys(f).forEach(function (k) { data[k] = f[k].value; });
      data.dir = useAppr ? choice.dir : ''; data.appr = useAppr ? apprSel.value : '';
      if (useAppr) { store.set('pf:dir', data.dir); store.set('pf:appr', data.appr); }
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
      useAppr ? h('div', { class: 'field' }, h('span', { class: 'lbl-t' }, 'Направление *'), dirBox) : null,
      useAppr ? h('div', { class: 'field' }, h('label', { for: 'f_appr' }, 'Согласующий от застройщика *'), apprSel, apprHint) : null,
      fld('to', 'Кому передаю фронт *'),
      fld('w1', 'Мои выполненные работы *'),
      fld('w2', 'Работы принимающего *'),
      h('div', { class: 'grid-pre' }, fld('p1', 'Предлог'), fld('mark', 'Отметка')),
      h('div', { class: 'grid-pre' }, fld('p2', 'Предлог'), fld('axes', 'Оси')),
      fld('app', 'Приложение'),
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
  function scope() {
    if (ST.dev && !ST.dev.counts.mine) return 'all';          // сервер без согласующих (Api 1.0) — показываем всё
    if (!ST.scope) ST.scope = store.get('pf:scope') || 'mine';
    return ST.scope;
  }
  function devList() {
    var d = ST.dev; if (!d) return [];
    var q = key(ST.q);
    if (ST.dtab === 'joins') {
      var j = d.joins || [];
      return q ? j.filter(function (v) { return key([v.id, v.org, v.inn, v.name, v.email, v.works].join(' ')).indexOf(q) >= 0; }) : j;
    }
    var arr = ST.dtab === 'fix' ? d.fix : ST.dtab === 'acts' ? d.acts : d.wait;
    if (scope() === 'mine') arr = arr.filter(function (v) { return v.mine; });
    return q ? arr.filter(function (v) { return key([v.id, v.from, v.to, v.w1, v.w2, v.korp, v.mark, v.axes, v.apprName].join(' ')).indexOf(q) >= 0; }) : arr;
  }
  function findDev(id) {
    var d = ST.dev; if (!d) return null;
    return d.wait.concat(d.fix, d.acts, d.joins || []).filter(function (v) { return v.id === id; })[0] || null;
  }

  function renderDev() {
    var r = root(); r.innerHTML = '';
    if (!ST.dev) { add(r, h('div', { class: 'wrap wide' }, topBar('Согласование', 'Застройщик'), h('div', { class: 'empty' }, h('span', { class: 'spin' }), ' Загрузка…'))); loadDev(); return; }
    var d = ST.dev;
    var sel = ST.sel ? findDev(ST.sel) : null;
    var list = devList();
    var wide = window.matchMedia('(min-width: 1000px)').matches;
    if (!sel && wide && list.length) sel = list[0];
    var c = scope() === 'mine' && d.counts.mine ? d.counts.mine : d.counts;
    if (ST.dtab === 'joins' && !(d.joins || []).length) ST.dtab = 'wait';
    var scopeSeg = !d.counts.mine ? null : h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Чьи заявки' },
      [['mine', 'Мои · ' + (d.counts.mine ? d.counts.mine.wait : d.counts.wait)], ['all', 'Все · ' + d.counts.wait]].map(function (p) {
        return h('button', { type: 'button', role: 'tab', class: scope() === p[0] ? 'on' : '', 'aria-selected': String(scope() === p[0]),
          onclick: function () { ST.scope = p[0]; store.set('pf:scope', p[0]); ST.sel = ''; go('d'); } }, p[1]);
      }));
    var tile = function (k, n, label) {
      return h('button', { type: 'button', class: 'tile' + (ST.dtab === k ? ' on' : ''), 'aria-pressed': String(ST.dtab === k), onclick: function () { ST.dtab = k; ST.sel = ''; go('d'); } },
        h('b', null, String(n)), h('span', null, label));
    };
    var search = h('input', { type: 'search', 'aria-label': 'Поиск', placeholder: 'Организация, работы, № заявки', value: ST.q });
    search.addEventListener('input', function () { ST.q = search.value; var pos = search.selectionStart; renderDev(); var s2 = document.querySelector('.search input'); if (s2) { s2.focus(); s2.setSelectionRange(pos, pos); } });

    var isJ = ST.dtab === 'joins';
    var cards = h('div', { class: 'list only-narrow', style: 'padding-bottom:32px' }, list.length ? list.map(function (v) {
      if (isJ) return h('a', { class: 'card hot', href: '#d/' + encodeURIComponent(v.id), style: 'color:var(--tx)' },
        h('div', { class: 'c-head' }, h('span', { class: 'c-id' }, v.id + ' · ' + v.sent), h('span', { class: 'chip wait' }, 'Подключение')),
        h('div', { class: 'c-title' }, v.org),
        h('div', { class: 'c-sub' }, [v.contract ? 'Договор ' + v.contract : '', v.name + ((v.contacts || []).length ? ' +' + v.contacts.length : ''), v.korp, v.dir].filter(Boolean).join(' · ')));
      return h('a', { class: 'card' + (v.forming ? '' : ST.dtab === 'wait' ? ' hot' : ''), href: '#d/' + encodeURIComponent(v.id), style: 'color:var(--tx)' },
        h('div', { class: 'c-head' }, h('span', { class: 'c-id' }, v.id + ' · ' + v.sent), statusChip(v)),
        h('div', { class: 'c-title' }, short(v.from) + ' → ' + short(v.to)),
        h('div', { class: 'c-sub' }, v.w1 + ' → ' + v.w2 + ' · ' + place(v)),
        !v.mine || scope() === 'all' ? h('div', { class: 'c-sub' }, 'Согласующий: ' + (v.apprName || 'не назначен') + (v.dir ? ' · ' + v.dir : '')) : null);
    }) : h('div', { class: 'empty' }, emptyText()));
    var table = isJ ? h('div', { class: 'dtable-box only-wide' }, list.length ? h('table', { class: 'dtable' },
      h('thead', null, h('tr', null, ['№', 'Организация', 'Контакт', 'Работы', 'Подана'].map(function (t) { return h('th', { scope: 'col' }, t); }))),
      h('tbody', null, list.map(function (v) {
        return h('tr', { class: sel && sel.id === v.id ? 'sel' : '', tabindex: '0', onclick: function () { go('d/' + encodeURIComponent(v.id)); },
          onkeydown: function (ev) { if (ev.key === 'Enter') go('d/' + encodeURIComponent(v.id)); } },
          h('td', { class: 'mono' }, v.id), h('td', { class: 'who' }, v.org, v.contract ? h('div', { class: 'c-sub' }, 'Договор ' + v.contract) : null), h('td', null, v.name + (v.pos ? ', ' + v.pos : '') + ((v.contacts || []).length ? ' +' + v.contacts.length : '')),
          h('td', null, v.works), h('td', null, v.sent));
      }))) : h('div', { class: 'empty' }, emptyText()))
      : h('div', { class: 'dtable-box only-wide' }, list.length ? h('table', { class: 'dtable' },
      h('thead', null, h('tr', null, ['№ заявки', 'Передаёт → принимает', 'Работы', 'Где', 'Согласующий', ST.dtab === 'acts' ? 'Акт' : 'Подана'].map(function (t) { return h('th', { scope: 'col' }, t); }))),
      h('tbody', null, list.map(function (v) {
        return h('tr', { class: sel && sel.id === v.id ? 'sel' : '', tabindex: '0', onclick: function () { go('d/' + encodeURIComponent(v.id)); },
          onkeydown: function (ev) { if (ev.key === 'Enter') go('d/' + encodeURIComponent(v.id)); } },
          h('td', { class: 'mono' }, v.id), h('td', { class: 'who' }, short(v.from) + ' → ' + short(v.to)),
          h('td', null, v.w1 + ' → ' + v.w2), h('td', null, place(v)), h('td', { class: v.mine ? 'who' : '' }, (v.apprName || '—') + (v.dir ? ' · ' + v.dir : '')), h('td', null, ST.dtab === 'acts' ? '№ ' + v.act : (v.forming ? 'формируется' : v.sent)));
      }))) : h('div', { class: 'empty' }, emptyText()));

    add(r, h('div', { class: 'wrap wide' },
      topBar(isJ ? 'Подключение организаций' : ST.dtab === 'fix' ? 'На доработке' : ST.dtab === 'acts' ? 'Сформированные акты' : 'На согласование', (d.name ? d.name + ' · ' : '') + 'Застройщик',
        null),
      h('div', { class: 'dev-grid' + (ST.sel ? ' has-sel' : '') },
        h('section', { class: 'dev-list' },
          scopeSeg,
          h('div', { class: 'tiles' + ((d.joins || []).length ? ' t4' : '') }, tile('wait', c.wait, 'Ждут решения'), tile('fix', c.fix, 'На доработке'), tile('acts', c.acts, 'Актов'),
            (d.joins || []).length ? tile('joins', d.joins.length, 'Новые орг.') : null),
          h('label', { class: 'search' }, h('span', { html: ICON.search, style: 'display:inline-flex' }), search),
          cards, table),
        h('aside', { class: 'dev-detail', 'aria-label': 'Заявка' }, sel ? (isJ || /^П/.test(sel.id) && sel.org ? joinDetail(sel) : detail(sel)) : h('div', { class: 'empty' }, 'Выберите заявку')))));
  }
  function emptyText() { return ST.q ? 'Ничего не найдено.' : ST.dtab === 'joins' ? 'Новых заявок нет.' : scope() === 'mine' && ST.dtab !== 'acts' ? 'В «Мои» пусто. Заявки коллег — во вкладке «Все».' : ST.dtab === 'wait' ? 'Все заявки рассмотрены.' : ST.dtab === 'fix' ? 'На доработке ничего нет.' : 'Актов пока нет.'; }
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
    if (v.app) facts.push(['Приложение', v.app]);
    if (v.note) facts.push(['Комментарий', v.note]);
    facts.push(['Согласующий', (v.apprName || 'не назначен') + (v.dir ? ' · ' + v.dir : '') + (v.mine ? ' (вы)' : '')]);
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
          toast((dec === 'Согласовать' ? 'Согласовано' : dec === 'На доработку' ? 'Отправлено на доработку' : 'Заявка отклонена') +
            (x.instead ? ' за ' + x.instead : '') + '.' + (dec === 'Согласовать' ? ' Акт и PDF сформируются за 1–3 минуты.' : ''));
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
      !v.mine && v.apprName ? h('div', { class: 'msg ok' }, 'Заявка назначена: ' + v.apprName + '. Ваше решение запишется как замена — «за ' + v.apprName + '».') : null,
      h('div', { style: 'font-size:12px;color:var(--mut)' }, 'Решение запишется с вашим именем и временем; в акте представителем застройщика будет тот, кто согласовал.')]);
    return box;
  }

  /* ---------- подключение организации ---------- */
  function joinDetail(v) {
    var facts = [['Организация', v.org], ['ИНН', v.inn], ['Договор', v.contract], ['Предмет', v.subject],
      ['Контакт', v.name + (v.pos ? ', ' + v.pos : '')], ['E-mail', v.email], ['Телефон', v.phone]];
    (v.contacts || []).forEach(function (c, i) {
      facts.push(['Контакт ' + (i + 2), [c.name, c.pos].filter(Boolean).join(', ') + (c.phone || c.email ? ' · ' + [c.phone, c.email].filter(Boolean).join(' · ') : '')]);
    });
    facts.push(['Работы', v.works], ['Корпуса', v.korp], ['Направление', v.dir], ['Подана', v.sent]);
    var comment = h('textarea', { id: 'jc', class: 'inp', rows: '3', placeholder: 'Обязателен для отказа — получит организация' });
    var msgBox = h('div', { 'aria-live': 'polite' });
    var bs = [];
    function decide(dec) {
      if (dec === 'Отклонить' && !comment.value.trim()) { msgBox.innerHTML = ''; add(msgBox, h('div', { class: 'msg err' }, 'Напишите причину отказа.')); comment.focus(); return; }
      bs.forEach(function (b) { b.disabled = true; });
      msgBox.innerHTML = ''; add(msgBox, h('div', { class: 'msg ok' }, h('span', { class: 'spin' }), ' Записываем…'));
      api('devJoinDecide', ST.token, v.id, dec, comment.value).then(function (x) {
        toast(x.already ? 'Уже решено: ' + x.status + (x.by ? ' — ' + x.by : '') + '.' :
          dec === 'Одобрить' ? 'Подключена: ' + x.org + ' (код ' + x.code + ').' + (x.mailed ? ' Письмо со ссылкой отправлено.' : ' Письмо не отправлено — сообщите вход сами.') :
          'Заявка отклонена, организации отправлено письмо.', !!x.already);
        ST.sel = ''; go('d'); loadDev(true);
      }).catch(function (e) { bs.forEach(function (b) { b.disabled = false; }); msgBox.innerHTML = ''; add(msgBox, h('div', { class: 'msg err' }, e.message)); });
    }
    var bOk = h('button', { class: 'btn block', type: 'button', onclick: function () { decide('Одобрить'); } }, icon('check'), 'Подключить');
    var bNo = h('button', { class: 'btn mute sm', type: 'button', style: 'height:52px', onclick: function () { decide('Отклонить'); } }, 'Отклонить');
    bs = [bOk, bNo];
    return h('div', { class: 'dev-detail-in', style: 'display:flex;flex-direction:column;gap:14px' },
      h('div', { class: 'back-row' }, h('a', { class: 'btn ghost sm', href: '#d', style: 'width:max-content' }, icon('back'), 'К списку')),
      h('div', { class: 'c-head', style: 'display:flex;justify-content:space-between;align-items:center' }, h('span', { class: 'mono', style: 'color:var(--acc-soft-tx)' }, v.id), h('span', { class: 'chip wait' }, 'Подключение')),
      h('dl', { class: 'facts' }, facts.filter(function (p) { return p[1]; }).map(function (p) { return [h('dt', null, p[0]), h('dd', null, p[1])]; })),
      h('div', { class: 'field' }, h('label', { for: 'jc' }, 'Комментарий организации'), comment),
      h('div', { class: 'decide' }, bOk, bNo), msgBox,
      h('div', { style: 'font-size:12px;color:var(--mut)' }, '«Подключить» вносит организацию и e-mail всех контактных лиц в «Реестры» и отправляет им письмо со ссылкой на приложение. Решение окончательное.'));
  }

  function renderJoin() {
    var r = root(); r.innerHTML = '';
    if (!ST.cfg) {
      add(r, h('div', { class: 'wrap' }, h('div', { class: 'empty' }, h('span', { class: 'spin' }), ' Загрузка…')));
      api('config').then(function (c) { ST.cfg = c; renderJoin(); }).catch(function () { ST.cfg = { korp: [], dirs: ['Общестрой', 'ВИС'] }; renderJoin(); });
      return;
    }
    var cfg = ST.cfg, pick = { korp: [], dir: '' };
    if (/^1\.0/.test(cfg.api || '')) {                         // сервер ещё без подключения (Api 1.0)
      add(r, h('main', { class: 'login' }, brand('Подключение организации'),
        h('div', { class: 'msg ok', style: 'margin-top:32px' }, 'Приём заявок на подключение скоро откроется. Пока обратитесь к застройщику напрямую.'),
        h('a', { class: 'btn block', href: '#', style: 'margin-top:16px' }, 'Ко входу')));
      return;
    }
    var inp = function (id, attrs) { return h('input', Object.assign({ id: 'j_' + id, class: 'inp' }, attrs || {})); };
    var f = {
      org: inp('org', { placeholder: 'ООО «Название»', autocomplete: 'organization' }), inn: inp('inn', { inputmode: 'numeric', maxlength: '12' }),
      contract: inp('contract', { placeholder: '№ 12/26-ОВ от 01.03.2026' }),
      subject: h('textarea', { id: 'j_subject', class: 'inp', rows: '2', placeholder: 'Например: выполнение работ по монтажу систем отопления и вентиляции' }),
      name: inp('name', { autocomplete: 'name' }), pos: inp('pos', { autocomplete: 'organization-title' }),
      email: inp('email', { type: 'email', inputmode: 'email', autocomplete: 'email' }), phone: inp('phone', { type: 'tel', autocomplete: 'tel' }),
      works: h('textarea', { id: 'j_works', class: 'inp', rows: '2', placeholder: 'Например: монтаж систем ОВ, отделка МОП' })
    };
    // контактные лица 2 и 3 — по кнопке «+», чтобы форма не росла
    var extra = [];
    var extraBox = h('div', { class: 'contacts' });
    var bAdd = h('button', { type: 'button', class: 'btn ghost sm add-contact', onclick: function () { addContact(); } }, icon('plus'), 'Контактное лицо');
    function addContact() {
      if (extra.length >= 2) return;
      var n = extra.length + 2, c = {
        name: h('input', { class: 'inp', 'aria-label': 'ФИО, лицо ' + n, placeholder: 'ФИО *', autocomplete: 'off' }),
        pos: h('input', { class: 'inp', 'aria-label': 'Должность, лицо ' + n, placeholder: 'Должность', autocomplete: 'off' }),
        phone: h('input', { class: 'inp', type: 'tel', 'aria-label': 'Телефон, лицо ' + n, placeholder: 'Телефон', autocomplete: 'off' }),
        email: h('input', { class: 'inp', type: 'email', inputmode: 'email', 'aria-label': 'E-mail, лицо ' + n, placeholder: 'E-mail (тоже получит вход)', autocomplete: 'off' })
      };
      c.box = h('fieldset', { class: 'contact' },
        h('legend', null, 'Контактное лицо ' + n,
          h('button', { type: 'button', class: 'x', 'aria-label': 'Убрать контактное лицо ' + n, onclick: function () {
            extra.splice(extra.indexOf(c), 1); c.box.remove(); renum(); } }, '×')),
        c.name, h('div', { class: 'grid2' }, c.pos, c.phone), c.email);
      extra.push(c); extraBox.appendChild(c.box); renum(); c.name.focus();
    }
    function renum() {
      extra.forEach(function (c, i) { c.box.querySelector('legend').firstChild.textContent = 'Контактное лицо ' + (i + 2); });
      bAdd.style.display = extra.length >= 2 ? 'none' : '';
    }
    var trap = h('input', { name: 'website', tabindex: '-1', autocomplete: 'off', class: 'trap', 'aria-hidden': 'true' });
    var fld = function (k, label) { return h('div', { class: 'field' }, h('label', { for: 'j_' + k }, label), f[k]); };
    var korpBox = h('div', { class: 'tags' }), dirBox = h('div', { class: 'seg' });
    function paint() {
      korpBox.innerHTML = ''; dirBox.innerHTML = '';
      (cfg.korp || []).forEach(function (k) {
        var on = pick.korp.indexOf(k) >= 0;
        add(korpBox, h('button', { type: 'button', class: 'tag' + (on ? ' on' : ''), 'aria-pressed': String(on),
          onclick: function () { if (on) pick.korp.splice(pick.korp.indexOf(k), 1); else pick.korp.push(k); paint(); } }, k));
      });
      (cfg.dirs || []).concat(['Оба']).forEach(function (x) {
        add(dirBox, h('button', { type: 'button', class: pick.dir === x ? 'on' : '', 'aria-pressed': String(pick.dir === x), onclick: function () { pick.dir = x; paint(); } }, x));
      });
    }
    paint();
    var msgBox = h('div', { 'aria-live': 'polite' });
    var bSend = h('button', { class: 'btn block', type: 'submit' }, 'Отправить заявку');
    var form = h('form', { class: 'form', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      var data = {}; Object.keys(f).forEach(function (k) { data[k] = f[k].value; });
      data.contacts = extra.map(function (c) { return { name: c.name.value, pos: c.pos.value, phone: c.phone.value, email: c.email.value }; });
      data.korp = pick.korp.join(', '); data.dir = pick.dir === 'Оба' ? '' : pick.dir; data.website = trap.value;
      bSend.disabled = true; bSend.textContent = 'Отправляем…'; msgBox.innerHTML = '';
      api('joinRequest', data).then(function (x) {
        r.innerHTML = '';
        add(r, h('main', { class: 'login' }, h('div', { class: 'ring', 'aria-hidden': 'true' }), brand('Заявка отправлена'),
          h('h1', { class: 'h1', style: 'margin-top:32px' }, 'Заявка ', h('em', null, x.id || 'принята')),
          h('p', { class: 'lead' }, 'Застройщик рассмотрит заявку. Ответ придёт на ' + data.email.trim() + ' — со ссылкой на приложение, если доступ открыт.'),
          h('a', { class: 'btn block', href: '#', style: 'margin-top:20px' }, 'Ко входу')));
      }).catch(function (e) { bSend.disabled = false; bSend.textContent = 'Отправить заявку'; add(msgBox, h('div', { class: 'msg err' }, e.message)); });
    } },
      fld('org', 'Организация *'), fld('inn', 'ИНН'),
      h('div', { class: 'grid2' }, fld('contract', 'Номер договора *'), h('div')), fld('subject', 'Предмет договора *'),
      h('fieldset', { class: 'contact' }, h('legend', null, 'Контактное лицо 1'),
        fld('name', 'ФИО *'), h('div', { class: 'grid2' }, fld('pos', 'Должность'), fld('phone', 'Телефон *')), fld('email', 'E-mail для входа *')),
      extraBox, bAdd,
      fld('works', 'Виды работ на объекте *'),
      (cfg.korp || []).length ? h('div', { class: 'field' }, h('span', { class: 'lbl-t' }, 'Корпуса'), korpBox) : null,
      h('div', { class: 'field' }, h('span', { class: 'lbl-t' }, 'Направление'), dirBox),
      trap, msgBox, h('div', { class: 'fab' }, bSend));
    add(r, h('div', { class: 'wrap' },
      h('div', { class: 'top' }, h('a', { class: 'icon-btn', href: '#', 'aria-label': 'Ко входу', html: ICON.back }),
        h('div', { class: 'grow' }, h('div', { class: 't-sub' }, ST.obj.name), h('div', { class: 't-main' }, 'Подключение организации'))),
      h('p', { class: 'lead', style: 'margin:4px 0 8px' }, 'Заполните заявку — застройщик проверит организацию и откроет доступ по e-mail.'),
      form));
    f.org.focus();
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
