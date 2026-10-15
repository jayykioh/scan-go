import React from 'react';
import ProductFeedbackInbox from '../../components/ProductFeedbackInbox';
import CustomerReportTopics from '../../components/CustomerReportTopics';

/**
 * Owner route for feedback (REQ-FDB-006, REQ-FDB-007). The top section is what
 * guests report about the shop; the bottom section is what operators report
 * about ScanGo itself. The server re-verifies the Owner membership for every
 * command, so this page holds no authorization logic.
 */
export default function FeedbackPage() {
  return (
    <div className="space-y-8">
      <CustomerReportTopics />
      <ProductFeedbackInbox />
    </div>
  );
}
