import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LandmarkIndex } from './landmark-index.js';
import { LandmarkOverlayHost } from './landmark-overlay-host.js';
import { LandmarkReturnBar } from './landmark-return-bar.js';

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

describe('LandmarkReturnBar', () => {
  function Bar({ onClose }: { onClose: (reason: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open wall
        </button>
        <LandmarkReturnBar
          open={open}
          title="Complaints Wall"
          hint="Hover a note to read it"
          onClose={(reason) => {
            onClose(reason);
            setOpen(false);
          }}
        />
      </>
    );
  }

  it('is a named, non-modal region that takes focus and closes on Esc anywhere', () => {
    const onClose = vi.fn();
    render(<Bar onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open wall' });
    opener.focus();
    fireEvent.click(opener);
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
    render(<Bar onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open wall' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to the dive' }));
    expect(onClose).toHaveBeenCalledWith('button');
  });
});
