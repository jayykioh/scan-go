// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import OperationTableBoard, {
  type OperationTableState,
} from './OperationTableBoard';
import type { PlanPlacement } from '../pages/dashboard/tables/tablePlan';
import type { OperationTable } from '../hooks/useOperationTables';

// The board measures itself; jsdom has no ResizeObserver.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

// vitest runs without globals, so RTL does not register its own cleanup.
afterEach(cleanup);

const table: OperationTable = {
  tableId: 'table-1',
  name: 'Bàn 1',
  area: null,
  seats: 4,
  position: { x: 0, y: 0 },
};

const placements: PlanPlacement<OperationTable>[] = [
  { table, position: { x: 0, y: 0 }, isSaved: true },
];

function renderBoard(states: Map<string, OperationTableState>) {
  return render(
    <OperationTableBoard
      placements={placements}
      columns={4}
      rows={4}
      states={states}
      selectedTableId={null}
      onSelect={() => {}}
    />,
  );
}

/** REQ-WAI-002: the ping tells a Waiter which table has dishes to carry. */
describe('OperationTableBoard service ping', () => {
  it('draws the ping and names it on a table with dishes to serve', () => {
    renderBoard(
      new Map([
        ['table-1', { state: 'foodReady', count: 2, ping: true }],
      ]),
    );

    expect(screen.getByTestId('operation-table-ping').textContent).toBe('!');
    expect(
      screen.getByRole('button', { name: /cần phục vụ/ }),
    ).toBeTruthy();
  });

  it('draws no ping when the page does not ask for one', () => {
    renderBoard(
      new Map([['table-1', { state: 'awaitingPayment', count: 1 }]]),
    );

    expect(screen.queryByTestId('operation-table-ping')).toBeNull();
    expect(screen.queryByRole('button', { name: /cần phục vụ/ })).toBeNull();
  });
});
