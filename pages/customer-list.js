(function () {
  CRMStore.ensureData();

  var LOG_PREF_KEY = "crm_log_panel_visible";
  var activeCustomerId = "";
  var historyPageSize = 4;
  var historyVisibleCount = historyPageSize;
  var historyCurrentList = [];
  var historyMode = "all";
  var activeHistoryId = "";
  var historyEditing = false;
  var createFillState = {
    lastLoggedProgressKey: "",
    lastContentSnapshot: ""
  };
  var tooltipState = {
    el: null,
    target: null
  };

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function hideTooltip() {
    if (!tooltipState.el) return;
    tooltipState.el.classList.remove("show");
    tooltipState.target = null;
  }

  function showTooltip(target) {
    if (!tooltipState.el || !target) return;
    var text = target.getAttribute("data-tip");
    if (!text) return;
    tooltipState.target = target;
    tooltipState.el.textContent = text;
    tooltipState.el.style.left = "-9999px";
    tooltipState.el.style.top = "-9999px";
    tooltipState.el.classList.add("show");

    var rect = target.getBoundingClientRect();
    var tipRect = tooltipState.el.getBoundingClientRect();
    var gap = 10;
    var top = rect.top - tipRect.height - gap;
    if (top < 8) top = rect.bottom + gap;
    var left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

    tooltipState.el.style.left = Math.round(left) + "px";
    tooltipState.el.style.top = Math.round(top) + "px";
  }

  function initGlobalTooltip() {
    if (tooltipState.el) return;
    var el = document.createElement("div");
    el.className = "global-tooltip";
    document.body.appendChild(el);
    tooltipState.el = el;

    document.addEventListener("pointerover", function (e) {
      var target = e.target.closest(".tip[data-tip]");
      if (!target) return;
      if (tooltipState.target === target) return;
      showTooltip(target);
    });

    document.addEventListener("pointerout", function (e) {
      if (!tooltipState.target) return;
      var outTarget = e.target.closest(".tip[data-tip]");
      if (outTarget !== tooltipState.target) return;
      var related = e.relatedTarget;
      if (related && tooltipState.target.contains(related)) return;
      hideTooltip();
    });

    document.addEventListener("focusin", function (e) {
      var target = e.target.closest(".tip[data-tip]");
      if (target) showTooltip(target);
    });

    document.addEventListener("focusout", function (e) {
      var target = e.target.closest(".tip[data-tip]");
      if (target) hideTooltip();
    });

    document.addEventListener("click", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
  }

  function latest() {
    return CRMStore.getLatestRecord();
  }

  function mainCustomer() {
    return CRMStore.getData().customer;
  }

  function toast(msg, type) {
    var wrap = document.createElement("div");
    wrap.className = "toast " + (type || "success");
    wrap.textContent = msg;
    var host = document.createElement("div");
    host.className = "toast-wrap";
    host.appendChild(wrap);
    document.body.appendChild(host);
    setTimeout(function () { host.remove(); }, 2200);
  }

  function logPanelVisible() {
    return localStorage.getItem(LOG_PREF_KEY) === "1";
  }

  function setLogPanelVisible(flag) {
    localStorage.setItem(LOG_PREF_KEY, flag ? "1" : "0");
  }

  function renderLogPanelToggle() {
    var on = logPanelVisible();
    document.getElementById("eventPanel").classList.toggle("off", !on);
    document.getElementById("toggleLogBtn").textContent = "埋点日志：" + (on ? "开" : "关");
  }

  function renderLogs() {
    var logs = CRMStore.getLogs();
    var list = document.getElementById("eventList");
    list.innerHTML = logs.length ? logs.map(function (l) {
      return "<li><span class='event-time'>" + CRMStore.formatDateTime(l.time) + "</span>" + l.name + "</li>";
    }).join("") : "<li>暂无埋点事件</li>";
  }

  function allCustomers() {
    var c = mainCustomer();
    var latestRecord = latest();
    var latestContent = latestRecord ? (latestRecord.content || "").trim() : "";
    return [
      {
        id: "cus_001",
        name: c.name,
        industry: c.industry,
        stage: c.stage,
        owner: c.owner,
        progress: latestRecord ? latestRecord.typeLabel : "待跟进",
        summary: latestRecord ? (CRMStore.formatDateTime(latestRecord.followupTime) + " · " + (latestContent ? (latestContent.slice(0, 24) + (latestContent.length > 24 ? "..." : "")) : "无")) : "暂无跟进记录",
        isMain: true
      },
      {
        id: "cus_002",
        name: "杭州远峰云链科技有限公司",
        industry: "工业互联网 / 供应链",
        stage: "跟进中",
        owner: "王婷",
        progress: "线上会议",
        summary: "2026-03-23 11:40 · 已同步预算流程",
        isMain: false
      },
      {
        id: "cus_003",
        name: "苏州海拓智控设备有限公司",
        industry: "智能制造 / 设备管理",
        stage: "意向",
        owner: "周楠",
        progress: "待跟进",
        summary: "暂无跟进记录",
        isMain: false
      }
    ];
  }

  function getFilters() {
    return {
      keyword: document.getElementById("keyword").value.trim(),
      stage: document.getElementById("stageFilter").value
    };
  }

  function renderTable() {
    var f = getFilters();
    var rows = allCustomers().filter(function (item) {
      var passKeyword = !f.keyword || item.name.indexOf(f.keyword) > -1;
      var passStage = f.stage === "all" || item.stage === f.stage;
      return passKeyword && passStage;
    });

    var tbody = document.getElementById("customerTbody");
    if (!rows.length) {
      tbody.innerHTML = "<tr><td colspan='6'><div class='empty'>暂无匹配客户</div></td></tr>";
      return;
    }

    tbody.innerHTML = rows.map(function (r) {
      var tagClass = r.progress === "待跟进" ? "tag-custom" : CRMStore.typeClass(r.progress);
      var op = r.isMain
        ? "<div class='op-row'>" +
          "<button class='btn btn-outline btn-add tip' data-id='" + r.id + "' data-tip='功能：新增客户跟进记录。&#10;点击：打开新增跟进弹窗。'>新增跟进</button>" +
          "<button class='btn btn-outline btn-history tip' data-id='" + r.id + "' data-tip='功能：查看该客户历史跟进。&#10;点击：打开历史弹窗并可筛选。'>跟进历史</button>" +
          "<button class='btn btn-primary btn-detail tip' data-id='" + r.id + "' data-tip='功能：查看客户详情。&#10;点击：打开详情弹窗。'>查看详情</button>" +
          "</div>"
        : "<button class='btn btn-outline' disabled>仅演示主客户</button>";

      return "<tr>" +
        "<td class='" + (r.isMain ? "customer-main" : "") + "'>" + r.name + "</td>" +
        "<td>" + r.industry + "</td>" +
        "<td>" + r.stage + "</td>" +
        "<td>" + r.owner + "</td>" +
        "<td class='progress-cell'><span class='tag " + tagClass + "'>" + r.progress + "</span><div class='progress-main'>" + r.summary + "</div></td>" +
        "<td>" + op + "</td>" +
        "</tr>";
    }).join("");

    Array.prototype.forEach.call(document.querySelectorAll(".btn-add"), function (btn) {
      btn.addEventListener("click", function () {
        activeCustomerId = btn.getAttribute("data-id");
        openCreateModal();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".btn-history"), function (btn) {
      btn.addEventListener("click", function () {
        activeCustomerId = btn.getAttribute("data-id");
        openHistoryModal("", "all");
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".btn-detail"), function (btn) {
      btn.addEventListener("click", function () {
        activeCustomerId = btn.getAttribute("data-id");
        openDetailModal();
      });
    });
  }

  function resetCreateForm() {
    document.getElementById("typeKey").value = "";
    document.getElementById("typeLabelCustom").value = "";
    document.getElementById("followupTime").value = CRMStore.nowLocal();
    document.getElementById("person").value = CRMStore.formatPerson(CRMStore.currentUser);
    document.getElementById("content").value = "";
    document.getElementById("nextFollowupTime").value = "";
    document.getElementById("customLabelRow").classList.add("hidden");
    ["typeKey", "typeLabelCustom", "followupTime", "content"].forEach(function (k) {
      var e = document.getElementById(k + "Error");
      if (e) e.textContent = "";
    });
    createFillState.lastLoggedProgressKey = "";
    createFillState.lastContentSnapshot = "";
    updateFillCount(false);
  }

  function updateFillCount(shouldLog) {
    var type = document.getElementById("typeKey").value;
    var total = type === "自定义标签" ? 5 : 4;
    var done = 0;
    if (type) done++;
    if (type === "自定义标签" && document.getElementById("typeLabelCustom").value.trim()) done++;
    if (document.getElementById("followupTime").value) done++;
    if (document.getElementById("person").value) done++;
    if (document.getElementById("content").value.trim()) done++;
    var progressKey = done + "/" + total;
    document.getElementById("fillCount").textContent = done + " / " + total;
    if (shouldLog && progressKey !== createFillState.lastLoggedProgressKey) {
      CRMStore.logEvent("followup_form_fill_progress");
      renderLogs();
      createFillState.lastLoggedProgressKey = progressKey;
    }
  }

  function validateForm() {
    var ok = true;
    var type = document.getElementById("typeKey").value;
    var custom = document.getElementById("typeLabelCustom").value.trim();
    var time = document.getElementById("followupTime").value;

    ["typeKey", "typeLabelCustom", "followupTime", "content"].forEach(function (k) {
      var e = document.getElementById(k + "Error");
      if (e) e.textContent = "";
    });

    if (!type) { document.getElementById("typeKeyError").textContent = "请选择跟进类型"; ok = false; }
    if (type === "自定义标签" && !custom) { document.getElementById("typeLabelCustomError").textContent = "请输入自定义标签名称"; ok = false; }
    if (!time) { document.getElementById("followupTimeError").textContent = "请选择跟进时间"; ok = false; }
    return ok;
  }

  function openCreateModal() {
    CRMStore.logEvent("followup_create_click");
    CRMStore.logEvent("followup_form_view");
    renderLogs();
    resetCreateForm();
    document.getElementById("createModal").classList.add("show");
  }

  function closeCreateModal() {
    document.getElementById("createModal").classList.remove("show");
  }

  function openHistoryModal(openId, mode) {
    historyVisibleCount = historyPageSize;
    historyMode = mode || "all";
    if (openId) {
      activeHistoryId = openId;
      historyEditing = false;
    }
    renderHistoryList();
    refreshDateClearState();
    document.getElementById("historyModal").classList.add("show");
    if (openId) {
      renderHistoryDetail();
      document.getElementById("historyDetailModal").classList.add("show");
    }
  }

  function getHistoryFilters() {
    return {
      type: document.getElementById("historyTypeFilter").value,
      startDate: document.getElementById("historyStartDate").value,
      endDate: document.getElementById("historyEndDate").value
    };
  }

  function formatDateForDisplay(dateVal) {
    if (!dateVal) return "";
    var parts = dateVal.split("-");
    if (parts.length !== 3) return dateVal;
    return parts[0] + "年" + parts[1] + "月" + parts[2] + "日";
  }

  function syncHistoryDateDisplays() {
    var startVal = document.getElementById("historyStartDate").value;
    var endVal = document.getElementById("historyEndDate").value;
    document.getElementById("historyStartDateDisplay").value = formatDateForDisplay(startVal);
    document.getElementById("historyEndDateDisplay").value = formatDateForDisplay(endVal);
  }

  function setupHistoryDateInputs() {
    [
      { valueId: "historyStartDate", displayId: "historyStartDateDisplay" },
      { valueId: "historyEndDate", displayId: "historyEndDateDisplay" }
    ].forEach(function (item) {
      var picker = document.getElementById(item.valueId);
      var display = document.getElementById(item.displayId);
      if (!picker || !display) return;

      function openPicker() {
        if (typeof picker.showPicker === "function") {
          try {
            picker.showPicker();
            return;
          } catch (e) {}
        }
        picker.focus();
      }

      display.addEventListener("click", openPicker);
      display.addEventListener("focus", openPicker);
    });
    syncHistoryDateDisplays();
  }

  function normalizeHistoryDateRange(changedId) {
    var startEl = document.getElementById("historyStartDate");
    var endEl = document.getElementById("historyEndDate");
    var startVal = startEl.value;
    var endVal = endEl.value;

    if (!startVal && !endVal) return;

    if (changedId === "historyStartDate" && startVal && !endVal) {
      endEl.value = startVal;
      return;
    }

    if (changedId === "historyEndDate" && endVal && !startVal) {
      startEl.value = endVal;
      return;
    }

    if (startVal && endVal && startVal > endVal) {
      if (changedId === "historyStartDate") {
        endEl.value = startVal;
      } else {
        startEl.value = endVal;
      }
      toast("日期区间已自动调整", "success");
    }
  }

  function refreshDateClearState() {
    var startVal = document.getElementById("historyStartDate").value;
    var endVal = document.getElementById("historyEndDate").value;
    document.getElementById("historyStartClearBtn").classList.toggle("hidden", !startVal);
    document.getElementById("historyEndClearBtn").classList.toggle("hidden", !endVal);
    syncHistoryDateDisplays();
  }

  function truncate(str, len) {
    if (!str) return "";
    return str.length > len ? str.slice(0, len) + "..." : str;
  }

  function contentOrDefault(val) {
    var s = (val || "").trim();
    return s ? s : "跟进内容：待补充";
  }

  function renderDetailModal() {
    var data = CRMStore.getData();
    var c = data.customer;
    var latestRecord = CRMStore.getLatestRecord();
    var stats = CRMStore.getStats();

    document.getElementById("detailCustomerFields").innerHTML = [
      ["客户名称", c.name],
      ["所属行业", c.industry],
      ["客户阶段", c.stage],
      ["负责人", c.owner],
      ["联系方式", c.phone],
      ["最近跟进时间", latestRecord ? CRMStore.formatDateTime(latestRecord.followupTime) : "—"]
    ].map(function (item) {
      return "<div class='field'><div class='field-label'>" + item[0] + "</div><div class='field-value'>" + item[1] + "</div></div>";
    }).join("");

    document.getElementById("detailStats").innerHTML =
      "<div class='stat-card'><div class='stat-label'>累计跟进次数</div><div class='stat-value'>" + stats.total + "</div></div>" +
      "<div class='stat-card'><div class='stat-label'>最近 7 天跟进次数</div><div class='stat-value'>" + stats.sevenDays + "</div></div>" +
      "<div class='stat-card clickable tip' id='detailPendingCard' data-tip='功能：查看待跟进事项。&#10;默认：统计下次跟进时间晚于当前且未标记已跟进。&#10;点击：打开历史弹窗并按待跟进过滤。'><div class='stat-label'>下次待跟进数</div><div class='stat-value'>" + stats.pending + "</div><div class='stat-tip'>点击查看待跟进事项</div></div>";

    document.getElementById("detailPendingCard").addEventListener("click", function () {
      openHistoryModal("", "pending");
    });

    var latestWrap = document.getElementById("detailLatestWrap");
    if (!latestRecord) {
      latestWrap.innerHTML = "<div class='empty'><h4>暂无跟进记录</h4><p>建议立即新增首条跟进。</p></div>";
      return;
    }
    latestWrap.innerHTML =
      "<div class='latest-card tip' id='detailLatestCard' data-tip='功能：查看最近一条跟进的完整详情。&#10;点击：打开记录详情弹窗。'>" +
      "<div class='latest-top'><span class='tag " + CRMStore.typeClass(latestRecord.typeKey) + "'>" + latestRecord.typeLabel + "</span><span class='badge-latest'>最近跟进</span></div>" +
      "<div class='latest-meta'>跟进时间：" + CRMStore.formatDateTime(latestRecord.followupTime) + " ｜ 跟进人：" + CRMStore.formatPerson(latestRecord.person) + "</div>" +
      "<div class='latest-content'>" + truncate(contentOrDefault(latestRecord.content), 110) + "</div>" +
      (latestRecord.nextFollowupTime ? ("<div class='latest-meta'>下次跟进时间：" + CRMStore.formatDateTime(latestRecord.nextFollowupTime) + (latestRecord.nextFollowupDone ? "（已跟进）" : "") + "</div>") : "") +
      "</div>";

    document.getElementById("detailLatestCard").addEventListener("click", function () {
      CRMStore.logEvent("followup_history_detail_click");
      renderLogs();
      activeHistoryId = latestRecord.id;
      historyEditing = false;
      renderHistoryDetail();
      document.getElementById("historyDetailModal").classList.add("show");
    });
  }

  function openDetailModal() {
    renderDetailModal();
    document.getElementById("detailModal").classList.add("show");
  }

  function renderHistoryList(skipAutoFill) {
    var filters = getHistoryFilters();
    var list = CRMStore.filterRecords(filters);
    if (historyMode === "pending") {
      var now = new Date();
      list = list.filter(function (r) {
        return !!r.nextFollowupTime && !r.nextFollowupDone && new Date(r.nextFollowupTime) > now;
      });
    }
    historyCurrentList = list;
    var latestRecord = CRMStore.getLatestRecord();
    var shown = list.slice(0, historyVisibleCount);
    var wrap = document.getElementById("historyWrap");
    var moreBtn = document.getElementById("historyMoreBtn");

    if (!list.length) {
      wrap.innerHTML = "<div class='empty'><h4>暂无匹配的跟进记录</h4><p>可尝试重置筛选，或新增一条跟进。</p></div>";
      moreBtn.style.display = "none";
      document.getElementById("historyCount").textContent = "共 0 条";
      return;
    }

    wrap.innerHTML =
      "<div class='timeline'>" +
      shown.map(function (r) {
        var latestBadge = latestRecord && latestRecord.id === r.id ? "<span class='badge-latest'>最近跟进</span>" : "";
        return (
          "<div class='timeline-item'>" +
          "<div class='history-card' data-id='" + r.id + "'>" +
          "<div class='card-top'><div><span class='tag " + CRMStore.typeClass(r.typeKey) + "'>" + r.typeLabel + "</span> " + latestBadge + "</div><span>" + CRMStore.formatDateTime(r.followupTime) + "</span></div>" +
          "<div class='card-meta'>跟进人：" + CRMStore.formatPerson(r.person) + (r.nextFollowupTime ? (" ｜ 下次跟进：" + CRMStore.formatDateTime(r.nextFollowupTime) + (r.nextFollowupDone ? "（已跟进）" : "")) : "") + "</div>" +
          "<div class='card-content'>" + truncate(contentOrDefault(r.content), 95) + "</div>" +
          "</div></div>"
        );
      }).join("") +
      "</div>";

    Array.prototype.forEach.call(document.querySelectorAll(".history-card"), function (node) {
      node.addEventListener("click", function () {
        CRMStore.logEvent("followup_history_detail_click");
        renderLogs();
        activeHistoryId = node.getAttribute("data-id");
        historyEditing = false;
        renderHistoryDetail();
        document.getElementById("historyDetailModal").classList.add("show");
      });
    });

    moreBtn.style.display = "none";
    document.getElementById("historyCount").textContent = "共 " + list.length + " 条";

    if (!skipAutoFill) {
      requestAnimationFrame(function () {
        var body = document.querySelector("#historyModal .modal-body");
        var safe = 0;
        while (
          body &&
          historyVisibleCount < historyCurrentList.length &&
          body.scrollHeight <= body.clientHeight + 2 &&
          safe < 20
        ) {
          historyVisibleCount = Math.min(historyVisibleCount + historyPageSize, historyCurrentList.length);
          renderHistoryList(true);
          body = document.querySelector("#historyModal .modal-body");
          safe++;
        }
      });
    }
  }

  function maybeLoadMoreHistory() {
    if (!document.getElementById("historyModal").classList.contains("show")) return;
    if (historyVisibleCount >= historyCurrentList.length) return;
    var body = document.querySelector("#historyModal .modal-body");
    if (!body) return;
    var nearBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 80;
    if (!nearBottom) return;
    historyVisibleCount = Math.min(historyVisibleCount + historyPageSize, historyCurrentList.length);
    renderHistoryList();
  }

  function renderHistoryDetail() {
    var record = CRMStore.getRecordById(activeHistoryId);
    if (!record) {
      document.getElementById("historyDetailModal").classList.remove("show");
      return;
    }
    var content = document.getElementById("historyDetailContent");
    var editBtn = document.getElementById("historyEditBtn");
    var delBtn = document.getElementById("historyDeleteBtn");
    var saveBtn = document.getElementById("historySaveBtn");

    if (!historyEditing) {
      var nextFollowupLabel = record.nextFollowupTime
        ? (CRMStore.formatDateTime(record.nextFollowupTime) + (record.nextFollowupDone ? "（已跟进）" : ""))
        : "未设置";
      var doneBtn = !record.nextFollowupTime
        ? ""
        : "<button class='btn btn-outline tip' id='markDoneBtn' data-tip='功能：切换下次跟进完成状态。&#10;点击：在已跟进与未跟进间切换，并联动统计。'>" + (record.nextFollowupDone ? "撤销已跟进" : "标记已跟进") + "</button>";
      content.innerHTML =
        "<div class='detail-grid'>" +
        "<div class='field'><div class='field-label'>跟进类型</div><div class='field-value'><span class='tag " + CRMStore.typeClass(record.typeKey) + "'>" + record.typeLabel + "</span></div></div>" +
        "<div class='field'><div class='field-label'>跟进时间</div><div class='field-value'>" + CRMStore.formatDateTime(record.followupTime) + "</div></div>" +
        "<div class='field'><div class='field-label'>跟进人</div><div class='field-value'>" + CRMStore.formatPerson(record.person) + "</div></div>" +
        "<div class='field'><div class='field-label'>下次跟进时间</div><div class='field-value'>" + nextFollowupLabel + " " + doneBtn + "</div></div>" +
        "</div>" +
        "<div class='field-label'>跟进内容</div><div class='content-box'>" + contentOrDefault(record.content) + "</div>" +
        "<div class='meta-line'>创建时间：" + CRMStore.formatDateTime(record.createdAt) + " ｜ 更新时间：" + CRMStore.formatDateTime(record.updatedAt) + "</div>";
      editBtn.classList.remove("hidden");
      delBtn.classList.remove("hidden");
      saveBtn.classList.add("hidden");
      var doneNode = document.getElementById("markDoneBtn");
      if (doneNode) {
        doneNode.addEventListener("click", function () {
          var targetDone = !record.nextFollowupDone;
          CRMStore.markNextFollowupDone(activeHistoryId, targetDone);
          CRMStore.logEvent("followup_mark_done");
          renderLogs();
          renderHistoryList();
          renderHistoryDetail();
          renderTable();
          toast(targetDone ? "已标记为跟进完成" : "已撤销跟进完成", "success");
        });
      }
      return;
    }

    content.innerHTML =
      "<div class='form-row'><div class='form-label'>跟进类型 <span class='required'>*</span></div>" +
      "<select class='select' id='editType'>" +
      "<option value='电话沟通'>电话沟通</option>" +
      "<option value='线上会议'>线上会议</option>" +
      "<option value='上门拜访'>上门拜访</option>" +
      "<option value='微信沟通'>微信沟通</option>" +
      "<option value='邮件往来'>邮件往来</option>" +
      "<option value='自定义标签'>自定义标签</option>" +
      "</select><div class='error' id='editTypeError'></div></div>" +
      "<div class='form-row'><div class='form-label'>跟进时间 <span class='required'>*</span></div>" +
      "<input type='datetime-local' class='input' id='editFollowupTime' value='" + (record.followupTime || "") + "' />" +
      "<div class='error' id='editFollowupTimeError'></div></div>" +
      "<div class='form-row " + (record.typeKey === "自定义标签" ? "" : "hidden") + "' id='editCustomWrap'>" +
      "<div class='form-label'>自定义标签名称 <span class='required'>*</span></div>" +
      "<input class='input' id='editCustomLabel' value='" + (record.typeKey === "自定义标签" ? record.typeLabel : "") + "' />" +
      "<div class='error' id='editCustomLabelError'></div></div>" +
      "<div class='form-row'><div class='form-label'>跟进内容（选填）</div>" +
      "<textarea class='textarea' id='editContent'>" + (record.content || "") + "</textarea><div class='error' id='editContentError'></div></div>" +
      "<div class='form-row'><div class='form-label'>下次跟进时间</div><input type='datetime-local' class='input' id='editNextTime' value='" + (record.nextFollowupTime || "") + "' /></div>";

    document.getElementById("editType").value = record.typeKey;
    document.getElementById("editType").addEventListener("change", function () {
      document.getElementById("editCustomWrap").classList.toggle("hidden", document.getElementById("editType").value !== "自定义标签");
    });
    editBtn.classList.add("hidden");
    delBtn.classList.add("hidden");
    saveBtn.classList.remove("hidden");
  }

  function saveHistoryEdit() {
    var type = document.getElementById("editType").value;
    var followupTime = document.getElementById("editFollowupTime").value;
    var custom = document.getElementById("editCustomLabel").value.trim();
    var content = document.getElementById("editContent").value.trim();
    var next = document.getElementById("editNextTime").value;
    var ok = true;

    document.getElementById("editTypeError").textContent = "";
    document.getElementById("editFollowupTimeError").textContent = "";
    document.getElementById("editCustomLabelError").textContent = "";
    document.getElementById("editContentError").textContent = "";
    if (!type) { ok = false; document.getElementById("editTypeError").textContent = "请选择跟进类型"; }
    if (!followupTime) { ok = false; document.getElementById("editFollowupTimeError").textContent = "请选择跟进时间"; }
    if (type === "自定义标签" && !custom) { ok = false; document.getElementById("editCustomLabelError").textContent = "请输入自定义标签名称"; }
    if (!ok) return;

    CRMStore.updateRecord(activeHistoryId, {
      typeKey: type,
      typeLabel: type === "自定义标签" ? custom : type,
      followupTime: followupTime,
      content: content,
      nextFollowupTime: next
    });
    CRMStore.logEvent("followup_edit");
    renderLogs();
    historyEditing = false;
    renderHistoryDetail();
    renderHistoryList();
    renderTable();
    toast("记录修改成功", "success");
  }

  function bindCreateModal() {
    document.getElementById("typeKey").addEventListener("change", function () {
      var custom = document.getElementById("typeKey").value === "自定义标签";
      document.getElementById("customLabelRow").classList.toggle("hidden", !custom);
      updateFillCount(true);
    });

    ["typeLabelCustom", "followupTime", "nextFollowupTime"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", function () {
        updateFillCount(false);
      });
      document.getElementById(id).addEventListener("change", function () {
        updateFillCount(true);
      });
    });

    var contentInput = document.getElementById("content");
    function commitContentFillProgress() {
      var current = contentInput.value.trim();
      if (current !== createFillState.lastContentSnapshot) {
        CRMStore.logEvent("followup_content_blur");
        renderLogs();
        createFillState.lastContentSnapshot = current;
      }
      updateFillCount(true);
    }
    contentInput.addEventListener("input", function () {
      updateFillCount(false);
    });
    contentInput.addEventListener("blur", commitContentFillProgress);
    contentInput.addEventListener("mouseleave", commitContentFillProgress);

    document.getElementById("submitCreateBtn").addEventListener("click", function () {
      if (!validateForm()) return;
      var type = document.getElementById("typeKey").value;
      var custom = document.getElementById("typeLabelCustom").value.trim();
      CRMStore.createRecord({
        typeKey: type,
        typeLabel: type === "自定义标签" ? custom : type,
        followupTime: document.getElementById("followupTime").value,
        person: CRMStore.currentUser,
        content: document.getElementById("content").value.trim(),
        nextFollowupTime: document.getElementById("nextFollowupTime").value
      });
      CRMStore.logEvent("followup_submit_success");
      renderLogs();
      renderTable();
      if (document.getElementById("detailModal").classList.contains("show")) renderDetailModal();
      closeCreateModal();
      toast("新增跟进成功，列表已更新", "success");
    });
  }

  function bind() {
    setupHistoryDateInputs();

    document.getElementById("keyword").addEventListener("input", renderTable);
    document.getElementById("stageFilter").addEventListener("change", renderTable);
    document.getElementById("resetBtn").addEventListener("click", function () {
      document.getElementById("keyword").value = "";
      document.getElementById("stageFilter").value = "all";
      renderTable();
    });

    document.getElementById("toggleLogBtn").addEventListener("click", function () {
      setLogPanelVisible(!logPanelVisible());
      renderLogPanelToggle();
    });

    document.getElementById("resetMockBtn").addEventListener("click", function () {
      CRMStore.reset();
      CRMStore.logEvent("mock_data_reset");
      renderLogs();
      renderTable();
      if (document.getElementById("detailModal").classList.contains("show")) renderDetailModal();
      if (document.getElementById("historyModal").classList.contains("show")) renderHistoryList();
      if (document.getElementById("historyDetailModal").classList.contains("show")) renderHistoryDetail();
      toast("Mock 数据已重置", "success");
    });

    document.getElementById("showIntroBtn").addEventListener("click", function () {
      document.getElementById("introModal").classList.add("show");
    });
    document.getElementById("openDetailDemoBtn").addEventListener("click", openDetailModal);
    document.getElementById("detailNewBtn").addEventListener("click", function () {
      openCreateModal();
    });
    document.getElementById("detailHistoryBtn").addEventListener("click", function () {
      openHistoryModal("", "all");
    });

    ["historyTypeFilter", "historyStartDate", "historyEndDate"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        if (id === "historyStartDate" || id === "historyEndDate") {
          normalizeHistoryDateRange(id);
        }
        historyVisibleCount = historyPageSize;
        renderHistoryList();
        refreshDateClearState();
      });
    });
    ["historyStartDate", "historyEndDate"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", refreshDateClearState);
    });
    document.getElementById("historyStartClearBtn").addEventListener("click", function () {
      document.getElementById("historyStartDate").value = "";
      document.getElementById("historyStartDate").dispatchEvent(new Event("change"));
    });
    document.getElementById("historyEndClearBtn").addEventListener("click", function () {
      document.getElementById("historyEndDate").value = "";
      document.getElementById("historyEndDate").dispatchEvent(new Event("change"));
    });
    document.getElementById("historyResetBtn").addEventListener("click", function () {
      document.getElementById("historyTypeFilter").value = "all";
      document.getElementById("historyStartDate").value = "";
      document.getElementById("historyEndDate").value = "";
      historyVisibleCount = historyPageSize;
      historyMode = "all";
      renderHistoryList();
      refreshDateClearState();
      CRMStore.logEvent("followup_filter_reset");
      renderLogs();
    });
    document.querySelector("#historyModal .modal-body").addEventListener("scroll", maybeLoadMoreHistory);
    document.getElementById("historyCreateBtn").addEventListener("click", function () {
      document.getElementById("historyModal").classList.remove("show");
      openCreateModal();
    });

    document.getElementById("historyEditBtn").addEventListener("click", function () {
      historyEditing = true;
      renderHistoryDetail();
    });
    document.getElementById("historySaveBtn").addEventListener("click", saveHistoryEdit);
    document.getElementById("historyDeleteBtn").addEventListener("click", function () {
      document.getElementById("historyDeleteModal").classList.add("show");
    });
    document.getElementById("historyConfirmDeleteBtn").addEventListener("click", function () {
      var ok = CRMStore.deleteRecord(activeHistoryId);
      document.getElementById("historyDeleteModal").classList.remove("show");
      document.getElementById("historyDetailModal").classList.remove("show");
      if (!ok) return;
      CRMStore.logEvent("followup_delete");
      renderLogs();
      renderHistoryList();
      renderTable();
      if (document.getElementById("detailModal").classList.contains("show")) renderDetailModal();
      toast("记录已删除", "success");
    });

    Array.prototype.forEach.call(document.querySelectorAll(".modal-close"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-close");
        if (id) document.getElementById(id).classList.remove("show");
      });
    });

    bindCreateModal();
  }

  if (localStorage.getItem(LOG_PREF_KEY) === null) setLogPanelVisible(false);
  initGlobalTooltip();
  bind();
  renderLogPanelToggle();
  renderTable();
  renderLogs();

  if (qs("openDetail") === "1") {
    openDetailModal();
  }
})();
