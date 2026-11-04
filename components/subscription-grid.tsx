"use client";
import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { Subscription } from "@/lib/types";
import { money } from "@/lib/money";
import { gridTheme } from "./grid-theme";
import { useAnimationPreference } from "./animation-provider";
export default function SubscriptionGrid({
  subscriptions,
  asOf,
  busy,
  onAction,
}: {
  subscriptions: Subscription[];
  asOf: string;
  busy: boolean;
  onAction: (sub: Subscription) => Promise<void>;
}) {
  const { reduced } = useAnimationPreference();
  const columns = useMemo<ColDef<Subscription>[]>(
    () => [
      {
        field: "merchant",
        headerName: "SUBSCRIPTION",
        flex: 1,
        minWidth: 200,
        cellRenderer: ({ data }: ICellRendererParams<Subscription>) =>
          data ? (
            <span className="grid-merchant">
              <span className="sub-icon sub-1">{data.merchant.slice(0, 1)}</span>
              <strong style={{ fontWeight: 500 }}>{data.merchant}</strong>
            </span>
          ) : null,
      },
      {
        field: "monthlyPrice",
        headerName: "MONTHLY COST",
        width: 145,
        valueFormatter: (p) => money(p.value),
      },
      {
        field: "lastUsedDate",
        headerName: "LAST USED",
        width: 145,
        valueFormatter: (p) =>
          `${Math.floor((Date.parse(asOf.slice(0, 10)) - Date.parse(p.value)) / 86400000)} days ago`,
      },
      {
        field: "status",
        headerName: "STATUS",
        width: 180,
        cellRenderer: ({ data }: ICellRendererParams<Subscription>) => {
          if (!data) return null;
          const idle = (Date.parse(asOf.slice(0, 10)) - Date.parse(data.lastUsedDate)) / 86400000;
          return (
            <span
              className={`pill ${data.status === "cancel-suggested" ? "pill-neutral" : idle > 45 ? "pill-amber" : "pill-green"}`}
            >
              {data.status === "cancel-suggested"
                ? "Cancellation suggested"
                : idle > 45
                  ? "Looks unused"
                  : "In use"}
            </span>
          );
        },
      },
      {
        headerName: "YOUR DECISION",
        width: 200,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }: ICellRendererParams<Subscription>) =>
          data ? (
            <button className="outline-button" disabled={busy} onClick={() => void onAction(data)}>
              {data.status === "cancel-suggested" ? "Undo suggestion" : "Suggest cancellation"}
            </button>
          ) : null,
      },
    ],
    [asOf, busy, onAction],
  );
  return (
    <div className="subscription-grid">
      <AgGridReact<Subscription>
        theme={gridTheme}
        rowData={subscriptions}
        columnDefs={columns}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
        rowHeight={77}
        animateRows={!reduced}
        domLayout="autoHeight"
        getRowId={(p) => p.data.id}
      />
    </div>
  );
}
