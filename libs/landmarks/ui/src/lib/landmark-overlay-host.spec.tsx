import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LandmarkIndex } from './landmark-index.js';
import { LandmarkOverlayHost } from './landmark-overlay-host.js';
import {
  LandmarkStage,
  TEXT_ENTRY_SCROLL_GRACE_MS,
  isTextEntry,
} from './landmark-stage.js';

function Harness({
  onClose = vi.fn(),
  withForm = true,
}: {
  onClose?: (reason: string) => void;
  withForm?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open bureau
      </button>
      <LandmarkOverlayHost
        open={open}
        title="Complaints Bureau"
        dir="rtl"
        lang="ar"
        onClose={(reason) => {
          onClose(reason);
          setOpen(false);
        }}
      >
        {withForm ? (
          <form>
            <input aria-label="Subject" />
            <button type="submit">Stamp it</button>
          </form>
        ) : (
          <p>Coming soon.</p>
        )}
      </LandmarkOverlayHost>
    </>
  );
}

const openDialog = () => {
  const opener = screen.getByRole('button', { name: 'Open bureau' });
  opener.focus();
  fireEvent.click(opener);
  return {
    opener,
    dialog: screen.getByRole('dialog', { name: 'Complaints Bureau' }),
  };
};

describe('LandmarkOverlayHost', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a labelled modal dialog carrying the text direction', () => {
    render(<Harness />);
    const { dialog } = openDialog();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('dir')).toBe('rtl');
    expect(dialog.getAttribute('lang')).toBe('ar');
  });

  it('moves focus to the first control in the overlay, or to close when it has none', () => {
    const { unmount } = render(<Harness />);
    openDialog();
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Subject' }),
    );
    unmount();

    render(<Harness withForm={false} />);
    openDialog();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close' }),
    );
  });

  it('traps Tab and Shift+Tab inside the dialog', () => {
    render(<Harness />);
    const { dialog } = openDialog();
    const close = screen.getByRole('button', { name: 'Close' });
    const stamp = screen.getByRole('button', { name: 'Stamp it' });

    stamp.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(stamp);
  });

  it('closes on Esc and returns focus to the opener', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { opener, dialog } = openDialog();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith('escape');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes from the close button and the backdrop', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenLastCalledWith('button');

    const { dialog } = openDialog();
    fireEvent.pointerDown(dialog); // inside the paper: stays open
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.pointerDown(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenLastCalledWith('backdrop');
  });

  it('locks page scroll while open and restores it after', () => {
    render(<Harness />);
    const { dialog } = openDialog();
    expect(document.documentElement.style.overflow).toBe('hidden');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(document.documentElement.style.overflow).toBe('');
  });
});

