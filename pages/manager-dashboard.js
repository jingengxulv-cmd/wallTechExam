(function () {
  CRMStore.ensureData();

  var DASHBOARD_CONFIG = {
    totalCustomers: 3,
    riskInactiveDays: 14,
    effectiveContentMinLen: 20,
    onTimeGraceHours: 24,
    execWeightFollowup: 0.65,
    execWeightResponse: 0.35
  };

  var PERSON_ID_MAP = {
    "李明": "137894",
    "王婷": "246801",
    "周楠": "975310",
    "赵颖": "458219",
    "陈飞": "561472",
    "孙悦": "693587"
  };

  var CUSTOMER_POOL = [
    { id: "cus_001", name: "上海星澜智能科技有限公司" },
    { id: "cus_002", name: "杭州云桥数智科技有限公司" },
    { id: "cus_003", name: "南京启策企业服务有限公司" }
  ];

  // 仅用于管理者看板演示，扩充多员工统计样本。
  var EXTRA_DASHBOARD_RECORDS = [
    {
      id: "demo_mgr_001",
      customerId: "cus_002",
      typeKey: "电话沟通",
      followupTime: "2026-03-27T10:30",
      person: "王婷",
      content: "与客户 CTO 对齐数据接入进度，确认本周完成 UAT 环境连通测试并安排实施窗口。",
      nextFollowupTime: "2026-03-30T14:00",
      nextFollowupDone: true,
      createdAt: "2026-03-27T10:35",
      updatedAt: "2026-03-30T11:10"
    },
    {
      id: "demo_mgr_002",
      customerId: "cus_003",
      typeKey: "线上会议",
      followupTime: "2026-03-26T15:00",
      person: "周楠",
      content: "组织售前方案评审会，客户关注私有化部署、自动化触达与工单联动流程，约定补充行业案例。",
      nextFollowupTime: "2026-03-29T16:00",
      nextFollowupDone: false,
      createdAt: "2026-03-26T15:10",
      updatedAt: "2026-03-26T15:10"
    },
    {
      id: "demo_mgr_003",
      customerId: "cus_002",
      typeKey: "上门拜访",
      followupTime: "2026-03-24T13:30",
      person: "赵颖",
      content: "拜访客户总部，演示销售漏斗分析和经营看板，客户希望按事业部拆分看板权限。",
      nextFollowupTime: "2026-03-28T11:00",
      nextFollowupDone: true,
      createdAt: "2026-03-24T13:40",
      updatedAt: "2026-03-28T10:20"
    },
    {
      id: "demo_mgr_004",
      customerId: "cus_001",
      typeKey: "微信沟通",
      followupTime: "2026-03-23T09:40",
      person: "陈飞",
      content: "同步报价调整与实施边界，提醒客户法务确认补充条款，并约定下次合同修订会。",
      nextFollowupTime: "2026-03-25T18:00",
      nextFollowupDone: false,
      createdAt: "2026-03-23T09:50",
      updatedAt: "2026-03-23T09:50"
    },
    {
      id: "demo_mgr_005",
      customerId: "cus_003",
      typeKey: "邮件往来",
      followupTime: "2026-03-22T16:20",
      person: "孙悦",
      content: "发送完整实施计划（项目节奏、里程碑、风险预案）及常见问题答复文档。",
      nextFollowupTime: "2026-03-31T10:00",
      nextFollowupDone: false,
      createdAt: "2026-03-22T16:25",
      updatedAt: "2026-03-22T16:25"
    },
    {
      id: "demo_mgr_006",
      customerId: "cus_002",
      typeKey: "电话沟通",
      followupTime: "2026-03-21T11:15",
      person: "王婷",
      content: "确认采购流程节点和合同签署窗口，客户要求补充 SLA 响应时效说明。",
      nextFollowupTime: "2026-03-26T15:00",
      nextFollowupDone: true,
      createdAt: "2026-03-21T11:20",
      updatedAt: "2026-03-26T14:30"
    }
  ];

  var lastDashboardResult = null;

  function parseDate(value) {
    if (!value) return null;
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function now() {
    return new Date();
  }

  function formatPercent(numerator, denominator) {
    if (!denominator) return "0%";
    var value = (numerator / denominator) * 100;
    return (Math.round(value * 10) / 10).toFixed(1).replace(".0", "") + "%";
  }

  function formatDecimal(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "0";
    return (Math.round(value * 10) / 10).toFixed(1).replace(".0", "");
  }

  function formatDurationHours(hours) {
    if (hours === null || hours === undefined || Number.isNaN(hours)) return "--";
    var totalMinutes = Math.max(0, Math.round(hours * 60));
    var days = Math.floor(totalMinutes / (24 * 60));
    var remainingAfterDays = totalMinutes % (24 * 60);
    var wholeHours = Math.floor(remainingAfterDays / 60);
    var minutes = remainingAfterDays % 60;

    if (days > 0) {
      return days + "天" + wholeHours + "小时" + minutes + "分钟";
    }
    if (wholeHours > 0) {
      return wholeHours + "小时" + minutes + "分钟";
    }
    return minutes + "分钟";
  }

  function formatPersonLabel(name) {
    var person = name || "未知";
    var id = PERSON_ID_MAP[person] || "";
    return id ? (person + "（工号：" + id + "）") : person;
  }

  function formatRankPersonCell(name) {
    var person = name || "未知";
    var id = PERSON_ID_MAP[person] || "";
    if (!id) return person;
    return "<span class='person-name'>" + person + "</span><span class='person-id'>(" + id + ")</span>";
  }

  function getRangeBounds(rangeKey) {
    var end = now();
    var start = null;
    if (rangeKey === "7d") start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (rangeKey === "30d") start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (rangeKey === "month") start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { start: start, end: end };
  }

  function inRange(date, bounds) {
    if (!date) return false;
    if (bounds.start && date < bounds.start) return false;
    if (bounds.end && date > bounds.end) return false;
    return true;
  }

  function getCustomerId(record, fallbackCustomerId) {
    return record.customerId || fallbackCustomerId || "cus_001";
  }

  function isPlanned(record) {
    return !!record.nextFollowupTime;
  }

  function isOnTimeDone(record) {
    if (!record.nextFollowupTime || !record.nextFollowupDone) return false;
    var dueAt = parseDate(record.nextFollowupTime);
    var doneAt = parseDate(record.updatedAt);
    if (!dueAt || !doneAt) return false;
    var graceMs = DASHBOARD_CONFIG.onTimeGraceHours * 60 * 60 * 1000;
    return doneAt.getTime() <= dueAt.getTime() + graceMs;
  }

  function isOverdue(record, currentTime) {
    if (!record.nextFollowupTime || record.nextFollowupDone) return false;
    var dueAt = parseDate(record.nextFollowupTime);
    return !!dueAt && dueAt < currentTime;
  }

  function isPending(record, currentTime) {
    if (!record.nextFollowupTime || record.nextFollowupDone) return false;
    var dueAt = parseDate(record.nextFollowupTime);
    return !!dueAt && dueAt >= currentTime;
  }

  function isEffectiveContent(record) {
    return (record.content || "").trim().length >= DASHBOARD_CONFIG.effectiveContentMinLen;
  }

  function isCompleteRecord(record) {
    return !!(
      record.typeKey &&
      record.followupTime &&
      record.person &&
      (record.content || "").trim()
    );
  }

  function calculateAverageGapHours(records) {
    var times = records.map(function (record) {
      return parseDate(record.followupTime);
    }).filter(function (date) {
      return !!date;
    }).sort(function (a, b) {
      return a - b;
    });

    if (times.length < 2) {
      return { avgHours: null, gapCount: 0 };
    }

    var totalHours = 0;
    var gapCount = 0;
    for (var i = 1; i < times.length; i += 1) {
      totalHours += (times[i].getTime() - times[i - 1].getTime()) / (60 * 60 * 1000);
      gapCount += 1;
    }

    return {
      avgHours: gapCount ? (totalHours / gapCount) : null,
      gapCount: gapCount
    };
  }

  function groupBySales(records, fallbackCustomerId) {
    var groups = {};
    records.forEach(function (record) {
      var person = record.person || "未知";
      if (!groups[person]) {
        groups[person] = {
          person: person,
          records: [],
          touchedCustomers: {}
        };
      }
      groups[person].records.push(record);
      groups[person].touchedCustomers[getCustomerId(record, fallbackCustomerId)] = true;
    });
    return groups;
  }

  function toSalesStats(groupMap, currentTime, bounds) {
    return Object.keys(groupMap).map(function (person) {
      var group = groupMap[person];
      var records = group.records;
      var gapInfo = calculateAverageGapHours(records);

      var plannedInRange = records.filter(function (record) {
        if (!isPlanned(record)) return false;
        return inRange(parseDate(record.nextFollowupTime), bounds);
      });

      var onTimeDoneCount = plannedInRange.filter(isOnTimeDone).length;
      var overdueCount = plannedInRange.filter(function (record) {
        return isOverdue(record, currentTime);
      }).length;
      var effectiveCount = records.filter(isEffectiveContent).length;
      var completeCount = records.filter(isCompleteRecord).length;

      return {
        person: group.person,
        followupCount: records.length,
        plannedCount: plannedInRange.length,
        onTimeDoneCount: onTimeDoneCount,
        overdueCount: overdueCount,
        onTimeRate: plannedInRange.length ? onTimeDoneCount / plannedInRange.length : 0,
        overdueRate: plannedInRange.length ? overdueCount / plannedInRange.length : 0,
        avgResponseHours: gapInfo.avgHours,
        responseGapCount: gapInfo.gapCount,
        effectiveCount: effectiveCount,
        effectiveRate: records.length ? effectiveCount / records.length : 0,
        completeRate: records.length ? completeCount / records.length : 0,
        touchedCustomerCount: Object.keys(group.touchedCustomers).length,
        execScore: 0
      };
    });
  }

  function computeDashboard(rangeKey) {
    var data = CRMStore.getData();
    var fallbackCustomerId = data.customer ? data.customer.id : "cus_001";
    var currentTime = now();
    var bounds = getRangeBounds(rangeKey);

    var allRecords = CRMStore.sortedFollowups((data.followups || []).concat(EXTRA_DASHBOARD_RECORDS));
    var recordsInRange = allRecords.filter(function (record) {
      return inRange(parseDate(record.followupTime), bounds);
    });

    var plannedAll = allRecords.filter(isPlanned);
    var plannedInRange = plannedAll.filter(function (record) {
      return inRange(parseDate(record.nextFollowupTime), bounds);
    });

    var onTimeDoneCount = plannedInRange.filter(isOnTimeDone).length;
    var overdueCount = plannedInRange.filter(function (record) {
      return isOverdue(record, currentTime);
    }).length;
    var pendingPoolCount = plannedAll.filter(function (record) {
      return isPending(record, currentTime);
    }).length;

    var touchedCustomers = {};
    recordsInRange.forEach(function (record) {
      touchedCustomers[getCustomerId(record, fallbackCustomerId)] = true;
    });
    var touchedCount = Object.keys(touchedCustomers).length;
    var totalCustomers = Math.max(DASHBOARD_CONFIG.totalCustomers, touchedCount);
    var effectiveCount = recordsInRange.filter(isEffectiveContent).length;

    var salesStats = toSalesStats(groupBySales(recordsInRange, fallbackCustomerId), currentTime, bounds);

    var avgTouchedCustomers = 0;
    var teamAvgResponseHours = null;
    if (salesStats.length) {
      avgTouchedCustomers = salesStats.reduce(function (sum, item) {
        return sum + item.touchedCustomerCount;
      }, 0) / salesStats.length;

      var weightedGapHours = 0;
      var totalGapCount = 0;
      salesStats.forEach(function (item) {
        if (item.avgResponseHours !== null && item.responseGapCount > 0) {
          weightedGapHours += item.avgResponseHours * item.responseGapCount;
          totalGapCount += item.responseGapCount;
        }
      });
      if (totalGapCount > 0) {
        teamAvgResponseHours = weightedGapHours / totalGapCount;
      }
    }

    var maxFollowupCount = salesStats.reduce(function (maxValue, item) {
      return Math.max(maxValue, item.followupCount || 0);
    }, 0);

    var responseHoursList = salesStats.map(function (item) {
      return item.avgResponseHours;
    }).filter(function (value) {
      return value !== null && value !== undefined && !Number.isNaN(value);
    });

    var minResponseHours = responseHoursList.length ? Math.min.apply(null, responseHoursList) : null;
    var maxResponseHours = responseHoursList.length ? Math.max.apply(null, responseHoursList) : null;

    salesStats.forEach(function (item) {
      var countScore = maxFollowupCount > 0 ? (item.followupCount / maxFollowupCount) : 0;
      var responseScore = 0.5;
      if (item.avgResponseHours !== null && minResponseHours !== null && maxResponseHours !== null) {
        if (maxResponseHours === minResponseHours) {
          responseScore = 1;
        } else {
          responseScore = (maxResponseHours - item.avgResponseHours) / (maxResponseHours - minResponseHours);
        }
      }
      item.execScore = countScore * DASHBOARD_CONFIG.execWeightFollowup + responseScore * DASHBOARD_CONFIG.execWeightResponse;
    });

    var execRank = salesStats.slice().sort(function (a, b) {
      if (b.execScore !== a.execScore) return b.execScore - a.execScore;
      if (b.followupCount !== a.followupCount) return b.followupCount - a.followupCount;
      if (a.avgResponseHours === null && b.avgResponseHours !== null) return 1;
      if (a.avgResponseHours !== null && b.avgResponseHours === null) return -1;
      if (a.avgResponseHours !== null && b.avgResponseHours !== null && a.avgResponseHours !== b.avgResponseHours) {
        return a.avgResponseHours - b.avgResponseHours;
      }
      return b.touchedCustomerCount - a.touchedCustomerCount;
    });

    var qualityRank = salesStats.slice().sort(function (a, b) {
      if (b.effectiveRate !== a.effectiveRate) return b.effectiveRate - a.effectiveRate;
      if (b.completeRate !== a.completeRate) return b.completeRate - a.completeRate;
      return b.followupCount - a.followupCount;
    });

    var customerPool = CUSTOMER_POOL.slice();
    if (data.customer && !customerPool.some(function (item) { return item.id === data.customer.id; })) {
      customerPool.push({ id: data.customer.id, name: data.customer.name || data.customer.id });
    }

    var riskCustomers = customerPool.filter(function (customer) {
      var customerRecords = allRecords.filter(function (record) {
        return getCustomerId(record, fallbackCustomerId) === customer.id;
      });
      var latestFollowup = customerRecords.length ? parseDate(customerRecords[0].followupTime) : null;
      var inactiveRisk = !latestFollowup || (currentTime.getTime() - latestFollowup.getTime() > DASHBOARD_CONFIG.riskInactiveDays * 24 * 60 * 60 * 1000);
      var overdueRisk = customerRecords.some(function (record) {
        return isOverdue(record, currentTime);
      });
      return inactiveRisk || overdueRisk;
    }).length;

    var monthBounds = getRangeBounds("month");
    var teamMonthlyFollowups = allRecords.filter(function (record) {
      return inRange(parseDate(record.followupTime), monthBounds);
    }).length;

    return {
      cards: {
        teamMonthlyFollowups: teamMonthlyFollowups,
        coverageRate: formatPercent(touchedCount, totalCustomers),
        onTimeRate: formatPercent(onTimeDoneCount, plannedInRange.length),
        overdueRate: formatPercent(overdueCount, plannedInRange.length),
        avgResponseIntervalHours: teamAvgResponseHours,
        avgResponseInterval: formatDurationHours(teamAvgResponseHours),
        pendingPool: pendingPoolCount,
        effectiveContentRate: formatPercent(effectiveCount, recordsInRange.length),
        avgTouchedCustomers: formatDecimal(avgTouchedCustomers),
        riskCustomers: riskCustomers
      },
      execRank: execRank,
      qualityRank: qualityRank
    };
  }

  function renderCards(cards) {
    document.getElementById("metricTeamMonthly").textContent = String(cards.teamMonthlyFollowups);
    document.getElementById("metricCoverage").textContent = cards.coverageRate;
    document.getElementById("metricOnTime").textContent = cards.onTimeRate;
    document.getElementById("metricAvgResponse").textContent = cards.avgResponseInterval;
    document.getElementById("metricPending").textContent = String(cards.pendingPool);
    document.getElementById("metricEffectiveContent").textContent = cards.effectiveContentRate;
    document.getElementById("metricAvgTouched").textContent = String(cards.avgTouchedCustomers);
    document.getElementById("metricRiskCustomers").textContent = String(cards.riskCustomers);
    document.getElementById("updatedAtText").textContent = "更新时间：" + CRMStore.formatDateTime(CRMStore.nowLocal());
  }

  function renderRankTable(targetId, rows, mapper) {
    var tbody = document.getElementById(targetId);
    if (!rows.length) {
      tbody.innerHTML = "<tr><td colspan='5' class='empty-tip'>暂无数据</td></tr>";
      return;
    }

    var prevRank = 0;
    var prevKey = "";
    tbody.innerHTML = rows.map(function (item, index) {
      var row = mapper(item);
      var rankKey = row.rankKey || [row.followupCount, row.mainRate, row.subRate].join("|");
      var rankNum = rankKey === prevKey ? prevRank : (index + 1);
      prevRank = rankNum;
      prevKey = rankKey;
      return (
        "<tr>" +
          "<td class='rank-cell'>TOP " + rankNum + "</td>" +
          "<td class='name-cell'>" + formatRankPersonCell(item.person) + "</td>" +
          "<td class='num-cell'>" + row.followupCount + "</td>" +
          "<td class='num-cell'>" + row.mainRate + "</td>" +
          "<td class='num-cell'>" + row.subRate + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function buildAiSummaryHtml(result) {
    var cards = result.cards;
    var execTop = result.execRank[0] || null;
    var qualityTop = result.qualityRank[0] || null;
    var execTail = result.execRank[result.execRank.length - 1] || null;

    var topExecText = execTop
      ? (formatPersonLabel(execTop.person) + "，执行评分 " + formatDecimal(execTop.execScore * 100) + " 分（跟进 " + execTop.followupCount + " 条，平均响应间隔 " + formatDurationHours(execTop.avgResponseHours) + "）")
      : "暂无数据";

    var topQualityText = qualityTop
      ? (formatPersonLabel(qualityTop.person) + "，有效内容率 " + formatPercent(qualityTop.effectiveCount, qualityTop.followupCount))
      : "暂无数据";

    var riskFocusText = execTail
      ? (formatPersonLabel(execTail.person) + "，跟进 " + execTail.followupCount + " 条，平均响应间隔 " + formatDurationHours(execTail.avgResponseHours))
      : "暂无数据";

    var teamJudgement = "团队执行稳定";
    var avgHours = cards.avgResponseIntervalHours;
    var onTimeValue = Number((cards.onTimeRate || "0").replace("%", "")) || 0;

    if (avgHours !== null && avgHours > 96) {
      teamJudgement = "团队响应偏慢，建议强化节奏管理";
    }
    if (avgHours !== null && avgHours <= 48 && onTimeValue >= 70) {
      teamJudgement = "团队执行效率较好，可继续放大复用动作";
    }

    return (
      "<h4 class='ai-summary-title'>AI总结：销售跟进洞察（样例）</h4>" +
      "<p class='ai-summary-paragraph'>综合近期数据判断：<strong>" + escapeHtml(teamJudgement) + "</strong>。当前客户覆盖率为 <strong>" + escapeHtml(cards.coverageRate) + "</strong>，按时完成率 <strong>" + escapeHtml(cards.onTimeRate) + "</strong>，平均响应间隔 <strong>" + escapeHtml(cards.avgResponseInterval) + "</strong>。</p>" +
      "<p class='ai-summary-paragraph'><strong>重点观察</strong></p>" +
      "<ul class='ai-summary-list'>" +
      "<li>执行榜领先：<strong>" + escapeHtml(topExecText) + "</strong></li>" +
      "<li>质量榜领先：<strong>" + escapeHtml(topQualityText) + "</strong></li>" +
      "<li>节奏关注对象：<strong>" + escapeHtml(riskFocusText) + "</strong></li>" +
      "</ul>" +
      "<p class='ai-summary-paragraph'><strong>提示：</strong>本模块为前瞻演示，AI结论为样例文案，未调用真实模型。</p>"
    );
  }

  function runAiSummary() {
    var button = document.getElementById("openAiSummaryBtn");
    var summaryContent = document.getElementById("aiSummaryContent");
    var summaryTime = document.getElementById("aiSummaryTime");

    if (!lastDashboardResult) {
      renderDashboard();
    }

    button.disabled = true;
    button.classList.add("loading");
    button.textContent = "AI分析中...";
    summaryContent.innerHTML = "<div class='empty-tip'>正在生成管理者视角总结...</div>";

    setTimeout(function () {
      summaryContent.innerHTML = buildAiSummaryHtml(lastDashboardResult);
      summaryTime.textContent = "分析时间：" + CRMStore.formatDateTime(CRMStore.nowLocal());
      button.disabled = false;
      button.classList.remove("loading");
      button.textContent = "AI一键总结（前瞻）";
    }, 700);
  }

  function renderDashboard() {
    var range = document.getElementById("rangeFilter").value;
    var result = computeDashboard(range);
    lastDashboardResult = result;

    renderCards(result.cards);

    renderRankTable("execRankBody", result.execRank, function (item) {
      return {
        followupCount: item.followupCount,
        mainRate: formatDurationHours(item.avgResponseHours),
        subRate: formatDecimal(item.execScore * 100) + "分",
        rankKey: [
          item.execScore.toFixed(4),
          item.followupCount,
          item.avgResponseHours === null ? "NA" : item.avgResponseHours.toFixed(2)
        ].join("|")
      };
    });

    renderRankTable("qualityRankBody", result.qualityRank, function (item) {
      var mainRate = formatPercent(item.effectiveCount, item.followupCount);
      var completeRate = formatPercent(
        Math.round(item.completeRate * item.followupCount),
        item.followupCount
      );
      return {
        followupCount: item.followupCount,
        mainRate: mainRate,
        subRate: completeRate,
        rankKey: [item.followupCount, mainRate, completeRate].join("|")
      };
    });
  }

  function bindEvents() {
    document.getElementById("rangeFilter").addEventListener("change", renderDashboard);
    document.getElementById("refreshBtn").addEventListener("click", renderDashboard);
    document.getElementById("openAiSummaryBtn").addEventListener("click", runAiSummary);

    document.getElementById("openMetricNoteBtn").addEventListener("click", function () {
      document.getElementById("metricNoteModal").classList.add("show");
    });

    Array.prototype.forEach.call(document.querySelectorAll(".modal-close"), function (button) {
      button.addEventListener("click", function () {
        var closeTarget = button.getAttribute("data-close");
        if (closeTarget) {
          document.getElementById(closeTarget).classList.remove("show");
        }
      });
    });
  }

  bindEvents();
  renderDashboard();
})();
