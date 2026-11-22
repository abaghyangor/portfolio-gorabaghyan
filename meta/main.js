import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

const repositoryUrl = 'https://github.com/abaghyangor/portfolio-gorabaghyan';
const colors = d3.scaleOrdinal(d3.schemeTableau10);
const chartDimensions = {
  width: 1000,
  height: 600,
  margin: { top: 20, right: 20, bottom: 50, left: 60 },
};
chartDimensions.usableArea = {
  top: chartDimensions.margin.top,
  right: chartDimensions.width - chartDimensions.margin.right,
  bottom: chartDimensions.height - chartDimensions.margin.bottom,
  left: chartDimensions.margin.left,
  width:
    chartDimensions.width - chartDimensions.margin.left - chartDimensions.margin.right,
  height:
    chartDimensions.height - chartDimensions.margin.top - chartDimensions.margin.bottom,
};

let commits = [];
let filteredCommits = [];
let commitProgress = 100;
let commitMaxTime;
let timeScale;
let xScale;
let yScale;
let brushBehavior;

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
  return d3
    .groups(data, (line) => line.commit)
    .map(([commit, lines]) => {
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
    })
    .sort((a, b) => d3.ascending(a.datetime, b.datetime));
}

function renderCommitInfo(commitData) {
  const visibleLines = commitData.flatMap((commit) => commit.lines);
  const fileLengths = d3.rollups(
    visibleLines,
    (lines) => d3.max(lines, (line) => line.line),
    (line) => line.file,
  );

  const summary = [
    ['Visible LOC', visibleLines.length],
    ['Visible commits', commitData.length],
    ['Files', fileLengths.length],
    [
      'Average file length',
      fileLengths.length
        ? `${Math.round(d3.mean(fileLengths, (file) => file[1]))} lines`
        : '0 lines',
    ],
    ['Maximum depth', d3.max(visibleLines, (line) => line.depth) ?? 0],
    [
      'Average line length',
      visibleLines.length
        ? `${Math.round(d3.mean(visibleLines, (line) => line.length))} characters`
        : '0 characters',
    ],
  ];

  const items = d3
    .select('#stats')
    .selectAll('dl')
    .data([summary])
    .join('dl')
    .attr('class', 'stats summary-stats')
    .selectAll('.stat-item')
    .data((values) => values, (value) => value[0])
    .join((enter) => {
      const item = enter.append('div').attr('class', 'stat-item');
      item.append('dt');
      item.append('dd');
      return item;
    });

  items.select('dt').text((value) => value[0]);
  items.select('dd').text((value) => value[1]);
}

