/**
 * Wires navigation, glossary, quiz UI, and mounts all interactives after globals load.
 */
(function () {
  'use strict';

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  // ─── Section stepper ──────────────────────────────────────────────────────

  function mountStepper() {
    var sections = qsa('main section[id]');
    var nav = qs('[data-role="section-stepper"]');
    if (!nav || sections.length === 0) return;

    sections.forEach(function (sec, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(idx + 1);
      btn.setAttribute('aria-label', 'Go to section ' + String(idx + 1));
      btn.addEventListener('click', function () {
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setCurrent(idx);
      });
      nav.appendChild(btn);
    });

    var buttons = qsa('button', nav);

    function setCurrent(i) {
      buttons.forEach(function (b, j) {
        if (j === i) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            var id = en.target.id;
            var ix = sections.findIndex(function (s) { return s.id === id; });
            if (ix >= 0) setCurrent(ix);
          });
        },
        { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
      );
      sections.forEach(function (s) { io.observe(s); });
    } else {
      setCurrent(0);
    }
  }

  // ─── Quiz ─────────────────────────────────────────────────────────────────

  function mountQuiz() {
    var quizRoot = qs('[data-role="quiz"]');
    if (!quizRoot || !window.RetargetQuiz) return;

    var R = window.RetargetQuiz;
    var form = qs('form', quizRoot);
    var result = qs('[data-role="quiz-result"]');
    var scoreEl = qs('[data-role="quiz-score"]');
    var detailEl = qs('[data-role="quiz-detail"]');
    var questionsMount = qs('[data-role="quiz-questions"]', form);
    var resetBtn = qs('[data-action="reset-quiz"]', quizRoot);

    if (!form || !result || !scoreEl || !detailEl || !questionsMount) return;

    R.QUIZ_QUESTIONS.forEach(function (q) {
      var fs = document.createElement('fieldset');
      var leg = document.createElement('legend');
      leg.textContent = q.prompt;
      fs.appendChild(leg);

      q.choices.forEach(function (c, idx) {
        var lab = document.createElement('label');
        lab.className = 'choice';
        var inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = q.id;
        inp.value = c.id;
        inp.id = q.id + '_' + c.id;
        lab.setAttribute('for', inp.id);
        lab.insertBefore(inp, null);
        var span = document.createElement('span');
        span.textContent = String.fromCharCode(97 + idx) + ') ' + c.label;
        lab.appendChild(span);
        fs.appendChild(lab);
      });

      questionsMount.appendChild(fs);
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var fd = new FormData(form);
      /** @type {Record<string, string>} */
      var answers = {};
      R.QUIZ_QUESTIONS.forEach(function (q) {
        var v = fd.get(q.id);
        if (typeof v === 'string') answers[q.id] = v;
      });

      var graded = R.gradeQuiz(answers);
      scoreEl.textContent =
        'Score: ' + graded.correct + ' / ' + graded.total +
        ' (' + Math.round(graded.fraction * 100) + '%).';

      var wrong = graded.details.filter(function (d) { return !d.correct; });
      if (wrong.length === 0) {
        detailEl.textContent = 'All questions correct — solid grasp of skeletal retargeting basics.';
      } else {
        detailEl.textContent =
          wrong.length +
          ' to review: open each missed prompt and compare with the earlier sections (bind pose, bone map, translations, root motion, IK).';
      }

      result.hidden = false;
      result.focus();
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        form.reset();
        result.hidden = true;
      });
    }
  }

  // ─── Pre-retarget checklist ───────────────────────────────────────────────

  function mountChecklist() {
    var list = qs('#pre-retarget-checklist');
    var statusEl = qs('[data-role="checklist-status"]');
    if (!list || !statusEl) return;

    var boxes = qsa('input[type="checkbox"]', list);
    var total = boxes.length;

    function update() {
      var checked = boxes.filter(function (b) { return b.checked; }).length;
      if (checked === 0) {
        statusEl.textContent = '';
      } else if (checked === total) {
        statusEl.textContent = 'All ' + total + ' steps checked — ready for review.';
      } else {
        statusEl.textContent = checked + ' / ' + total + ' steps checked.';
      }
    }

    boxes.forEach(function (b) { b.addEventListener('change', update); });
  }

  // ─── Mount all interactive widgets ───────────────────────────────────────

  function mountInteractives() {
    if (!window.RetargetInteractives) return;
    var R = window.RetargetInteractives;

    var bone    = qs('[data-widget="bone-map"]');
    var prop    = qs('[data-widget="proportion-demo"]');
    var wc      = qs('[data-widget="walk-cycle"]');
    var bpm     = qs('[data-widget="bind-pose-vis"]');
    var ik      = qs('[data-widget="ik-demo"]');
    var rm      = qs('[data-widget="root-motion-demo"]');
    var spine   = qs('[data-widget="spine-dist"]');

    if (bone)  R.mountBoneMap(bone);
    if (prop)  R.mountProportionDemo(prop);
    if (wc)    R.mountWalkCycle(wc);
    if (bpm)   R.mountBindPoseMismatch(bpm);
    if (ik)    R.mountIKDemo(ik);
    if (rm)    R.mountRootMotion(rm);
    if (spine) R.mountSpineDist(spine);
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    mountStepper();
    mountInteractives();
    mountQuiz();
    mountChecklist();
  });
})();
