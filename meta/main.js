import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const repositoryUrl = 'https://github.com/abaghyangor/portfolio-gorabaghyan';

let commits = [];
let xScale;
let yScale;

async function loadData() {
  return d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(`${row.date}T00:00${row.timezone}`),
    datetime: new Date(row.datetime),
  }));
}

function processCommits(data) {
  return d3.groups(data, (line) => line.commit).map(([commit, lines]) => {
    const first = lines[0];
    const { author, date, time, timezone, datetime } = first;
    const result = {
      id: commit,
      url: `${repositoryUrl}/commit/${commit}`,
      author,
      date,
      time,
      timezone,
      datetime,
      hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
      totalLines: lines.length,
    };

    Object.defineProperty(result, 'lines', {
      value: lines,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    return result;
  });
}

function renderCommitInfo(data, commitData) {
  const fileLengths = d3.rollups(
    data,
    (lines) => d3.max(lines, (line) => line.line),
    (line) => line.file,
  );

  const summary = [
    ['Total LOC', data.length],
    ['Total commits', commitData.length],
    ['Files', fileLengths.length],
    ['Average file length', `${Math.round(d3.mean(fileLengths, (file) => file[1]))} lines`],
    ['Maximum depth', d3.max(data, (line) => line.depth)],
    ['Average line length', `${Math.round(d3.mean(data, (line) => line.length))} characters`],
  ];

  const dl = d3.select('#stats').append('dl').attr('class', 'stats summary-stats');

  summary.forEach(([label, value]) => {
    const item = dl.append('div').attr('class', 'stat-item');
    item.append('dt').text(label);
    item.append('dd').text(value);
  });
}

function renderTooltipContent(commit) {
  if (!commit || Object.keys(commit).length === 0) return;

  const link = document.getElementById('commit-link');
  link.href = commit.url;
  link.textContent = commit.id.slice(0, 7);
  link.title = commit.id;

  document.getElementById('commit-date').textContent = commit.datetime.toLocaleDateString(
    'en',
    { dateStyle: 'full' },
  );
  document.getElementById('commit-time').textContent = commit.datetime.toLocaleTimeString(
    'en',
    { timeStyle: 'short' },
  );
  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  document.getElementById('commit-tooltip').hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  const offset = 14;
  const left = Math.min(event.clientX + offset, window.innerWidth - tooltip.offsetWidth - offset);
  const top = Math.min(event.clientY + offset, window.innerHeight - tooltip.offsetHeight - offset);
  tooltip.style.left = `${Math.max(offset, left)}px`;
  tooltip.style.top = `${Math.max(offset, top)}px`;
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;

  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x0 <= x && x <= x1 && y0 <= y && y <= y1;
}

function selectedCommits(selection) {
  return selection ? commits.filter((commit) => isCommitSelected(selection, commit)) : [];
}

function renderSelectionCount(selection) {
  const count = selectedCommits(selection).length;
  document.getElementById('selection-count').textContent = `${count || 'No'} commit${
    count === 1 ? '' : 's'
  } selected`;
}

function renderLanguageBreakdown(selection) {
  const selected = selectedCommits(selection);
  const container = document.getElementById('language-breakdown');
  container.innerHTML = '';

  if (selected.length === 0) return;

  const lines = selected.flatMap((commit) => commit.lines);
  const breakdown = d3.rollup(
    lines,
    (languageLines) => languageLines.length,
    (line) => line.type,
  );

  for (const [language, count] of d3.sort(breakdown, (entry) => -entry[1])) {
    const proportion = count / lines.length;
    container.insertAdjacentHTML(
      'beforeend',
      `<dt>${language}</dt><dd>${count} lines (${d3.format('.1~%')(proportion)})</dd>`,
    );
  }
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('#chart circle').classed('selected', (commit) =>
    isCommitSelected(selection, commit),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function renderScatterPlot(commitData) {
  const width = 1000;
  const height = 600;
  const margin = { top: 20, right: 20, bottom: 50, left: 60 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Commits plotted by date and time of day');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commitData, (commit) => commit.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();
  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const [minLines, maxLines] = d3.extent(commitData, (commit) => commit.totalLines);
  const rScale = d3
    .scaleSqrt()
    .domain(minLines === maxLines ? [0, maxLines || 1] : [minLines, maxLines])
    .range([4, 28]);

  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(d3.axisBottom(xScale));

  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(
      d3
        .axisLeft(yScale)
        .tickFormat((hour) => `${String(hour % 24).padStart(2, '0')}:00`),
    );

  const sortedCommits = d3.sort(commitData, (commit) => -commit.totalLines);
  const dots = svg.append('g').attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(sortedCommits)
    .join('circle')
    .attr('cx', (commit) => xScale(commit.datetime))
    .attr('cy', (commit) => yScale(commit.hourFrac))
    .attr('r', (commit) => rScale(commit.totalLines))
    .attr('fill', 'steelblue')
    .attr('fill-opacity', 0.7)
    .attr('tabindex', 0)
    .attr('aria-label', (commit) =>
      `${commit.totalLines} lines committed on ${commit.datetime.toLocaleString()}`,
    )
    .on('mouseenter focus', (event, commit) => {
      d3.select(event.currentTarget).attr('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      const bounds = event.currentTarget.getBoundingClientRect();
      updateTooltipPosition({
        clientX: event.clientX || bounds.right,
        clientY: event.clientY || bounds.bottom,
      });
    })
    .on('mousemove', (event) => updateTooltipPosition(event))
    .on('mouseleave blur', (event) => {
      d3.select(event.currentTarget).attr('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  svg.call(
    d3
      .brush()
      .extent([
        [usableArea.left, usableArea.top],
        [usableArea.right, usableArea.bottom],
      ])
      .on('start brush end', brushed),
  );
  svg.selectAll('.dots, .overlay ~ *').raise();
}

const data = await loadData();
commits = processCommits(data);
renderCommitInfo(data, commits);
renderScatterPlot(commits);
