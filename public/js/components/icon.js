const iconMap = {
  dashboard: 'fa-solid fa-chart-line',
  scheduler: 'fa-regular fa-calendar-days',
  timeclock: 'fa-solid fa-clock',
  projects: 'fa-solid fa-building-user',
  tasks: 'fa-solid fa-list-check',
  forms: 'fa-solid fa-clipboard-list',
  chat: 'fa-regular fa-comments',
  docs: 'fa-solid fa-folder-open',
  hr: 'fa-solid fa-id-card',
  users: 'fa-solid fa-users',
  settings: 'fa-solid fa-gears'
};

export function getIconClass(name) {
  return iconMap[name] || 'fa-solid fa-circle';
}

export function getIconHTML(name) {
  return `<i class="${getIconClass(name)}"></i>`;
}
