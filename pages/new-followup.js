(function () {
  CRMStore.ensureData();
  CRMStore.logEvent("followup_form_view");

  var fields = {
    typeKey: document.getElementById("typeKey"),
    typeLabelCustom: document.getElementById("typeLabelCustom"),
    followupTime: document.getElementById("followupTime"),
    person: document.getElementById("person"),
    content: document.getElementById("content"),
    nextFollowupTime: document.getElementById("nextFollowupTime")
  };

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

  function setError(name, text) {
    var node = document.getElementById(name + "Error");
    if (node) node.textContent = text || "";
  }

  function renderLogs() {
    var logs = CRMStore.getLogs();
    var list = document.getElementById("eventList");
    list.innerHTML = logs.length ? logs.map(function (l) {
      return "<li><span class='event-time'>" + CRMStore.formatDateTime(l.time) + "</span>" + l.name + "</li>";
    }).join("") : "<li>暂无埋点事件</li>";
  }

  function calcFillCount() {
    var total = fields.typeKey.value === "自定义标签" ? 5 : 4;
    var done = 0;
    if (fields.typeKey.value) done++;
    if (fields.typeKey.value === "自定义标签" && fields.typeLabelCustom.value.trim()) done++;
    if (fields.followupTime.value) done++;
    if (fields.person.value) done++;
    if (fields.content.value.trim()) done++;
    document.getElementById("fillCount").textContent = "已填写 " + done + " / " + total + " 项";
    CRMStore.logEvent("followup_form_fill_progress");
    renderLogs();
  }

  function validate() {
    var ok = true;
    setError("typeKey", "");
    setError("typeLabelCustom", "");
    setError("followupTime", "");
    setError("content", "");

    if (!fields.typeKey.value) {
      setError("typeKey", "请选择跟进类型");
      ok = false;
    }
    if (fields.typeKey.value === "自定义标签" && !fields.typeLabelCustom.value.trim()) {
      setError("typeLabelCustom", "请输入自定义标签名称");
      ok = false;
    }
    if (!fields.followupTime.value) {
      setError("followupTime", "请选择跟进时间");
      ok = false;
    }
    if (!fields.content.value.trim()) {
      setError("content", "请填写跟进内容");
      ok = false;
    }
    return ok;
  }

  function bind() {
    fields.person.value = CRMStore.currentUser;
    fields.followupTime.value = CRMStore.nowLocal();

    document.getElementById("showIntroBtn").addEventListener("click", function () {
      document.getElementById("introModal").classList.add("show");
    });
    document.getElementById("closeIntroBtn").addEventListener("click", function () {
      document.getElementById("introModal").classList.remove("show");
    });
    document.getElementById("introModal").addEventListener("click", function (e) {
      if (e.target.id === "introModal") document.getElementById("introModal").classList.remove("show");
    });

    fields.typeKey.addEventListener("change", function () {
      var isCustom = fields.typeKey.value === "自定义标签";
      document.getElementById("customLabelRow").classList.toggle("hidden", !isCustom);
      calcFillCount();
    });

    ["typeLabelCustom", "followupTime", "content", "nextFollowupTime"].forEach(function (name) {
      fields[name].addEventListener("input", calcFillCount);
      fields[name].addEventListener("change", calcFillCount);
    });

    document.getElementById("submitBtn").addEventListener("click", function () {
      CRMStore.logEvent("followup_create_click");
      if (!validate()) {
        toast("请先修正表单错误后再提交", "success");
        renderLogs();
        return;
      }
      var payload = {
        typeKey: fields.typeKey.value,
        typeLabel: fields.typeKey.value === "自定义标签" ? fields.typeLabelCustom.value.trim() : fields.typeKey.value,
        followupTime: fields.followupTime.value,
        person: fields.person.value,
        content: fields.content.value.trim(),
        nextFollowupTime: fields.nextFollowupTime.value
      };
      CRMStore.createRecord(payload);
      CRMStore.logEvent("followup_submit_success");
      renderLogs();
      toast("跟进记录创建成功", "success");

      var from = qs("from") === "history" ? "followup-history.html" : "customer-detail.html";
      setTimeout(function () {
        window.location.href = "./" + from + "?toast=createSuccess";
      }, 700);
    });
  }

  bind();
  calcFillCount();
  renderLogs();
})();
