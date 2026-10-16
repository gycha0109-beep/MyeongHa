/**
 * Foreground/background OAuth handoff tracker.
 * No token, state nonce, authorization URL, or callback payload is retained.
 * A callback always wins over an app-resume cancellation.
 */
export class MobileSocialAuthReturnGateV1 {
  private sequence = 0;
  private activeAttempt: number | null = null;
  private leftApp = false;
  private callbackObserved = false;

  begin(): number {
    const attempt = ++this.sequence;
    this.activeAttempt = attempt;
    this.leftApp = false;
    this.callbackObserved = false;
    return attempt;
  }

  leaveApp(): void {
    if (this.activeAttempt !== null) this.leftApp = true;
  }

  returnedWithoutCallback(): number | null {
    return this.leftApp && !this.callbackObserved ? this.activeAttempt : null;
  }

  callback(): void {
    if (this.activeAttempt !== null) this.callbackObserved = true;
  }

  callbackRejected(): void {
    if (this.activeAttempt !== null) this.callbackObserved = false;
  }

  mayCancelOnReturn(attempt: number): boolean {
    return this.activeAttempt === attempt && this.leftApp && !this.callbackObserved;
  }

  mayEnterPending(attempt: number): boolean {
    return this.activeAttempt === attempt && !this.callbackObserved;
  }

  finish(): void {
    this.activeAttempt = null;
    this.leftApp = false;
    this.callbackObserved = false;
  }
}
