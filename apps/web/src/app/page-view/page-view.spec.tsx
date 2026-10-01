import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  credits,
  narration,
  profile,
  projectItems,
  resumeEntries,
  serviceItems,
} from '@qa3elhamor/content-data-access';
import { NARRATION_LANDMARKS } from '@qa3elhamor/content-domain';
import { shippedCredits } from '@qa3elhamor/world-domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pendingSubmitter } from '../overlays/complaint-scroll';
import { buildPageContent } from './page-content';
import { PageView, type PageViewProps } from './page-view';

const content = buildPageContent(pendingSubmitter);

const renderPage = (props: Partial<PageViewProps> = {}) =>
  render(
    <PageView
      content={content}
      reason="requested"
      diveHref="/"
      baseUrl="/"
      {...props}
    />,
  );

const section = (name: string) => screen.getByRole('region', { name });

afterEach(() => vi.restoreAllMocks());

describe('PageView: every piece of content, without WebGL', () => {
  it('titles the page with the owner, once', () => {
    renderPage();
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toBe(profile.name.en);
  });

  it('shows the Citizenship Card: identity, every bio paragraph, skill and link', () => {
    renderPage();
    const about = section('About');
    expect(within(about).getByText(profile.headline.en)).toBeTruthy();
    for (const paragraph of profile.bio)
      expect(within(about).getByText(paragraph.en)).toBeTruthy();
    for (const skill of profile.skills.flatMap((group) => group.skills))
      expect(within(about).getByText(skill)).toBeTruthy();
    for (const link of profile.links) {
      expect(
        within(about)
          .getByRole('link', { name: new RegExp(`^${link.label.en}`) })
          .getAttribute('href'),
      ).toBe(link.url);
    }
  });

  it('lists every experience entry with its highlights', () => {
    renderPage();
    const experience = section('Experience');
    expect(within(experience).getAllByTestId('page-resume-entry')).toHaveLength(
      resumeEntries.length,
    );
    for (const entry of resumeEntries) {
      expect(
        within(experience).getAllByText(entry.role.en).length,
      ).toBeGreaterThan(0);
      for (const highlight of entry.highlights)
        expect(within(experience).getByText(highlight.en)).toBeTruthy();
    }
  });

  it('lists every project in display order, with all of its links', () => {
    renderPage();
    const projects = within(section('Projects')).getAllByTestId('page-project');
    expect(projects).toHaveLength(projectItems.length);
    projects.forEach((card, index) => {
      const project = projectItems[index];
      expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(
        project.title.en,
      );
      const hrefs = within(card)
        .queryAllByRole('link')
        .map((a) => a.getAttribute('href'));
      for (const link of project.links) expect(hrefs).toContain(link.url);
    });
  });

  it('lists every service on the menu', () => {
    renderPage();
    const services = section('Services');
    expect(within(services).getAllByTestId('page-service')).toHaveLength(
      serviceItems.length,
    );
    for (const service of serviceItems)
      expect(within(services).getByText(service.description.en)).toBeTruthy();
  });

  it('carries the Bureau complaint form', () => {
    renderPage();
    const contact = section('Contact');
    expect(contact.querySelector('form')).toBeTruthy();
    expect(
      within(contact).getByRole('textbox', {
        name: /Subject of the complaint/,
      }),
    ).toBeTruthy();
    expect(
      within(contact).getByRole('button', { name: 'Stamp and send' }),
    ).toBeTruthy();
  });

  it('prints every narrator line at every landmark', () => {
    renderPage();
    const overheard = section('Overheard on the dive');
    expect(
      within(overheard).getAllByTestId('page-narration-stop'),
    ).toHaveLength(NARRATION_LANDMARKS.length);
    for (const id of NARRATION_LANDMARKS) {
      for (const line of narration.landmarks[id].lines)
        expect(within(overheard).getAllByText(line.en).length).toBeGreaterThan(
          0,
        );
    }
  });

  it('credits the site and every CC-BY model', () => {
    renderPage();
    const creditsRegion = section('Credits');
    expect(
      within(creditsRegion)
        .getByTestId('page-site-credits')
        .querySelectorAll('li'),
    ).toHaveLength(credits.length);
    const models = within(creditsRegion).getByRole('list', {
      name: '3D model credits',
    });
    expect(within(models).getAllByRole('listitem')).toHaveLength(
      shippedCredits().length,
    );
  });

  it('says so in place when the model credits cannot be derived', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderPage({
      modelCredits: () => {
        throw new Error('no attribution');
      },
    });
    expect(within(section('Credits')).getByRole('alert').textContent).toMatch(
      /unavailable/,
    );
  });
});

describe('PageView: navigation', () => {
  it('skips straight to the content', () => {
    renderPage();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toBe('#page-main');
    expect(document.getElementById('page-main')?.tagName).toBe('MAIN');
  });

  it('links every section from the section nav', () => {
    renderPage();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const targets = within(nav)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href')?.slice(1) ?? '');
    expect(targets).toHaveLength(7);
    for (const id of targets)
      expect(document.getElementById(id)?.tagName).toBe('SECTION');
  });

  it('switches back to the dive in place when the page was asked for', () => {
    const onReturnToDive = vi.fn();
    renderPage({
      reason: 'requested',
      diveHref: '/?quality=low',
      onReturnToDive,
    });
    const links = screen.getAllByRole('link', { name: 'Back to the dive' });
    expect(links[0].getAttribute('href')).toBe('/?quality=low');
    fireEvent.click(links[0]);
    expect(onReturnToDive).toHaveBeenCalledTimes(1);
  });

  it('offers no dive to a browser without WebGL, and says why', () => {
    renderPage({ reason: 'no-webgl' });
    expect(screen.getByText(/WebGL is not available/)).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: /(Back to|Try) the dive/ }),
    ).toBeNull();
  });

  it('offers a fresh try after the dive broke', () => {
    renderPage({ reason: 'dive-failed', diveHref: '/' });
    expect(screen.getByText(/stopped working on this device/)).toBeTruthy();
    expect(
      screen
        .getAllByRole('link', { name: 'Try the dive again' })[0]
        .getAttribute('href'),
    ).toBe('/');
  });

  it('takes focus on its heading when the visitor just switched to it', () => {
    renderPage({ focusOnMount: true });
    expect(document.activeElement?.tagName).toBe('H1');
  });

  it('flips for Arabic', () => {
    const { container } = renderPage({ locale: 'ar' });
    const root = container.firstElementChild;
    expect(root?.getAttribute('dir')).toBe('rtl');
    expect(root?.getAttribute('lang')).toBe('ar');
    expect(
      screen.getByRole('link', { name: 'انتقل إلى المحتوى' }),
    ).toBeTruthy();
  });
});
