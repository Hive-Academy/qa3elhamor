import { serviceItems, siteCopy } from '@qa3elhamor/content-data-access';
import { localize } from '@qa3elhamor/content-domain';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ServicesMenu, createServicesMenuOverlay } from './services-menu';

describe('ServicesMenu', () => {
  it("is the page view's Services section: every dish, its service, price and tags", () => {
    render(
      <ServicesMenu
        services={serviceItems}
        copy={siteCopy}
        locale="en"
        dir="ltr"
        variant="in-world"
      />,
    );
    const menu = screen.getByRole('article', { name: 'Services' });
    expect(menu.getAttribute('tabindex')).toBe('-1');
    const dishes = within(menu).getAllByTestId('page-service');
    expect(dishes).toHaveLength(serviceItems.length);
    serviceItems.forEach((service, i) => {
      const dish = dishes[i] as HTMLElement;
      expect(
        within(dish).getByRole('heading', {
          name: localize(service.title, 'en'),
        }),
      ).toBeTruthy();
      expect(dish.textContent).toContain(localize(service.menuName, 'en'));
      if (service.price)
        expect(dish.textContent).toContain(localize(service.price, 'en'));
    });
  });

  it('is the Krusty Krab dialog fallback, flat on the dialog paper', () => {
    const Overlay = createServicesMenuOverlay({
      services: serviceItems,
      copy: siteCopy,
    });
    render(
      <Overlay
        landmarkId="krusty-krab"
        title="The Krusty Krab"
        locale="en"
        dir="ltr"
        onClose={vi.fn()}
      />,
    );
    const menu = screen.getByRole('article', { name: 'Services' });
    expect(menu.classList.contains('krusty-menu--dialog')).toBe(true);
    expect(within(menu).getAllByTestId('page-service')).toHaveLength(
      serviceItems.length,
    );
  });
});
