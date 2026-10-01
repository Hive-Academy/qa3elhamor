import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  ATTRIBUTIONS,
  SOURCE_MODELS,
  creditLine,
  shippedCredits,
} from '@qa3elhamor/world-domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteCredits } from './credits';

describe('site credits', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows every required credit string, verbatim, from the page chrome', () => {
    render(<SiteCredits />);
    fireEvent.click(screen.getByRole('button', { name: 'Credits' }));

    // The dialog may render non-modally where `showModal` is missing (jsdom).
    const dialog = screen.getByRole('dialog', { name: 'Credits', hidden: true });
    const texts = within(dialog)
      .getAllByRole('listitem', { hidden: true })
      .map((item) => item.textContent);
    expect(texts).toHaveLength(shippedCredits().length);
    for (const model of SOURCE_MODELS) {
      expect(texts).toContain(creditLine(ATTRIBUTIONS[model.id]));
    }
  });

  it('contains a licence error to the credit surface, says so and logs it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('no attribution record');
    const failing = () => {
      throw failure;
    };

    render(
      <>
        <SiteCredits source={failing} />
        <p>rest of the site</p>
      </>,
    );

    expect(screen.getByText('rest of the site')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/credits unavailable.*licence error/i);
    expect(screen.queryByRole('button', { name: 'Credits' })).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/licence error/), failure);
  });
});
