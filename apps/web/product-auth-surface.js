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

function shouldReloadForMemberSubjectChange({ oldValue, newValue }) {
  const previousSubjectId = memberSubjectIdFromStoredSession(oldValue);
  const nextSubjectId = memberSubjectIdFromStoredSession(newValue);
  if (previousSubjectId === nextSubjectId) return false;
  return previousSubjectId !== null || nextSubjectId !== null;
}

export function shouldReloadSajuForMemberSessionStorageChange({ pathname, oldValue, newValue }) {
  if (pageBasename(pathname) !== 'reading.html') return false;
  return shouldReloadForMemberSubjectChange({ oldValue, newValue });
}

export function shouldReloadMyForMemberSessionStorageChange({ pathname, oldValue, newValue }) {
  if (pageBasename(pathname) !== 'my.html') return false;
  return shouldReloadForMemberSubjectChange({ oldValue, newValue });
}

export function shouldReloadBirthForMemberSessionStorageChange({ pathname, oldValue, newValue }) {
  if (pageBasename(pathname) !== 'birth.html') return false;
  return shouldReloadForMemberSubjectChange({ oldValue, newValue });
}
