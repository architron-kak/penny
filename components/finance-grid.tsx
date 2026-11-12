"use client";
import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { gridTheme } from "./grid-theme";
import type { AccountView, EntryView } from "@/lib/private/types";
import { formatMoney, categoryLabels } from "./personal-money";
export default function FinanceGrid({
  entries,
  accounts,
  search,
  onVoid,
}: {
  entries: EntryView[];
  accounts: AccountView[];
  search: string;
  onVoid: (entry: EntryView) => void;
}) {
  const columns = useMemo<ColDef<EntryView>[]>(
    () => [
      { field: "date", headerName: "Дата", width: 130, sort: "desc" },
      { field: "description", headerName: "Операция", flex: 1, minWidth: 180 },
      {
        field: "accountId",
        headerName: "Счёт",
        width: 160,
        valueFormatter: (p) => accounts.find((a) => a.id === p.value)?.name || "Счёт",
      },
      {
        field: "category",
        headerName: "Категория",
        width: 180,
        valueFormatter: (p) => categoryLabels[p.value as keyof typeof categoryLabels] || p.value,
      },
      {
        field: "amountMinor",
        headerName: "Сумма",
        width: 170,
        cellRenderer: ({ data }: ICellRendererParams<EntryView>) =>
          data ? (
            <span
              className={
                data.voidedAt ? "ledger-voided" : data.kind === "income" ? "ledger-positive" : ""
              }
            >
              {data.kind === "income" ? "+" : "−"}
              {formatMoney(data.amountMinor, data.currency)}
            </span>
          ) : null,
      },
      {
        headerName: "Статус",
        width: 140,
        valueGetter: (p) => (p.data?.voidedAt ? "Отменена" : "Сохранена"),
      },
      {
        headerName: "",
        width: 135,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }: ICellRendererParams<EntryView>) =>
          data && !data.voidedAt ? (
            <button className="ledger-text-button" onClick={() => onVoid(data)}>
              Отменить запись
            </button>
          ) : null,
      },
    ],
    [accounts, onVoid],
  );
  return (
    <div className="ledger-grid">
      <AgGridReact<EntryView>
        theme={gridTheme}
        rowData={entries}
        columnDefs={columns}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
        quickFilterText={search}
        pagination
        paginationPageSize={15}
        paginationPageSizeSelector={[15, 30, 60]}
        getRowId={(p) => p.data.id}
        animateRows={false}
      />
    </div>
  );
}
