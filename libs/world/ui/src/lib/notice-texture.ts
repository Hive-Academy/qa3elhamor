import type { ShippedCredit } from '@qa3elhamor/world-domain';
import { CanvasTexture, SRGBColorSpace } from 'three';
import {
  NOTICE,
  NOTICE_FONT_FAMILY,
  bodyFont,
  headingFont,
  layoutNotice,
  type NoticeLayout,
} from './notice-layout.js';

/** The notice's ink and paper; the municipal palette of the landmark overlays. */
export const NOTICE_COLORS = {
  paper: '#f3ead3',
  ink: '#2a2118',
  rule: '#7a4b2a',
  stamp: '#a23b2a',
} as const;

export interface NoticeText {
  /** Arabic masthead: "Municipality of Qaa El-Hamour". */
  readonly mastheadAr: string;
  readonly masthead: string;
  readonly subtitle: string;
  /** Points readers at the DOM credits, which carry the working links. */
  readonly footer: string;
}

export const DEFAULT_NOTICE_TEXT: NoticeText = {
  mastheadAr: 'بلدية قاع الهامور',
  masthead: 'MUNICIPALITY OF QAA EL-HAMOUR · PUBLIC NOTICE',
  subtitle: 'This town is built from the following works, credited as their licences require.',
  footer: 'Every link is in "Credits" at the top of the page.',
};

/**
 * Paints the notice onto a 2D context of `NOTICE.width` x `NOTICE.height`: masthead, one
 * entry per credit (title, then the licence line verbatim, wrapped) and the footer.
 */
export function drawNotice(
  ctx: CanvasRenderingContext2D,
  layout: NoticeLayout,
  text: NoticeText = DEFAULT_NOTICE_TEXT,
): void {
  const { width, height, padding } = NOTICE;
  const right = width - padding;

  ctx.fillStyle = NOTICE_COLORS.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = NOTICE_COLORS.rule;
  ctx.lineWidth = 10;
  ctx.strokeRect(28, 28, width - 56, height - 56);

  ctx.fillStyle = NOTICE_COLORS.ink;
  ctx.textBaseline = 'alphabetic';

  // Masthead.
  ctx.textAlign = 'left';
  // Sized so the English and Arabic mastheads share the line without touching.
  ctx.font = headingFont(44);
  ctx.fillText(text.masthead, padding, padding + 60);
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.font = headingFont(64);
  ctx.fillText(text.mastheadAr, right, padding + 60);
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.font = `italic 34px ${NOTICE_FONT_FAMILY}`;
  ctx.fillText(text.subtitle, padding, padding + 120);
  ctx.fillStyle = NOTICE_COLORS.rule;
  ctx.fillRect(padding, NOTICE.mastheadHeight - 14, right - padding, 6);

  // Credits.
  ctx.fillStyle = NOTICE_COLORS.ink;
  let y = NOTICE.mastheadHeight + layout.headingPx + 8;
  for (const entry of layout.entries) {
    ctx.font = headingFont(layout.headingPx);
    ctx.fillText(entry.heading, padding, y);
    y += Math.round(layout.headingPx * 1.3);
    ctx.font = bodyFont(layout.bodyPx);
    for (const line of entry.lines) {
      ctx.fillText(line, padding, y);
      y += layout.lineHeight;
    }
    y += NOTICE.entryGap;
  }

  // Footer.
  ctx.font = `600 32px ${NOTICE_FONT_FAMILY}`;
  ctx.fillText(text.footer, padding, height - padding + 20);

  // The municipal stamp, because nothing here is official until it is stamped.
  ctx.save();
  ctx.translate(right - 110, height - padding - 40);
  ctx.rotate(-0.22);
  ctx.strokeStyle = NOTICE_COLORS.stamp;
  ctx.fillStyle = NOTICE_COLORS.stamp;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = headingFont(34);
  ctx.fillText('CC BY 4.0', 0, -6);
  ctx.font = headingFont(26);
  ctx.fillText('APPROVED', 0, 30);
  ctx.restore();
}

/**
 * Renders the credits to a texture for the plaque's face. Returns null where no 2D canvas is
 * available (the plaque then shows a blank board; the DOM credits are unaffected).
 */
export function createNoticeTexture(
  credits: readonly ShippedCredit[],
  text: NoticeText = DEFAULT_NOTICE_TEXT,
  doc: Document = document,
): CanvasTexture | null {
  const canvas = doc.createElement('canvas');
  canvas.width = NOTICE.width;
  canvas.height = NOTICE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const measure = (value: string, font: string): number => {
    ctx.font = font;
    return ctx.measureText(value).width;
  };
  drawNotice(ctx, layoutNotice(credits, measure), text);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
