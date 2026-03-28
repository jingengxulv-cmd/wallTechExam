(function () {
  CRMStore.ensureData();

  var recordId = "";
  var from = "detail";
  var editing = false;

  function query(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(message, type) {
    var wrap = document.getElementById("toastWrap");
    var item = document.createElement("div");
    item.className = "toast " + (type || "success");
    item.textContent = message;
    wrap.appendChild(item);
    setTimeout(function () { item.remove(); }, 2200);
  }

  function renderLogs() {
    var logs = CRMStore.getLogs();
    var list = document.getElementById("eventList");
    if (!logs.length) {
      list.innerHTML = "<li>暂无埋点事件</li>";
      return;
    }
    list.innerHTML = logs.map(function (l) {
      return "<li><span class='event-time'>" + CRMStore.formatDateTime(l.time) + "</span>" + escapeHtml(l.name) + "</li>";
    }).join("");
  }

  function backUrl(toastKey) {
    var page = "customer-detail.html";
    if (from === "history") page = "followup-history.html";
    if (from === "list") page = "customer-list.html";
    return "./" + page + (toastKey ? ("?toast=" + toastKey) : "");
  }

  function fieldRow(label, value) {
    return "<div class='field'><div class='field-label'>" + label + "</div><div class='field-value'>" + value + "</div></div>";
  }

  function renderView(record) {
    document.getElementById("detailWrap").innerHTML =
      "<div class='detail-head'>" +
      "<h3 class='detail-title'>记录信息</h3>" +
      "<div class='btn-row'>" +
      "<button class='btn btn-outline' id='editBtn'>编辑</button>" +
      "<button class='btn btn-danger' id='deleteBtn'>删除</button>" +
      "</div>" +
      "</div>" +
      "<div class='detail-content'>" +
      "<div class='detail-grid'>" +
      fieldRow("跟进类型", "<span class='tag " + CRMStore.typeClass(record.typeKey) + "'>" + escapeHtml(record.typeLabel) + "</span>") +
      fieldRow("跟进时间", CRMStore.formatDateTime(record.followupTime)) +
      fieldRow("跟进人", escapeHtml(record.person)) +
      fieldRow("下次跟进时间", record.nextFollowupTime ? CRMStore.formatDateTime(record.nextFollowupTime) : "未设置") +
      "</div>" +
      "<div class='field-label'>跟进内容</div>" +
      "<div class='content-box'>" + escapeHtml(record.content) + "</div>" +
      "<div class='meta-line'>创建时间：" + CRMStore.formatDateTime(record.createdAt) + " ｜ 更新时间：" + CRMStore.formatDateTime(record.updatedAt) + "</div>" +
      "<div class='debug-box'>模拟埋点事件：followup_edit / followup_delete / followup_history_detail_click</div>" +
      "</div>";

    document.getElementById("editBtn").addEventListener("click", function () {
      editing = true;
      render();
    });
    document.getElementById("deleteBtn").addEventListener("click", function () {
      document.getElementById("deleteModal").classList.add("show");
    });
  }

  function renderEdit(record) {
    document.getElementById("detailWrap").innerHTML =
      "<div class='detail-head'><h3 class='detail-title'>编辑跟进记录</h3></div>" +
      "<div class='detail-content'>" +
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
      "<input class='input' id='editCustomLabel' value='" + escapeHtml(record.typeKey === "自定义标签" ? record.typeLabel : "") + "' />" +
      "<div class='error' id='editCustomLabelError'></div></div>" +
      "<div class='form-row'><div class='form-label'>跟进内容 <span class='required'>*</span></div>" +
      "<textarea class='textarea' id='editContent'>" + escapeHtml(record.content) + "</textarea>" +
      "<div class='error' id='editContentError'></div></div>" +
      "<div class='form-row'><div class='form-label'>下次跟进时间</div>" +
      "<input type='datetime-local' class='input' id='editNextTime' value='" + escapeHtml(record.nextFollowupTime || "") + "' /></div>" +
      "<div class='footer-actions'><button class='btn btn-outline' id='cancelEditBtn'>取消</button><button class='btn btn-primary' id='saveEditBtn'>保存</button></div>" +
      "</div>";

    var typeEl = document.getElementById("editType");
    typeEl.value = record.typeKey;
    typeEl.addEventListener("change", function () {
      document.getElementById("editCustomWrap").classList.toggle("hidden", typeEl.value !== "自定义标签");
    });

    document.getElementById("cancelEditBtn").addEventListener("click", function () {
      editing = false;
      render();
    });

    document.getElementById("saveEditBtn").addEventListener("click", function () {
      var typeKey = typeEl.value;
      var customLabel = document.getElementById("editCustomLabel").value.trim();
      var content = document.getElementById("editContent").value.trim();
      var nextTime = document.getElementById("editNextTime").value;
      var valid = true;

      document.getElementById("editTypeError").textContent = "";
      document.getElementById("editCustomLabelError").textContent = "";
      document.getElementById("editContentError").textContent = "";

      if (!typeKey) {
        valid = false;
        document.getElementById("editTypeError").textContent = "请选择跟进类型";
      }
      if (typeKey === "自定义标签" && !customLabel) {
        valid = false;
        document.getElementById("editCustomLabelError").textContent = "请输入自定义标签名称";
      }
      if (!content) {
        valid = false;
        document.getElementById("editContentError").textContent = "请填写跟进内容";
      }
      if (!valid) return;

      CRMStore.updateRecord(recordId, {
        typeKey: typeKey,
        typeLabel: typeKey === "自定义标签" ? customLabel : typeKey,
        content: content,
        nextFollowupTime: nextTime
      });
      CRMStore.logEvent("followup_edit");
      renderLogs();
      toast("跟进记录已保存", "success");
      editing = false;
      setTimeout(function () {
        window.location.href = backUrl("editSuccess");
      }, 520);
    });
  }

  function renderEmpty() {
    document.getElementById("detailWrap").innerHTML =
      "<div class='empty'><h4>记录不存在或已删除</h4><p>请返回上一页继续操作。</p><a class='btn btn-primary' href='" + backUrl() + "'>返回上一页</a></div>";
  }

  function render() {
    var record = CRMStore.getRecordById(recordId);
    if (!record) {
      renderEmpty();
      return;
    }
    if (editing) renderEdit(record);
    else renderView(record);
  }

  function bind() {
    from = query("from") || "detail";
    var latest = CRMStore.getLatestRecord();
    recordId = query("id") || (latest ? latest.id : "");

    if (from === "history") CRMStore.logEvent("followup_history_detail_click");
    renderLogs();

    document.getElementById("backLink").setAttribute("href", backUrl());

    document.getElementById("showIntroBtn").addEventListener("click", function () {
      document.getElementById("introModal").classList.add("show");
    });
    document.getElementById("closeIntroBtn").addEventListener("click", function () {
      document.getElementById("introModal").classList.remove("show");
    });
    document.getElementById("introModal").addEventListener("click", function (e) {
      if (e.target.id === "introModal") document.getElementById("introModal").classList.remove("show");
    });

    document.getElementById("cancelDeleteBtn").addEventListener("click", function () {
      document.getElementById("deleteModal").classList.remove("show");
    });
    document.getElementById("deleteModal").addEventListener("click", function (e) {
      if (e.target.id === "deleteModal") document.getElementById("deleteModal").classList.remove("show");
    });
    document.getElementById("confirmDeleteBtn").addEventListener("click", function () {
      var deleted = CRMStore.deleteRecord(recordId);
      document.getElementById("deleteModal").classList.remove("show");
      if (!deleted) return;
      CRMStore.logEvent("followup_delete");
      renderLogs();
      toast("记录已删除", "success");
      setTimeout(function () {
        window.location.href = backUrl("deleteSuccess");
      }, 500);
    });
  }

  bind();
  render();
})();
