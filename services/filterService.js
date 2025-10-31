// services/filterService.js

/**
 * Builds basic filter parameters from query params.
 * You can expand this later for more complex dashboard filters.
 */
function buildFilterParams(query) {
  const filters = {};

  if (query.startDate) filters.startDate = query.startDate;
  if (query.endDate) filters.endDate = query.endDate;
  if (query.status) filters.status = query.status;
  if (query.city) filters.city = query.city;

  return filters;
}

/**
 * Returns a readable version of the filters applied,
 * useful for logging or showing in frontend dashboards.
 */
function getAppliedFilters(query) {
  const applied = [];

  if (query.startDate && query.endDate) {
    applied.push(`Date range: ${query.startDate} → ${query.endDate}`);
  } else if (query.startDate) {
    applied.push(`From: ${query.startDate}`);
  } else if (query.endDate) {
    applied.push(`Until: ${query.endDate}`);
  }

  if (query.status) applied.push(`Status: ${query.status}`);
  if (query.city) applied.push(`City: ${query.city}`);

  return applied.length ? applied : ['No filters applied'];
}

module.exports = {
  buildFilterParams,
  getAppliedFilters,
};
