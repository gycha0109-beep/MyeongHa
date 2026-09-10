export function memberSubjectIdFromStoredSession(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw);
    const id = parsed?.user?.id;
    return typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
  } catch {
    return null;
  }
}

function pageBasename(pathname) {
  return String(pathname ?? '').split('/').filter(Boolean).pop() ?? '';
}

export function shouldReloadSajuForMemberSessionStorageChange({ pathname, oldValue, newValue }) {
  if (pageBasename(pathname) !== 'reading.html') return false;
  const previousSubjectId = memberSubjectIdFromStoredSession(oldValue);
  const nextSubjectId = memberSubjectIdFromStoredSession(newValue);
  if (previousSubjectId === nextSubjectId) return false;
  return previousSubjectId !== null || nextSubjectId !== null;
}
