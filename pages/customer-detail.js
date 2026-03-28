(function () {
  CRMStore.ensureData();

  var LOG_PREF_KEY = "crm_log_panel_visible";
  var historyPageSize = 4;
  var historyVisibleCount = historyPageSize;
  var historyCurrentList = [];
  var activeHistoryId = "";
  var historyEditing = false;
  var historyMode = "all";

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function toast(msg, type) {
    var wrap = document.getElementById("toastWrap");
    var item = document.createElement("div");
    item.className = "toast " + (type || "success");
    item.textContent = msg;
    wrap.appendChild(item);
    setTimeout(function () { item.remove(); }, 2200);
  }

  function logPanelVisible() {
    return localStorage.getItem(LOG_PREF_KEY) === "1";
  }

  function setLogPanelVisible(flag) {
    localStorage.setItem(LOG_PREF_KEY, flag ? "1" : "0");
  }

  function openModal(id) {
    document.getElementById(id).classList.add("show");
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove("show");
  }

  function renderLogPanelToggle() {
    var on = logPanelVisible();
    document.getElementById("eventPanel").classList.toggle("off", !on);
    document.getElementById("toggleLogBtn").textContent = "埋点日志：" + (on ? "开" : "关");
  }

  function renderEventLogs() {
    var logs = CRMStore.getLogs();
    var list = document.getElementById("eventList");
    list.innerHTML = logs.length
      ? logs.map(function (l) {
        return "<li><span class='event-time'>" + CRMStore.formatDateTime(l.time) + "</span>" + l.name + "</li>";
      }).join("")
      : "<li>暂无埋点事件</li>";
  }

  function renderStats() {
    var stats = CRMStore.getStats();
    document.getElementById("followupStats").innerHTML =
      "<div class='stat-card'><div class='stat-label'>累计跟进次数</div><div class='stat-value'>" + stats.total + "</div></div>" +
      "<div class='stat-card'><div class='stat-label'>最近 7 天跟进次数</div><div class='stat-value'>" + stats.sevenDays + "</div></div>" +
      "<div class='stat-card clickable' id='pendingStatCard'><div class='stat-label'>下次待跟进数</div><div class='stat-value'>" + stats.pending + "</div><div class='stat-tip'>点击查看待跟进事项</div></div>";
    document.getElementById("pendingStatCard").addEventListener("click", function () {
      openHistoryModal("", "pending");
    });
  }

  function renderCustomer() {
    var data = CRMStore.getData();
    var c = data.customer;
    var latest = CRMStore.getLatestRecord();
    document.getElementById("customerFields").innerHTML = [
      ["客户名称", c.name],
      ["所属行业", c.industry],
      ["客户阶段", c.stage],
      ["负责人", c.owner],
      ["联系方式", c.phone],
      ["最近跟进时间", latest ? CRMStore.formatDateTime(latest.followupTime) : "—"]
    ].map(function (item) {
      return "<div class='field'><div class='field-label'>" + item[0] + "</div><div class='field-value'>" + item[1] + "</div></div>";
    }).join("");
  }

  function truncate(str, len) {
    if (!str) return "";
    return str.length > len ? str.slice(0, len) + "..." : str;
  }

  function contentOrDefault(val) {
    var s = (val || "").trim();
    return s ? s : "跟进内容：待补充";
  }

  function renderLatest() {
    var wrap = document.getElementById("latestRecordWrap");
    var latest = CRMStore.getLatestRecord();
    if (!latest) {
      wrap.innerHTML =
        "<div class='empty'><h4>暂无跟进记录</h4><p>建议立即新增首条跟进，便于后续销售追踪。</p><button class='btn btn-primary' id='emptyCreateBtn'>新增跟进</button></div>";
      document.getElementById("emptyCreateBtn").addEventListener("click", openCreateModal);
      return;
    }
    wrap.innerHTML =
      "<div class='latest-card' id='latestCard'>" +
      "<div class='latest-top'><span class='tag " + CRMStore.typeClass(latest.typeKey) + "'>" + latest.typeLabel + "</span><span class='badge-latest'>最近跟进</span></div>" +
      "<div class='latest-meta'>跟进时间：" + CRMStore.formatDateTime(latest.followupTime) + " ｜ 跟进人：" + CRMStore.formatPerson(latest.person) + "</div>" +
      "<div class='latest-content'>" + truncate(contentOrDefault(latest.content), 110) + "</div>" +
      (latest.nextFollowupTime ? ("<div class='latest-meta'>下次跟进时间：" + CRMStore.formatDateTime(latest.nextFollowupTime) + (latest.nextFollowupDone ? "（已跟进）" : "") + "</div>") : "") +
      "</div>";

    document.getElementById("latestCard").addEventListener("click", function () {
      activeHistoryId = latest.id;
      historyEditing = false;
      renderHistoryDetail();
      openModal("historyDetailModal");
    });
  }

  function getHistoryFilters() {
    return {
      type: document.getElementById("historyTypeFilter").value,
      startDate: document.getElementById("historyStartDate").value,
      endDate: document.getElementById("historyEndDate").value
    };
  }

  function refreshDateClearState() {
    var startVal = document.getElementById("historyStartDate").value;
    var endVal = document.getElementById("historyEndDate").value;
    document.getElementById("historyStartClearBtn").classList.toggle("hidden", !startVal);
    document.getElementById("historyEndClearBtn").classList.toggle("hidden", !endVal);
  }

  function renderHistoryList() {
    var filters = getHistoryFilters();
    var list = CRMStore.filterRecords(filters);
    if (historyMode === "pending") {
      var now = new Date();
      list = list.filter(function (r) {
        return !!r.nextFollowupTime && !r.nextFollowupDone && new Date(r.nextFollowupTime) > now;
      });
    }
    historyCurrentList = list;
    var latest = CRMStore.getLatestRecord();
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
        var latestBadge = latest && latest.id === r.id ? "<span class='badge-latest'>最近跟进</span>" : "";
        return (
          "<div class='timeline-item'>" +
          "<div class='history-card' data-id='" + r.id + "'>" +
          "<div class='card-top'><div><span class='tag " + CRMStore.typeClass(r.typeKey) + "'>" + r.typeLabel + "</span> " + latestBadge + "</div><span>" + CRMStore.formatDateTime(r.followupTime) + "</span></div>" +
          "<div class='card-meta'>跟进人：" + CRMStore.formatPerson(r.person) + (r.nextFollowupTime ? (" ｜ 下次跟进：" + CRMStore.formatDateTime(r.nextFollowupTime) + (r.nextFollowupDone ? "（已跟进）" : "")) : "") + "</div>" +
          "<div class='card-content'>" + truncate(contentOrDefault(r.content), 95) + "</div>" +
          "</div>" +
          "</div>"
        );
      }).join("") +
      "</div>";

    Array.prototype.forEach.call(document.querySelectorAll(".history-card"), function (node) {
      node.addEventListener("click", function () {
        CRMStore.logEvent("followup_history_detail_click");
        renderEventLogs();
        activeHistoryId = node.getAttribute("data-id");
        historyEditing = false;
        renderHistoryDetail();
        openModal("historyDetailModal");
      });
    });

    moreBtn.style.display = "none";
    document.getElementById("historyCount").textContent = "共 " + list.length + " 条";
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
      closeModal("historyDetailModal");
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
        : "<button class='btn btn-outline' id='markDoneBtn'>" + (record.nextFollowupDone ? "撤销已跟进" : "标记已跟进") + "</button>";
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
          renderEventLogs();
          renderAllBase();
          renderHistoryList();
          renderHistoryDetail();
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
      "<div class='form-row " + (record.typeKey === "自定义标签" ? "" : "hidden") + "' id='editCustomWrap'>" +
      "<div class='form-label'>自定义标签名称 <span class='required'>*</span></div>" +
      "<input class='input' id='editCustomLabel' value='" + (record.typeKey === "自定义标签" ? record.typeLabel : "") + "' />" +
      "<div class='error' id='editCustomLabelError'></div></div>" +
      "<div class='form-row'><div class='form-label'>跟进内容 <span class='required'>*</span></div>" +
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
    var custom = document.getElementById("editCustomLabel").value.trim();
    var content = document.getElementById("editContent").value.trim();
    var next = document.getElementById("editNextTime").value;
    var ok = true;

    document.getElementById("editTypeError").textContent = "";
    document.getElementById("editCustomLabelError").textContent = "";
    document.getElementById("editContentError").textContent = "";

    if (!type) { ok = false; document.getElementById("editTypeError").textContent = "请选择跟进类型"; }
    if (type === "自定义标签" && !custom) { ok = false; document.getElementById("editCustomLabelError").textContent = "请输入自定义标签名称"; }
    if (!content) { ok = false; document.getElementById("editContentError").textContent = "请填写跟进内容"; }
    if (!ok) return;

    CRMStore.updateRecord(activeHistoryId, {
      typeKey: type,
      typeLabel: type === "自定义标签" ? custom : type,
      content: content,
      nextFollowupTime: next
    });
    CRMStore.logEvent("followup_edit");
    renderEventLogs();
    historyEditing = false;
    renderHistoryDetail();
    renderHistoryList();
    renderAllBase();
    toast("记录修改成功", "success");
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
      var node = document.getElementById(k + "Error");
      if (node) node.textContent = "";
    });
    updateFillCount();
  }

  function updateFillCount() {
    var type = document.getElementById("typeKey").value;
    var total = type === "自定义标签" ? 5 : 4;
    var done = 0;
    if (type) done++;
    if (type === "自定义标签" && document.getElementById("typeLabelCustom").value.trim()) done++;
    if (document.getElementById("followupTime").value) done++;
    if (document.getElementById("person").value) done++;
    if (document.getElementById("content").value.trim()) done++;
    document.getElementById("fillCount").textContent = done + " / " + total;
    CRMStore.logEvent("followup_form_fill_progress");
    renderEventLogs();
  }

  function validateCreate() {
    var ok = true;
    var type = document.getElementById("typeKey").value;
    var custom = document.getElementById("typeLabelCustom").value.trim();
    var time = document.getElementById("followupTime").value;
    ["typeKey", "typeLabelCustom", "followupTime", "content"].forEach(function (k) {
      var node = document.getElementById(k + "Error");
      if (node) node.textContent = "";
    });
    if (!type) { ok = false; document.getElementById("typeKeyError").textContent = "请选择跟进类型"; }
    if (type === "自定义标签" && !custom) { ok = false; document.getElementById("typeLabelCustomError").textContent = "请输入自定义标签名称"; }
    if (!time) { ok = false; document.getElementById("followupTimeError").textContent = "请选择跟进时间"; }
    return ok;
  }

  function openCreateModal() {
    CRMStore.logEvent("followup_create_click");
    CRMStore.logEvent("followup_form_view");
    renderEventLogs();
    resetCreateForm();
    openModal("createModal");
  }

  function submitCreate() {
    if (!validateCreate()) return;
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
    closeModal("createModal");
    renderAllBase();
    if (document.getElementById("historyModal").classList.contains("show")) renderHistoryList();
    toast("新增跟进成功", "success");
  }

  function openHistoryModal(openId, mode) {
    historyVisibleCount = historyPageSize;
    if (mode) historyMode = mode;
    else if (openId) historyMode = "all";
    else if (!openId) historyMode = "all";
    if (openId) {
      activeHistoryId = openId;
      historyEditing = false;
    }
    var tip = document.getElementById("historyModeTip");
    if (historyMode === "pending") {
      tip.classList.remove("hidden");
      tip.textContent = "当前展示：下次待跟进事项（下次跟进时间晚于当前时间）";
    } else {
      tip.classList.add("hidden");
      tip.textContent = "";
    }
    renderHistoryList();
    refreshDateClearState();
    openModal("historyModal");
    if (openId) {
      renderHistoryDetail();
      openModal("historyDetailModal");
    }
  }

  function bindEvents() {
    document.getElementById("toggleLogBtn").addEventListener("click", function () {
      setLogPanelVisible(!logPanelVisible());
      renderLogPanelToggle();
    });

    document.getElementById("showIntroBtn").addEventListener("click", function () {
      openModal("introModal");
    });

    document.getElementById("newBtn").addEventListener("click", openCreateModal);
    document.getElementById("detailBtn").addEventListener("click", function () {
      historyMode = "all";
      openHistoryModal();
    });

    document.getElementById("resetMockBtn").addEventListener("click", function () {
      CRMStore.reset();
      CRMStore.logEvent("mock_data_reset");
      renderAllBase();
      if (document.getElementById("historyModal").classList.contains("show")) renderHistoryList();
      toast("Mock 数据已重置", "success");
    });

    document.getElementById("typeKey").addEventListener("change", function () {
      var showCustom = document.getElementById("typeKey").value === "自定义标签";
      document.getElementById("customLabelRow").classList.toggle("hidden", !showCustom);
      updateFillCount();
    });
    ["typeLabelCustom", "followupTime", "content", "nextFollowupTime"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", updateFillCount);
      document.getElementById(id).addEventListener("change", updateFillCount);
    });
    document.getElementById("submitCreateBtn").addEventListener("click", submitCreate);

    ["historyTypeFilter", "historyStartDate", "historyEndDate"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
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
      document.getElementById("historyModeTip").classList.add("hidden");
      renderHistoryList();
      refreshDateClearState();
      CRMStore.logEvent("followup_filter_reset");
      renderEventLogs();
    });
    document.querySelector("#historyModal .modal-body").addEventListener("scroll", maybeLoadMoreHistory);
    document.getElementById("historyCreateBtn").addEventListener("click", function () {
      closeModal("historyModal");
      openCreateModal();
    });

    document.getElementById("historyEditBtn").addEventListener("click", function () {
      historyEditing = true;
      renderHistoryDetail();
    });
    document.getElementById("historySaveBtn").addEventListener("click", saveHistoryEdit);
    document.getElementById("historyDeleteBtn").addEventListener("click", function () {
      openModal("historyDeleteModal");
    });
    document.getElementById("historyConfirmDeleteBtn").addEventListener("click", function () {
      var ok = CRMStore.deleteRecord(activeHistoryId);
      closeModal("historyDeleteModal");
      closeModal("historyDetailModal");
      if (!ok) return;
      CRMStore.logEvent("followup_delete");
      renderEventLogs();
      renderHistoryList();
      renderAllBase();
      toast("记录已删除", "success");
    });

    Array.prototype.forEach.call(document.querySelectorAll(".modal-close"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-close");
        if (id) closeModal(id);
      });
    });
  }

  function renderAllBase() {
    renderStats();
    renderCustomer();
    renderLatest();
    renderEventLogs();
  }

  if (localStorage.getItem(LOG_PREF_KEY) === null) setLogPanelVisible(false);
  bindEvents();
  renderLogPanelToggle();
  renderAllBase();

  if (qs("openHistory") === "1") {
    openHistoryModal(qs("openId") || "");
  }
})();
