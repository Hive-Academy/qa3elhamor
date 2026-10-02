import { expect, type Page } from '@playwright/test';

/** The page view's sections, by their heading (page-view/page-copy.ts). */
export const PAGE_SECTIONS = [
  'About',
  'Experience',
  'Projects',
  'Services',
  'Contact',
  'Overheard on the dive',
  'Credits',
] as const;

/** Every section of the readable page is in the section navigation and has its own heading. */
export async function expectEverySection(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const sections = page.getByRole('navigation', { name: 'Sections' });
  for (const name of PAGE_SECTIONS) {
    await expect(sections.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeAttached();
  }
}
