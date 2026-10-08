import React from 'react';
import ProductFeedbackInbox from '../../components/ProductFeedbackInbox';

/**
 * Owner route for the product-feedback inbox (REQ-FDB-006). The server callable
 * re-verifies the Owner membership, so this page holds no authorization logic.
 */
export default function FeedbackPage() {
  return <ProductFeedbackInbox />;
}
