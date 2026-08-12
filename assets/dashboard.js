/*
  강북구 아파트 매매 대시보드 — 로직
  데이터: window.DASHBOARD_DATA (data/dashboard.js, build_data.py 산출물)
  차트: 외부 라이브러리 없이 인라인 SVG로 직접 그림.

  핵심 규칙 (PRD 참조):
  - 예산 매수 가능 여부는 "개별 거래" 기준. 중위값으로 걸러선 안 된다 (§2.1).
  - S2는 93개 단지 전부가 후보(탐색), 중위 평당가만 n<10 경고 배지(랭킹) — §2.3.
  - 도시 전체 평균과의 비교 문구는 절대 쓰지 않는다(구성효과로 오도될 수 있음). 상대 위치는 순위(n위/25)로만 (§2.2).
  - 상승/하락은 화살표(▲/▼) + 부호로만 표기, 색으로 구분하지 않는다 (§5.4).
*/
(function () {
  "use strict";

  var DATA = window.DASHBOARD_DATA;
  var SVG_NS = "http://www.w3.org/2000/svg";

  var DONG_OPTIONS = ["전체", "미아동", "번동", "수유동", "우이동"];
  var AREA_OPTIONS = ["전체", "소형", "중형", "대형"];

  var BUDGET_MIN = 10000;
  var BUDGET_MAX = 130000;
  var BUDGET_STEP = 1000;
  var BUDGET_DEFAULT = 70000;

  var state = {
    budget: BUDGET_DEFAULT,
    dong: "전체",
    area: "전체",
    sortKey: "dealsAtBudget",
    sortDir: "desc",
  };

  // ---------- formatting helpers ----------
  function fmtInt(n) {
    if (n === null || n === undefined) return "-";
    return Math.round(n).toLocaleString("ko-KR");
  }

  function fmtSigned(n, digits) {
    if (n === null || n === undefined) return "-";
    var d = digits === undefined ? 2 : digits;
    var arrow = n > 0 ? "▲" : n < 0 ? "▼" : "-";
    var sign = n > 0 ? "+" : "";
    return arrow + " " + sign + n.toFixed(d) + "%";
  }

  // 만원 단위 금액을 "N억" / "N억 M,MMM만원"으로 표기
  function fmtEok(manwon) {
    var eok = Math.floor(manwon / 10000);
    var rem = Math.round(manwon % 10000);
    if (rem === 0) return eok + "억원";
    return eok + "억 " + rem.toLocaleString("ko-KR") + "만원";
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") e.className = attrs[k];
        else if (k === "html") e.innerHTML = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) e.appendChild(c);
    });
    return e;
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        e.setAttribute(k, attrs[k]);
      });
    }
    return e;
  }

  function median(arr) {
    if (!arr.length) return null;
    var sorted = arr.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
    return sorted[mid];
  }

  // ---------- deal decoding ----------
  // dealFields: ["c","m","area","floor","price","ppp"]
  var F_C = 0,
    F_M = 1,
    F_AREA = 2,
    F_FLOOR = 3,
    F_PRICE = 4,
    F_PPP = 5;

  function dongOfComplex(c) {
    return DATA.complexList[c].dong;
  }

  function areaBandOf(area) {
    if (area <= 60) return "소형";
    if (area <= 85) return "중형";
    return "대형";
  }

  // 동/면적대 필터만 적용한 거래 목록 (예산과 무관, S1·S2·S0의 "전체 후보" 계산에 사용)
  function getScopedDeals() {
    var dong = state.dong;
    var area = state.area;
    if (dong === "전체" && area === "전체") return DATA.deals;
    return DATA.deals.filter(function (d) {
      if (dong !== "전체" && dongOfComplex(d[F_C]) !== dong) return false;
      if (area !== "전체" && areaBandOf(d[F_AREA]) !== area) return false;
      return true;
    });
  }

  function uniqueComplexes(deals) {
    var s = {};
    deals.forEach(function (d) {
      s[d[F_C]] = true;
    });
    return Object.keys(s).map(Number);
  }

  // =====================================================================
  // S0 — 예산 입력 + 즉답
  // =====================================================================
  function budgetValueText(v) {
    return fmtEok(v);
  }

  function initBudgetControl() {
    var range = document.getElementById("budget-range");
    var num = document.getElementById("budget-number");

    range.min = BUDGET_MIN;
    range.max = BUDGET_MAX;
    range.step = BUDGET_STEP;
    range.value = state.budget;
    range.setAttribute("aria-valuetext", budgetValueText(state.budget));

    num.min = BUDGET_MIN;
    num.max = BUDGET_MAX;
    num.step = BUDGET_STEP;
    num.value = state.budget;

    var initialPct = ((state.budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
    range.style.background =
      "linear-gradient(to right, var(--primary-normal) 0%, var(--primary-normal) " +
      initialPct +
      "%, var(--fill-normal) " +
      initialPct +
      "%, var(--fill-normal) 100%)";

    function updateTrackFill(v) {
      var pct = ((v - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
      range.style.background =
        "linear-gradient(to right, var(--primary-normal) 0%, var(--primary-normal) " +
        pct +
        "%, var(--fill-normal) " +
        pct +
        "%, var(--fill-normal) 100%)";
    }

    function apply(v) {
      v = Math.round(v / BUDGET_STEP) * BUDGET_STEP;
      if (v < BUDGET_MIN) v = BUDGET_MIN;
      if (v > BUDGET_MAX) v = BUDGET_MAX;
      state.budget = v;
      range.value = v;
      num.value = v;
      range.setAttribute("aria-valuetext", budgetValueText(v));
      updateTrackFill(v);
      renderBudgetDependent();
    }

    range.addEventListener("input", function () {
      apply(Number(range.value));
    });
    num.addEventListener("input", function () {
      var v = Number(num.value);
      if (isNaN(v)) return;
      apply(v);
    });
    num.addEventListener("blur", function () {
      apply(Number(num.value) || state.budget);
    });
  }

  function renderHero() {
    var scoped = getScopedDeals();
    var inBudget = scoped.filter(function (d) {
      return d[F_PRICE] <= state.budget;
    });

    var heroEmpty = document.getElementById("hero-empty");
    var kpiGrid = document.getElementById("kpi-grid");

    var scopeLabel =
      (state.dong !== "전체" ? state.dong : "강북구") +
      (state.area !== "전체" ? " · " + state.area : "");

    if (scoped.length === 0) {
      document.getElementById("hero-headline").textContent = "선택한 조건에 해당하는 거래가 없습니다";
      document.getElementById("hero-sub").textContent = scopeLabel + " · 동/면적대 필터를 조정해보세요";
      kpiGrid.style.display = "none";
      heroEmpty.style.display = "block";
      heroEmpty.textContent = "해당 조건(" + scopeLabel + ")의 거래 데이터가 없습니다.";
      return;
    }

    if (inBudget.length === 0) {
      var minInScope = Math.min.apply(
        null,
        scoped.map(function (d) {
          return d[F_PRICE];
        })
      );
      document.getElementById("hero-headline").textContent =
        fmtEok(state.budget) + "으로는 " + scopeLabel + "에서 살 수 있는 단지가 없습니다";
      document.getElementById("hero-sub").textContent =
        scopeLabel + " 최저 거래가는 " + fmtInt(minInScope) + "만원입니다. 예산을 올려보세요.";
      kpiGrid.style.display = "none";
      heroEmpty.style.display = "block";
      heroEmpty.textContent =
        "예산 이하 거래가 0건입니다 (" + scopeLabel + " 최저 거래가 " + fmtInt(minInScope) + "만원).";
      return;
    }

    heroEmpty.style.display = "none";
    kpiGrid.style.display = "";

    var complexesScoped = uniqueComplexes(scoped);
    var complexesBudget = uniqueComplexes(inBudget);
    var pct = (inBudget.length / scoped.length) * 100;

    document.getElementById("hero-headline").textContent =
      fmtEok(state.budget) +
      "이면 " +
      scopeLabel +
      " 아파트 거래의 " +
      pct.toFixed(1) +
      "%, " +
      complexesBudget.length +
      "개 단지에 닿습니다";
    document.getElementById("hero-sub").textContent =
      DATA.meta.period + " · " + scopeLabel + " 매매 " + fmtInt(scoped.length) + "건 기준";

    var maxArea = Math.max.apply(
      null,
      inBudget.map(function (d) {
        return d[F_AREA];
      })
    );

    var countByComplex = {};
    inBudget.forEach(function (d) {
      countByComplex[d[F_C]] = (countByComplex[d[F_C]] || 0) + 1;
    });
    var topComplexIdx = null;
    var topCount = -1;
    Object.keys(countByComplex).forEach(function (k) {
      if (countByComplex[k] > topCount) {
        topCount = countByComplex[k];
        topComplexIdx = Number(k);
      }
    });
    var topComplexName = topComplexIdx !== null ? DATA.complexList[topComplexIdx].name : "-";

    kpiGrid.innerHTML = "";
    var cards = [
      {
        label: "매수 가능 단지",
        value: fmtInt(complexesBudget.length) + "개",
        sub: "/ " + fmtInt(complexesScoped.length) + "개 단지",
      },
      {
        label: "예산 이하 거래",
        value: fmtInt(inBudget.length) + "건",
        sub: pct.toFixed(1) + "%",
      },
      {
        label: "예산 내 최대 면적",
        value: fmtInt(maxArea) + "㎡",
        sub: "전용면적 기준",
      },
      {
        label: "선택지가 가장 많은 단지",
        value: topComplexName,
        sub: fmtInt(topCount) + "건",
      },
    ];

    cards.forEach(function (c) {
      kpiGrid.appendChild(
        el("div", { class: "kpi-card" }, [
          el("span", { class: "caption1", text: c.label }),
          el("span", { class: "kpi-value", text: c.value }),
          el("div", { class: "kpi-sub" }, [el("span", { class: "rank-tag", text: c.sub })]),
        ])
      );
    });
  }

  // =====================================================================
  // S1 — 가격 분포 히스토그램 + 예산선
  // =====================================================================
  function renderHistogram() {
    var scoped = getScopedDeals();
    var container = document.getElementById("hist-chart");
    var caption = document.getElementById("hist-caption");
    container.innerHTML = "";

    if (scoped.length === 0) {
      container.appendChild(el("div", { class: "empty-state", text: "해당 조건의 거래 데이터가 없습니다." }));
      caption.textContent = "";
      return;
    }

    var prices = scoped.map(function (d) {
      return d[F_PRICE];
    });
    var minP = Math.min.apply(null, prices);
    var maxP = Math.max.apply(null, prices);
    var numBins = 16;
    var span = Math.max(1, maxP - minP);
    var binW = span / numBins;

    var bins = [];
    for (var i = 0; i < numBins; i++) {
      bins.push({ start: minP + i * binW, end: minP + (i + 1) * binW, below: 0, above: 0 });
    }
    prices.forEach(function (p) {
      var idx = Math.min(numBins - 1, Math.floor((p - minP) / binW));
      if (p <= state.budget) bins[idx].below++;
      else bins[idx].above++;
    });

    var chartW = 640;
    var chartH = 220;
    var padL = 44;
    var padR = 16;
    var padT = 16;
    var padB = 30;
    var plotW = chartW - padL - padR;
    var plotH = chartH - padT - padB;
    var slot = plotW / numBins;
    var barW = slot * 0.82;
    var maxCount = Math.max.apply(
      null,
      bins.map(function (b) {
        return b.below + b.above;
      })
    );

    function xAt(i) {
      return padL + i * slot + (slot - barW) / 2;
    }
    function hAt(count) {
      return maxCount ? (count / maxCount) * plotH : 0;
    }

    var budgetInRange = state.budget >= minP;
    var budgetX = padL + Math.min(1, Math.max(0, (state.budget - minP) / span)) * plotW;

    var pct = (scoped.filter(function (d) { return d[F_PRICE] <= state.budget; }).length / scoped.length) * 100;

    var svg = svgEl("svg", {
      class: "chart",
      viewBox: "0 0 " + chartW + " " + chartH,
      role: "img",
      "aria-label":
        "강북구 매매가 분포 히스토그램. 최저 " +
        fmtInt(minP) +
        "만원부터 최고 " +
        fmtInt(maxP) +
        "만원까지 분포하며, 예산 " +
        fmtInt(state.budget) +
        "만원은 하위 " +
        pct.toFixed(1) +
        "% 지점에 위치합니다.",
    });

    bins.forEach(function (b, i) {
      var x = xAt(i);
      var total = b.below + b.above;
      var totalH = hAt(total);
      var belowH = maxCount ? (b.below / maxCount) * plotH : 0;
      var aboveH = totalH - belowH;
      var yBase = padT + plotH;

      if (b.below > 0) {
        svg.appendChild(
          svgEl("rect", {
            x: x,
            y: yBase - belowH,
            width: barW,
            height: belowH,
            rx: 2,
            class: "chart-bar-primary",
          })
        );
      }
      if (b.above > 0) {
        svg.appendChild(
          svgEl("rect", {
            x: x,
            y: yBase - totalH,
            width: barW,
            height: aboveH,
            rx: 2,
            class: "chart-bar-neutral",
          })
        );
      }
    });

    // x axis labels (min / max)
    var lblMin = svgEl("text", { x: padL, y: chartH - 8, class: "chart-axis-text" });
    lblMin.textContent = fmtInt(minP) + "만원";
    svg.appendChild(lblMin);
    var lblMax = svgEl("text", { x: chartW - padR, y: chartH - 8, "text-anchor": "end", class: "chart-axis-text" });
    lblMax.textContent = fmtInt(maxP) + "만원";
    svg.appendChild(lblMax);

    // budget marker line
    if (budgetInRange) {
      svg.appendChild(
        svgEl("line", {
          x1: budgetX,
          x2: budgetX,
          y1: padT,
          y2: padT + plotH,
          class: "budget-marker-line",
        })
      );
      var markerLabel = svgEl("text", {
        x: budgetX,
        y: padT - 4,
        "text-anchor": budgetX > chartW - 60 ? "end" : "middle",
        class: "chart-value-text budget-marker-text",
      });
      markerLabel.textContent = "내 예산 " + fmtEok(state.budget);
      svg.appendChild(markerLabel);
    }

    container.appendChild(svg);

    caption.textContent = "내 예산은 강북구 거래의 하위 " + pct.toFixed(1) + "% 지점입니다";
  }

  // =====================================================================
  // S2 — 예산으로 살 수 있는 단지 (핵심 결과 테이블)
  // =====================================================================
  function getComplexRows() {
    var scoped = getScopedDeals();
    var byComplex = {};
    scoped.forEach(function (d) {
      var c = d[F_C];
      if (!byComplex[c]) byComplex[c] = [];
      byComplex[c].push(d);
    });

    var rows = [];
    Object.keys(byComplex).forEach(function (k) {
      var c = Number(k);
      var deals = byComplex[k];
      var atBudget = deals.filter(function (d) {
        return d[F_PRICE] <= state.budget;
      });
      if (atBudget.length === 0) return; // §3 S2: 예산 이하 거래가 1건 이상인 단지만

      var prices = deals.map(function (d) {
        return d[F_PRICE];
      });
      var ppps = deals.map(function (d) {
        return d[F_PPP];
      });
      var areas = deals.map(function (d) {
        return d[F_AREA];
      });

      rows.push({
        complex: DATA.complexList[c].name,
        dong: DATA.complexList[c].dong,
        minPrice: Math.min.apply(null, prices),
        dealsAtBudget: atBudget.length,
        dealsTotal: deals.length,
        medianPpp: median(ppps),
        lowSample: deals.length < 10,
        repArea: median(areas),
      });
    });
    return rows;
  }

  function sortRows(rows) {
    var key = state.sortKey;
    var dir = state.sortDir === "asc" ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }

  var COLUMNS = [
    { key: "rank", label: "순위", sortable: false },
    { key: "complex", label: "단지명", sortable: true },
    { key: "dong", label: "동", sortable: true },
    { key: "minPrice", label: "최저가", sortable: true },
    { key: "dealsAtBudget", label: "예산 이하 거래수/전체", sortable: true },
    { key: "medianPpp", label: "중위 평당가", sortable: true },
    { key: "repArea", label: "대표 면적", sortable: true },
  ];

  function renderComplexTable() {
    var rows = sortRows(getComplexRows());
    var thead = document.getElementById("complex-thead");
    var tbody = document.getElementById("complex-tbody");
    var emptyState = document.getElementById("complex-empty");
    var tableEl = document.getElementById("complex-table");

    thead.innerHTML = "";
    var trHead = el("tr");
    COLUMNS.forEach(function (col) {
      var th = el("th", { scope: "col" });
      if (col.sortable) {
        var isActive = state.sortKey === col.key;
        var arrow = isActive ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
        var btn = el("button", {
          type: "button",
          "aria-label": col.label + " 기준 정렬",
        });
        btn.textContent = col.label + arrow;
        btn.addEventListener("click", function () {
          if (state.sortKey === col.key) {
            state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
          } else {
            state.sortKey = col.key;
            state.sortDir = "desc";
          }
          renderComplexTable();
        });
        th.appendChild(btn);
      } else {
        th.textContent = col.label;
      }
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    tbody.innerHTML = "";

    if (rows.length === 0) {
      tableEl.style.display = "none";
      emptyState.style.display = "block";

      var scoped = getScopedDeals();
      if (scoped.length === 0) {
        emptyState.textContent =
          "선택한 조건(" + state.dong + " · " + state.area + ")에 해당하는 거래 데이터가 없습니다.";
      } else {
        var minInScope = Math.min.apply(
          null,
          scoped.map(function (d) {
            return d[F_PRICE];
          })
        );
        emptyState.textContent =
          "예산 " +
          fmtEok(state.budget) +
          "으로 매수 가능한 단지가 없습니다. 선택한 조건의 최저 거래가는 " +
          fmtInt(minInScope) +
          "만원입니다.";
      }
      return;
    }

    tableEl.style.display = "";
    emptyState.style.display = "none";

    rows.forEach(function (r, i) {
      var rank = i + 1;
      var tr = el("tr");

      var rankTd = el("td");
      var chip = el("span", {
        class: "rank-chip" + (rank <= 3 ? " top" : ""),
        text: String(rank),
      });
      rankTd.appendChild(chip);
      tr.appendChild(rankTd);

      tr.appendChild(el("td", { text: r.complex }));
      tr.appendChild(el("td", { text: r.dong }));

      var minPriceTd = el("td", { class: "price-cell" });
      minPriceTd.appendChild(document.createTextNode(fmtInt(r.minPrice) + " "));
      minPriceTd.appendChild(el("span", { class: "price-unit", text: "만원" }));
      tr.appendChild(minPriceTd);

      tr.appendChild(el("td", { text: fmtInt(r.dealsAtBudget) + " / " + fmtInt(r.dealsTotal) + "건" }));

      var pppTd = el("td", { class: "price-cell" });
      pppTd.appendChild(document.createTextNode(fmtInt(r.medianPpp) + " "));
      pppTd.appendChild(el("span", { class: "price-unit", text: "만원/평" }));
      if (r.lowSample) {
        pppTd.appendChild(
          el("span", { class: "low-sample-badge", text: "⚠ n=" + r.dealsTotal, title: "표본 10건 미만 — 대표값 신뢰도 낮음" })
        );
      }
      tr.appendChild(pppTd);

      tr.appendChild(el("td", { text: fmtInt(r.repArea) + "㎡" }));

      tbody.appendChild(tr);
    });
  }

  // =====================================================================
  // S3 — 서울 25개 구 랭킹 (가로 막대) — 예산과 무관
  // =====================================================================
  function renderGuRanking() {
    var ranking = DATA.guRanking; // already sorted desc by medianPpp
    var container = document.getElementById("gu-ranking-chart");
    container.innerHTML = "";

    var rowH = 22;
    var gap = 4;
    var leftLabelW = 74;
    var rightValueW = 78;
    var chartW = 640;
    var barAreaW = chartW - leftLabelW - rightValueW;
    var height = ranking.length * (rowH + gap);
    var maxVal = ranking[0].medianPpp;

    var svg = svgEl("svg", {
      class: "chart",
      viewBox: "0 0 " + chartW + " " + height,
      role: "img",
      "aria-label":
        "서울 25개 구 중위 평당가 가로 막대 그래프. 1위 " +
        ranking[0].gu +
        " " +
        fmtInt(ranking[0].medianPpp) +
        "만원, 강북구는 " +
        DATA.kpi.pppRank +
        "위 " +
        fmtInt(DATA.kpi.medianPpp) +
        "만원.",
    });

    ranking.forEach(function (g, i) {
      var y = i * (rowH + gap);
      var w = Math.max(2, (g.medianPpp / maxVal) * barAreaW);
      var isGB = g.gu === DATA.meta.gu;

      var label = svgEl("text", {
        x: leftLabelW - 8,
        y: y + rowH / 2 + 4,
        "text-anchor": "end",
        class: "chart-axis-text",
      });
      label.textContent = g.gu;
      if (isGB) label.setAttribute("font-weight", "700");
      svg.appendChild(label);

      var rect = svgEl("rect", {
        x: leftLabelW,
        y: y,
        width: w,
        height: rowH,
        rx: 4,
        class: isGB ? "chart-bar-primary" : "chart-bar-neutral",
      });
      svg.appendChild(rect);

      var val = svgEl("text", {
        x: leftLabelW + w + 6,
        y: y + rowH / 2 + 4,
        class: "chart-value-text",
      });
      val.textContent = fmtInt(g.medianPpp);
      svg.appendChild(val);
    });

    container.appendChild(svg);

    var top = ranking[0];
    var pctOfTop = Math.round((DATA.kpi.medianPpp / top.medianPpp) * 100);
    document.getElementById("gu-ranking-caption").textContent =
      "1위 " +
      top.gu +
      "(" +
      fmtInt(top.medianPpp) +
      "만원/평) 대비 강북구는 " +
      pctOfTop +
      "% 수준 · " +
      DATA.kpi.pppRank +
      "위 / " +
      DATA.kpi.pppTotal;
  }

  // =====================================================================
  // S4 — 12개월 추세 (거래량 막대 + ma3 라인, 이중 축) — 예산과 무관
  // =====================================================================
  function renderMonthlyTrend() {
    var monthly = DATA.monthly;
    var container = document.getElementById("monthly-chart");
    container.innerHTML = "";

    var chartW = 640;
    var chartH = 300;
    var padL = 46;
    var padR = 46;
    var padT = 16;
    var padB = 30;
    var plotW = chartW - padL - padR;
    var plotH = chartH - padT - padB;
    var n = monthly.length;
    var slot = plotW / n;
    var barW = slot * 0.5;

    var maxDeals = Math.max.apply(
      null,
      monthly.map(function (m) {
        return m.deals;
      })
    );
    var ppps = monthly
      .map(function (m) {
        return m.ma3;
      })
      .filter(function (v) {
        return v !== null;
      })
      .concat(
        monthly.map(function (m) {
          return m.medianPpp;
        })
      );
    var minPpp = Math.min.apply(null, ppps) * 0.95;
    var maxPpp = Math.max.apply(null, ppps) * 1.05;

    function xAt(i) {
      return padL + i * slot + slot / 2;
    }
    function yDeals(v) {
      return padT + plotH - (v / maxDeals) * plotH;
    }
    function yPpp(v) {
      return padT + plotH - ((v - minPpp) / (maxPpp - minPpp)) * plotH;
    }

    var svg = svgEl("svg", {
      class: "chart",
      viewBox: "0 0 " + chartW + " " + chartH,
      role: "img",
      "aria-label":
        "12개월 월별 거래량 막대와 3개월 이동 중위 평당가 라인 복합 차트. 거래량은 " +
        monthly[0].deals +
        "건에서 " +
        monthly[n - 1].deals +
        "건으로 증가했고, 평당가는 정체 흐름.",
    });

    // gridlines (deals axis, 4 lines)
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (plotH / 4) * g;
      svg.appendChild(
        svgEl("line", { x1: padL, x2: chartW - padR, y1: gy, y2: gy, class: "chart-grid-line" })
      );
    }

    // bars (deals)
    monthly.forEach(function (m, i) {
      var x = xAt(i) - barW / 2;
      var y = yDeals(m.deals);
      var h = padT + plotH - y;
      svg.appendChild(
        svgEl("rect", { x: x, y: y, width: barW, height: h, rx: 2, class: "chart-bar-neutral" })
      );
    });

    // x labels (every other month to avoid crowding)
    monthly.forEach(function (m, i) {
      if (i % 2 !== 0 && i !== n - 1) return;
      var t = svgEl("text", {
        x: xAt(i),
        y: chartH - 8,
        "text-anchor": "middle",
        class: "chart-axis-text",
      });
      t.textContent = m.ym.slice(2).replace("-", ".");
      svg.appendChild(t);
    });

    // ma3 line — starts at 3rd point (index 2), handles null gap
    var pathPoints = [];
    monthly.forEach(function (m, i) {
      if (m.ma3 !== null && m.ma3 !== undefined) {
        pathPoints.push([xAt(i), yPpp(m.ma3)]);
      }
    });
    if (pathPoints.length > 1) {
      var d = pathPoints
        .map(function (p, i) {
          return (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1);
        })
        .join(" ");
      svg.appendChild(svgEl("path", { d: d, class: "chart-line-path" }));
      pathPoints.forEach(function (p) {
        svg.appendChild(svgEl("circle", { cx: p[0], cy: p[1], r: 3, class: "chart-line-dot" }));
      });
    }

    // axis labels
    var lblDeals = svgEl("text", {
      x: padL,
      y: 12,
      class: "chart-axis-text",
    });
    lblDeals.textContent = "거래량(건)";
    svg.appendChild(lblDeals);

    var lblPpp = svgEl("text", {
      x: chartW - padR,
      y: 12,
      "text-anchor": "end",
      class: "chart-axis-text",
    });
    lblPpp.textContent = "3개월 이동 평당가(만원)";
    svg.appendChild(lblPpp);

    container.appendChild(svg);
  }

  // =====================================================================
  // S5 — 동별 격차 (세로 막대 + 표본 배지) — 예산과 무관
  // =====================================================================
  function renderDongChart() {
    var dongs = DATA.dongs;
    var container = document.getElementById("dong-chart");
    container.innerHTML = "";

    var chartW = 480;
    var chartH = 260;
    var padL = 50;
    var padR = 16;
    var padT = 20;
    var padB = 40;
    var plotW = chartW - padL - padR;
    var plotH = chartH - padT - padB;
    var n = dongs.length;
    var slot = plotW / n;
    var barW = slot * 0.5;
    var maxVal = Math.max.apply(
      null,
      dongs.map(function (d) {
        return d.medianPpp;
      })
    );

    var svg = svgEl("svg", {
      class: "chart",
      viewBox: "0 0 " + chartW + " " + chartH,
      role: "img",
      "aria-label":
        "강북구 4개 동 중위 평당가 세로 막대 그래프. " +
        dongs
          .map(function (d) {
            return d.dong + " " + fmtInt(d.medianPpp) + "만원(" + d.n + "건)";
          })
          .join(", ") +
        ". 우이동은 표본 17건으로 표본 부족.",
    });

    dongs.forEach(function (d, i) {
      var x = padL + i * slot + (slot - barW) / 2;
      var h = (d.medianPpp / maxVal) * plotH;
      var y = padT + plotH - h;

      svg.appendChild(
        svgEl("rect", { x: x, y: y, width: barW, height: h, rx: 4, class: "chart-bar-primary" })
      );

      var valText = svgEl("text", {
        x: x + barW / 2,
        y: y - 6,
        "text-anchor": "middle",
        class: "chart-value-text",
      });
      valText.textContent = fmtInt(d.medianPpp);
      svg.appendChild(valText);

      var nText = svgEl("text", {
        x: x + barW / 2,
        y: padT + plotH + 16,
        "text-anchor": "middle",
        class: "chart-axis-text",
      });
      nText.textContent = d.dong + " (" + d.n + "건)";
      svg.appendChild(nText);

      if (d.lowSample) {
        var badgeText = svgEl("text", {
          x: x + barW / 2,
          y: padT + plotH + 30,
          "text-anchor": "middle",
          class: "chart-axis-text",
        });
        badgeText.setAttribute("font-weight", "700");
        badgeText.textContent = "⚠ 표본 " + d.n + "건";
        svg.appendChild(badgeText);
      }
    });

    container.appendChild(svg);

    // share text
    var total = dongs.reduce(function (s, d) {
      return s + d.n;
    }, 0);
    var mia = dongs.find(function (d) {
      return d.dong === "미아동";
    });
    var share = Math.round((mia.n / total) * 100);
    document.getElementById("dong-caption").textContent =
      "동별 거래량 비중: 미아동이 전체의 " + share + "%를 차지 — 강북구 시세는 사실상 미아동 시세와 같다";
  }

  // =====================================================================
  // S6 — 면적대별 비교 (동 필터에 연동, 예산과 무관)
  // =====================================================================
  function computeAreaBandsForDong(dong) {
    if (dong === "전체") return DATA.areaBands;

    // Exact per-dong area-band medians, computed at build time directly
    // from the CSV rows (see build_data.py's dongAreaBands). A dong may
    // have fewer than 3 bands if a (dong, band) pair has no transactions.
    return (DATA.dongAreaBands && DATA.dongAreaBands[dong]) || [];
  }

  function renderAreaBandChart() {
    var bands = computeAreaBandsForDong(state.dong).filter(function (b) {
      return b.n > 0;
    });
    var container = document.getElementById("area-band-chart");
    var caption = document.getElementById("area-band-caption");
    container.innerHTML = "";

    if (bands.length === 0) {
      container.appendChild(el("div", { class: "empty-state", text: "선택한 동에는 면적대별 집계 데이터가 없습니다." }));
      caption.textContent = "";
      return;
    }

    var hasLowSample = bands.some(function (b) {
      return b.n < 30;
    });

    var chartW = 480;
    var chartH = hasLowSample ? 260 : 240;
    var padL = 50;
    var padR = 16;
    var padT = 20;
    var padB = hasLowSample ? 54 : 34;
    var plotW = chartW - padL - padR;
    var plotH = chartH - padT - padB;
    var n = bands.length;
    var slot = plotW / n;
    var barW = slot * 0.5;
    var maxVal = Math.max.apply(
      null,
      bands.map(function (b) {
        return b.medianPpp;
      })
    );

    var svg = svgEl("svg", {
      class: "chart",
      viewBox: "0 0 " + chartW + " " + chartH,
      role: "img",
      "aria-label":
        "면적대별 중위 평당가 세로 막대 그래프 (" +
        state.dong +
        "). " +
        bands
          .map(function (b) {
            return (
              b.band +
              " " +
              fmtInt(b.medianPpp) +
              "만원(" +
              b.n +
              "건)" +
              (b.n < 30 ? " - 표본 부족" : "")
            );
          })
          .join(", "),
    });

    bands.forEach(function (b, i) {
      var x = padL + i * slot + (slot - barW) / 2;
      var h = (b.medianPpp / maxVal) * plotH;
      var y = padT + plotH - h;

      svg.appendChild(
        svgEl("rect", { x: x, y: y, width: barW, height: h, rx: 4, class: "chart-bar-neutral" })
      );

      var valText = svgEl("text", {
        x: x + barW / 2,
        y: y - 6,
        "text-anchor": "middle",
        class: "chart-value-text",
      });
      valText.textContent = fmtInt(b.medianPpp);
      svg.appendChild(valText);

      var lblText = svgEl("text", {
        x: x + barW / 2,
        y: padT + plotH + 18,
        "text-anchor": "middle",
        class: "chart-axis-text",
      });
      lblText.textContent = b.band;
      svg.appendChild(lblText);

      if (b.n < 30) {
        var badgeText = svgEl("text", {
          x: x + barW / 2,
          y: padT + plotH + 34,
          "text-anchor": "middle",
          class: "chart-axis-text",
        });
        badgeText.setAttribute("font-weight", "700");
        badgeText.textContent = "⚠ 표본 " + b.n + "건";
        svg.appendChild(badgeText);
      }
    });

    container.appendChild(svg);

    if (bands.length >= 2) {
      var small = bands[0];
      var large = bands[bands.length - 1];
      if (small.medianPpp && large.medianPpp) {
        var pct = Math.round(((small.medianPpp - large.medianPpp) / large.medianPpp) * 100);
        var direction = pct >= 0 ? "높음" : "낮음";
        caption.textContent =
          small.band +
          "이(가) " +
          large.band +
          "보다 " +
          Math.abs(pct) +
          "% " +
          direction +
          " (" +
          state.dong +
          ")";
      } else {
        caption.textContent = "";
      }
    } else {
      caption.textContent = "";
    }
  }

  // =====================================================================
  // filters
  // =====================================================================
  function renderFilters() {
    var dongGroup = document.getElementById("dong-filter");
    var areaGroup = document.getElementById("area-filter");
    dongGroup.innerHTML = "";
    areaGroup.innerHTML = "";

    DONG_OPTIONS.forEach(function (opt) {
      var btn = el("button", {
        type: "button",
        class: "filter-btn",
        "aria-pressed": String(state.dong === opt),
        text: opt,
      });
      btn.addEventListener("click", function () {
        state.dong = opt;
        renderFilters();
        renderBudgetDependent();
        renderAreaBandChart(); // S6: 동 필터에 연동
      });
      dongGroup.appendChild(btn);
    });

    AREA_OPTIONS.forEach(function (opt) {
      var btn = el("button", {
        type: "button",
        class: "filter-btn",
        "aria-pressed": String(state.area === opt),
        text: opt,
      });
      btn.addEventListener("click", function () {
        state.area = opt;
        renderFilters();
        renderBudgetDependent();
      });
      areaGroup.appendChild(btn);
    });
  }

  // 예산·동·면적대 중 하나라도 바뀌면 S0·S1·S2를 갱신
  function renderBudgetDependent() {
    renderHero();
    renderHistogram();
    renderComplexTable();
  }

  // =====================================================================
  // init
  // =====================================================================
  function init() {
    if (!DATA) {
      document.body.innerHTML =
        '<p style="padding:40px;text-align:center;color:#999;">데이터를 불러오지 못했습니다 (data/dashboard.js 확인 필요).</p>';
      return;
    }
    initBudgetControl();
    renderFilters();
    renderBudgetDependent();
    renderGuRanking();
    renderMonthlyTrend();
    renderDongChart();
    renderAreaBandChart();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
