/* ============================================================
   VALTORIX INFOTECH — Shared JS (single file, all pages)
   Modules (each guarded, runs only if markup exists):
     1. Navbar (menu toggle, scroll shadow)
     2. Scroll reveal
     3. FAQ accordion  (.faq-item > .faq-question)
     4. Project filters (.filter-btn + [data-category])
     5. Marquee duplication (seamless loops)
     6. Contact form (#contactFormElement)
     7. Start-a-project multistep (#projectForm)
     8. Char counters ([data-count])
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 0. Missing-image fallback (broken src -> placeholder) ---------- */
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && !t.classList.contains('broken')) {
      t.classList.add('broken');
      var p = t.parentElement;
      if (p) p.classList.add('has-broken');
    }
  }, true);

  /* ---------- 1. Navbar ---------- */
  if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }
  var menuBtn = document.querySelector('.menu-btn');
  var navLinks = document.querySelector('.nav-links');
  function closeMenu() {
    if (!navLinks || !navLinks.classList.contains('show')) return;
    navLinks.classList.remove('show');
    var icon = menuBtn && menuBtn.querySelector('i');
    if (icon) { icon.classList.add('fa-bars'); icon.classList.remove('fa-xmark'); }
  }
  if (menuBtn && navLinks) {
    menuBtn.addEventListener('click', function () {
      navLinks.classList.toggle('show');
      var icon = menuBtn.querySelector('i');
      if (icon) { icon.classList.toggle('fa-bars'); icon.classList.toggle('fa-xmark'); }
    });
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
    document.addEventListener('click', function (e) {
      if (navLinks.classList.contains('show') && !navLinks.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
    });
  }
  window.addEventListener('scroll', function () {
    var navbar = document.getElementById('navbar');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 20);
    closeMenu();
  });

  /* ---------- 2. Scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal,.reveal-left,.reveal-right');
  if (revealEls.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('revealed'); io.unobserve(en.target); }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -20px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('revealed'); });
  }
  /* Safety net: never leave content invisible (e.g. observer blocked) */
  setTimeout(function () {
    document.querySelectorAll('.reveal,.reveal-left,.reveal-right').forEach(function (el) { el.classList.add('revealed'); });
  }, 2500);

  /* ---------- 3. FAQ accordion ---------- */
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = this.closest('.faq-item');
      if (!item) return;
      var wasActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(function (i) { i.classList.remove('active'); });
      if (!wasActive) item.classList.add('active');
    });
  });

  /* ---------- 4. Project filters ---------- */
  var filterBtns = document.querySelectorAll('.filter-btn');
  var filterCards = document.querySelectorAll('[data-category]');
  if (filterBtns.length && filterCards.length) {
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var f = btn.getAttribute('data-filter');
        filterCards.forEach(function (card) {
          var show = f === 'all' || card.getAttribute('data-category') === f;
          card.style.display = show ? '' : 'none';
        });
      });
    });
  }

  /* ---------- 5. Marquee duplication ---------- */
  document.querySelectorAll('.marquee-track').forEach(function (track) {
    if (track.children.length && !track.dataset.doubled) {
      track.dataset.doubled = '1';
      track.innerHTML += track.innerHTML;
    }
  });

  /* ---------- Form email helper (Vercel /api/send + WhatsApp fallback) ---------- */
  var WHATSAPP = '917989369571';
  /* ---------- Inline validation + toast (no browser alert dialogs) ---------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function digitsOnly(v) { return String(v || '').replace(/\D/g, ''); }
  function fieldBox(el) { return (el && el.closest) ? el.closest('.field') : null; }
  function setErr(el, msg) {
    if (!el) return;
    el.style.borderColor = '#e33';
    var box = fieldBox(el);
    if (box) {
      box.classList.add('invalid');
      var m = box.querySelector('.field-err');
      if (!m) { m = document.createElement('div'); m.className = 'field-err'; box.appendChild(m); }
      m.textContent = msg;
    }
  }
  function clearErr(el) {
    if (!el) return;
    el.style.borderColor = '';
    var box = fieldBox(el);
    if (box) {
      box.classList.remove('invalid');
      var m = box.querySelector('.field-err');
      if (m) m.remove();
    }
  }
  function liveClear(el) {
    if (!el || el.dataset.live) return;
    el.dataset.live = '1';
    el.addEventListener('input', function () { clearErr(el); });
    el.addEventListener('change', function () { clearErr(el); });
  }
  function gotoEl(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); } }, 450);
  }
  function toast(msg) {
    var old = document.querySelector('.v-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'v-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 350); }, 3200);
  }
  function checkField(id, test, msg) {
    var e = document.getElementById(id);
    if (!e) return { ok: true, el: null };
    liveClear(e);
    if (test(e.value.trim())) { clearErr(e); return { ok: true, el: null }; }
    setErr(e, msg);
    return { ok: false, el: e };
  }
  function pickBox(g) {
    if (!g) return null;
    var box = g.closest ? g.closest('.field') : null;
    return box || g.parentElement;
  }
  function setPickErr(groupId, msg) {
    var g = document.getElementById(groupId);
    if (!g) return null;
    var box = pickBox(g);
    if (box) box.classList.add('invalid');
    g.classList.add('pick-missing');
    var m = box ? box.querySelector('.pick-error') : null;
    if (box && !m) { m = document.createElement('div'); m.className = 'pick-error'; box.appendChild(m); }
    if (m) { m.textContent = msg || 'Please make a selection to continue.'; m.style.display = ''; }
    return g;
  }
  function clearPickErr(groupId) {
    var g = document.getElementById(groupId);
    if (!g) return;
    var box = pickBox(g);
    if (box) { box.classList.remove('invalid'); var m = box.querySelector('.pick-error'); if (m) m.style.display = 'none'; }
    g.classList.remove('pick-missing');
  }
  function setTermsErr(msg) {
    var t = document.getElementById('terms');
    if (!t) return;
    t.style.outline = '2px solid #e33';
    var host = t.closest('.review-body') || t.parentElement;
    var m = host.querySelector('.pick-error');
    if (!m) { m = document.createElement('div'); m.className = 'pick-error'; host.appendChild(m); }
    m.textContent = msg; m.style.display = '';
  }
  function clearTermsErr() {
    var t = document.getElementById('terms');
    if (t) t.style.outline = '';
    var host = t ? (t.closest('.review-body') || t.parentElement) : null;
    if (host) { var m = host.querySelector('.pick-error'); if (m) m.style.display = 'none'; }
  }
  function waLink(msg) {
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg);
  }
  function formError(hostSel, msg, wa) {
    var host = document.querySelector(hostSel);
    if (!host) { toast(msg); return; }
    var old = host.querySelector('.send-error');
    if (old) old.remove();
    var d = document.createElement('div');
    d.className = 'send-error';
    d.setAttribute('style', 'background:#fdeaea;border:1px solid #f3c1c1;color:#b3261e;font-size:12px;border-radius:10px;padding:12px 14px;margin-top:14px;text-align:center');
    var p = document.createElement('div');
    p.textContent = msg;
    d.appendChild(p);
    if (wa) {
      var a = document.createElement('a');
      a.href = wa; a.target = '_blank'; a.rel = 'noopener';
      a.className = 'btn btn-primary btn-sm';
      a.style.marginTop = '10px';
      a.textContent = 'Send via WhatsApp instead';
      d.appendChild(a);
    }
    host.appendChild(d);
    d.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function sendToOwner(payload) {
    var fields = {};
    Object.keys(payload).forEach(function (k) {
      if (k.charAt(0) !== '_') fields[k] = payload[k];
    });
    var ctrl = null, timer = null;
    if (window.AbortController) {
      ctrl = new AbortController();
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 30000);
    }
    var p = fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        subject: payload._subject || 'Website enquiry — VALTORIX',
        replyTo: payload._replyto || payload.Email || '',
        fields: fields
      }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error('send failed');
      return r.json();
    });
    if (!timer) return p;
    return p.then(function (res) { clearTimeout(timer); return res; },
      function (err) { clearTimeout(timer); throw err; });
  }
  function isSent(res) {
    return !!(res && (res.ok === true || res.success === true));
  }
  function sendFailed() {
    throw new Error('mail not accepted');
  }
  function sendFailMessage() {
    return 'Could not send right now. Please try again in a minute, or tap below to send the same details on WhatsApp — we reply Mon-Sat 9AM-9PM.';
  }

  /* ---------- 6. Contact form ---------- */
  var subjects = document.querySelectorAll('.subject');
  subjects.forEach(function (s) {
    s.addEventListener('click', function () {
      subjects.forEach(function (x) { x.classList.remove('selected'); });
      s.classList.add('selected');
    });
  });
  var contactForm = document.getElementById('contactFormElement');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var checks = [
        checkField('cname', function (v) { return v.length >= 3; }, 'Please enter your full name (min 3 letters).'),
        checkField('cemail', function (v) { return EMAIL_RE.test(v); }, 'Please enter a valid email address (e.g. you@company.com).'),
        checkField('cphone', function (v) { return digitsOnly(v).length >= 10; }, 'Please enter a valid 10-digit mobile number.'),
        checkField('cmessage', function (v) { return v.length >= 10; }, 'Please write your message (min 10 characters).')
      ];
      var firstBad = null, allOk = true;
      checks.forEach(function (c) { if (!c.ok) { allOk = false; if (!firstBad) firstBad = c.el; } });
      if (!allOk) { toast('Please fill the highlighted fields correctly.'); gotoEl(firstBad); return; }
      var btn = contactForm.querySelector('[type="submit"]');
      var orig = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = 'Sending…'; }
      var gv = function (id) { var el = document.getElementById(id); return (el && el.value.trim()) || '—'; };
      var subj = document.querySelector('.subject.selected');
      var payload = {
        'Name': gv('cname'),
        'Company': gv('ccompany'),
        'Email': gv('cemail'),
        'Phone': gv('cphone'),
        'Interested In': subj ? subj.getAttribute('data-subject') : '—',
        'Message': gv('cmessage'),
        'Preferred Contact': gv('cmethod'),
        'Best Time': gv('ctime'),
        '_subject': 'New Contact Message — VALTORIX Website',
        '_template': 'table',
        '_captcha': 'false',
        '_replyto': gv('cemail'),
        '_autoresponse': AUTOREPLY
      };
      sendToOwner(payload).then(function (res) {
        if (!isSent(res)) sendFailed();
        var card = document.getElementById('contactForm');
        var success = document.getElementById('successMessage');
        if (card) card.style.display = 'none';
        if (success) { success.style.display = 'block'; success.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        /* back to normal form after 3 sec */
        setTimeout(function () {
          if (success) success.style.display = 'none';
          if (card) {
            card.style.display = '';
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          contactForm.reset();
          subjects.forEach(function (x) { x.classList.remove('selected'); });
          contactForm.querySelectorAll('.field-err').forEach(function (m) { m.remove(); });
          contactForm.querySelectorAll('.field.invalid').forEach(function (b) { b.classList.remove('invalid'); });
          ['cname', 'cemail', 'cphone', 'cmessage'].forEach(function (id) {
            var x = document.getElementById(id);
            if (x) x.style.borderColor = '';
          });
          if (btn) { btn.disabled = false; btn.innerHTML = orig; }
        }, 3000);
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
        var waText = 'New enquiry — VALTORIX website\nName: ' + gv('cname') + '\nPhone: ' + gv('cphone') + '\nEmail: ' + gv('cemail') + '\nMessage: ' + gv('cmessage');
        formError('#contactForm', sendFailMessage(), waLink(waText));
      });
    });
  }

  /* ---------- 7. Start-a-project multistep ---------- */
  var projectForm = document.getElementById('projectForm');
  if (projectForm) {
    var state = { step: 1, type: '', timeline: '', budget: '', goals: [] };
    var steps = document.querySelectorAll('.form-step');
    var backBtn = document.getElementById('backBtn');
    var nextBtn = document.getElementById('nextBtn');
    function paint() {
      document.querySelectorAll('.progress-step').forEach(function (el, i) {
        var n = i + 1;
        el.classList.toggle('active', n === state.step);
        el.classList.toggle('done', n < state.step);
      });
      if (backBtn) backBtn.style.display = state.step > 1 ? 'inline-flex' : 'none';
      if (nextBtn) nextBtn.innerHTML = state.step === 4 ? 'Submit Project Request &nbsp;→' : 'Next Step &nbsp;→';
    }
    function show(n) {
      state.step = n;
      steps.forEach(function (el) {
        el.style.display = (+el.getAttribute('data-step') === n) ? 'block' : 'none';
      });
      paint();
      var area = document.getElementById('formArea');
      if (area) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (n === 4) fillReview();
    }
    function val(id) {
      var e = document.getElementById(id);
      return (e && e.value.trim()) || '—';
    }
    function fillReview() {
      var set = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
      set('rType', state.type || '—'); set('rName', val('name')); set('rTitle', val('projectTitle'));
      set('rEmail', val('email')); set('rCompany', val('company')); set('rPhone', val('phone'));
      set('rRequirements', val('requirements')); set('rFeatures', val('features'));
      set('rReferences', val('references')); set('rNotes', val('notes'));
      set('rTimeline', state.timeline || '—'); set('rBudget', state.budget || '—');
      set('rGoals', state.goals.join(', ') || '—');
      set('rSource', val('source')); set('rCommunication', val('communication')); set('rAdditional', val('additional'));
    }
    function validStep() {
      if (state.step === 1) {
        var firstBad = null, ok = true;
        if (!state.type) {
          setPickErr('projectType', 'Please choose a project type to continue.');
          ok = false; firstBad = firstBad || document.getElementById('projectType');
        } else { clearPickErr('projectType'); }
        var checks = [
          checkField('projectTitle', function (v) { return v.length >= 3; }, 'Please give your project a title.'),
          checkField('name', function (v) { return v.length >= 3; }, 'Please enter your full name (min 3 letters).'),
          checkField('email', function (v) { return EMAIL_RE.test(v); }, 'Please enter a valid email address.'),
          checkField('phone', function (v) { return digitsOnly(v).length >= 10; }, 'Please enter a valid 10-digit mobile number.'),
          checkField('overview', function (v) { return v.length >= 10; }, 'Please describe your project briefly (min 10 characters).')
        ];
        checks.forEach(function (c) { if (!c.ok) { ok = false; if (!firstBad) firstBad = c.el; } });
        if (!ok) { toast('Please complete the highlighted fields.'); gotoEl(firstBad); }
        return ok;
      }
      if (state.step === 2) {
        var c2 = checkField('requirements', function (v) { return v.length >= 10; }, 'Please describe your requirements in detail (min 10 characters).');
        if (!c2.ok) { toast('Please complete the highlighted field.'); gotoEl(c2.el); return false; }
        return true;
      }
      if (state.step === 3) {
        var bad3 = null;
        if (!state.timeline) { setPickErr('timelineChoices', 'Please pick your project timeline.'); bad3 = bad3 || document.getElementById('timelineChoices'); }
        else clearPickErr('timelineChoices');
        if (!state.budget) { setPickErr('budgetChoices', 'Please pick your estimated budget.'); bad3 = bad3 || document.getElementById('budgetChoices'); }
        else clearPickErr('budgetChoices');
        if (bad3) { toast('Please pick a timeline and budget to continue.'); gotoEl(bad3); return false; }
        return true;
      }
      if (state.step === 4) {
        var t = document.getElementById('terms');
        if (t && !t.checked) {
          setTermsErr('Please tick this box to agree to the Terms & Privacy Policy.');
          toast('Please agree to the Terms & Privacy Policy.');
          gotoEl(t);
          return false;
        }
        clearTermsErr();
        return true;
      }
      return true;
    }
    document.querySelectorAll('#projectType .option').forEach(function (o) {
      o.addEventListener('click', function () {
        clearPickErr('projectType');
        document.querySelectorAll('#projectType .option').forEach(function (x) { x.classList.remove('selected'); });
        o.classList.add('selected');
        state.type = o.getAttribute('data-value');
      });
    });
    function choiceGroup(groupId, prop, multi) {
      var sel = multi ? '#' + groupId + ' .option' : '#' + groupId + ' .choice';
      document.querySelectorAll(sel).forEach(function (o) {
        o.addEventListener('click', function () {
          clearPickErr(groupId);
          if (multi) {
            o.classList.toggle('selected');
            state[prop] = Array.prototype.map.call(
              document.querySelectorAll('#' + groupId + ' .option.selected'),
              function (x) { return x.getAttribute('data-value'); }
            );
          } else {
            document.querySelectorAll('#' + groupId + ' .choice').forEach(function (x) { x.classList.remove('selected'); });
            o.classList.add('selected');
            state[prop] = o.getAttribute('data-value');
          }
        });
      });
    }
    choiceGroup('timelineChoices', 'timeline', false);
    choiceGroup('budgetChoices', 'budget', false);
    choiceGroup('goalChoices', 'goals', true);
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (!validStep()) return;
      if (state.step < 4) { show(state.step + 1); return; }
      var d = new Date();
      var id = 'VTX-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000);
      var ref = document.getElementById('referenceId');
      if (ref) ref.textContent = id;
      var origNext = nextBtn.innerHTML;
      nextBtn.disabled = true;
      nextBtn.innerHTML = 'Sending…';
      var payload = {
        'Reference ID': id,
        'Project Type': state.type || '—',
        'Project Title': val('projectTitle'),
        'Your Name': val('name'),
        'Company': val('company'),
        'Email': val('email'),
        'Phone': val('phone'),
        'Project Overview': val('overview'),
        'Goals (Step 1)': val('goals'),
        'Detailed Requirements': val('requirements'),
        'Key Features': val('features'),
        'References': val('references'),
        'Notes': val('notes'),
        'Timeline': state.timeline || '—',
        'Budget': state.budget || '—',
        'Project Goals': state.goals.join(', ') || '—',
        'Heard Via': val('source'),
        'Preferred Communication': val('communication'),
        'Additional Info': val('additional'),
        '_subject': 'New Project Request [' + id + '] — VALTORIX Website',
        '_template': 'table',
        '_captcha': 'false',
        '_replyto': val('email'),
        '_autoresponse': AUTOREPLY
      };
      sendToOwner(payload).then(function (res) {
        if (!isSent(res)) sendFailed();
        var flow = document.getElementById('formFlow');
        var done = document.getElementById('successPage');
        if (flow) flow.style.display = 'none';
        if (done) done.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }).catch(function () {
        nextBtn.disabled = false;
        nextBtn.innerHTML = origNext;
        var waText = 'New project request — VALTORIX website\nType: ' + (state.type || '-') + '\nTitle: ' + val('projectTitle') + '\nName: ' + val('name') + '\nPhone: ' + val('phone') + '\nEmail: ' + val('email') + '\nOverview: ' + val('overview');
        formError('#stepPanel', sendFailMessage(), waLink(waText));
      });
    });
    if (backBtn) backBtn.addEventListener('click', function () { show(state.step - 1); });
    var termsBox = document.getElementById('terms');
    if (termsBox) termsBox.addEventListener('change', function () { clearTermsErr(); });
    document.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { show(+b.getAttribute('data-edit')); });
    });
    paint();
  }

  /* ---------- 8. Char counters ---------- */
  document.querySelectorAll('textarea[id]').forEach(function (ta) {
    ta.addEventListener('input', function () {
      var c = document.querySelector('[data-count="' + ta.id + '"]');
      if (c) c.textContent = ta.value.length;
    });
  });
})();
