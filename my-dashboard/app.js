// 城市天气数据看板 app.js（自主实践 + 独立研究）
// 数据流：fetch 并行加载两份 JSON → 四种状态处理 → 卡片 + 三类图表 → jQuery 交互
const state = {
  weather: null,     // 主数据（气候月报）
  cities: null,      // 第二份 JSON（城市信息）
  season: 'all',     // 当前筛选季节
  window: null,      // 当前展示窗口（按季节过滤后的数据）
  barChart: null,
  lineChart: null,
  pieChart: null
};

const params = new URLSearchParams(location.search);
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ---------- 工具：按季节取月份下标 ----------
const pickMonths = (season) => {
  if (season === 'all') return state.weather.months.map((_, i) => i);
  const map = {
    spring: [2, 3, 4],   // 3-5月
    summer: [5, 6, 7],   // 6-8月
    autumn: [8, 9, 10],  // 9-11月
    winter: [11, 0, 1]   // 12、1、2月
  };
  return map[season];
};

// ---------- 数据加载（研究任务一：Promise.all 并行 + 计时对比） ----------
const loadData = async () => {
  $('#status').removeClass('alert-danger').addClass('alert-warning');
  $('#status').text('加载中...').show();

  try {
    // 演示用参数：?state=fail 模拟失败，?state=empty 模拟空数据，?delay=3000 拉长加载时间
    if (params.get('state') === 'fail') {
      throw new Error('模拟断网：请求无法完成');
    }
    const wait = Number(params.get('delay') || 0);
    if (wait > 0) await delay(wait);

    // ① 并行加载两份 JSON，统一显示“加载中”，全部完成再继续
    const t0 = performance.now();
    const [weatherRes, citiesRes] = await Promise.all([
      fetch('data/weather.json'),
      fetch('data/cities.json')
    ]);
    if (!weatherRes.ok || !citiesRes.ok) {
      throw new Error('HTTP 错误：' + weatherRes.status + ' / ' + citiesRes.status);
    }
    const [weather, cities] = await Promise.all([
      weatherRes.json(),
      citiesRes.json()
    ]);
    const parallelMs = Math.round(performance.now() - t0);

    // ② 串行加载作对比（先天气后城市，逐份等待）
    const t1 = performance.now();
    const wRes = await fetch('data/weather.json');
    const wData = await wRes.json();
    const cRes = await fetch('data/cities.json');
    const cData = await cRes.json();
    const serialMs = Math.round(performance.now() - t1);

    state.weather = weather;
    state.cities = cities;

    // 空数据状态：演示参数或数据本身为空数组
    if (params.get('state') === 'empty') state.weather.series = [];
    if (state.weather.series.length === 0) {
      $('#status').text('暂无数据（空数据状态）').show();
      return;
    }

    $('#status').hide();
    $('#timing-body .timing-parallel').text(parallelMs);
    $('#timing-body .timing-serial').text(serialMs);
    $('#timing-note').text(
      '说明：本地文件加载耗时都很短；真实网络环境下并行明显更快，因为两个请求同时发出，总耗时≈最慢的那个请求，而不是两者之和。'
    );
    $('#sub-title').text(
      weather.title + '（' + weather.year + '）· 数据来源：课程示例气候数据集 · 已并行加载2份JSON：气候数据 + 城市信息'
    );
    renderAll();
  } catch (error) {
    // 失败状态：错误提示 + 重试按钮（不白屏）
    $('#status').addClass('alert-danger').removeClass('alert-warning').html(
      '加载失败：' + error.message +
      ' <button type="button" id="retry-btn" class="btn btn-sm btn-danger ms-2">重试</button>'
    ).show();
  }
};
$('#status').on('click', '#retry-btn', loadData);   // 事件委托：重试按钮

// ---------- 渲染：卡片 + 三张图表 ----------
const renderAll = () => {
  state.window = buildWindow();
  renderCards(state.window);
  renderBarChart(state.window);
  renderLineChart(state.window);
  renderPieChart(state.window);
  bindBarClick();
};

