/* =========================================================
   mokare ヒアリング — App logic
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "mokare_hearing_sheets_v2";
  const TOTAL_STEPS = 6;
  const STEP_LABELS = ["スタート", "連携", "メニュー", "カテゴリー", "通知", "確認"];

  // required field map for completeness meter
  const REQUIRED_KEYS = [
    "noticePasswordChange", "noticeMenuChange", "projectName",
    "lineDeveloperPermission", "accountName", "password",
    "categoryButton"
  ];

  let currentStep = 1;
  let catSeq = 0;
  let combinedMode = false;
  let suppressAutosave = false;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  /* ---------- Stepper ---------- */
  function buildStepper() {
    const nav = $("#stepper");
    nav.innerHTML = "";
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "step-node";
      btn.dataset.go = i;
      btn.innerHTML =
        `<span class="step-bullet">${i}</span><span class="step-label">${STEP_LABELS[i - 1]}</span>`;
      btn.addEventListener("click", () => {
        if (i <= currentStep || i === currentStep + 1) {
          if (i > currentStep && !validateStep(currentStep)) return;
          goToStep(i);
        } else {
          // jump forward across multiple: validate each in between
          for (let s = currentStep; s < i; s++) { if (!validateStep(s)) { goToStep(s); return; } }
          goToStep(i);
        }
      });
      nav.appendChild(btn);
      if (i < TOTAL_STEPS) {
        const c = document.createElement("div");
        c.className = "step-connector";
        c.dataset.conn = i;
        nav.appendChild(c);
      }
    }
    refreshStepper();
  }

  function refreshStepper() {
    $$(".step-node").forEach((n) => {
      const i = +n.dataset.go;
      n.classList.toggle("is-current", i === currentStep);
      n.classList.toggle("is-done", i < currentStep);
      const bullet = $(".step-bullet", n);
      if (i < currentStep) {
        bullet.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 12 5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      } else {
        bullet.textContent = i;
      }
    });
    $$(".step-connector").forEach((c) => {
      c.classList.toggle("filled", +c.dataset.conn < currentStep);
    });
  }

  /* ---------- Navigation ---------- */
  function goToStep(n) {
    currentStep = Math.max(1, Math.min(TOTAL_STEPS, n));
    $$(".step").forEach((s) => s.classList.toggle("active", +s.dataset.step === currentStep));
    refreshStepper();
    $("#navMid").textContent = `ステップ ${currentStep} / ${TOTAL_STEPS}`;
    $("#prevBtn").style.visibility = currentStep === 1 ? "hidden" : "visible";

    const next = $("#nextBtn");
    if (currentStep === TOTAL_STEPS) {
      next.style.visibility = "hidden";
      renderReview();
    } else {
      next.style.visibility = "visible";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- Validation ---------- */
  function validateStep(stepNum) {
    const sec = $(`.step[data-step="${stepNum}"]`);
    if (!sec) return true;
    let ok = true; let firstBad = null;

    $$("[data-required]", sec).forEach((field) => {
      // skip if inside a hidden conditional
      if (field.closest(".conditional:not(.show)")) return;
      const type = field.dataset.required;
      let valid = true;
      if (type === "checks") {
        valid = $$('input[type="checkbox"]', field).every((c) => c.checked);
      } else if (type === "radio") {
        valid = !!$("input[type=radio]:checked", field);
      } else { // text
        const inp = $(".input, .textarea", field);
        valid = inp && inp.value.trim() !== "";
      }
      field.classList.toggle("invalid", !valid);
      if (!valid) { ok = false; if (!firstBad) firstBad = field; }
    });

    if (!ok && firstBad) {
      const inp = $(".input, .textarea, input", firstBad);
      if (inp) inp.focus({ preventScroll: true });
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      toast("未入力の必須項目があります", "warn");
    }
    return ok;
  }

  // clear invalid state as user fixes
  function wireValidationClear() {
    $("#hearingForm").addEventListener("input", (e) => {
      const f = e.target.closest("[data-required]");
      if (f && f.classList.contains("invalid")) f.classList.remove("invalid");
    });
    $("#hearingForm").addEventListener("change", (e) => {
      const f = e.target.closest("[data-required]");
      if (f && f.classList.contains("invalid")) f.classList.remove("invalid");
    });
  }

  /* ---------- Conditional reveal ---------- */
  function evalConditionals() {
    $$("[data-show-when]").forEach((el) => {
      const [name, val] = el.dataset.showWhen.split("=");
      const sel = $(`input[name="${name}"]:checked`);
      el.classList.toggle("show", !!sel && sel.value === val);
    });
  }

  /* ---------- Checklist visual state ---------- */
  function wireCheckVisual() {
    $$(".check input[type=checkbox]").forEach((cb) => {
      const sync = () => cb.closest(".check").classList.toggle("is-checked", cb.checked);
      cb.addEventListener("change", sync); sync();
    });
  }

  /* ---------- Password toggle ---------- */
  function wirePassword() {
    const t = $("#pwToggle"), inp = $("#password");
    t.addEventListener("click", () => {
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      t.classList.toggle("revealed", show);
      t.setAttribute("aria-label", show ? "パスワードを隠す" : "パスワードを表示");
    });
  }

  /* ---------- Category builder ---------- */
  function catEmptyHtml() {
    return `<div class="cat-empty" data-empty>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7h18M3 12h18M3 17h10" stroke-linecap="round"/></svg>
      <p>まだカテゴリーがありません。「カテゴリーを追加」から登録してください。</p></div>`;
  }

  const ICON_ADD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>`;
  const ICON_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" stroke-linecap="round"/></svg>`;
  const ICON_GRIP = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>`;

  function rowHtml(type, value) {
    return `<div class="row-item" data-type="${type}">
      <span class="row-drag" title="ドラッグで並べ替え">${ICON_GRIP}</span>
      <div class="row-num"></div>
      <input type="text" class="input" value="${esc(value)}" placeholder="${type === "menu" ? "メニュー項目を入力…" : "クーポン項目を入力…"}">
      <button type="button" class="icon-btn" data-remove-row aria-label="削除">${ICON_X}</button>
    </div>`;
  }

  function rowHtmlCombined(type, value) {
    return `<div class="row-item combined" data-type="${type}">
      <span class="row-drag" title="ドラッグで並べ替え">${ICON_GRIP}</span>
      <div class="row-num"></div>
      <span class="row-tag ${type}">${type === "menu" ? "メニュー" : "クーポン"}</span>
      <input type="text" class="input" value="${esc(value)}" placeholder="${type === "menu" ? "メニュー項目を入力…" : "クーポン項目を入力…"}">
      <button type="button" class="icon-btn" data-remove-row aria-label="削除">${ICON_X}</button>
    </div>`;
  }

  function addCat(data) {
    catSeq++;
    const wrap = $("#catContainer");
    const empty = $("[data-empty]", wrap);
    if (empty) empty.remove();

    const el = document.createElement("div");
    el.className = "cat";
    el.dataset.cat = catSeq;
    el.innerHTML = `
      <div class="cat-head">
        <div class="cat-drag" title="ドラッグで並べ替え"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></div>
        <div class="cat-num"></div>
        <input type="text" class="input cat-name" placeholder="カテゴリー名を入力…" value="${esc(data && data.name)}">
        <button type="button" class="icon-btn" data-remove-cat aria-label="カテゴリー削除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div class="cat-body"></div>`;
    wrap.appendChild(el);

    const dragHandle = $(".cat-drag", el);
    dragHandle.addEventListener("mousedown", () => el.setAttribute("draggable", "true"));
    dragHandle.addEventListener("touchstart", () => el.setAttribute("draggable", "true"), { passive: true });
    el.addEventListener("dragend", () => el.removeAttribute("draggable"));

    renderCatBody(el, normalizeItems(data));
    renumberCats();
    return el;
  }

  function renumberCats() {
    $$("#catContainer .cat").forEach((c, i) => { $(".cat-num", c).textContent = i + 1; });
    if (!$("#catContainer .cat")) $("#catContainer").innerHTML = catEmptyHtml();
  }
  function renumberRows(catEl) {
    $$('.cat-body.two-col .rows', catEl).forEach((rows) => {
      $$(".row-num", rows).forEach((n, i) => (n.textContent = i + 1));
    });
  }
  function renumberCombined(catEl) {
    $$(".rows.combined .row-item", catEl).forEach((r, i) => { $(".row-num", r).textContent = i + 1; });
  }

  function normalizeItems(data) {
    if (data && Array.isArray(data.items)) {
      return data.items.map((it) => ({ type: it.type === "coupon" ? "coupon" : "menu", value: it.value || "" }));
    }
    if (data) {
      return [
        ...(data.menuItems || []).map((v) => ({ type: "menu", value: v })),
        ...(data.couponItems || []).map((v) => ({ type: "coupon", value: v })),
      ];
    }
    return [];
  }

  function renderCatBody(catEl, items) {
    const body = $(".cat-body", catEl);
    if (combinedMode) {
      body.className = "cat-body one-col";
      body.innerHTML = `
        <div class="rows combined" data-rows="all">${items.map((it) => rowHtmlCombined(it.type, it.value)).join("")}</div>
        <div class="add-actions">
          <button type="button" class="add-row" data-add="menu">${ICON_ADD}メニュー項目を追加</button>
          <button type="button" class="add-row coupon" data-add="coupon">${ICON_ADD}クーポン項目を追加</button>
        </div>`;
      renumberCombined(catEl);
      enableRowSortable($(".rows.combined", body), () => { renumberCombined(catEl); scheduleSave(); });
    } else {
      body.className = "cat-body two-col";
      const menuItems = items.filter((i) => i.type === "menu");
      const couponItems = items.filter((i) => i.type === "coupon");
      body.innerHTML = `
        <div class="subcol">
          <h5><span class="tag menu"></span>メニューからの追加項目</h5>
          <div class="rows" data-rows="menu">${menuItems.map((i) => rowHtml("menu", i.value)).join("")}</div>
          <button type="button" class="add-row" data-add="menu">${ICON_ADD}項目を追加</button>
        </div>
        <div class="subcol">
          <h5><span class="tag coupon"></span>クーポンからの追加項目</h5>
          <div class="rows" data-rows="coupon">${couponItems.map((i) => rowHtml("coupon", i.value)).join("")}</div>
          <button type="button" class="add-row coupon" data-add="coupon">${ICON_ADD}項目を追加</button>
        </div>`;
      renumberRows(catEl);
      $$("[data-rows]", body).forEach((rows) => enableRowSortable(rows, () => { renumberRows(catEl); scheduleSave(); }));
    }
  }

  function readCatItems(catEl) {
    const combined = $(".rows.combined", catEl);
    if (combined) {
      return $$(".row-item", combined).map((r) => ({ type: r.dataset.type, value: $("input", r).value }));
    }
    const items = [];
    $$('[data-rows="menu"] .row-item', catEl).forEach((r) => items.push({ type: "menu", value: $("input", r).value }));
    $$('[data-rows="coupon"] .row-item', catEl).forEach((r) => items.push({ type: "coupon", value: $("input", r).value }));
    return items;
  }

  function rerenderAllCatBodies() {
    $$("#catContainer .cat").forEach((c) => renderCatBody(c, readCatItems(c)));
  }

  function applyCombinedToggle() {
    const t = $("#combinedToggle");
    if (t) t.checked = combinedMode;
  }

  function enableRowSortable(container, onReorder) {
    if (!container) return;
    container.addEventListener("mousedown", (e) => {
      const h = e.target.closest(".row-drag");
      if (h) h.closest(".row-item").setAttribute("draggable", "true");
    });
    container.addEventListener("touchstart", (e) => {
      const h = e.target.closest(".row-drag");
      if (h) h.closest(".row-item").setAttribute("draggable", "true");
    }, { passive: true });
    container.addEventListener("dragend", (e) => {
      const it = e.target.closest(".row-item");
      if (it) it.removeAttribute("draggable");
    });
    enableSortable(container, ".row-item", onReorder || (() => scheduleSave()));
  }

  function wireCatDelegation() {
    const wrap = $("#catContainer");
    wrap.addEventListener("click", (e) => {
      const addBtn = e.target.closest("[data-add]");
      if (addBtn) {
        const kind = addBtn.dataset.add;
        const cat = addBtn.closest(".cat");
        if (combinedMode) {
          const rows = $(".rows.combined", cat);
          rows.insertAdjacentHTML("beforeend", rowHtmlCombined(kind, ""));
          renumberCombined(cat);
        } else {
          const rows = $(`[data-rows="${kind}"]`, cat);
          rows.insertAdjacentHTML("beforeend", rowHtml(kind, ""));
          renumberRows(cat);
        }
        scheduleSave();
        return;
      }
      const rmRow = e.target.closest("[data-remove-row]");
      if (rmRow) {
        const cat = rmRow.closest(".cat");
        rmRow.closest(".row-item").remove();
        if (combinedMode) renumberCombined(cat); else renumberRows(cat);
        scheduleSave(); return;
      }
      const rmCat = e.target.closest("[data-remove-cat]");
      if (rmCat) {
        rmCat.closest(".cat").remove();
        renumberCats(); scheduleSave(); return;
      }
    });
    $("#addCatBtn").addEventListener("click", () => { addCat(); scheduleSave(); });
    $("#combinedToggle").addEventListener("change", (e) => {
      combinedMode = e.target.checked;
      rerenderAllCatBodies();
      scheduleSave();
    });
  }


  /* ---------- Sortable (HTML5 DnD) ---------- */
  function afterElement(container, sel, y) {
    const els = $$(sel + ":not(.dragging)", container);
    let closest = { offset: -Infinity, el: null };
    els.forEach((child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) closest = { offset, el: child };
    });
    return closest.el;
  }
  function enableSortable(container, sel, onReorder) {
    container.addEventListener("dragstart", (e) => {
      const it = e.target.closest(sel);
      if (it && it === e.target && container.contains(it)) setTimeout(() => it.classList.add("dragging"), 0);
    });
    container.addEventListener("dragend", (e) => {
      const it = e.target.closest(sel);
      if (it && it === e.target) { it.classList.remove("dragging"); onReorder && onReorder(); }
    });
    container.addEventListener("dragover", (e) => {
      const dragging = $(".dragging", container);
      if (!dragging || !dragging.matches(sel)) return;
      e.preventDefault();
      const after = afterElement(container, sel, e.clientY);
      if (after == null) container.appendChild(dragging);
      else container.insertBefore(dragging, after);
    });
    container.addEventListener("drop", (e) => e.preventDefault());
  }

  /* ---------- Data collection ---------- */
  function val(id) { const el = document.getElementById(id); return el ? el.value : ""; }
  function radio(name) { const r = $(`input[name="${name}"]:checked`); return r ? r.value : ""; }

  function collectCategories() {
    return $$("#catContainer .cat").map((c) => ({
      name: $(".cat-name", c).value.trim(),
      items: readCatItems(c).map((it) => ({ type: it.type, value: it.value.trim() })).filter((it) => it.value),
    })).filter((c) => c.name || c.items.length);
  }

  function collectData() {
    return {
      projectName: val("projectName").trim(),
      noticePasswordChange: $("#noticePasswordChange").checked,
      noticeMenuChange: $("#noticeMenuChange").checked,
      lineDeveloperPermission: radio("lineDeveloperPermission"),
      accountName: val("accountName"),
      password: val("password"),
      shareUrl: val("shareUrl"),
      nomenu: val("nomenu"),
      nocoupon: val("nocoupon"),
      categoryButton: radio("categoryButton"),
      categories: collectCategories(),
      combinedMode: combinedMode,
      notificationEmails: val("notificationEmails"),
      newReservationAdmin: val("newReservationAdmin"),
      cancelReservationAdmin: val("cancelReservationAdmin"),
      newReservationUser: val("newReservationUser"),
      cancelReservationUser: val("cancelReservationUser"),
      reminderTime: val("reminderTime"),
      reminderMessage: val("reminderMessage"),
      overview: val("overview"),
    };
  }

  /* ---------- Restore ---------- */
  function setRadio(name, value) {
    const r = $(`input[name="${name}"][value="${value}"]`);
    if (r) r.checked = true;
  }
  function restoreData(d) {
    suppressAutosave = true;
    $("#projectName").value = d.projectName || "";
    $("#noticePasswordChange").checked = !!d.noticePasswordChange;
    $("#noticeMenuChange").checked = !!d.noticeMenuChange;
    setRadio("lineDeveloperPermission", d.lineDeveloperPermission);
    $("#accountName").value = d.accountName || "";
    $("#password").value = d.password || "";
    $("#shareUrl").value = d.shareUrl || "";
    $("#nomenu").value = d.nomenu || "";
    $("#nocoupon").value = d.nocoupon || "";
    setRadio("categoryButton", d.categoryButton);
    $("#notificationEmails").value = d.notificationEmails || "";
    $("#newReservationAdmin").value = d.newReservationAdmin || "";
    $("#cancelReservationAdmin").value = d.cancelReservationAdmin || "";
    $("#newReservationUser").value = d.newReservationUser || "";
    $("#cancelReservationUser").value = d.cancelReservationUser || "";
    $("#reminderTime").value = d.reminderTime || "";
    $("#reminderMessage").value = d.reminderMessage || "";
    $("#overview").value = d.overview || "";
    combinedMode = !!d.combinedMode;
    applyCombinedToggle();
    $("#catContainer").innerHTML = "";
    catSeq = 0;
    (d.categories || []).forEach((c) => addCat(c));
    renumberCats();
    wireCheckVisual();
    evalConditionals();
    suppressAutosave = false;
  }

  function clearForm() {
    suppressAutosave = true;
    $("#hearingForm").reset();
    $("#catContainer").innerHTML = "";
    catSeq = 0;
    renumberCats();
    combinedMode = false;
    applyCombinedToggle();
    $("#password").type = "password";
    $("#pwToggle").classList.remove("revealed");
    wireCheckVisual();
    evalConditionals();
    suppressAutosave = false;
    setPill("idle");
  }

  /* ---------- Storage ---------- */
  function allSheets() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function writeSheets(obj) { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }

  let saveTimer = null;
  function scheduleSave() {
    if (suppressAutosave) return;
    setPill("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 700);
  }
  function doSave() {
    const data = collectData();
    if (!data.projectName) { setPill("idle"); return; }
    const sheets = allSheets();
    sheets[data.projectName] = { savedAt: new Date().toISOString(), data };
    writeSheets(sheets);
    setPill("saved");
    renderSavedList();
  }

  function setPill(state) {
    const pill = $("#savePill");
    pill.classList.remove("saved", "saving");
    const txt = $(".txt", pill);
    if (state === "saving") { pill.classList.add("saving"); txt.textContent = "保存中…"; }
    else if (state === "saved") {
      pill.classList.add("saved"); txt.textContent = "保存済み";
    } else { txt.textContent = "未保存"; }
  }

  /* ---------- Drawer / saved list ---------- */
  function openDrawer() { $("#drawer").classList.add("open"); $("#drawerBackdrop").classList.add("open"); renderSavedList(); }
  function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawerBackdrop").classList.remove("open"); }

  function fmtDate(iso) {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function renderSavedList() {
    const sheets = allSheets();
    const names = Object.keys(sheets).sort((a, b) =>
      new Date(sheets[b].savedAt) - new Date(sheets[a].savedAt));
    const list = $("#savedList");
    if (!names.length) {
      list.innerHTML = `<div class="saved-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 7l2-3h6l2 3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <p>保存済みのシートはまだありません。<br>店舗名を入力すると自動保存されます。</p></div>`;
      return;
    }
    const current = val("projectName").trim();
    list.innerHTML = names.map((name) => {
      const s = sheets[name];
      const cats = (s.data.categories || []).length;
      const isCur = name === current;
      return `<div class="saved-card">
        <div class="sc-top">
          <div>
            <div class="sc-name">${esc(name)}${isCur ? ' <span style="font-size:10px;color:var(--accent-strong);background:var(--accent-soft);padding:1px 7px;border-radius:999px;vertical-align:middle;">編集中</span>' : ""}</div>
            <div class="sc-meta">最終保存 ${fmtDate(s.savedAt)} ・ カテゴリー ${cats}件</div>
          </div>
        </div>
        <div class="sc-actions">
          <button class="btn btn-subtle btn-sm" data-load="${esc(name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>読み込む</button>
          <button class="btn btn-danger-ghost btn-sm" data-del="${esc(name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6" stroke-linecap="round" stroke-linejoin="round"/></svg>削除</button>
        </div>
      </div>`;
    }).join("");
  }

  function wireDrawer() {
    $("#openDrawerBtn").addEventListener("click", openDrawer);
    $("#drawerClose").addEventListener("click", closeDrawer);
    $("#drawerBackdrop").addEventListener("click", closeDrawer);
    $("#savedList").addEventListener("click", (e) => {
      const load = e.target.closest("[data-load]");
      if (load) {
        const name = load.dataset.load;
        const s = allSheets()[name];
        if (s) { restoreData(s.data); setPill("saved"); closeDrawer(); goToStep(1); toast(`「${name}」を読み込みました`, "ok"); }
        return;
      }
      const del = e.target.closest("[data-del]");
      if (del) {
        const name = del.dataset.del;
        confirmDialog("削除しますか？", `「${name}」の保存データを削除します。この操作は取り消せません。`, () => {
          const sheets = allSheets(); delete sheets[name]; writeSheets(sheets);
          renderSavedList(); toast("削除しました", "ok");
        });
      }
    });
  }

  /* ---------- Confirm modal ---------- */
  let confirmCb = null;
  function confirmDialog(title, text, cb) {
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = text;
    confirmCb = cb;
    $("#confirmModal").classList.add("open");
  }
  function wireConfirm() {
    $("#confirmCancel").addEventListener("click", () => $("#confirmModal").classList.remove("open"));
    $("#confirmModal").addEventListener("click", (e) => { if (e.target.id === "confirmModal") $("#confirmModal").classList.remove("open"); });
    $("#confirmOk").addEventListener("click", () => {
      $("#confirmModal").classList.remove("open");
      if (confirmCb) confirmCb();
      confirmCb = null;
    });
  }

  /* ---------- New sheet ---------- */
  function wireNew() {
    $("#newSheetBtn").addEventListener("click", () => {
      confirmDialog("新規シートを作成", "現在の入力内容をクリアして新しいシートを始めます。保存済みデータは残ります。", () => {
        clearForm(); goToStep(1); toast("新規シートを開始しました", "ok");
      });
      $("#confirmOk").textContent = "新規作成";
      $("#confirmOk").style.background = "var(--accent)";
      // reset button after close
      setTimeout(() => {
        const restore = () => { $("#confirmOk").textContent = "削除する"; $("#confirmOk").style.background = "var(--danger)"; };
        $("#confirmCancel").addEventListener("click", restore, { once: true });
        $("#confirmOk").addEventListener("click", restore, { once: true });
      }, 0);
    });
  }

  /* ---------- Review (step 6) ---------- */
  function reviewRow(label, value, opts) {
    opts = opts || {};
    const empty = value == null || value === "";
    const warn = opts.required && empty;
    const disp = empty ? (opts.required ? "未入力（必須）" : "—") : value;
    return `<div class="review-item${warn ? " warn-row" : ""}">
      <dt>${esc(label)}</dt><dd class="${empty ? "empty" : ""}">${esc(disp)}</dd></div>`;
  }
  function yn(v) { return v === "yes" ? "はい" : v === "no" ? "いいえ" : ""; }

  function renderReview() {
    const d = collectData();
    // completeness
    let filled = 0;
    REQUIRED_KEYS.forEach((k) => {
      const v = d[k];
      if (v === true || (typeof v === "string" && v.trim() !== "")) filled++;
    });
    const pct = Math.round((filled / REQUIRED_KEYS.length) * 100);
    const comp = $("#completeness");
    const meter = $(".meter", comp);
    meter.style.setProperty("--p", pct + "%");
    $("span", meter).textContent = pct + "%";
    comp.classList.toggle("has-warn", pct < 100);
    $(".ctext strong", comp).textContent = pct === 100 ? "必須項目はすべて入力済みです" : `必須項目 ${filled}/${REQUIRED_KEYS.length} 入力済み`;
    $(".ctext p", comp).textContent = pct === 100 ? "このまま出力できます。" : "未入力の必須項目があります。各ステップでご確認ください。";

    const card = $("#reviewCard");
    let html = "";

    html += `<div class="review-block"><h4><span class="n">基本</span>店舗・連携アカウント</h4><dl class="review-grid">`;
    html += reviewRow("店舗名", d.projectName, { required: true });
    html += reviewRow("注意事項の確認", (d.noticePasswordChange && d.noticeMenuChange) ? "両方確認済み" : "", { required: true });
    html += reviewRow("LINE Developer 権限確認", yn(d.lineDeveloperPermission), { required: true });
    html += reviewRow("サロンボード アカウント名", d.accountName, { required: true });
    html += reviewRow("サロンボード パスワード", d.password ? "•".repeat(Math.min(d.password.length, 10)) : "", { required: true });
    html += reviewRow("HPB 店舗TOP URL", d.shareUrl);
    html += `</dl></div>`;

    html += `<div class="review-block"><h4><span class="n">設定</span>除外メニュー・クーポン・カテゴリー</h4><dl class="review-grid">`;
    html += reviewRow("除外メニュー", d.nomenu);
    html += reviewRow("除外クーポン", d.nocoupon);
    html += reviewRow("カテゴリーボタン", yn(d.categoryButton), { required: true });
    html += reviewRow("登録カテゴリー数", d.categories.length ? d.categories.length + " 件" : "");
    if (d.categoryButton === "yes") html += reviewRow("総合並び順", d.combinedMode ? "設定する（メニュー・クーポンを1列で管理）" : "設定しない");
    html += `</dl></div>`;

    if (d.categories.length) {
      html += `<div class="review-block"><h4><span class="n">詳細</span>カテゴリー内訳</h4><dl class="review-grid">`;
      d.categories.forEach((c) => {
        const mn = (c.items || []).filter((i) => i.type === "menu").length;
        const cp = (c.items || []).filter((i) => i.type === "coupon").length;
        const parts = [];
        if (mn) parts.push(`メニュー ${mn}`);
        if (cp) parts.push(`クーポン ${cp}`);
        html += reviewRow(c.name || "（名称未設定）", parts.join(" ・ ") || "項目なし");
      });
      html += `</dl></div>`;
    }

    html += `<div class="review-block"><h4><span class="n">通知</span>通知テキスト</h4><dl class="review-grid">`;
    html += reviewRow("通知先メール", d.notificationEmails);
    html += reviewRow("リマインド", d.reminderTime);
    html += reviewRow("備考", d.overview);
    html += `</dl></div>`;

    card.innerHTML = html;
  }

  /* ---------- Toast ---------- */
  function toast(msg, kind) {
    const host = $("#toastHost");
    const t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    const ic = kind === "warn"
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 12 5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    t.innerHTML = ic + `<span>${esc(msg)}</span>`;
    host.appendChild(t);
    setTimeout(() => { t.classList.add("leaving"); setTimeout(() => t.remove(), 280); }, 2600);
  }

  /* ---------- Export ---------- */
  function buildOutput(d) {
    const COPY = [];
    const push = (txt) => { COPY.push(txt == null ? "" : String(txt)); return COPY.length - 1; };
    const copyBtn = (txt) => {
      const i = push(txt);
      return `<button class="cp" data-i="${i}" aria-label="コピー"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke-linecap="round"/></svg></button>`;
    };
    const item = (label, value, multiline) => {
      if (value == null || value === "") return "";
      const body = multiline
        ? `<div class="v-label">${esc(label)}</div><pre class="v-pre">${esc(value)}</pre>`
        : `<div class="v-inline"><span class="v-label">${esc(label)}</span><span class="v-val">${esc(value)}</span></div>`;
      return `<div class="row ${multiline ? "row-ml" : ""}">${body}${copyBtn(value)}</div>`;
    };
    const section = (title, inner) => inner ? `<section class="sec"><h2>${esc(title)}</h2><div class="sec-body">${inner}</div></section>` : "";

    // 基本
    let basic = "";
    basic += item("店舗名", d.projectName);
    basic += item("LINE Developer 権限確認", yn(d.lineDeveloperPermission));
    basic += item("サロンボード アカウント名", d.accountName);
    if (d.password) basic += `<div class="row"><div class="v-inline"><span class="v-label">サロンボード パスワード</span><span class="v-val pw" data-pw="${esc(d.password)}">${"•".repeat(Math.min(d.password.length, 12))} <button class="pw-show" type="button">表示</button></span></div>${copyBtn(d.password)}</div>`;
    basic += item("HPB 店舗TOP URL", d.shareUrl);
    if (d.noticePasswordChange) basic += item("注意事項：パスワード変更時の連絡", "確認済み");
    if (d.noticeMenuChange) basic += item("注意事項：メニュー変更時の連絡", "確認済み");

    // メニュー・クーポン
    let mc = "";
    mc += item("除外メニュー", d.nomenu, true);
    mc += item("除外クーポン", d.nocoupon, true);
    mc += item("カテゴリーボタン", yn(d.categoryButton));

    // カテゴリー詳細
    const catTagHtml = (type) => `<span class="chip-tag ${type}">${type === "menu" ? "メニュー" : "クーポン"}</span>`;
    let cats = "";
    d.categories.forEach((c) => {
      const items = c.items || [];
      let inner = "";
      if (d.combinedMode) {
        if (items.length) {
          inner += `<div class="cat-sub">`;
          items.forEach((it) => inner += `<div class="chip">${catTagHtml(it.type)}<span class="chip-v">${esc(it.value)}</span>${copyBtn(it.value)}</div>`);
          inner += `</div>`;
        }
      } else {
        const menuItems = items.filter((i) => i.type === "menu");
        const couponItems = items.filter((i) => i.type === "coupon");
        if (menuItems.length) {
          inner += `<div class="cat-sub"><div class="cat-sub-h"><span class="dot menu"></span>メニューからの追加</div>`;
          menuItems.forEach((m) => inner += `<div class="chip"><span class="chip-v">${esc(m.value)}</span>${copyBtn(m.value)}</div>`);
          inner += `</div>`;
        }
        if (couponItems.length) {
          inner += `<div class="cat-sub"><div class="cat-sub-h"><span class="dot coupon"></span>クーポンからの追加</div>`;
          couponItems.forEach((m) => inner += `<div class="chip"><span class="chip-v">${esc(m.value)}</span>${copyBtn(m.value)}</div>`);
          inner += `</div>`;
        }
      }
      cats += `<div class="cat-card"><div class="cat-card-h"><h3>${esc(c.name || "（名称未設定）")}</h3>${copyBtn(c.name)}</div>${inner ? `<div class="cat-card-b">${inner}</div>` : ""}</div>`;
    });

    // 通知
    let notify = "";
    notify += item("通知先メールアドレス", d.notificationEmails, true);
    notify += item("管理者通知：新規予約時", d.newReservationAdmin, true);
    notify += item("管理者通知：キャンセル時", d.cancelReservationAdmin, true);
    notify += item("ユーザー通知：新規予約時", d.newReservationUser, true);
    notify += item("ユーザー通知：キャンセル時", d.cancelReservationUser, true);
    notify += item("リマインド：タイミング", d.reminderTime);
    notify += item("リマインドメッセージ", d.reminderMessage, true);
    notify += item("備考・その他", d.overview, true);

    const title = d.projectName ? `${d.projectName} ヒアリングシート` : "ヒアリングシート";
    const copyJson = JSON.stringify(COPY).replace(/</g, "\\u003c");

    return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
:root{--bg:#f6f8f8;--surface:#fff;--ink:#243038;--ink2:#5a6a72;--ink3:#8a97a0;--line:#e6ebec;--accent:#2f8f86;--accent-soft:#e8f4f2;--accent-ink:#1f6b63;--warn:#c98a2e;}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"IBM Plex Sans JP","Hiragino Kaku Gothic ProN",system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.65;padding:40px 20px;}
.sheet{max-width:880px;margin:0 auto;}
.sheet-head{display:flex;align-items:center;gap:14px;margin-bottom:8px;}
.logo{width:38px;height:38px;border-radius:11px;background:var(--accent);display:grid;place-items:center;flex-shrink:0;}
.logo::after{content:"";width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 55%,#fff);}
.sheet-head h1{font-size:24px;font-weight:600;letter-spacing:-.02em;}
.sheet-head p{font-size:12.5px;color:var(--ink3);font-weight:500;letter-spacing:.04em;}
.meta{font-size:12px;color:var(--ink3);margin:0 0 28px 52px;}
.sec{background:var(--surface);border:1px solid var(--line);border-radius:14px;margin-bottom:18px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,32,.04);}
.sec>h2{font-size:14px;font-weight:600;padding:15px 22px;background:linear-gradient(0deg,var(--surface),var(--accent-soft));border-bottom:1px solid var(--line);color:var(--accent-ink);letter-spacing:.01em;}
.sec-body{padding:10px 22px 18px;}
.row{display:flex;align-items:flex-start;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);}
.row:last-child{border-bottom:none;}
.row-ml{flex-direction:column;align-items:stretch;}
.v-inline{flex:1;display:flex;justify-content:space-between;gap:16px;align-items:baseline;flex-wrap:wrap;}
.v-label{font-size:12.5px;color:var(--ink3);font-weight:500;}
.v-val{font-size:14px;color:var(--ink);font-weight:500;text-align:right;word-break:break-word;}
.row-ml .v-label{margin-bottom:7px;}
.v-pre{font-family:"IBM Plex Mono",monospace;font-size:12.5px;line-height:1.6;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;white-space:pre-wrap;word-break:break-word;color:var(--ink);}
.row-ml{position:relative;}
.row-ml .cp{position:absolute;top:9px;right:0;}
.cp{flex-shrink:0;width:30px;height:30px;border-radius:7px;border:1px solid var(--line);background:var(--surface);cursor:pointer;color:var(--ink3);display:grid;place-items:center;transition:.15s;}
.cp:hover{color:var(--accent);border-color:var(--accent);background:var(--accent-soft);}
.cp svg{width:15px;height:15px;stroke-width:2;}
.cp.done{color:#fff;background:var(--accent);border-color:var(--accent);}
.cat-card{border:1px solid var(--line);border-radius:12px;margin-bottom:14px;overflow:hidden;}
.cat-card-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 18px;background:var(--accent-soft);}
.cat-card-h h3{font-size:15px;font-weight:600;color:var(--accent-ink);}
.cat-card-b{padding:16px 18px;display:flex;flex-direction:column;gap:16px;}
.cat-sub-h{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--ink2);margin-bottom:9px;}
.dot{width:8px;height:8px;border-radius:3px;}.dot.menu{background:var(--accent);}.dot.coupon{background:var(--warn);}
.chip{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13.5px;padding:8px 12px;background:var(--bg);border:1px solid var(--line);border-radius:8px;margin-bottom:7px;}
.chip-v{flex:1;}
.chip-tag{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:999px;flex-shrink:0;white-space:nowrap;}
.chip-tag.menu{background:var(--accent-soft);color:var(--accent-ink);}
.chip-tag.coupon{background:#f6ecd9;color:var(--warn);}
.ord-rows{display:flex;flex-direction:column;gap:8px;margin-bottom:8px;}
.ord-row{display:flex;align-items:center;gap:12px;font-size:14px;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:8px;}
.ord-row>span:nth-child(2){flex:1;font-weight:500;}
.ord-n{width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex-shrink:0;}
.pw .pw-show{font:inherit;font-size:11px;border:1px solid var(--line);background:#fff;border-radius:6px;padding:1px 8px;cursor:pointer;color:var(--ink2);margin-left:6px;}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:13.5px;font-weight:500;padding:11px 18px;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.2);z-index:99;opacity:0;transition:.25s;}
.toast.show{opacity:1;}
.foot{text-align:center;font-size:11.5px;color:var(--ink3);margin-top:24px;}
@media print{body{background:#fff;padding:0;}.cp,.pw-show{display:none!important;}.sec{box-shadow:none;break-inside:avoid;}}
</style></head>
<body>
<div class="sheet">
  <div class="sheet-head"><div class="logo"></div><div><h1>${esc(title)}</h1><p>mokare 予約システム導入ヒアリングシート</p></div></div>
  <div class="meta">作成日時：${new Date().toLocaleString("ja-JP")}</div>
  ${section("基本設定・連携アカウント", basic)}
  ${section("除外メニュー・クーポン・カテゴリー設定", mc)}
  ${cats ? section("カテゴリー詳細", cats) : ""}
  ${section("通知テキスト設定", notify)}
  <div class="foot">mokare ヒアリングシート</div>
</div>
<div class="toast" id="t"></div>
<script>
var COPY=${copyJson};
function flash(m){var t=document.getElementById("t");t.textContent=m;t.classList.add("show");clearTimeout(window.__tt);window.__tt=setTimeout(function(){t.classList.remove("show")},1800);}
function cp(txt,btn){function ok(){flash("コピーしました");if(btn){btn.classList.add("done");setTimeout(function(){btn.classList.remove("done")},900);}}
if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(txt).then(ok).catch(function(){fb(txt,ok)});}else{fb(txt,ok);}}
function fb(txt,ok){var a=document.createElement("textarea");a.value=txt;a.style.position="fixed";a.style.left="-9999px";document.body.appendChild(a);a.select();try{document.execCommand("copy");ok();}catch(e){flash("コピーに失敗しました");}document.body.removeChild(a);}
document.addEventListener("click",function(e){var b=e.target.closest(".cp");if(b){cp(COPY[+b.dataset.i],b);return;}var p=e.target.closest(".pw-show");if(p){var span=p.closest(".pw");span.firstChild.textContent=span.dataset.pw+" ";p.remove();}});
<\/script>
</body></html>`;
  }

  function download(content, filename) {
    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.style.display = "none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function wireExport() {
    $("#exportBtn").addEventListener("click", () => {
      const d = collectData();
      const missing = REQUIRED_KEYS.filter((k) => {
        const v = d[k]; return !(v === true || (typeof v === "string" && v.trim() !== ""));
      });
      if (!d.projectName) { toast("店舗名を入力してください", "warn"); goToStep(1); return; }
      if (missing.length) {
        confirmDialog("未入力の必須項目があります", `必須項目が ${missing.length} 件未入力です。このまま出力しますか？`, () => doExport(d));
        $("#confirmOk").textContent = "このまま出力";
        $("#confirmOk").style.background = "var(--accent)";
        const restore = () => { $("#confirmOk").textContent = "削除する"; $("#confirmOk").style.background = "var(--danger)"; };
        $("#confirmCancel").addEventListener("click", restore, { once: true });
        $("#confirmOk").addEventListener("click", restore, { once: true });
        return;
      }
      doExport(d);
    });
  }
  function doExport(d) {
    const html = buildOutput(d);
    const fn = (d.projectName || "ヒアリングシート") + "_ヒアリングシート.html";
    download(html, fn);
    doSave();
    toast("HTMLシートを出力しました", "ok");
  }

  /* ---------- Init ---------- */
  function init() {
    buildStepper();
    goToStep(1);
    addCat(); // start with one empty category
    wireCatDelegation();
    enableSortable($("#catContainer"), ".cat", () => { renumberCats(); scheduleSave(); });
    applyCombinedToggle();
    wireCheckVisual();
    wirePassword();
    wireDrawer();
    wireConfirm();
    wireNew();
    wireExport();
    wireValidationClear();

    // conditional reveal on radio change
    $("#hearingForm").addEventListener("change", (e) => {
      if (e.target.matches("input[type=radio]")) evalConditionals();
    });
    evalConditionals();

    // nav buttons
    $("#prevBtn").addEventListener("click", () => goToStep(currentStep - 1));
    $("#nextBtn").addEventListener("click", () => { if (validateStep(currentStep)) goToStep(currentStep + 1); });

    // autosave
    const form = $("#hearingForm");
    form.addEventListener("input", scheduleSave);
    form.addEventListener("change", scheduleSave);

    // project name → auto-load existing
    $("#projectName").addEventListener("change", () => {
      const name = val("projectName").trim();
      if (!name) return;
      const s = allSheets()[name];
      if (s && s.data && (s.data.categories || []).length >= 0) {
        // only auto-load if current form is essentially empty besides the name
        const cur = collectData();
        const isEmpty = !cur.accountName && !cur.password && cur.categories.length === 0 && !cur.lineDeveloperPermission;
        if (isEmpty) { restoreData(s.data); setPill("saved"); toast(`「${name}」を読み込みました`, "ok"); }
      }
    });

    renderSavedList();

    // keyboard: Enter on text inputs shouldn't submit / advance unexpectedly
    form.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("input.input")) e.preventDefault();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
