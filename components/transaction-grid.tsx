"use client";
import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { type ColDef, type ICellRendererParams } from "ag-grid-community";
import type { Transaction } from "@/lib/types";
import { money } from "@/lib/money";
import { gridTheme } from "./grid-theme";
import { useAnimationPreference } from "./animation-provider";
export default function TransactionGrid({
  transactions,
  search,
  onRefund,
}: {
  transactions: Transaction[];
  search: string;
  onRefund?: (transaction: Transaction) => void;
}) {
  const { reduced } = useAnimationPreference();
  const columns = useMemo<ColDef<Transaction>[]>(
    () => [
      ...(onRefund
        ? [
            {
              headerName: "REFUND",
              width: 120,
              sortable: false,
              filter: false,
              cellRenderer: ({ data }: ICellRendererParams<Transaction>) =>
                data && data.amount > 0 ? (
                  <button className="text-button" onClick={() => onRefund(data)}>
                    Track refund
                  </button>
                ) : null,
            } satisfies ColDef<Transaction>,
          ]
        : []),
      { field: "date", headerName: "DATE", width: 145, sort: "desc" },
      {
        field: "merchant",
        headerName: "MERCHANT",
        flex: 1,
        minWidth: 190,
        cellRenderer: ({ data }: ICellRendererParams<Transaction>) =>
          data ? (
            <span className="grid-merchant">
              <span className="merchant-avatar">{data.merchant.slice(0, 1)}</span>
              <span>{data.merchant}</span>
            </span>
          ) : null,
      },
      {
        field: "category",
        headerName: "CATEGORY",
        width: 175,
        cellRenderer: ({ value }: ICellRendererParams<Transaction>) => (
          <span className={`category-badge category-${String(value).replaceAll(" ", "-")}`}>
            {value}
          </span>
        ),
      },
      {
        field: "amount",
        headerName: "AMOUNT",
        width: 140,
        cellRenderer: ({ value }: ICellRendererParams<Transaction>) => (
          <span className={Number(value) < 0 ? "income" : "expense"}>
            {Number(value) < 0 ? "+" : "−"}
            {money(Math.abs(Number(value)))}
          </span>
        ),
      },
      {
        field: "source",
        headerName: "SOURCE",
        width: 155,
        valueFormatter: (p) => (p.value === "synthetic" ? "Synthetic data" : "PayPal Sandbox"),
      },
    ],
    [onRefund],
  );
  return (
    <div className="transaction-grid" style={{ height: 480 }}>
      <AgGridReact<Transaction>
        theme={gridTheme}
        rowData={transactions}
        columnDefs={columns}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
        quickFilterText={search}
        pagination
        paginationPageSize={10}
        paginationPageSizeSelector={[10, 20, 50]}
        getRowId={(p) => p.data.id}
        animateRows={!reduced}
        suppressCellFocus={false}
      />
    </div>
  );
}
