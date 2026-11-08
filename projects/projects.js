import { fetchJSON, renderProjects } from '../global.js?v=6';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = (await fetchJSON('../lib/projects.json')) ?? [];
const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');
const svg = d3.select('#projects-pie-plot');
const legend = d3.select('.legend');
const colors = d3.scaleOrdinal(d3.schemeTableau10);
const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

let query = '';
let selectedYear = null;

function projectsMatchingQuery() {
  const normalizedQuery = query.trim().toLowerCase();

  return projects.filter((project) => {
    const projectMetadata = Object.values(project).join('\n').toLowerCase();
    return projectMetadata.includes(normalizedQuery);
  });
}

function toggleYear(year) {
  selectedYear = selectedYear === year ? null : year;
  updatePage();
}

function renderPieChart(projectsGiven) {
  const rolledData = d3.rollups(
    projectsGiven,
    (values) => values.length,
    (project) => String(project.year),
  );

  const data = rolledData
    .map(([year, count]) => ({ value: count, label: year }))
    .sort((a, b) => d3.descending(Number(a.label), Number(b.label)));

  const sliceGenerator = d3.pie().value((item) => item.value).sort(null);
  const arcData = sliceGenerator(data);

  svg.selectAll('path').remove();
  legend.selectAll('li').remove();

  if (data.length === 0) {
    legend
      .append('li')
      .attr('class', 'legend-empty')
      .text('No matching projects');
    return;
  }

  arcData.forEach((arc, index) => {
    const year = arc.data.label;
    const isSelected = year === selectedYear;

    svg
      .append('path')
      .attr('d', arcGenerator(arc))
      .attr('fill', colors(index))
      .attr('class', isSelected ? 'selected' : null)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', `${year}: ${arc.data.value} projects`)
      .attr('aria-pressed', isSelected)
      .on('click', () => toggleYear(year))
      .on('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleYear(year);
        }
      });
  });

  data.forEach((item, index) => {
    const isSelected = item.label === selectedYear;

    legend
      .append('li')
      .attr('style', `--color: ${colors(index)}`)
      .attr('class', `legend-item${isSelected ? ' selected' : ''}`)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-pressed', isSelected)
      .html(
        `<span class="swatch" aria-hidden="true"></span>
         <span>${item.label} <em>(${item.value})</em></span>`,
      )
      .on('click', () => toggleYear(item.label))
      .on('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleYear(item.label);
        }
      });
  });
}

function updatePage() {
  const searchMatches = projectsMatchingQuery();

  if (
    selectedYear &&
    !searchMatches.some((project) => String(project.year) === selectedYear)
  ) {
    selectedYear = null;
  }

  const visibleProjects = selectedYear
    ? searchMatches.filter((project) => String(project.year) === selectedYear)
    : searchMatches;

  renderProjects(visibleProjects, projectsContainer, 'h2');
  renderPieChart(searchMatches);

  if (projectsTitle) {
    const projectLabel = visibleProjects.length === 1 ? 'Project' : 'Projects';
    projectsTitle.textContent = `My ${visibleProjects.length} ${projectLabel}`;
  }
}

searchInput?.addEventListener('input', (event) => {
  query = event.target.value;
  updatePage();
});

updatePage();
