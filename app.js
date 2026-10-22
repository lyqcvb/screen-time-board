(function () {
  "use strict";

  var STORAGE_KEY = "screen-time-board-data";
  var DAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  function loadAll() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function toMinutes(hhmm) {
    if (!hhmm || hhmm.indexOf(":") < 0) return null;
    var parts = hhmm.split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function toHHMM(mins) {
    if (mins == null) return "--:--";
    var m = ((mins % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60);
    var mm = m % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }

  function sleepMinutes(wake, sleep) {
    if (wake == null || sleep == null) return null;
    var diff = wake - sleep;
    if (diff <= 0) diff += 1440;
    return diff;
  }

  function todayISO() {
    var d = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd;
  }

  var state = {
    data: loadAll(),
    currentDate: todayISO()
  };

  var els = {
    dateInput: document.getElementById("dateInput"),
    prevDay: document.getElementById("prevDay"),
    nextDay: document.getElementById("nextDay"),
    todayBtn: document.getElementById("todayBtn"),
    form: document.getElementById("entryForm"),
    wakeTime: document.getElementById("wakeTime"),
    sleepTime: document.getElementById("sleepTime"),
    breakfast: document.getElementById("breakfast"),
    lunch: document.getElementById("lunch"),
    dinner: document.getElementById("dinner"),
    screen: document.getElementById("screen"),
    status: document.getElementById("status"),
    timeline: document.getElementById("timeline"),
    trendChart: document.getElementById("trendChart"),
    trendSummary: document.getElementById("trendSummary"),
    reportText: document.getElementById("reportText"),
    exportBtn: document.getElementById("exportBtn"),
    clearBtn: document.getElementById("clearBtn")
  };

  function setStatus(msg) {
    els.status.textContent = msg;
    if (msg) {
      window.clearTimeout(setStatus._t);
      setStatus._t = window.setTimeout(function () {
        els.status.textContent = "";
      }, 2600);
    }
  }

  function renderTimeline() {
    var rec = state.data[state.currentDate];
    els.timeline.innerHTML = "";
    if (!rec) {
      var hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "今天还没有记录，填写下方表单开始记录";
      els.timeline.appendChild(hint);
      return;
    }

    var wake = toMinutes(rec.wakeTime);
    var sleep = toMinutes(rec.sleepTime);

    function addBlock(startMin, endMin, type, title) {
      if (startMin == null) return;
      var segs = [];
      if (endMin == null) endMin = startMin + 30;
      if (endMin <= startMin) {
        segs.push([startMin, 1440]);
        segs.push([0, endMin]);
      } else {
        segs.push([startMin, endMin]);
      }
      segs.forEach(function (s) {
        var div = document.createElement("div");
        div.className = "tl-block " + type;
        div.style.left = (s[0] / 1440) * 100 + "%";
        div.style.width = ((s[1] - s[0]) / 1440) * 100 + "%";
        div.title = title + " " + toHHMM(s[0]) + " - " + toHHMM(s[1]);
        els.timeline.appendChild(div);
      });
    }

    if (sleep != null) addBlock(sleep, 1440, "sleep", "睡眠");
    if (wake != null) addBlock(0, wake, "sleep", "睡眠");

    addBlock(toMinutes(rec.breakfast), toMinutes(rec.breakfast) != null ? toMinutes(rec.breakfast) + 40 : null, "meal", "早餐");
    addBlock(toMinutes(rec.lunch), toMinutes(rec.lunch) != null ? toMinutes(rec.lunch) + 40 : null, "meal", "午餐");
    addBlock(toMinutes(rec.dinner), toMinutes(rec.dinner) != null ? toMinutes(rec.dinner) + 40 : null, "meal", "晚餐");

    if (rec.screenMinutes > 0 && wake != null && sleep != null) {
      var awake = sleepMinutes(wake, sleep);
      var start = wake;
      var width = Math.min(awake, rec.screenMinutes);
      addBlock(start, start + width, "screen", "屏幕时间");
    }
  }

  function fillForm() {
    var rec = state.data[state.currentDate] || {};
    els.wakeTime.value = rec.wakeTime || "";
    els.sleepTime.value = rec.sleepTime || "";
    els.breakfast.value = rec.breakfast || "";
    els.lunch.value = rec.lunch || "";
    els.dinner.value = rec.dinner || "";
    els.screen.value = rec.screenMinutes != null ? rec.screenMinutes : "";
    els.dateInput.value = state.currentDate;
  }

  function last7Days() {
    var out = [];
    var base = new Date(state.currentDate + "T00:00:00");
    for (var i = 6; i >= 0; i--) {
      var d = new Date(base.getTime());
      d.setDate(d.getDate() - i);
      var mm = d.getMonth() + 1;
      var dd = d.getDate();
      var key = d.getFullYear() + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd;
      out.push({
        key: key,
        date: d,
        rec: state.data[key] || null
      });
    }
    return out;
  }

  function renderTrend() {
    var days = last7Days();
    var svg = els.trendChart;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var W = 640, H = 240;
    var padL = 42, padR = 18, padT = 18, padB = 34;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    var NS = "http://www.w3.org/2000/svg";
    function mk(tag, attrs) {
      var el = document.createElementNS(NS, tag);
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
      }
      return el;
    }

    var maxScreen = 240;
    var tickVals = [0, 60, 120, 180, 240];
    tickVals.forEach(function (v) {
      var y = padT + plotH - (v / maxScreen) * plotH;
      svg.appendChild(mk("line", {
        x1: padL, y1: y, x2: W - padR, y2: y,
        stroke: "#e6ded2", "stroke-width": 1
      }));
      var t = mk("text", {
        x: padL - 8, y: y + 4,
        "text-anchor": "end", "font-size": "11", fill: "#9aa39e"
      });
      t.textContent = v;
      svg.appendChild(t);
    });

    var gap = plotW / 7;
    var barW = gap * 0.42;
    var points = [];

    days.forEach(function (d, i) {
      var x = padL + gap * i + gap / 2;
      var screenMin = d.rec && d.rec.screenMinutes != null ? d.rec.screenMinutes : 0;
      var capped = Math.min(screenMin, maxScreen);
      var h = (capped / maxScreen) * plotH;
      var y = padT + plotH - h;

      var rect = mk("rect", {
        x: x - barW / 2, y: y, width: barW, height: h,
        rx: 3, fill: "#6fae9f", opacity: d.rec ? 0.9 : 0.25
      });
      var tip = mk("title", {});
      tip.textContent = DAY_NAMES[d.date.getDay()] + " 屏幕 " + screenMin + " 分钟";
      rect.appendChild(tip);
      svg.appendChild(rect);

      if (d.rec && d.rec.wakeTime && d.rec.sleepTime) {
        var sm = sleepMinutes(toMinutes(d.rec.wakeTime), toMinutes(d.rec.sleepTime));
        points.push({ x: x, y: padT + plotH - Math.min(sm, 720) / 720 * plotH, v: sm });
      }

      var lab = mk("text", {
        x: x, y: H - 12, "text-anchor": "middle", "font-size": "11", fill: "#6b7671"
      });
      lab.textContent = DAY_NAMES[d.date.getDay()].replace("周", "");
      svg.appendChild(lab);
    });

    if (points.length > 1) {
      var dAttr = points
        .map(function (p, i) { return (i === 0 ? "M" : "L") + p.x + " " + p.y; })
        .join(" ");
      svg.appendChild(mk("path", {
        d: dAttr, fill: "none", stroke: "#3f7d70",
        "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round"
      }));
    }
    points.forEach(function (p) {
      var c = mk("circle", { cx: p.x, cy: p.y, r: 3.4, fill: "#fff", stroke: "#3f7d70", "stroke-width": 2 });
      var t = mk("title", {});
      t.textContent = "睡眠 " + (p.v / 60).toFixed(1) + " 小时";
      c.appendChild(t);
      svg.appendChild(c);
    });

    var lg1 = mk("rect", { x: padL, y: 2, width: 10, height: 10, rx: 2, fill: "#6fae9f" });
    svg.appendChild(lg1);
    var lt1 = mk("text", { x: padL + 15, y: 11, "font-size": "11", fill: "#6b7671" });
    lt1.textContent = "屏幕时间（分钟）";
    svg.appendChild(lt1);

    var lg2 = mk("line", { x1: padL + 165, y1: 7, x2: padL + 183, y2: 7, stroke: "#3f7d70", "stroke-width": 2.2 });
    svg.appendChild(lg2);
    var lt2 = mk("text", { x: padL + 189, y: 11, "font-size": "11", fill: "#6b7671" });
    lt2.textContent = "睡眠时长";
    svg.appendChild(lt2);

    var recs = days.filter(function (d) { return d.rec; });
    if (!recs.length) {
      els.trendSummary.textContent = "还没有可对比的数据，记录两三天后趋势就会显现。";
      return;
    }
    var screenVals = recs
      .map(function (d) { return d.rec.screenMinutes; })
      .filter(function (v) { return v != null; });
    var sleepVals = recs
      .map(function (d) { return sleepMinutes(toMinutes(d.rec.wakeTime), toMinutes(d.rec.sleepTime)); })
      .filter(function (v) { return v != null; });

    var parts = [];
    if (screenVals.length) {
      var avgS = Math.round(screenVals.reduce(function (a, b) { return a + b; }, 0) / screenVals.length);
      parts.push("屏幕日均 " + avgS + " 分钟");
    }
    if (sleepVals.length) {
      var avgSl = sleepVals.reduce(function (a, b) { return a + b; }, 0) / sleepVals.length / 60;
      parts.push("睡眠日均 " + avgSl.toFixed(1) + " 小时");
    }
    els.trendSummary.textContent = "近 7 天：" + parts.join(" · ");
  }

  function renderReport() {
    var days = last7Days();
    var recs = days.filter(function (d) { return d.rec; });
    if (!recs.length) {
      els.reportText.textContent = "暂无数据。先记录几天，再来生成周报。";
      return;
    }

    var lines = [];
    lines.push("【家庭作息周报】" + days[0].key + " ~ " + days[6].key);
    lines.push("");

    var screenVals = [];
    var sleepVals = [];
    var lateNights = 0;

    recs.forEach(function (d) {
      var r = d.rec;
      var sm = sleepMinutes(toMinutes(r.wakeTime), toMinutes(r.sleepTime));
      if (sm != null) sleepVals.push(sm);
      if (r.screenMinutes != null) screenVals.push(r.screenMinutes);
      if (r.sleepTime) {
        var s = toMinutes(r.sleepTime);
        if (s >= 22 * 60 + 30 || s < 6 * 60) lateNights++;
      }

      lines.push(
        DAY_NAMES[d.date.getDay()] + " " + d.key.slice(5) +
        "｜起床 " + (r.wakeTime || "--:--") +
        "｜就寝 " + (r.sleepTime || "--:--") +
        "｜睡眠 " + (sm != null ? (sm / 60).toFixed(1) + "h" : "--") +
        "｜屏幕 " + (r.screenMinutes != null ? r.screenMinutes + "min" : "--")
      );
    });

    lines.push("");
    if (screenVals.length) {
      var avg = Math.round(screenVals.reduce(function (a, b) { return a + b; }, 0) / screenVals.length);
      var max = Math.max.apply(null, screenVals);
      var min = Math.min.apply(null, screenVals);
      lines.push("屏幕时间：日均 " + avg + " 分钟，最高 " + max + "，最低 " + min + "。");
    }
    if (sleepVals.length) {
      var avgH = sleepVals.reduce(function (a, b) { return a + b; }, 0) / sleepVals.length / 60;
      lines.push("睡眠时长：日均 " + avgH.toFixed(1) + " 小时。");
    }
    lines.push("晚睡天数（22:30 后就寝）：" + lateNights + " / " + recs.length + "。");
    lines.push("");
    lines.push("下周可以试试：把最晚的一天提前 20 分钟，只改一件事。");

    els.reportText.textContent = lines.join("\n");
  }

  function renderAll() {
    fillForm();
    renderTimeline();
    renderTrend();
    renderReport();
  }

  els.form.addEventListener("submit", function (e) {
    e.preventDefault();
    var screenRaw = els.screen.value.trim();
    var rec = {
      wakeTime: els.wakeTime.value,
      sleepTime: els.sleepTime.value,
      breakfast: els.breakfast.value,
      lunch: els.lunch.value,
      dinner: els.dinner.value,
      screenMinutes: screenRaw === "" ? null : parseInt(screenRaw, 10)
    };
    state.data[state.currentDate] = rec;
    saveAll(state.data);
    setStatus("已保存 " + state.currentDate + " 的记录");
    renderAll();
  });

  els.dateInput.addEventListener("change", function () {
    if (els.dateInput.value) {
      state.currentDate = els.dateInput.value;
      renderAll();
    }
  });

  function shiftDay(delta) {
    var d = new Date(state.currentDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    state.currentDate = d.getFullYear() + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd;
    renderAll();
  }

  els.prevDay.addEventListener("click", function () { shiftDay(-1); });
  els.nextDay.addEventListener("click", function () { shiftDay(1); });
  els.todayBtn.addEventListener("click", function () {
    state.currentDate = todayISO();
    renderAll();
  });

  els.exportBtn.addEventListener("click", function () {
    var text = els.reportText.textContent || "";
    if (!text || text.indexOf("暂无数据") === 0) {
      setStatus("还没有可导出的周报");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { setStatus("周报已复制到剪贴板"); },
        function () { fallbackCopy(text); }
      );
    } else {
      fallbackCopy(text);
    }
  });

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      setStatus("周报已复制到剪贴板");
    } catch (e) {
      setStatus("复制失败，请手动选择文本");
    }
    document.body.removeChild(ta);
  }

  els.clearBtn.addEventListener("click", function () {
    if (!window.confirm("确定清空所有本地记录？此操作不可撤销。")) return;
    state.data = {};
    saveAll(state.data);
    setStatus("已清空全部数据");
    renderAll();
  });

  renderAll();
})();
