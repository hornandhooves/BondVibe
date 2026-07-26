/**
 * KIN-117 QA fix #3 — resolveReasonText must decide by REPORT_REASON_KEYS
 * membership, not by `t(key) === key`. i18next's default nsSeparator is
 * ":", so free prose containing a colon (a user_block host-typed reason,
 * or any historical doc) would get split by a real t() and compared against
 * a fragment — a false "this translates" that silently truncates what the
 * admin sees. Membership-based resolution never calls t() at all unless the
 * reason is a genuinely known key, so this can't happen regardless of any
 * i18next configuration.
 */
import { REPORT_REASON_KEYS, resolveReasonText } from '../reportReasons';

describe('resolveReasonText', () => {
  it('translates a known reason key', () => {
    const t = jest.fn((k) => `TRANSLATED(${k})`);
    expect(resolveReasonText(t, 'harassmentOrBullying'))
      .toBe('TRANSLATED(report.reasons.harassmentOrBullying)');
    expect(t).toHaveBeenCalledWith('report.reasons.harassmentOrBullying');
  });

  it('shows free prose with a colon in full, never calling t() for it', () => {
    // Simulates i18next's real nsSeparator behavior: a key with an
    // unregistered namespace before ":" gets split, and only the trailing
    // fragment comes back — the exact trap `t(key) === key` fell into.
    const t = jest.fn((k) => (k.includes(':') ? k.split(':').slice(1).join(':').trim() : k));
    const reason = 'asked them to stop: they kept messaging anyway';
    expect(resolveReasonText(t, reason)).toBe(reason);
    expect(t).not.toHaveBeenCalled();
  });

  it('REPORT_REASON_KEYS membership decides — not string equality after translation', () => {
    expect(REPORT_REASON_KEYS).toContain('harassmentOrBullying');
    expect(REPORT_REASON_KEYS).not.toContain('bank_details');
    expect(REPORT_REASON_KEYS).not.toContain('harassment');
  });
});
