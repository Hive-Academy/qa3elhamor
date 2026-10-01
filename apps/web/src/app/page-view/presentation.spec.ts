import { describe, expect, it } from 'vitest';
import { choosePresentation, hrefFor, searchFor } from './presentation';

describe('choosePresentation', () => {
  it('dives by default when WebGL is available', () => {
    expect(choosePresentation({ search: '', webgl: true })).toEqual({
      kind: 'dive',
    });
  });

  it('serves the page when the browser has no WebGL, whatever the URL asks', () => {
    const page = { kind: 'page', reason: 'no-webgl' };
    expect(choosePresentation({ search: '', webgl: false })).toEqual(page);
    expect(choosePresentation({ search: '?view=dive', webgl: false })).toEqual(
      page,
    );
  });

  it('serves the page when ?view=page asks for it', () => {
    expect(
      choosePresentation({ search: '?quality=low&view=page', webgl: true }),
    ).toEqual({
      kind: 'page',
      reason: 'requested',
    });
  });

  it('ignores any other view value', () => {
    expect(choosePresentation({ search: '?view=pages', webgl: true })).toEqual({
      kind: 'dive',
    });
  });
});

describe('searchFor / hrefFor', () => {
  it('adds and removes the view parameter, keeping every other one', () => {
    expect(searchFor('?quality=low', 'page')).toBe('?quality=low&view=page');
    expect(searchFor('?quality=low&view=page', 'dive')).toBe('?quality=low');
    expect(searchFor('?view=page', 'dive')).toBe('');
    expect(searchFor('', 'page')).toBe('?view=page');
  });

  it('builds a same-document href under the deploy path', () => {
    expect(hrefFor({ pathname: '/qa3elhamor/', search: '' }, 'page')).toBe(
      '/qa3elhamor/?view=page',
    );
    expect(hrefFor({ pathname: '/', search: '?view=page' }, 'dive')).toBe('/');
  });
});
