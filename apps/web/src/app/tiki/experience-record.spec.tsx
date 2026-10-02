import { resumeEntries, siteCopy } from '@qa3elhamor/content-data-access';
import { localize } from '@qa3elhamor/content-domain';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ExperienceRecord,
  createExperienceRecordOverlay,
} from './experience-record';

describe('ExperienceRecord', () => {
  it("is the page view's Experience section: every job, its tech and its review", () => {
    render(
      <ExperienceRecord
        entries={resumeEntries}
        copy={siteCopy}
        locale="en"
        dir="ltr"
        variant="in-world"
      />,
    );
    const record = screen.getByRole('article', { name: 'Experience' });
    expect(record.getAttribute('tabindex')).toBe('-1');
    const jobs = within(record).getAllByTestId('page-resume-entry');
    expect(jobs).toHaveLength(resumeEntries.length);
    resumeEntries.forEach((entry, i) => {
      const job = jobs[i] as HTMLElement;
      expect(
        within(job).getByRole('heading', { name: localize(entry.role, 'en') }),
      ).toBeTruthy();
      if (entry.quip)
        expect(job.textContent).toContain(localize(entry.quip, 'en'));
    });
  });

  it('is the Tiki dialog fallback, flat on the dialog paper', () => {
    const Overlay = createExperienceRecordOverlay({ entries: resumeEntries, copy: siteCopy });
    render(
      <Overlay
        landmarkId="tiki"
        title="Tiki Head"
        locale="en"
        dir="ltr"
        onClose={vi.fn()}
      />,
    );
    const record = screen.getByRole('article', { name: 'Experience' });
    expect(record.classList.contains('tiki-record--dialog')).toBe(true);
    expect(within(record).getAllByTestId('page-resume-entry')).toHaveLength(
      resumeEntries.length,
    );
  });
});