const buildWindow = () => {
  const idx = pickMonths(state.season);
  return {
    months: idx.map(i => state.weather.months[i]),
    series: state.weather.series.map(s => ({
      city: s.city,
      avgTemp: idx.map(i => s.avgTemp[i]),
      precip: idx.map(i => s.precip[i])
    }))
  };
};

const renderCards = (w) => {
  $('#cards').empty();
  w.series.forEach(s => {
    const n = w.months.length;
    const avg = s.avgTemp.reduce((a, b) => a + b, 0) / n;
    const sum = s.precip.reduce((a, b) => a + b, 0);
    $('#cards').append(`
      <div class="col-md-6">
        <div class="card">
          <div class="card-body">
            <h3 class="card-title h6">${s.city}</h3>
            <p class="card-text fs-4">${avg.toFixed(1)}℃</p>
            <p class="card-text small text-muted">${n}个月平均气温 · 期间总降水量 ${sum}mm</p>
          </div>
        </div>
      </div>
    `);
  });
};

// ECharts 柱状图：月降水量对比
const renderBarChart = (w) => {
  if (!state.barChart) {
    state.barChart = echarts.init(document.querySelector('#bar-chart'));
  }
  state.barChart.setOption({
    title: { text: '月降水量对比（单位：mm）', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    xAxis: { data: w.months },
    yAxis: { name: 'mm' },
    series: w.series.map(s => ({
      name: s.city,
      type: 'bar',
      data: s.precip,
      emphasis: { focus: 'series' }
    }))
  });
};

// Chart.js 折线图：月平均气温趋势
const renderLineChart = (w) => {
  if (state.lineChart) state.lineChart.destroy();   // 防重复初始化
  const ctx = document.querySelector('#line-chart');
  state.lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: w.months,
      datasets: w.series.map(s => ({
        label: s.city + ' 平均气温',
        data: s.avgTemp,
        borderWidth: 2,
        tension: 0.3
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: '月平均气温趋势（单位：℃）' }
      },
      scales: { y: { title: { display: true, text: '℃' } } }
    }
  });
};

// ECharts 饼图：所选时段降水量占比
const renderPieChart = (w) => {
  if (!state.pieChart) {
    state.pieChart = echarts.init(document.querySelector('#pie-chart'));
  }
  state.pieChart.setOption({
    title: { text: '所选时段降水量占比', left: 'center' },
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: '60%',
      data: w.series.map(s => ({
        name: s.city,
        value: s.precip.reduce((a, b) => a + b, 0)
      })),
      label: { show: true, formatter: '{b}: {d}%' }
    }]
  });
};

// ---------- 研究任务二：图表联动（ECharts 点击柱状图 → Chart.js 高亮该月） ----------
const bindBarClick = () => {
  state.barChart.off('click');
  state.barChart.on('click', (param) => {
    const idx = param.dataIndex;
    highlightLine(idx);
    $('#sub-title').text('已联动高亮：' + state.window.months[idx] + ' 的气温数据点（点击其他月份可切换）');
  });
};

const highlightLine = (idx) => {
  const c = state.lineChart;
  c.data.datasets.forEach(ds => {
    ds.pointBackgroundColor = ds.data.map((_, i) => (i === idx ? '#dc3545' : '#0d6efd'));
    ds.pointRadius = ds.data.map((_, i) => (i === idx ? 7 : 3));
  });
  c.update();
};

// ---------- jQuery 交互：季节筛选 ----------
$('#season-btns').on('click', '.btn-season', function () {
  $('#season-btns .btn-season').removeClass('active');
  $(this).addClass('active');
  state.season = $(this).data('season');
  renderAll();
});

// ---------- jQuery 交互：点击卡片高亮 ----------
$('#cards').on('click', '.card', function () {
  $(this).toggleClass('border-primary shadow');
});

// 窗口自适应
window.addEventListener('resize', () => {
  if (state.barChart) state.barChart.resize();
  if (state.pieChart) state.pieChart.resize();
});

loadData();