describe('LandmarkIndex', () => {
  const items = [
    { id: 'pineapple', label: 'The Pineapple', caption: 'About' },
    { id: 'bureau', label: 'Complaints Bureau' },
  ];

  it('lists every landmark as a button in a named navigation region', () => {
    render(
      <LandmarkIndex items={items} label="Landmarks" onActivate={vi.fn()} />,
    );
    expect(screen.getByRole('navigation', { name: 'Landmarks' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('treats focus as hover and Enter/Space clicks as keyboard activation', () => {
    const onActivate = vi.fn();
    const onHover = vi.fn();
    const onUnhover = vi.fn();
    render(
      <LandmarkIndex
        items={items}
        label="Landmarks"
        activeId="bureau"
        onActivate={onActivate}
        onHover={onHover}
        onUnhover={onUnhover}
      />,
    );
    const bureau = screen.getByRole('button', { name: 'Complaints Bureau' });
    expect(bureau.hasAttribute('data-active')).toBe(true);
    fireEvent.focus(bureau);
    expect(onHover).toHaveBeenCalledWith('bureau', 'keyboard');
    fireEvent.click(bureau, { detail: 0 });
    expect(onActivate).toHaveBeenCalledWith('bureau', 'keyboard');
    fireEvent.click(bureau, { detail: 1 });
    expect(onActivate).toHaveBeenLastCalledWith('bureau', 'pointer');
    fireEvent.blur(bureau);
    expect(onUnhover).toHaveBeenCalledWith('bureau');
  });
});

describe('LandmarkOverlayHost background and focus return', () => {
  it('makes everything outside the dialog inert while open, and restores it', () => {
    render(
      <main>
        <Harness />
      </main>,
    );
    const main = screen.getByRole('main');
    const { dialog } = openDialog();
    expect(main.closest('[inert]')).not.toBeNull();
    expect(dialog.closest('[inert]')).toBeNull();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(main.closest('[inert]')).toBeNull();
  });

  it('keeps an element that was already inert inert after closing', () => {
    const aside = document.createElement('aside');
    aside.setAttribute('inert', '');
    document.body.append(aside);
    render(<Harness />);
    const { dialog } = openDialog();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(aside.hasAttribute('inert')).toBe(true);
    aside.remove();
  });

  it('sends focus to returnFocus() when opened from somewhere focus cannot go back to', () => {
    function CanvasOpened() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <div aria-hidden="true">
            <button type="button" tabIndex={-1} onClick={() => setOpen(true)}>
              beacon
            </button>
          </div>
          <button type="button" data-testid="nav-entry">
            Bureau in the list
          </button>
          <LandmarkOverlayHost
            open={open}
            title="Bureau"
            onClose={() => setOpen(false)}
            returnFocus={() => screen.getByTestId('nav-entry')}
          />
        </>
      );
    }
    render(<CanvasOpened />);
    const beacon = screen.getByText('beacon');
    beacon.focus();
    fireEvent.click(beacon);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByTestId('nav-entry'));
  });

  it('leaves page scroll alone when lockScroll is off', () => {
    render(
      <LandmarkOverlayHost
        open
        title="Tiki"
        onClose={vi.fn()}
        lockScroll={false}
      />,
    );
    expect(document.documentElement.style.overflow).toBe('');
  });
});

describe('LandmarkStage', () => {
  function Stage({
    onClose,
    leaveOnScroll,
  }: {
    onClose: (reason: string) => void;
    leaveOnScroll?: number | false;
  }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open wall
        </button>
        <LandmarkStage
          open={open}
          title="Complaints Wall"
          hint="Hover a note to read it"
          leaveOnScroll={leaveOnScroll}
          sceneLayerRef={(slot) => {
            if (slot) slot.dataset['testid'] = 'scene-slot';
          }}
          onClose={(reason) => {
            onClose(reason);
            setOpen(false);
          }}
        />
      </>
    );
  }

  const open = () => {
    const opener = screen.getByRole('button', { name: 'Open wall' });
    opener.focus();
    fireEvent.click(opener);
    return opener;
  };

  it('is a named, non-modal region that takes focus and closes on Esc anywhere', () => {
    const onClose = vi.fn();
    render(<Stage onClose={onClose} />);
    const opener = open();
    expect(
      screen.getByRole('region', { name: 'Complaints Wall' }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Back to the dive' }),
    );
    expect(opener.closest('[inert]')).toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith('escape');
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes from its button', () => {
    const onClose = vi.fn();
    render(<Stage onClose={onClose} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the dive' }));
    expect(onClose).toHaveBeenCalledWith('button');
  });

  it('keeps its scene slot mounted while closed, inside the region while open', () => {
    render(<Stage onClose={vi.fn()} />);
    const slot = screen.getByTestId('scene-slot');
    open();
    expect(screen.getByRole('region').contains(slot)).toBe(true);
    expect(screen.getByTestId('scene-slot')).toBe(slot);
  });

  it('moves focus into the scene once its DOM arrives, unless the visitor moved it', async () => {
    render(<Stage onClose={vi.fn()} />);
    open();
    const slot = screen.getByTestId('scene-slot');
    const card = document.createElement('article');
    card.tabIndex = -1;
    card.setAttribute('data-landmark-autofocus', '');
    await act(async () => {
      slot.append(card);
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(card);
  });

  it('closes when the page is scrolled away, not on a nudge', () => {
    const onClose = vi.fn();
    render(<Stage onClose={onClose} leaveOnScroll={64} />);
    open();
    const scrollTo = (y: number) => {
      Object.defineProperty(window, 'scrollY', {
        value: y,
        configurable: true,
      });
      fireEvent.scroll(window);
    };
    scrollTo(30);
    expect(onClose).not.toHaveBeenCalled();
    scrollTo(-40);
    expect(onClose).not.toHaveBeenCalled();
    scrollTo(70);
    expect(onClose).toHaveBeenCalledWith('scroll');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('does not leave while the visitor types in the scene: an on-screen keyboard scrolls the page', () => {
    const onClose = vi.fn();
    render(<Stage onClose={onClose} leaveOnScroll={64} />);
    open();
    const field = document.createElement('input');
    field.type = 'text';
    screen.getByTestId('scene-slot').append(field);
    const scrollTo = (y: number) => {
      Object.defineProperty(window, 'scrollY', {
        value: y,
        configurable: true,
      });
      fireEvent.scroll(window);
    };
    // iOS Safari scrolls the page to show the field above its keyboard.
    field.focus();
    scrollTo(120);
    expect(onClose).not.toHaveBeenCalled();
    // The keyboard closing scrolls it back, just after the field lost focus.
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000);
    field.blur();
    scrollTo(40);
    expect(onClose).not.toHaveBeenCalled();
    // Then a real scroll away, measured from where the keyboard left the page.
    now.mockReturnValue(10_000 + TEXT_ENTRY_SCROLL_GRACE_MS + 1);
    scrollTo(110);
    expect(onClose).toHaveBeenCalledWith('scroll');
    now.mockRestore();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('ignores an Escape that cancels an IME composition, or that the scene handled', () => {
    const onClose = vi.fn();
    render(<Stage onClose={onClose} />);
    open();
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true });
    fireEvent.keyDown(window, { key: 'Escape', keyCode: 229 });
    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    handled.preventDefault();
    window.dispatchEvent(handled);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith('escape');
  });

  it('knows which fields take typed text', () => {
    const make = (html: string) => {
      const host = document.createElement('div');
      host.innerHTML = html;
      return host.firstElementChild;
    };
    expect(isTextEntry(make('<input>'))).toBe(true);
    expect(isTextEntry(make('<input type="email">'))).toBe(true);
    expect(isTextEntry(make('<textarea></textarea>'))).toBe(true);
    expect(isTextEntry(make('<select></select>'))).toBe(true);
    expect(isTextEntry(make('<input type="checkbox">'))).toBe(false);
    expect(isTextEntry(make('<button>Go</button>'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
