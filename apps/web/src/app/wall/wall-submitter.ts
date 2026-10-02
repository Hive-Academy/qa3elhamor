import {
  ComplaintSendError,
  type ComplaintDelivery,
  type ComplaintSubmitter,
} from '../overlays/complaint-scroll/complaint-submitter';
import type { WallClient } from './wall-client';

/**
 * The Bureau form's way onto the public wall: a validated draft (the same domain rules the API
 * applies) becomes `POST /complaints`. A `201` means "awaiting moderation"; nothing is public
 * until a moderator approves it. The reply address is never sent (the domain does not allow one
 * on a public complaint), and the client sends only the four fields the API accepts.
 */
export function wallSubmitter(client: WallClient): ComplaintSubmitter {
  return {
    async submit(draft): Promise<ComplaintDelivery> {
      const result = await client.submit({
        subject: draft.subject,
        body: draft.body,
        senderName: draft.senderName,
        senderSpecies: draft.senderSpecies,
      });
      if (result.ok) return { status: 'awaiting-moderation' };
      switch (result.failure.kind) {
        case 'rate-limited':
          throw new ComplaintSendError('rate-limited');
        case 'unavailable':
          throw new ComplaintSendError('unavailable');
        default:
          throw new ComplaintSendError('failed');
      }
    },
  };
}
