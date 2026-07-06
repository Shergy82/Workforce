// Helper functions

export function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function getLocalDateString(d = new Date()) {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatTime(dateTimeString) {
  if (!dateTimeString) return '';
  const d = new Date(dateTimeString);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(dateTimeString) {
  if (!dateTimeString) return '';
  const d = new Date(dateTimeString);
  return `${formatDate(d)} at ${formatTime(d)}`;
}

// Calculate distance in meters using Haversine formula
export function haversineDistance(coords1, coords2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371e3; // Earth radius in meters

  const dLat = toRad(coords2.lat - coords1.lat);
  const dLng = toRad(coords2.lng - coords1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coords1.lat)) *
      Math.cos(toRad(coords2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

export function generateUUID() {
  return 'uuid-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
}

// Load a script dynamically if needed
export function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(`Script load error: ${url}`));
    document.head.appendChild(script);
  });
}

// Get standard loading spinner HTML
export function getLoadingSpinner() {
  return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; gap: 12px; width: 100%;">
      <i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color: hsl(var(--primary));"></i>
      <span style="font-size: 0.85rem; color: hsl(var(--text-muted));">Fetching content...</span>
    </div>
  `;
}
