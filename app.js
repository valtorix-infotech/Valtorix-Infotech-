/* ==========================================================================
   VALTORIX INFOTECH — Shared JS (single file, all pages)
   --------------------------------------------------------------------------
   Modules (each guarded, runs only if the markup exists):
     0. Missing-image fallback
     1. Header: scroll state, mobile drawer, active link
     2. Scroll progress bar
     3. Scroll reveal
     4. FAQ accordion
     5. Project filters
     6. Marquee duplication
     7. Animated counters
     8. Contact form
     9. Start-a-project multi-step form
    10. Character counters
   ========================================================================== */
(function () {
  "use strict";

  const WHATSAPP = "917989369571";
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- 0. Missing-image fallback ---------- */
  document.addEventListener(
    "error",
    function (e) {
      const t = e.target;
      if (t && t.tagName === "IMG" && !t.classList.contains("broken")) {
        t.classList.add("broken");
        const p = t.parentElement;
        if (p) p.classList.add("has-broken");
      }
    },
    true
  );

  /* ---------- 1. Header ---------- */
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  const navbar = document.getElementById("navbar");
  const menuBtn = document.querySelector(".menu-btn");
  const navLinks = document.querySelector(".nav-links");

  function isOpen() {
    return !!(navLinks && navLinks.classList.contains("show"));
  }

  function closeMenu() {
    if (!isOpen()) return;
    navLinks.classList.remove("show");
    if (menuBtn) {
      menuBtn.setAttribute("aria-expanded", "false");
      const icon = menuBtn.querySelector("i");
      if (icon) {
        icon.classList.add("fa-bars");
        icon.classList.remove("fa-xmark");
      }
    }
    document.body.classList.remove("is-locked");
  }

  function openMenu() {
    if (!navLinks) return;
    navLinks.classList.add("show");
    if (menuBtn) {
      menuBtn.setAttribute("aria-expanded", "true");
      const icon = menuBtn.querySelector("i");
      if (icon) {
        icon.classList.remove("fa-bars");
        icon.classList.add("fa-xmark");
      }
    }
    document.body.classList.add("is-locked");
  }

  if (menuBtn && navLinks) {
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-controls", "primary-nav");
    navLinks.id = "primary-nav";
    menuBtn.addEventListener("click", function () {
      if (isOpen()) closeMenu();
      else openMenu();
    });
    navLinks.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
    document.addEventListener("click", function (e) {
      if (isOpen() && !navLinks.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 960) closeMenu();
    });
  }

  window.addEventListener(
    "scroll",
    function () {
      if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 12);
    },
    { passive: true }
  );

  /* Mark the current page in the nav (unless the markup already did it) */
  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (navLinks) {
    navLinks.querySelectorAll("a[href]").forEach(function (a) {
      const target = a.getAttribute("href").split("#")[0].toLowerCase();
      if (!target || target === "#") return;
      if (target === here || (here === "" && target === "index.html")) {
        a.classList.add("active");
        a.setAttribute("aria-current", "page");
      }
    });
  }

  /* ---------- 2. Scroll progress bar ---------- */
  let bar = document.createElement("div");
  bar.className = "scroll-progress";
  document.body.appendChild(bar);
  function paintProgress() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const pct = h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0;
    bar.style.width = pct + "%";
  }
  window.addEventListener("scroll", paintProgress, { passive: true });
  window.addEventListener("resize", paintProgress);
  paintProgress();

  /* ---------- 3. Scroll reveal ---------- */
  const revealEls = document.querySelectorAll(".reveal,.reveal-left,.reveal-right");
  if (revealEls.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("revealed");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -24px 0px" }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("revealed");
    });
  }
  /* Safety net: never leave content invisible */
  window.setTimeout(function () {
    document.querySelectorAll(".reveal,.reveal-left,.reveal-right").forEach(function (el) {
      el.classList.add("revealed");
    });
  }, 2500);

  /* Stagger sibling reveals inside a grid */
  document
    .querySelectorAll(".grid,.work-grid,.feature-row,.process-steps,.stats,.img-grid,.card-grid")
    .forEach(function (grid) {
      grid.querySelectorAll(".reveal").forEach(function (item, i) {
        item.style.transitionDelay = Math.min(i * 0.07, 0.4) + "s";
      });
    });

  /* ---------- 4. FAQ accordion ---------- */
  document.querySelectorAll(".faq-question").forEach(function (btn) {
    const item = btn.closest(".faq-item");
    if (item) btn.setAttribute("aria-expanded", item.classList.contains("active") ? "true" : "false");
    btn.addEventListener("click", function () {
      const row = this.closest(".faq-item");
      if (!row) return;
      const wasActive = row.classList.contains("active");
      document.querySelectorAll(".faq-item").forEach(function (i) {
        i.classList.remove("active");
        const q = i.querySelector(".faq-question");
        if (q) q.setAttribute("aria-expanded", "false");
      });
      if (!wasActive) {
        row.classList.add("active");
        this.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* ---------- 5. Project filters ---------- */
  const filterBtns = document.querySelectorAll(".filter-btn");
  const filterCards = document.querySelectorAll("[data-category]");
  if (filterBtns.length && filterCards.length) {
    filterBtns.forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      btn.addEventListener("click", function () {
        filterBtns.forEach(function (b) {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        const f = btn.getAttribute("data-filter");
        filterCards.forEach(function (card) {
          const show = f === "all" || card.getAttribute("data-category") === f;
          card.style.display = show ? "" : "none";
        });
      });
    });
  }

  /* ---------- 6. Marquee duplication ---------- */
  document.querySelectorAll(".marquee-track").forEach(function (track) {
    if (track.children.length && !track.dataset.doubled) {
      track.dataset.doubled = "1";
      /* the loop needs the content twice, but only the first copy is for
         people - a screen reader would otherwise announce every item twice */
      const clone = track.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.removeAttribute("data-doubled");
      track.parentNode.appendChild(clone);
    }
  });

  /* ---------- 6b. 3D pointer tilt on the work cards -----------------------
     Transform-only, so the tilt stays on the compositor and never triggers
     layout. Skipped on touch devices and when reduced motion is requested. */
  const tiltCards = document.querySelectorAll(".work-card");
  if (
    tiltCards.length &&
    window.matchMedia &&
    window.matchMedia("(pointer: fine)").matches &&
    !(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  ) {
    const MAX_TILT = 4.5; // degrees
    let pending = null;
    let ticking = false;

    function applyTilt() {
      ticking = false;
      if (!pending) return;
      const card = pending.card;
      const r = pending.rect;
      const px = (pending.x - (r.left + r.width / 2)) / (r.width / 2);
      const py = (pending.y - (r.top + r.height / 2)) / (r.height / 2);
      card.style.setProperty("--tilt-x", (-py * MAX_TILT).toFixed(2) + "deg");
      card.style.setProperty("--tilt-y", (px * MAX_TILT).toFixed(2) + "deg");
      pending = null;
    }

    tiltCards.forEach(function (card) {
      card.addEventListener(
        "pointermove",
        function (e) {
          pending = { card: card, x: e.clientX, y: e.clientY, rect: card.getBoundingClientRect() };
          if (!ticking) {
            ticking = true;
            requestAnimationFrame(applyTilt);
          }
        },
        { passive: true }
      );
      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
      });
    });
  }

  /* ---------- 7. Animated counters ---------- */
  let counters = document.querySelectorAll("[data-count-to]");
  if (counters.length && "IntersectionObserver" in window) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          cio.unobserve(en.target);
          const el = en.target;
          const to = parseFloat(el.getAttribute("data-count-to"));
          const suffix = el.getAttribute("data-count-suffix") || "";
          if (reduce || !isFinite(to)) {
            el.textContent = to + suffix;
            return;
          }
          const start = performance.now();
          const dur = 1100;
          (function tick(now) {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            const val = to * eased;
            el.textContent = (to % 1 === 0 ? Math.round(val) : val.toFixed(1)) + suffix;
            if (p < 1) requestAnimationFrame(tick);
          })(start);
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach(function (el) {
      cio.observe(el);
    });
  }

  /* ---------- form helpers ---------- */
  function digitsOnly(v) {
    return String(v || "").replace(/\D/g, "");
  }
  function fieldBox(el) {
    return el && el.closest ? el.closest(".field") : null;
  }
  function setErr(el, msg) {
    if (!el) return;
    el.style.borderColor = "#d9534f";
    el.setAttribute("aria-invalid", "true");
    const box = fieldBox(el);
    if (box) {
      box.classList.add("invalid");
      let m = box.querySelector(".field-err");
      if (!m) {
        m = document.createElement("div");
        m.className = "field-err";
        m.id = (el.id ? el.id : "field") + "-error";
        box.appendChild(m);
      }
      m.textContent = msg;
      /* point the control at its message so a screen reader announces it */
      let ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      if (ids.indexOf(m.id) === -1) {
        ids.push(m.id);
        el.setAttribute("aria-describedby", ids.join(" "));
      }
    }
  }
  function clearErr(el) {
    if (!el) return;
    el.style.borderColor = "";
    el.removeAttribute("aria-invalid");
    const box = fieldBox(el);
    if (box) {
      box.classList.remove("invalid");
      let m = box.querySelector(".field-err");
      if (m) {
        let ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
        ids = ids.filter(function (id) { return id !== m.id; });
        if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
        else el.removeAttribute("aria-describedby");
        m.remove();
      }
    }
  }
  function liveClear(el) {
    if (!el || el.dataset.live) return;
    el.dataset.live = "1";
    el.addEventListener("input", function () {
      clearErr(el);
    });
    el.addEventListener("change", function () {
      clearErr(el);
    });
  }
  function gotoEl(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(function () {
      try {
        el.focus({ preventScroll: true });
      } catch (_) {
        el.focus();
      }
    }, 450);
  }
  function toast(msg) {
    const old = document.querySelector(".v-toast");
    if (old) old.remove();
    const t = document.createElement("div");
    t.className = "v-toast";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () {
      t.classList.add("show");
    });
    window.setTimeout(function () {
      t.classList.remove("show");
      window.setTimeout(function () {
        t.remove();
      }, 350);
    }, 3200);
  }
  function checkField(id, test, msg) {
    const e = document.getElementById(id);
    if (!e) return { ok: true, el: null };
    liveClear(e);
    if (test(e.value.trim())) {
      clearErr(e);
      return { ok: true, el: null };
    }
    setErr(e, msg);
    return { ok: false, el: e };
  }
  function pickBox(g) {
    if (!g) return null;
    const box = g.closest ? g.closest(".field") : null;
    return box || g.parentElement;
  }
  function setPickErr(groupId, msg) {
    const g = document.getElementById(groupId);
    if (!g) return null;
    const box = pickBox(g);
    if (box) box.classList.add("invalid");
    g.classList.add("pick-missing");
    let m = box ? box.querySelector(".pick-error") : null;
    if (box && !m) {
      m = document.createElement("div");
      m.className = "pick-error";
      box.appendChild(m);
    }
    if (m) {
      m.textContent = msg || "Please make a selection to continue.";
      m.style.display = "";
    }
    return g;
  }
  function clearPickErr(groupId) {
    const g = document.getElementById(groupId);
    if (!g) return;
    const box = pickBox(g);
    if (box) {
      box.classList.remove("invalid");
      let m = box.querySelector(".pick-error");
      if (m) m.style.display = "none";
    }
    g.classList.remove("pick-missing");
  }
  function setTermsErr(msg) {
    const t = document.getElementById("terms");
    if (!t) return;
    t.style.outline = "2px solid #d9534f";
    const host = t.closest(".review-body") || t.parentElement;
    let m = host.querySelector(".pick-error");
    if (!m) {
      m = document.createElement("div");
      m.className = "pick-error";
      host.appendChild(m);
    }
    m.textContent = msg;
    m.style.display = "";
  }
  function clearTermsErr() {
    const t = document.getElementById("terms");
    if (!t) return;
    t.style.outline = "";
    const host = t.closest(".review-body") || t.parentElement;
    if (host) {
      let m = host.querySelector(".pick-error");
      if (m) m.style.display = "none";
    }
  }
  function waLink(msg) {
    return "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(msg);
  }
  function formError(hostSel, msg, wa) {
    const host = document.querySelector(hostSel);
    if (!host) {
      toast(msg);
      return;
    }
    const old = host.querySelector(".send-error");
    if (old) old.remove();
    const d = document.createElement("div");
    d.className = "send-error";
    d.setAttribute("role", "alert");
    const p = document.createElement("div");
    p.textContent = msg;
    d.appendChild(p);
    if (wa) {
      const a = document.createElement("a");
      a.href = wa;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "btn btn-primary btn-sm";
      a.textContent = "Send via WhatsApp instead";
      d.appendChild(a);
    }
    host.appendChild(d);
    d.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function sendToOwner(payload) {
    const fields = {};
    Object.keys(payload).forEach(function (k) {
      if (k.charAt(0) !== "_") fields[k] = payload[k];
    });
    let ctrl = null;
    let timer = null;
    if (window.AbortController) {
      ctrl = new AbortController();
      timer = window.setTimeout(function () {
        try {
          ctrl.abort();
        } catch (e) {}
      }, 30000);
    }
    const p = fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        subject: payload._subject || "Website enquiry — VALTORIX",
        replyTo: payload._replyto || payload.Email || "",
        fields: fields
      }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error("send failed");
      return r.json();
    });
    if (!timer) return p;
    return p.then(
      function (res) {
        clearTimeout(timer);
        return res;
      },
      function (err) {
        clearTimeout(timer);
        throw err;
      }
    );
  }
  function isSent(res) {
    return !!(res && (res.ok === true || res.success === true));
  }
  function sendFailed() {
    throw new Error("mail not accepted");
  }
  function sendFailMessage() {
    return "Could not send right now. Please try again in a minute, or tap below to send the same details on WhatsApp — we reply Mon–Sat 9AM–9PM.";
  }
  function honeypotTripped() {
    const hp = document.getElementById("website");
    return !!(hp && hp.value.trim().length > 0);
  }

  /* ---------- 8. Contact form ---------- */
  const subjects = document.querySelectorAll(".subject");
  subjects.forEach(function (s) {
    s.addEventListener("click", function () {
      subjects.forEach(function (x) {
        x.classList.remove("selected");
      });
      s.classList.add("selected");
    });
  });

  const contactForm = document.getElementById("contactFormElement");
  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const checks = [
        checkField("cname", function (v) { return v.length >= 3; }, "Please enter your full name (min 3 letters)."),
        checkField("cemail", function (v) { return EMAIL_RE.test(v); }, "Please enter a valid email address (e.g. you@company.com)."),
        checkField("cphone", function (v) { return digitsOnly(v).length >= 10; }, "Please enter a valid 10-digit mobile number."),
        checkField("cmessage", function (v) { return v.length >= 10; }, "Please write your message (min 10 characters).")
      ];
      let firstBad = null;
      let allOk = true;
      checks.forEach(function (c) {
        if (!c.ok) {
          allOk = false;
          if (!firstBad) firstBad = c.el;
        }
      });
      if (!allOk) {
        toast("Please fill the highlighted fields correctly.");
        gotoEl(firstBad);
        return;
      }
      if (honeypotTripped()) {
        toast("Submission rejected.");
        return;
      }

      const btn = contactForm.querySelector('[type="submit"]');
      const orig = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending…";
      }
      const gv = function (id) {
        const el = document.getElementById(id);
        return (el && el.value.trim()) || "—";
      };
      const subj = document.querySelector(".subject.selected");
      const payload = {
        Name: gv("cname"),
        Company: gv("ccompany"),
        Email: gv("cemail"),
        Phone: gv("cphone"),
        "Interested In": subj ? subj.getAttribute("data-subject") : "—",
        Message: gv("cmessage"),
        "Preferred Contact": gv("cmethod"),
        "Best Time": gv("ctime"),
        _subject: "New Contact Message — VALTORIX Website",
        _replyto: gv("cemail")
      };
      const waTextC =
        "New enquiry — VALTORIX website\nName: " +
        gv("cname") +
        "\nPhone: " +
        gv("cphone") +
        "\nEmail: " +
        gv("cemail") +
        "\nMessage: " +
        gv("cmessage");
      try {
        sendToOwner(payload)
          .then(function (res) {
            if (!isSent(res)) sendFailed();
            const card = document.getElementById("contactForm");
            const success = document.getElementById("successMessage");
            if (card) card.classList.add("is-hidden");
            if (success) {
              success.classList.remove("is-hidden");
              success.classList.add("is-shown");
              success.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            window.setTimeout(function () {
              if (success) {
                success.classList.remove("is-shown");
                success.classList.add("is-hidden");
              }
              if (card) {
                card.classList.remove("is-hidden");
                card.scrollIntoView({ behavior: "smooth", block: "center" });
              }
              contactForm.reset();
              subjects.forEach(function (x) {
                x.classList.remove("selected");
              });
              contactForm.querySelectorAll(".field-err").forEach(function (m) {
                m.remove();
              });
              contactForm.querySelectorAll(".field.invalid").forEach(function (b) {
                b.classList.remove("invalid");
              });
              ["cname", "cemail", "cphone", "cmessage"].forEach(function (id) {
                const x = document.getElementById(id);
                if (x) x.style.borderColor = "";
              });
              if (btn) {
                btn.disabled = false;
                btn.textContent = orig;
              }
            }, 4000);
          })
          .catch(function () {
            if (btn) {
              btn.disabled = false;
              btn.textContent = orig;
            }
            formError("#contactForm", sendFailMessage(), waLink(waTextC));
          });
      } catch (err) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = orig;
        }
        formError("#contactForm", sendFailMessage(), waLink(waTextC));
      }
    });
  }

  /* ---------- 9. Start-a-project multi-step ---------- */
  const projectForm = document.getElementById("projectForm");
  if (projectForm) {
    const state = { step: 1, type: "", timeline: "", budget: "", goals: [] };
    const steps = document.querySelectorAll(".form-step");
    const backBtn = document.getElementById("backBtn");
    const nextBtn = document.getElementById("nextBtn");

    function paint() {
      document.querySelectorAll(".progress-step").forEach(function (el, i) {
        const n = i + 1;
        el.classList.toggle("active", n === state.step);
        el.classList.toggle("done", n < state.step);
      });
      if (backBtn) {
        backBtn.classList.toggle("is-shown", state.step > 1);
        backBtn.classList.toggle("is-hidden", state.step <= 1);
      }
      if (nextBtn) {
        nextBtn.textContent = state.step === 4 ? "Submit Project Request →" : "Next Step →";
      }
    }

    function show(n) {
      state.step = n;
      steps.forEach(function (el) {
        const current = +el.getAttribute("data-step") === n;
        el.classList.toggle("is-shown", current);
        el.classList.toggle("is-hidden", !current);
      });
      paint();
      const area = document.getElementById("formArea");
      if (area) area.scrollIntoView({ behavior: "smooth", block: "start" });
      if (n === 4) fillReview();
    }

    function val(id) {
      const e = document.getElementById(id);
      return (e && e.value.trim()) || "—";
    }

    function fillReview() {
      const set = function (id, v) {
        const e = document.getElementById(id);
        if (e) e.textContent = v;
      };
      set("rType", state.type || "—");
      set("rName", val("name"));
      set("rTitle", val("projectTitle"));
      set("rEmail", val("email"));
      set("rCompany", val("company"));
      set("rPhone", val("phone"));
      set("rRequirements", val("requirements"));
      set("rFeatures", val("features"));
      set("rReferences", val("references"));
      set("rNotes", val("notes"));
      set("rTimeline", state.timeline || "—");
      set("rBudget", state.budget || "—");
      set("rGoals", state.goals.join(", ") || "—");
      set("rSource", val("source"));
      set("rCommunication", val("communication"));
      set("rAdditional", val("additional"));
    }

    function validStep() {
      if (state.step === 1) {
        let firstBad = null;
        let ok = true;
        if (!state.type) {
          setPickErr("projectType", "Please choose a project type to continue.");
          ok = false;
          firstBad = firstBad || document.getElementById("projectType");
        } else {
          clearPickErr("projectType");
        }
        const checks = [
          checkField("projectTitle", function (v) { return v.length >= 3; }, "Please give your project a title."),
          checkField("name", function (v) { return v.length >= 3; }, "Please enter your full name (min 3 letters)."),
          checkField("email", function (v) { return EMAIL_RE.test(v); }, "Please enter a valid email address."),
          checkField("phone", function (v) { return digitsOnly(v).length >= 10; }, "Please enter a valid 10-digit mobile number."),
          checkField("overview", function (v) { return v.length >= 10; }, "Please describe your project briefly (min 10 characters).")
        ];
        checks.forEach(function (c) {
          if (!c.ok) {
            ok = false;
            if (!firstBad) firstBad = c.el;
          }
        });
        if (!ok) {
          toast("Please complete the highlighted fields.");
          gotoEl(firstBad);
        }
        return ok;
      }
      if (state.step === 2) {
        const c2 = checkField("requirements", function (v) { return v.length >= 10; }, "Please describe your requirements in detail (min 10 characters).");
        if (!c2.ok) {
          toast("Please complete the highlighted field.");
          gotoEl(c2.el);
          return false;
        }
        return true;
      }
      if (state.step === 3) {
        let bad3 = null;
        if (!state.timeline) {
          setPickErr("timelineChoices", "Please pick your project timeline.");
          bad3 = bad3 || document.getElementById("timelineChoices");
        } else {
          clearPickErr("timelineChoices");
        }
        if (!state.budget) {
          setPickErr("budgetChoices", "Please pick your estimated budget.");
          bad3 = bad3 || document.getElementById("budgetChoices");
        } else {
          clearPickErr("budgetChoices");
        }
        if (bad3) {
          toast("Please pick a timeline and budget to continue.");
          gotoEl(bad3);
          return false;
        }
        return true;
      }
      if (state.step === 4) {
        const t = document.getElementById("terms");
        if (t && !t.checked) {
          setTermsErr("Please tick this box to agree to the Terms & Privacy Policy.");
          toast("Please agree to the Terms & Privacy Policy.");
          gotoEl(t);
          return false;
        }
        clearTermsErr();
        return true;
      }
      return true;
    }

    document.querySelectorAll("#projectType .option").forEach(function (o) {
      o.addEventListener("click", function () {
        clearPickErr("projectType");
        document.querySelectorAll("#projectType .option").forEach(function (x) {
          x.classList.remove("selected");
        });
        o.classList.add("selected");
        state.type = o.getAttribute("data-value");
      });
    });

    function choiceGroup(groupId, prop, multi) {
      const sel = multi ? "#" + groupId + " .option" : "#" + groupId + " .choice";
      document.querySelectorAll(sel).forEach(function (o) {
        o.addEventListener("click", function () {
          clearPickErr(groupId);
          if (multi) {
            o.classList.toggle("selected");
            state[prop] = Array.prototype.map.call(
              document.querySelectorAll("#" + groupId + " .option.selected"),
              function (x) {
                return x.getAttribute("data-value");
              }
            );
          } else {
            document.querySelectorAll("#" + groupId + " .choice").forEach(function (x) {
              x.classList.remove("selected");
            });
            o.classList.add("selected");
            state[prop] = o.getAttribute("data-value");
          }
        });
      });
    }
    choiceGroup("timelineChoices", "timeline", false);
    choiceGroup("budgetChoices", "budget", false);
    choiceGroup("goalChoices", "goals", true);

    if (nextBtn) {
      /* The button is a real submit button, so the form is handled on submit
         rather than on click. That way pressing Enter in a text field moves
         the wizard on, exactly as clicking the button does. */
      projectForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!validStep()) return;
        if (state.step < 4) {
          show(state.step + 1);
          return;
        }
        if (honeypotTripped()) {
          toast("Submission rejected.");
          return;
        }

        const d = new Date();
        const id =
          "VTX-" +
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          String(d.getDate()).padStart(2, "0") +
          "-" +
          Math.floor(1000 + Math.random() * 9000);
        const ref = document.getElementById("referenceId");
        if (ref) ref.textContent = id;
        const origNext = nextBtn.textContent;
        nextBtn.disabled = true;
        nextBtn.textContent = "Sending…";
        const payload = {
          "Reference ID": id,
          "Project Type": state.type || "—",
          "Project Title": val("projectTitle"),
          "Your Name": val("name"),
          Company: val("company"),
          Email: val("email"),
          Phone: val("phone"),
          "Project Overview": val("overview"),
          "Goals (Step 1)": val("goals"),
          "Detailed Requirements": val("requirements"),
          "Key Features": val("features"),
          References: val("references"),
          Notes: val("notes"),
          Timeline: state.timeline || "—",
          Budget: state.budget || "—",
          "Project Goals": state.goals.join(", ") || "—",
          "Heard Via": val("source"),
          "Preferred Communication": val("communication"),
          "Additional Info": val("additional"),
          _subject: "New Project Request [" + id + "] — VALTORIX Website",
          _replyto: val("email")
        };
        const waTextP =
          "New project request — VALTORIX website\nType: " +
          (state.type || "-") +
          "\nTitle: " +
          val("projectTitle") +
          "\nName: " +
          val("name") +
          "\nPhone: " +
          val("phone") +
          "\nEmail: " +
          val("email") +
          "\nOverview: " +
          val("overview");
        try {
          sendToOwner(payload)
            .then(function (res) {
              if (!isSent(res)) sendFailed();
              const flow = document.getElementById("formFlow");
              const done = document.getElementById("successPage");
              if (flow) flow.classList.add("is-hidden");
              if (done) {
                done.classList.remove("is-hidden");
                done.classList.add("is-shown");
              }
              window.scrollTo({ top: 0, behavior: "smooth" });
            })
            .catch(function () {
              nextBtn.disabled = false;
              nextBtn.textContent = origNext;
              formError("#stepPanel", sendFailMessage(), waLink(waTextP));
            });
        } catch (err) {
          nextBtn.disabled = false;
          nextBtn.textContent = origNext;
          formError("#stepPanel", sendFailMessage(), waLink(waTextP));
        }
      });
    }

    if (backBtn) {
      backBtn.addEventListener("click", function () {
        show(state.step - 1);
      });
    }
    const termsBox = document.getElementById("terms");
    if (termsBox) {
      termsBox.addEventListener("change", function () {
        clearTermsErr();
      });
    }
    document.querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () {
        show(+b.getAttribute("data-edit"));
      });
    });
    paint();
  }

  /* ---------- 9b. Deferred map ------------------------------------------
     The Google Maps embed is ~200 KB of third-party JavaScript. It is only
     loaded once the map is about to be seen, and a styled placeholder holds
     the space until it arrives. */
  const lazyMaps = document.querySelectorAll("iframe[data-map-src]");
  if (lazyMaps.length) {
    function loadMap(frame) {
      if (frame.dataset.mapLoaded) return;
      frame.dataset.mapLoaded = "1";
      frame.addEventListener("load", function () {
        const card = frame.closest(".map-card");
        if (card) card.classList.add("is-loaded");
      });
      frame.src = frame.getAttribute("data-map-src");
    }
    function wireMap(frame) {
      const btn = frame.parentNode && frame.parentNode.querySelector("[data-map-load]");
      if (btn) {
        btn.addEventListener("click", function () {
          loadMap(frame);
        });
      }
    }
    lazyMaps.forEach(wireMap);
    if (window.IntersectionObserver) {
      const mapObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              loadMap(e.target);
              mapObserver.unobserve(e.target);
            }
          });
        },
        { rootMargin: "400px 0px" }
      );
      lazyMaps.forEach(function (f) { mapObserver.observe(f); });
    } else {
      lazyMaps.forEach(loadMap);
    }
  }

  /* ---------- 10. Character counters ---------- */
  document.querySelectorAll("textarea[id]").forEach(function (ta) {
    const out = document.querySelector('[data-count="' + ta.id + '"]');
    if (!out) return;
    const update = function () {
      out.textContent = ta.value.length;
    };
    ta.addEventListener("input", update);
    update();
  });
})();