function renderTooltipContent(commit) {
  if (!commit) return;

  const link = document.getElementById('commit-link');
  link.href = commit.url;
  link.textContent = commit.id.slice(0, 7);
  link.title = commit.id;

  document.getElementById('commit-date').textContent = commit.datetime.toLocaleDateString(
    'en',
    { dateStyle: 'full' },
  );
  document.getElementById('commit-tooltip-time').textContent =
    commit.datetime.toLocaleTimeString('en', { timeStyle: 'short' });
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
  return selection
    ? filteredCommits.filter((commit) => isCommitSelected(selection, commit))
    : [];
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

function commitExtent(commitData) {
  const [start, end] = d3.extent(commitData, (commit) => commit.datetime);
  if (+start !== +end) return [start, end];

  const oneDay = 24 * 60 * 60 * 1000;
  return [new Date(+start - oneDay), new Date(+end + oneDay)];
}

function attachCircleEvents(selection) {
  selection
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
}

function renderScatterPlot(commitData) {
  const { width, height, usableArea } = chartDimensions;
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Commits plotted by date and time of day');

  xScale = d3.scaleTime().range([usableArea.left, usableArea.right]);
  yScale = d3.scaleLinear().domain([0, 24]).range([usableArea.bottom, usableArea.top]);

  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`);

  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(
      d3
        .axisLeft(yScale)
        .tickFormat((hour) => `${String(hour % 24).padStart(2, '0')}:00`),
    );

  svg.append('g').attr('class', 'dots');

  brushBehavior = d3
    .brush()
    .extent([
      [usableArea.left, usableArea.top],
      [usableArea.right, usableArea.bottom],
    ])
    .on('start brush end', brushed);
  svg.append('g').attr('class', 'brush').call(brushBehavior);
  svg.select('.dots').raise();

  updateScatterPlot(commitData);
}

function updateScatterPlot(commitData) {
  const svg = d3.select('#chart svg');
  xScale.domain(commitExtent(commitData)).nice();
  svg.select('.x-axis').call(d3.axisBottom(xScale));

  const maxLines = d3.max(commitData, (commit) => commit.totalLines) ?? 1;
  const rScale = d3.scaleSqrt().domain([0, maxLines]).range([3, 28]);
  const sortedCommits = d3.sort(commitData, (commit) => -commit.totalLines);

  const circles = svg
    .select('.dots')
    .selectAll('circle')
    .data(sortedCommits, (commit) => commit.id)
    .join('circle')
    .attr('cx', (commit) => xScale(commit.datetime))
    .attr('cy', (commit) => yScale(commit.hourFrac))
    .attr('r', (commit) => rScale(commit.totalLines))
    .style('--r', (commit) => rScale(commit.totalLines))
    .attr('fill', 'steelblue')
    .attr('fill-opacity', 0.7)
    .attr('tabindex', 0)
    .attr('aria-label', (commit) =>
      `${commit.totalLines} lines committed on ${commit.datetime.toLocaleString()}`,
    );

  attachCircleEvents(circles);
  svg.select('.brush').call(brushBehavior.move, null);
}

function updateFileDisplay(commitData) {
  const files = d3
    .groups(
      commitData.flatMap((commit) => commit.lines),
      (line) => line.file,
    )
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    .selectAll(':scope > div')
    .data(files, (file) => file.name)
    .join(
      (enter) =>
        enter.append('div').call((file) => {
          const term = file.append('dt');
          term.append('code');
          term.append('small');
          file.append('dd');
        }),
      (update) => update,
      (exit) => exit.remove(),
    );

  filesContainer.select('dt > code').text((file) => file.name);
  filesContainer
    .select('dt > small')
    .text((file) => `${file.lines.length.toLocaleString()} lines`);
  filesContainer
    .select('dd')
    .attr('aria-label', (file) => `${file.name}: ${file.lines.length} lines`)
    .selectAll('.loc')
    .data(
      (file) => file.lines,
      (line) => `${line.commit}-${line.line}`,
    )
    .join('div')
    .attr('class', 'loc')
    .attr('title', (line) => `${line.type}, line ${line.line}`)
    .style('--color', (line) => colors(line.type));
}

function renderStory(commitData) {
  const steps = d3
    .select('#scatter-story')
    .selectAll('.step')
    .data(commitData, (commit) => commit.id)
    .join('article')
    .attr('class', 'step');

  steps.html((commit, index) => {
    const filesChanged = new Set(commit.lines.map((line) => line.file)).size;
    const cumulativeLines = d3.sum(commitData.slice(0, index + 1), (item) => item.totalLines);
    return `
      <p class="step-number">Commit ${index + 1} of ${commitData.length}</p>
      <h3>${commit.datetime.toLocaleDateString('en', { dateStyle: 'long' })}</h3>
      <p>
        <a href="${commit.url}" target="_blank" rel="noreferrer">${commit.id.slice(0, 7)}</a>
        contributes ${commit.totalLines.toLocaleString()} lines across
        ${filesChanged} file${filesChanged === 1 ? '' : 's'}.
      </p>
      <p>By this point, ${cumulativeLines.toLocaleString()} current lines are represented.</p>
    `;
  });
}

function updateVisualization(progress) {
  commitProgress = Math.max(0, Math.min(100, Number(progress)));
  commitMaxTime = timeScale.invert(commitProgress);
  filteredCommits = commits.filter((commit) => commit.datetime <= commitMaxTime);

  document.getElementById('commit-progress').value = Math.round(commitProgress);
  document.getElementById('commit-time').textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  updateScatterPlot(filteredCommits);
  renderCommitInfo(filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange(event) {
  updateVisualization(event.currentTarget.value);
  d3.selectAll('#scatter-story .step').classed('is-active', false);
}

function onStepEnter(response) {
  const commit = response.element.__data__;
  updateVisualization(timeScale(commit.datetime));
  d3.selectAll('#scatter-story .step').classed(
    'is-active',
    (item) => item.id === commit.id,
  );
}

const data = await loadData();
commits = processCommits(data);
filteredCommits = commits;
timeScale = d3
  .scaleTime()
  .domain(d3.extent(commits, (commit) => commit.datetime))
  .range([0, 100]);

renderScatterPlot(commits);
renderStory(commits);
updateVisualization(commitProgress);

document
  .getElementById('commit-progress')
  .addEventListener('input', onTimeSliderChange);

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
    offset: 0.5,
  })
  .onStepEnter(onStepEnter);

window.addEventListener('resize', () => scroller.resize());
