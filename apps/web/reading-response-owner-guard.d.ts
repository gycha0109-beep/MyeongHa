export type ReadingResponseOwnerSnapshotV1 = Readonly<{
  kind: 'member' | 'guest';
  key: string;
}>;

export type BrowserReadingMemberSessionV1 = Readonly<{
  user?: Readonly<{ id?: string | null }> | null;
  accessToken?: string | null;
}> | null;

export function captureReadingResponseOwnerV1(
  credential: Readonly<{ kind: 'member' | 'guest'; token: string }> | null,
  memberSession: BrowserReadingMemberSessionV1,
  guestCredential: string | null,
): ReadingResponseOwnerSnapshotV1 | null;

export function isReadingResponseOwnerCurrentV1(
  snapshot: ReadingResponseOwnerSnapshotV1 | null,
  memberSession: BrowserReadingMemberSessionV1,
  guestCredential: string | null,
): boolean;
