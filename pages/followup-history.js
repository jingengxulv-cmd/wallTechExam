(function () {
  CRMStore.ensureData();

  var LOG_PREF_KEY = "crm_log_panel_visible";
  var expanded = false;
  var baseCount = 4;
  var currentList = [];
  var activeDetailId = "";
  var detailEditing = false;

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

  function renderLogPanelToggle() {
    var on = logPanelVisible();
    document.getElementById("eventPanel").classList.toggle("off", !on);
    document.getElementById("toggleLogBtn").textContent = "埋点日志：" + (on ? "开" : "关");
  }

  function renderLogs() {
    var logs = CRMStore.getLogs();
    document.getElementById("eventList").innerHTML = logs.length
      ? logs.map(function (l) {
        return "<li><span class='event-time'>" + CRMStore.formatDateTime(l.time) + "</span>" + l.name + "</li>";
      }).join("")
      : "<li>暂无埋点事件</li>";
  }

  function truncate(str, len) {
    return str.length > len ? str.slice(0, len) + "..." : str;
  }

  function getFilters() {
    return {
      type: document.getElementById("typeFilter").value,
      startDate: document.getElementById("startDate").value,
      endDate: document.getElementById("endDate").value
    };
  }

  function renderHistory() {
    var filters = getFilters();
    var list = CRMStore.filterRecords(filters);
    currentList = list;
    var latest = CRMStore.getLatestRecord();
    var shown = expanded ? list : list.slice(0, baseCount);
    var wrap = document.getElementById("historyWrap");
    var moreBtn = document.getElementById("moreBtn");

    if (!list.length) {
      wrap.innerHTML =
        "<div class='empty'><h4>暂无匹配的跟进记录</h4><p>可尝试重置筛选，或立即新增一条跟进。</p><button class='btn btn-primary' id='emptyCreateBtn'>新增跟进</button></div>";
      moreBtn.style.display = "none";
      document.getElementById("emptyCreateBtn").addEventListener("click", openCreateModal);
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
          "<div class='card-meta'>跟进人：" + r.person + " ｜ 下次跟进：" + (r.nextFollowupTime ? CRMStore.formatDateTime(r.nextFollowupTime) : "未设置") + "</div>" +
          "<div class='card-content'>" + truncate(r.content, 95) + "</div>" +
          "</div></div>"
        );
      }).join("") +
      "</div>";

    Array.prototype.forEach.call(document.querySelectorAll(".history-card"), function (node) {
      node.addEventListener("click", function () {
        CRMStore.logEvent("followup_history_detail_click");
        activeDetailId = node.getAttribute("data-id");
        detailEditing = false;
        renderDetailModal();
        openModal("detailModal");
      });
    });

    if (list.length > baseCount) {
      moreBtn.style.display = "inline-block";
      moreBtn.textContent = expanded ? "收起" : "查看更多";
    } else {
      moreBtn.style.display = "none";
    }
  }

  function openModal(id) {
    document.getElementById(id).classList.add("show");
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove("show");
  }

  function resetCreateForm() {
    document.getElementById("typeKey").value = "";
    document.getElementById("typeLabelCustom").value = "";
    document.getElementById("followupTime").value = CRMStore.nowLocal();
    document.getElementById("person").value = CRMStore.currentUser;
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
    renderLogs();
  }

  function validateCreate() {
    var ok = true;
    var type = document.getElementById("typeKey").value;
    var custom = document.getElementById("typeLabelCustom").value.trim();
    var time = document.getElementById("followupTime").value;
    var content = document.getElementById("content").value.trim();

    ["typeKey", "typeLabelCustom", "followupTime", "content"].forEach(function (k) {
      var node = document.getElementById(k + "Error");
      if (node) node.textContent = "";
    });
    if (!type) { ok = false; document.getElementById("typeKeyError").textContent = "请选择跟进类型"; }
    if (type === "自定义标签" && !custom) { ok = false; document.getElementById("typeLabelCustomError").textContent = "请输入自定义标签名称"; }
    if (!time) { ok = false; document.getElementById("followupTimeError").textContent = "请选择跟进时间"; }
    if (!content) { ok = false; document.getElementById("contentError").textContent = "请填写跟进内容"; }
    return ok;
  }

  function openCreateModal() {
    CRMStore.logEvent("followup_create_click");
    CRMStore.logEvent("followup_form_view");
    renderLogs();
    resetCreateForm();
    openModal("createModal");
  }

  function renderDetailModal() {
    var record = CRMStore.getRecordById(activeDetailId);
    if (!record) {
      closeModal("detailModal");
      return;
    }
    var content = document.getElementById("detailContent");
    var saveBtn = document.getElementById("saveDetailBtn");
    var editBtn = document.getElementById("editDetailBtn");
    var delBtn = document.getElementById("deleteDetailBtn");

    if (!detailEditing) {
      content.innerHTML =
        "<div class='detail-grid'>" +
        "<div class='field'><div class='field-label'>跟进类型</div><div class='field-value'><span class='tag " + CRMStore.typeClass(record.typeKey) + "'>" + record.typeLabel + "</span></div></div>" +
        "<div class='field'><div class='field-label'>跟进时间</div><div class='field-value'>" + CRMStore.formatDateTime(record.followupTime) + "</div></div>" +
        "<div class='field'><div class='field-label'>跟进人</div><div class='field-value'>" + record.person + "</div></div>" +
        "<div class='field'><div class='field-label'>下次跟进时间</div><div class='field-value'>" + (record.nextFollowupTime ? CRMStore.formatDateTime(record.nextFollowupTime) : "未设置") + "</div></div>" +
        "</div>" +
        "<div class='field-label'>跟进内容</div><div class='content-box'>" + record.content + "</div>" +
        "<div class='meta-line'>创建时间：" + CRMStore.formatDateTime(record.createdAt) + " ｜ 更新时间：" + CRMStore.formatDateTime(record.updatedAt) + "</div>";
      saveBtn.classList.add("hidden");
      editBtn.classList.remove("hidden");
      delBtn.classList.remove("hidden");
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
      "<textarea class='textarea' id='editContent'>" + record.content + "</textarea><div class='error' id='editContentError'></div></div>" +
      "<div class='form-row'><div class='form-label'>下次跟进时间</div><input type='datetime-local' class='input' id='editNextTime' value='" + (record.nextFollowupTime || "") + "'/></div>";

    document.getElementById("editType").value = record.typeKey;
    document.getElementById("editType").addEventListener("change", function () {
      document.getElementById("editCustomWrap").classList.toggle("hidden", document.getElementById("editType").value !== "自定义标签");
    });

    saveBtn.classList.remove("hidden");
    editBtn.classList.add("hidden");
    delBtn.classList.add("hidden");
  }

  function saveDetailEdit() {
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

    CRMStore.updateRecord(activeDetailId, {
      typeKey: type,
      typeLabel: type === "自定义标签" ? custom : type,
      content: content,
      nextFollowupTime: next
    });
    CRMStore.logEvent("followup_edit");
    renderLogs();
    detailEditing = false;
    renderDetailModal();
    renderHistory();
    toast("记录修改成功", "success");
  }

  function bind() {
    ["typeFilter", "startDate", "endDate"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        expanded = false;
        renderHistory();
      });
    });

    document.getElementById("openCreateBtn").addEventListener("click", openCreateModal);
    document.getElementById("resetFilterBtn").addEventListener("click", function () {
      document.getElementById("typeFilter").value = "all";
      document.getElementById("startDate").value = "";
      document.getElementById("endDate").value = "";
      expanded = false;
      renderHistory();
      CRMStore.logEvent("followup_filter_reset");
      renderLogs();
    });
    document.getElementById("moreBtn").addEventListener("click", function () {
      if (currentList.length <= baseCount) return;
      expanded = !expanded;
      renderHistory();
    });

    document.getElementById("toggleLogBtn").addEventListener("click", function () {
      setLogPanelVisible(!logPanelVisible());
      renderLogPanelToggle();
    });

    document.getElementById("showIntroBtn").addEventListener("click", function () {
      openModal("introModal");
    });
    document.getElementById("closeIntroBtn").addEventListener("click", function () {
      closeModal("introModal");
    });
    document.getElementById("introModal").addEventListener("click", function (e) {
      if (e.target.id === "introModal") closeModal("introModal");
    });

    document.getElementById("typeKey").addEventListener("change", function () {
      var custom = document.getElementById("typeKey").value === "自定义标签";
      document.getElementById("customLabelRow").classList.toggle("hidden", !custom);
      updateFillCount();
    });
    ["typeLabelCustom", "followupTime", "content", "nextFollowupTime"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", updateFillCount);
      document.getElementById(id).addEventListener("change", updateFillCount);
    });
    document.getElementById("cancelCreateBtn").addEventListener("click", function () { closeModal("createModal"); });
    document.getElementById("createModal").addEventListener("click", function (e) {
      if (e.target.id === "createModal") closeModal("createModal");
    });
    document.getElementById("submitCreateBtn").addEventListener("click", function () {
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
      renderLogs();
      renderHistory();
      toast("新增跟进成功", "success");
    });

    document.getElementById("cancelDetailBtn").addEventListener("click", function () {
      closeModal("detailModal");
      detailEditing = false;
    });
    document.getElementById("detailModal").addEventListener("click", function (e) {
      if (e.target.id === "detailModal") closeModal("detailModal");
    });
    document.getElementById("editDetailBtn").addEventListener("click", function () {
      detailEditing = true;
      renderDetailModal();
    });
    document.getElementById("saveDetailBtn").addEventListener("click", saveDetailEdit);
    document.getElementById("deleteDetailBtn").addEventListener("click", function () {
      openModal("deleteModal");
    });

    document.getElementById("cancelDeleteBtn").addEventListener("click", function () {
      closeModal("deleteModal");
    });
    document.getElementById("deleteModal").addEventListener("click", function (e) {
      if (e.target.id === "deleteModal") closeModal("deleteModal");
    });
    document.getElementById("confirmDeleteBtn").addEventListener("click", function () {
      var ok = CRMStore.deleteRecord(activeDetailId);
      closeModal("deleteModal");
      closeModal("detailModal");
      if (!ok) return;
      CRMStore.logEvent("followup_delete");
      renderLogs();
      renderHistory();
      toast("记录已删除", "success");
    });
  }

  if (localStorage.getItem(LOG_PREF_KEY) === null) setLogPanelVisible(false);
  bind();
  renderLogPanelToggle();
  renderHistory();
  renderLogs();

  var openId = qs("openId");
  if (openId) {
    activeDetailId = openId;
    detailEditing = false;
    renderDetailModal();
    openModal("detailModal");
  }
})();
