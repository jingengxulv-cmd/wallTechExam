(function () {
  var DATA_KEY = "crm_followup_data_v3";
  var LOG_KEY = "crm_followup_logs_v3";
  var CURRENT_USER = "李明";
  var EMPLOYEE_ID_MAP = {
    "李明": "137894",
    "王婷": "246801",
    "周楠": "975310"
  };

  function nowLocal() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    var hh = String(d.getHours()).padStart(2, "0");
    var mi = String(d.getMinutes()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd + "T" + hh + ":" + mi;
  }

  function parseDate(val) {
    if (!val) return new Date(0);
    return new Date(val);
  }

  function formatDateTime(val) {
    if (!val) return "—";
    return val.replace("T", " ");
  }

  function uid() {
    return "fu_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  }

  function formatPerson(personName) {
    var name = personName || "";
    var id = EMPLOYEE_ID_MAP[name];
    return id ? (name + "（工号：" + id + "）") : name;
  }

  function typeClass(typeKey) {
    switch (typeKey) {
      case "电话沟通": return "tag-phone";
      case "线上会议": return "tag-online";
      case "上门拜访": return "tag-visit";
      case "微信沟通": return "tag-wechat";
      case "邮件往来": return "tag-email";
      default: return "tag-custom";
    }
  }

  function initialData() {
    return {
      customer: {
        id: "cus_001",
        name: "上海星澜智能科技有限公司",
        industry: "企业服务 / AI SaaS",
        stage: "方案沟通",
        owner: "李明",
        phone: "138****8888"
      },
      followups: [
        {
          id: "fu_1001",
          typeKey: "电话沟通",
          typeLabel: "电话沟通",
          followupTime: "2026-03-25T15:20",
          person: "李明",
          content: "与客户 CTO 电话确认了数据接入安全方案，客户关注私有化部署与 SLA 响应时效，已约定补充一份标准服务条款清单。",
          nextFollowupTime: "2026-03-29T10:00",
          nextFollowupDone: false,
          createdAt: "2026-03-25T15:20",
          updatedAt: "2026-03-25T15:20"
        },
        {
          id: "fu_1002",
          typeKey: "线上会议",
          typeLabel: "线上会议",
          followupTime: "2026-03-21T10:00",
          person: "李明",
          content: "组织了售前方案评审会，客户运营负责人、IT 经理参加。重点讲解了线索评分、自动化触达与工单联动场景，客户希望看到同行业实施案例。",
          nextFollowupTime: "",
          nextFollowupDone: false,
          createdAt: "2026-03-21T10:00",
          updatedAt: "2026-03-21T10:00"
        },
        {
          id: "fu_1003",
          typeKey: "上门拜访",
          typeLabel: "上门拜访",
          followupTime: "2026-03-16T14:30",
          person: "李明",
          content: "现场拜访客户总部，演示销售漏斗分析和客户分层运营能力。客户表示如果报表可支持按事业部拆分，将更有助于总部管理。",
          nextFollowupTime: "2026-03-19T16:00",
          nextFollowupDone: false,
          createdAt: "2026-03-16T14:30",
          updatedAt: "2026-03-16T14:30"
        },
        {
          id: "fu_1004",
          typeKey: "微信沟通",
          typeLabel: "微信沟通",
          followupTime: "2026-03-12T18:40",
          person: "李明",
          content: "发送了本周报价调整说明和功能排期更新，客户回复希望在月底前完成合同法务条款核对。",
          nextFollowupTime: "",
          nextFollowupDone: false,
          createdAt: "2026-03-12T18:40",
          updatedAt: "2026-03-12T18:40"
        },
        {
          id: "fu_1005",
          typeKey: "邮件往来",
          typeLabel: "邮件往来",
          followupTime: "2026-03-08T09:20",
          person: "李明",
          content: "发送完整实施计划（项目节奏、里程碑、风险预案）与报价清单，并附上客户常见问题答复文档。",
          nextFollowupTime: "",
          nextFollowupDone: false,
          createdAt: "2026-03-08T09:20",
          updatedAt: "2026-03-08T09:20"
        },
        {
          id: "fu_1006",
          typeKey: "自定义标签",
          typeLabel: "法务沟通",
          followupTime: "2026-03-04T11:15",
          person: "李明",
          content: "与客户法务对接保密协议附件，对数据留存条款进行了逐条确认，待客户回传盖章版本。",
          nextFollowupTime: "2026-03-27T14:00",
          nextFollowupDone: false,
          createdAt: "2026-03-04T11:15",
          updatedAt: "2026-03-04T11:15"
        }
      ]
    };
  }

  function ensureData() {
    var raw = localStorage.getItem(DATA_KEY);
    if (!raw) {
      localStorage.setItem(DATA_KEY, JSON.stringify(initialData()));
    }
    if (!localStorage.getItem(LOG_KEY)) {
      localStorage.setItem(LOG_KEY, JSON.stringify([]));
    }
  }

  function getData() {
    ensureData();
    return JSON.parse(localStorage.getItem(DATA_KEY) || "{}");
  }

  function saveData(data) {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  }

  function sortedFollowups(list) {
    return list.slice().sort(function (a, b) {
      return parseDate(b.followupTime) - parseDate(a.followupTime);
    });
  }

  function getLatestRecord() {
    var data = getData();
    var sorted = sortedFollowups(data.followups || []);
    return sorted.length ? sorted[0] : null;
  }

  function getRecordById(id) {
    var data = getData();
    return (data.followups || []).find(function (r) { return r.id === id; }) || null;
  }

  function createRecord(payload) {
    var data = getData();
    var now = nowLocal();
    var item = {
      id: uid(),
      typeKey: payload.typeKey,
      typeLabel: payload.typeLabel,
      followupTime: payload.followupTime,
      person: payload.person || CURRENT_USER,
      content: payload.content,
      nextFollowupTime: payload.nextFollowupTime || "",
      nextFollowupDone: false,
      createdAt: now,
      updatedAt: now
    };
    data.followups.push(item);
    saveData(data);
    return item;
  }

  function updateRecord(id, payload) {
    var data = getData();
    var target = data.followups.find(function (r) { return r.id === id; });
    if (!target) return null;
    target.typeKey = payload.typeKey;
    target.typeLabel = payload.typeLabel;
    if (payload.followupTime) {
      target.followupTime = payload.followupTime;
    }
    target.content = payload.content;
    var oldNext = target.nextFollowupTime || "";
    target.nextFollowupTime = payload.nextFollowupTime || "";
    if (typeof payload.nextFollowupDone === "boolean") {
      target.nextFollowupDone = payload.nextFollowupDone;
    } else if (oldNext !== target.nextFollowupTime) {
      target.nextFollowupDone = false;
    } else if (typeof target.nextFollowupDone !== "boolean") {
      target.nextFollowupDone = false;
    }
    target.updatedAt = nowLocal();
    saveData(data);
    return target;
  }

  function markNextFollowupDone(id, done) {
    var data = getData();
    var target = data.followups.find(function (r) { return r.id === id; });
    if (!target) return null;
    if (!target.nextFollowupTime) return null;
    target.nextFollowupDone = typeof done === "boolean" ? done : true;
    target.updatedAt = nowLocal();
    saveData(data);
    return target;
  }

  function deleteRecord(id) {
    var data = getData();
    var before = data.followups.length;
    data.followups = data.followups.filter(function (r) { return r.id !== id; });
    saveData(data);
    return before !== data.followups.length;
  }

  function filterRecords(filters) {
    var data = getData();
    var list = data.followups || [];
    var result = list.filter(function (r) {
      var passType = !filters.type || filters.type === "all" || r.typeKey === filters.type;
      var date = parseDate(r.followupTime);
      var passStart = true;
      var passEnd = true;
      if (filters.startDate) {
        passStart = date >= new Date(filters.startDate + "T00:00");
      }
      if (filters.endDate) {
        passEnd = date <= new Date(filters.endDate + "T23:59");
      }
      return passType && passStart && passEnd;
    });
    return sortedFollowups(result);
  }

  function getStats() {
    var list = sortedFollowups(getData().followups || []);
    var total = list.length;
    var seven = 0;
    var pending = 0;
    var now = new Date();
    var sevenAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    list.forEach(function (r) {
      var f = parseDate(r.followupTime);
      if (f >= sevenAgo && f <= now) seven++;
      if (r.nextFollowupTime && !r.nextFollowupDone && parseDate(r.nextFollowupTime) > now) pending++;
    });
    return {
      total: total,
      sevenDays: seven,
      pending: pending
    };
  }

  function logEvent(name) {
    ensureData();
    var logs = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    logs.unshift({
      name: name,
      time: nowLocal()
    });
    logs = logs.slice(0, 40);
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  }

  function getLogs() {
    ensureData();
    return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  }

  function reset() {
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(LOG_KEY);
    ensureData();
  }

  window.CRMStore = {
    currentUser: CURRENT_USER,
    nowLocal: nowLocal,
    formatDateTime: formatDateTime,
    typeClass: typeClass,
    formatPerson: formatPerson,
    ensureData: ensureData,
    getData: getData,
    sortedFollowups: sortedFollowups,
    getLatestRecord: getLatestRecord,
    getRecordById: getRecordById,
    createRecord: createRecord,
    updateRecord: updateRecord,
    deleteRecord: deleteRecord,
    markNextFollowupDone: markNextFollowupDone,
    filterRecords: filterRecords,
    getStats: getStats,
    logEvent: logEvent,
    getLogs: getLogs,
    reset: reset
  };
})();
