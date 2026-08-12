/*
  강북구 아파트 매매 대시보드 — 로직
  데이터: window.DASHBOARD_DATA (data/dashboard.js, build_data.py 산출물)
  차트: 외부 라이브러리 없이 인라인 SVG로 직접 그림.
*/
(function () {
  "use strict";

  var DATA = window.DASHBOARD_DATA;
  var SVG_NS = "http://www.w3.org/2000/svg";

  var DONG_OPTIONS = ["전체", "미아동", "번동", "수유동", "우이동"];
  var AREA_OPTIONS = ["전체", "소형", "중형", "대형"];

  var state = {
    dong: "전체",
    area: "전체",
    sortKey: "medianPpp",
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

  // =====================================================================
  // S0 — Hero + KPI
  // =====================================================================
  function renderHero() {
    var kpi = DATA.kpi;
    var meta = DATA.meta;

    document.getElementById("hero-headline").textContent =
      DATA.meta.gu + "는 서울에서 " + kpi.pppRank + "번째로 싼 구입니다";
    document.getElementById("hero-sub").textContent =
      meta.period + " · 매매 " + fmtInt(meta.total) + "건 · " + meta.generatedFrom + " 기반 집계";

    var kpiGrid = document.getElementById("kpi-grid");
    kpiGrid.innerHTML = "";

    var cards = [
      {
        label: "중위 평당가",
        value: fmtInt(kpi.medianPpp) + "만원/평",
        sub: kpi.pppRank + "위 / " + kpi.pppTotal,
      },
      {
        label: "반기 변화율",
        value: fmtSigned(kpi.changePct, 2),
        sub: kpi.changeRank + "위 / " + kpi.pppTotal,
      },
      {
        label: "거래량",
        value: fmtInt(kpi.deals) + "건",
        sub: "하반기 " + fmtSigned(kpi.dealsChangePct, 1),
      },
      {
        label: "동별 격차",
        value: kpi.dongGapRatio + "배",
        sub: "미아동 ↔ 우이동",
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
  // S1 — 서울 25개 구 랭킹 (가로 막대)
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
        class: "chart-axis-text" + (isGB ? "" : ""),
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
      "1위 " + top.gu + "(" + fmtInt(top.medianPpp) + "만원/평) 대비 강북구는 " + pctOfTop + "% 수준";
  }

  // =====================================================================
  // S2 — 12개월 추세 (거래량 막대 + ma3 라인, 이중 축)
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
  // S3 — 동별 격차 (세로 막대 + 표본 배지)
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
  // S4 — 단지 랭킹 테이블
  // =====================================================================
  function getFilteredComplexRows() {
    var rows = [];
    DATA.complexes.forEach(function (c) {
      if (state.dong !== "전체" && c.dong !== state.dong) return;

      if (state.area === "전체") {
        rows.push({
          complex: c.complex,
          dong: c.dong,
          medianPpp: c.medianPpp,
          n: c.n,
          medianPrice: c.medianPrice,
        });
      } else {
        var band = c.byArea && c.byArea[state.area];
        if (!band || band.n < 10) return; // §2.2 small-sample rule survives filtering
        rows.push({
          complex: c.complex,
          dong: c.dong,
          medianPpp: band.medianPpp,
          n: band.n,
          medianPrice: band.medianPrice,
        });
      }
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
    { key: "medianPpp", label: "중위 평당가", sortable: true },
    { key: "n", label: "거래 건수", sortable: true },
    { key: "medianPrice", label: "중위 거래가", sortable: true },
  ];

  function renderComplexTable() {
    var rows = sortRows(getFilteredComplexRows());
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
      emptyState.textContent =
        "선택한 조건(" + state.dong + " · " + state.area + ")에 해당하는 단지가 없습니다 (거래 10건 이상 기준).";
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

      var pppTd = el("td", { class: "price-cell" });
      pppTd.appendChild(document.createTextNode(fmtInt(r.medianPpp) + " "));
      pppTd.appendChild(el("span", { class: "price-unit", text: "만원/평" }));
      tr.appendChild(pppTd);

      tr.appendChild(el("td", { text: fmtInt(r.n) + "건" }));

      var priceTd = el("td", { class: "price-cell" });
      priceTd.appendChild(document.createTextNode(fmtInt(r.medianPrice) + " "));
      priceTd.appendChild(el("span", { class: "price-unit", text: "만원" }));
      tr.appendChild(priceTd);

      tbody.appendChild(tr);
    });
  }

  // =====================================================================
  // S5 — 면적대별 비교
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
        renderComplexTable();
        renderAreaBandChart();
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
        renderComplexTable();
      });
      areaGroup.appendChild(btn);
    });
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
    renderHero();
    renderGuRanking();
    renderMonthlyTrend();
    renderDongChart();
    renderFilters();
    renderComplexTable();
    renderAreaBandChart();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
